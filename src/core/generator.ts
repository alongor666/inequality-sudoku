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
  const n = spec.cols
  // 约束：从解盘读取真实关系
  let constraints: Constraint[] = allAdjacents(spec)
    .filter(() => rng() < signProb)
    .map(({ a, b }) => {
      const va = sol[a.r - 1][a.c - 1]
      const vb = sol[b.r - 1][b.c - 1]
      return va > vb ? { type: '>' as const, a, b } : { type: '<' as const, a, b }
    })

  // 给定数：随机挑 targetGivens 个
  const cells = shuffled(
    allCells(spec),
    rng,
  ).slice(0, Math.min(targetGivens, n * n))
  let givens = cells.map((addr) => ({ addr, value: sol[addr.r - 1][addr.c - 1] }))

  const id = `gen-${Date.now().toString(36)}-${Math.floor(rng() * 1e4).toString(36)}`
  const tryPuzzle = (g: typeof givens, cons: Constraint[]): Puzzle => ({
    id,
    name: '随机新题',
    spec,
    givens: g,
    constraints: cons,
    solution: sol,
  })

  // 收紧循环：不唯一就先补约束（从尚未使用的邻接对里挑），再补给定数
  const usedPairs = new Set(constraints.map((c) => pairKey(c.a, c.b)))
  const spare = allAdjacents(spec).filter((p) => !usedPairs.has(pairKey(p.a, p.b)))
  let spareIdx = 0
  const shuffledSpare = shuffled(spare, rng)

  for (let guard = 0; guard < 200; guard++) {
    const res = solvePuzzle(spec, givens, constraints, 2)
    if (res.count === 1) {
      const puzzle = tryPuzzle(givens, constraints)
      // 出口验证（fail-closed）
      const check = solvePuzzle(spec, puzzle.givens, puzzle.constraints, 2)
      return check.count === 1 ? puzzle : null
    }
    if (res.count === 0) return null // 不应发生（一切派生自解盘），防御
    if (spareIdx < shuffledSpare.length) {
      const p = shuffledSpare[spareIdx++]
      const va = sol[p.a.r - 1][p.a.c - 1]
      const vb = sol[p.b.r - 1][p.b.c - 1]
      constraints = [...constraints, va > vb ? { type: '>', a: p.a, b: p.b } : { type: '<', a: p.a, b: p.b }]
    } else if (givens.length < n * n) {
      const remaining = allCells(spec).filter(
        (addr) => !givens.some((g) => g.addr.r === addr.r && g.addr.c === addr.c),
      )
      const pick = remaining[Math.floor(rng() * remaining.length)]
      givens = [...givens, { addr: pick, value: sol[pick.r - 1][pick.c - 1] }]
    } else {
      return null
    }
  }
  return null
}

function pairKey(a: Addr, b: Addr): string {
  const [x, y] = a.r < b.r || (a.r === b.r && a.c < b.c) ? [a, b] : [b, a]
  return `${x.r},${x.c}-${y.r},${y.c}`
}

function allCells(spec: GridSpec): Addr[] {
  const out: Addr[] = []
  for (let r = 1; r <= spec.rows; r++) for (let c = 1; c <= spec.cols; c++) out.push({ r, c })
  return out
}
