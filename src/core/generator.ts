import type { Addr, Constraint, Difficulty, GridSpec, Puzzle } from './types'
import { DIFFICULTY_PRESETS } from './types'
import { solvePuzzle } from './solver'

/**
 * 随机新题生成器：
 * 1. 随机生成完整解盘（回溯填入随机序数字）。
 * 2. 按难度挖给定数、按概率放比较符号（符号一律从解盘读取真实大小关系）。
 * 3. 若解不唯一，循环「补给定数 → 补符号」收紧，直到恰好唯一。
 * 全程派生自同一张解盘，逻辑自洽由构造保证；出口再验证一次唯一性。
 */

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function randomFullGrid(spec: GridSpec, rng: () => number): number[][] | null {
  const n = spec.cols
  const grid: number[][] = Array.from({ length: spec.rows }, () => new Array(n).fill(0))
  const rows = Array.from({ length: spec.rows }, () => 0)
  const cols = Array.from({ length: spec.cols }, () => 0)
  const boxRowsCount = Math.floor(spec.rows / spec.boxRows)
  const boxColsCount = Math.floor(spec.cols / spec.boxCols)
  const boxes = Array.from({ length: boxRowsCount * boxColsCount }, () => 0)

  const bt = (pos: number): boolean => {
    if (pos === n * n) return true
    const r = Math.floor(pos / n)
    const c = pos % n
    const b = Math.floor(r / spec.boxRows) * boxColsCount + Math.floor(c / spec.boxCols)
    const digits = shuffled(
      Array.from({ length: n }, (_, i) => i + 1),
      rng,
    )
    for (const v of digits) {
      const bit = 1 << v
      if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) continue
      grid[r][c] = v
      rows[r] |= bit
      cols[c] |= bit
      boxes[b] |= bit
      if (bt(pos + 1)) return true
      grid[r][c] = 0
      rows[r] &= ~bit
      cols[c] &= ~bit
      boxes[b] &= ~bit
    }
    return false
  }
  return bt(0) ? grid : null
}

function allAdjacents(spec: GridSpec): { a: Addr; b: Addr; horizontal: boolean }[] {
  const out: { a: Addr; b: Addr; horizontal: boolean }[] = []
  for (let r = 1; r <= spec.rows; r++)
    for (let c = 1; c <= spec.cols; c++) {
      if (c < spec.cols) out.push({ a: { r, c }, b: { r, c: c + 1 }, horizontal: true })
      if (r < spec.rows) out.push({ a: { r, c }, b: { r: r + 1, c }, horizontal: false })
    }
  return out
}

export function generateRandom(
  spec: GridSpec,
  difficulty: Difficulty,
  rng: () => number = Math.random,
  attemptLimit = 40,
): Puzzle {
  const preset = DIFFICULTY_PRESETS[difficulty]
  for (let attempt = 0; attempt < attemptLimit; attempt++) {
    const sol = randomFullGrid(spec, rng)
    if (!sol) continue
    const puzzle = buildFromSolution(spec, sol, preset.givens, preset.signProb, rng)
    if (puzzle) return puzzle
  }
  throw new Error(`连续 ${attemptLimit} 次未能生成满足难度的唯一解题目`)
}

function buildFromSolution(
  spec: GridSpec,
  sol: number[][],
  targetGivens: number,
  signProb: number,
  rng: () => number,
): Puzzle | null {
  // 符号一次定死：密度由难度控制，收紧阶段绝不膨胀（防符号海）
  const constraints: Constraint[] = allAdjacents(spec)
    .filter(() => rng() < signProb)
    .map(({ a, b }) => {
      const va = sol[a.r - 1][a.c - 1]
      const vb = sol[b.r - 1][b.c - 1]
      return va > vb ? { type: '>' as const, a, b } : { type: '<' as const, a, b }
    })

  // 自顶向下挖洞：从全盘给定出发，随机删格，只要仍唯一就继续，直到目标数量
  const all = allCells(spec)
  let givens: { addr: Addr; value: number }[] = all.map((addr) => ({
    addr,
    value: sol[addr.r - 1][addr.c - 1],
  }))
  const order = shuffled(all, rng)
  for (const addr of order) {
    if (givens.length <= targetGivens) break
    const trial = givens.filter((g) => g.addr.r !== addr.r || g.addr.c !== addr.c)
    if (solvePuzzle(spec, trial, constraints, 2).count === 1) givens = trial
  }

  const puzzle: Puzzle = {
    id: `gen-${Date.now().toString(36)}-${Math.floor(rng() * 1e4).toString(36)}`,
    name: '随机新题',
    spec,
    givens,
    constraints,
    solution: sol,
  }
  // 出口验证（fail-closed）
  const check = solvePuzzle(spec, puzzle.givens, puzzle.constraints, 2)
  return check.count === 1 ? puzzle : null
}

function allCells(spec: GridSpec): Addr[] {
  const out: Addr[] = []
  for (let r = 1; r <= spec.rows; r++) for (let c = 1; c <= spec.cols; c++) out.push({ r, c })
  return out
}
