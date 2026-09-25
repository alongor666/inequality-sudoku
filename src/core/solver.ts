import type { Addr, Constraint, GridSpec, Puzzle } from './types'

/**
 * 通用求解器：行/列/宫全异 + 任意比较约束（> < =）。
 * 位掩码回溯，含约束传播剪枝。
 */

export interface SolveResult {
  /** 无解时为 null */
  solution: number[][] | null
  /** 解数量（到 cap 截断） */
  count: number
}

const idx = (spec: GridSpec, a: Addr): number => (a.r - 1) * spec.cols + (a.c - 1)
const boxOf = (spec: GridSpec, a: Addr): number =>
  Math.floor((a.r - 1) / spec.boxRows) * Math.floor(spec.cols / spec.boxCols) +
  Math.floor((a.c - 1) / spec.boxCols)

interface ConstraintRef {
  type: Constraint['type']
  self: number // 约束里的 a（以 a > b 语义存）
  other: number
}

/** 预处理：每格挂上它参与的约束（统一折算为「本格 > 他格」方向） */
function buildRefs(spec: GridSpec, constraints: Constraint[]): ConstraintRef[][] {
  const n = spec.rows * spec.cols
  const refs: ConstraintRef[][] = Array.from({ length: n }, () => [])
  for (const con of constraints) {
    const ia = idx(spec, con.a)
    const ib = idx(spec, con.b)
    if (con.type === '>') {
      refs[ia].push({ type: '>', self: ia, other: ib }) // a > b
      refs[ib].push({ type: '<', self: ib, other: ia }) // b < a
    } else if (con.type === '<') {
      refs[ib].push({ type: '>', self: ib, other: ia })
      refs[ia].push({ type: '<', self: ia, other: ib })
    } else {
      refs[ia].push({ type: '=', self: ia, other: ib })
      refs[ib].push({ type: '=', self: ib, other: ia })
    }
  }
  return refs
}

function checkValue(
  spec: GridSpec,
  board: number[],
  refs: ConstraintRef[][],
  pos: number,
  v: number,
  rowUsed: number[],
  colUsed: number[],
  boxUsed: number[],
): boolean {
  const r = Math.floor(pos / spec.cols)
  const c = pos % spec.cols
  const b = boxOf(spec, { r: r + 1, c: c + 1 })
  if (rowUsed[r] & (1 << v)) return false
  if (colUsed[c] & (1 << v)) return false
  if (boxUsed[b] & (1 << v)) return false
  for (const ref of refs[pos]) {
    const ov = board[ref.other]
    if (ov === 0) continue
    if (ref.type === '>' && v <= ov) return false
    if (ref.type === '<' && v >= ov) return false
    if (ref.type === '=' && v !== ov) return false
  }
  return true
}

/** 求解与计数。cap 为解数量上限（用于唯一性判断传 2）。 */
export function solvePuzzle(
  spec: GridSpec,
  givens: { addr: Addr; value: number }[],
  constraints: Constraint[],
  cap = 2,
): SolveResult {
  const n = spec.rows * spec.cols
  const full = (1 << (spec.cols + 1)) - 2 // bit1..bitN
  const board = new Array<number>(n).fill(0)
  const rowUsed = new Array<number>(spec.rows).fill(0)
  const colUsed = new Array<number>(spec.cols).fill(0)
  const boxCount = Math.floor(spec.rows / spec.boxRows) * Math.floor(spec.cols / spec.boxCols)
  const boxUsed = new Array<number>(boxCount).fill(0)
  const refs = buildRefs(spec, constraints)

  for (const g of givens) {
    const pos = idx(spec, g.addr)
    const v = g.value
    if (v < 1 || v > spec.cols) return { solution: null, count: 0 }
    if (!checkValue(spec, board, refs, pos, v, rowUsed, colUsed, boxUsed)) {
      return { solution: null, count: 0 }
    }
    board[pos] = v
    const r = Math.floor(pos / spec.cols)
    const c = pos % spec.cols
    const b = boxOf(spec, { r: r + 1, c: c + 1 })
    rowUsed[r] |= 1 << v
    colUsed[c] |= 1 << v
    boxUsed[b] |= 1 << v
  }

  const empties: number[] = []
  for (let i = 0; i < n; i++) if (board[i] === 0) empties.push(i)

  const solutions: number[][] = []
  let counter = 0

  const bt = (k: number): void => {
    if (counter >= cap) return
    if (k === empties.length) {
      counter++
      if (solutions.length < cap) solutions.push([...board])
      return
    }
    // 选剩余候选最少的空格（MRV），加速
    let bestK = -1
    let bestCount = 99
    let bestMask = 0
    for (let m = k; m < empties.length; m++) {
      const pos = empties[m]
      const r = Math.floor(pos / spec.cols)
      const c = pos % spec.cols
      const b = boxOf(spec, { r: r + 1, c: c + 1 })
      let mask = full & ~(rowUsed[r] | colUsed[c] | boxUsed[b])
      // 约束区间收窄
      for (const ref of refs[pos]) {
        const ov = board[ref.other]
        if (ov === 0) continue
        for (let v = 1; v <= spec.cols; v++) {
          if (!(mask & (1 << v))) continue
          if (ref.type === '>' && v <= ov) mask &= ~(1 << v)
          if (ref.type === '<' && v >= ov) mask &= ~(1 << v)
          if (ref.type === '=' && v !== ov) mask &= ~(1 << v)
        }
      }
      const cnt = popcount(mask)
      if (cnt === 0) return
      if (cnt < bestCount) {
        bestCount = cnt
        bestK = m
        bestMask = mask
        if (cnt === 1) break
      }
    }
    const pos = empties[bestK]
    ;[empties[bestK], empties[k]] = [empties[k], empties[bestK]]
    const r = Math.floor(pos / spec.cols)
    const c = pos % spec.cols
    const b = boxOf(spec, { r: r + 1, c: c + 1 })
    for (let v = 1; v <= spec.cols; v++) {
      if (!(bestMask & (1 << v))) continue
      board[pos] = v
      rowUsed[r] |= 1 << v
      colUsed[c] |= 1 << v
      boxUsed[b] |= 1 << v
      bt(k + 1)
      board[pos] = 0
      rowUsed[r] &= ~(1 << v)
      colUsed[c] &= ~(1 << v)
      boxUsed[b] &= ~(1 << v)
      if (counter >= cap) break
    }
    ;[empties[bestK], empties[k]] = [empties[k], empties[bestK]]
  }

  bt(0)
  const toGrid = (flat: number[]): number[][] => {
    const g: number[][] = []
    for (let r = 0; r < spec.rows; r++) g.push(flat.slice(r * spec.cols, (r + 1) * spec.cols))
    return g
  }
  return { solution: solutions.length ? toGrid(solutions[0]) : null, count: counter }
}

function popcount(x: number): number {
  let n = 0
  while (x) {
    x &= x - 1
    n++
  }
  return n
}

/** 唯一解判定 */
export function hasUniqueSolution(p: Puzzle): boolean {
  return solvePuzzle(p.spec, p.givens, p.constraints, 2).count === 1
}

/** 求出解（存在且取第一个） */
export function solveFor(p: Puzzle): number[][] | null {
  return solvePuzzle(p.spec, p.givens, p.constraints, 1).solution
}

/**
 * 当前盘面下某空格的可行数字集合（区间提示的依据）：
 * 行/列/宫未用数字 ∩ 邻接约束推出的上下界。
 */
export function feasibleValues(
  spec: GridSpec,
  values: number[][], // r,c 从 0 起，0 表示空
  constraints: Constraint[],
  addr: Addr,
): number[] {
  const r = addr.r - 1
  const c = addr.c - 1
  if (values[r][c] !== 0) return []
  const used = new Set<number>()
  for (let i = 0; i < spec.cols; i++) if (values[r][i]) used.add(values[r][i])
  for (let i = 0; i < spec.rows; i++) if (values[i][c]) used.add(values[i][c])
  const br = Math.floor(r / spec.boxRows) * spec.boxRows
  const bc = Math.floor(c / spec.boxCols) * spec.boxCols
  for (let i = br; i < br + spec.boxRows; i++)
    for (let j = bc; j < bc + spec.boxCols; j++) if (values[i][j]) used.add(values[i][j])

  const out: number[] = []
  for (let v = 1; v <= spec.cols; v++) {
    if (used.has(v)) continue
    let ok = true
    for (const con of constraints) {
      const ka = addrKey2(con.a)
      const kb = addrKey2(con.b)
      const isA = ka === addrKey2(addr)
      const isB = kb === addrKey2(addr)
      if (!isA && !isB) continue
      const other = isA ? con.b : con.a
      const ov = values[other.r - 1][other.c - 1]
      if (!ov) continue
      const type = isA ? con.type : flip(con.type)
      if (type === '>' && v <= ov) ok = false
      if (type === '<' && v >= ov) ok = false
      if (type === '=' && v !== ov) ok = false
      if (!ok) break
    }
    if (ok) out.push(v)
  }
  return out
}

const addrKey2 = (a: Addr): string => `${a.r},${a.c}`
function flip(t: Constraint['type']): Constraint['type'] {
  if (t === '>') return '<'
  if (t === '<') return '>'
  return '='
}
