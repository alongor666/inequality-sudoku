import type { Addr, Puzzle } from './types'
import { feasibleValues } from './solver'

/**
 * 对局引擎：纯函数状态机，React 只做渲染。
 * values 以 0 表示空；notes 用位掩码（bit v = 候选 v）。
 */

export interface Progress {
  values: number[][]
  notes: number[][]
  hinted: Set<string> // r,c —— 由提示填入的格子，样式区分
  revealed: boolean // 已放弃对局、直接显示解答
}

export interface Snapshot {
  values: number[][]
  notes: number[][]
  hinted: Set<string>
}

export function emptyProgress(puzzle: Puzzle): Progress {
  const n = puzzle.spec.rows
  const values: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const notes: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (const g of puzzle.givens) values[g.addr.r - 1][g.addr.c - 1] = g.value
  return { values, notes, hinted: new Set(), revealed: false }
}

export function isGiven(puzzle: Puzzle, addr: Addr): boolean {
  return puzzle.givens.some((g) => g.addr.r === addr.r && g.addr.c === addr.c)
}

export function setValue(p: Progress, puzzle: Puzzle, addr: Addr, v: number | null): Progress {
  if (isGiven(puzzle, addr) || p.revealed) return p
  const next: Progress = { ...p, values: p.values.map((r) => [...r]), notes: p.notes.map((r) => [...r]), hinted: new Set(p.hinted) }
  next.values[addr.r - 1][addr.c - 1] = v ?? 0
  if (v !== null) {
    next.notes[addr.r - 1][addr.c - 1] = 0
    // 同行/列/宫的候选笔记自动清掉该数字
    const { spec } = puzzle
    for (let r = 1; r <= spec.rows; r++)
      for (let c = 1; c <= spec.cols; c++) {
        if (r === addr.r && c === addr.c) continue
        const sameRow = r === addr.r
        const sameCol = c === addr.c
        const sameBox =
          Math.floor((r - 1) / spec.boxRows) === Math.floor((addr.r - 1) / spec.boxRows) &&
          Math.floor((c - 1) / spec.boxCols) === Math.floor((addr.c - 1) / spec.boxCols)
        if (sameRow || sameCol || sameBox) next.notes[r - 1][c - 1] &= ~(1 << v)
      }
  }
  return next
}

export function toggleNote(p: Progress, puzzle: Puzzle, addr: Addr, v: number): Progress {
  if (isGiven(puzzle, addr) || p.revealed) return p
  if (p.values[addr.r - 1][addr.c - 1] !== 0) return p
  const next: Progress = { ...p, values: p.values.map((r) => [...r]), notes: p.notes.map((r) => [...r]), hinted: new Set(p.hinted) }
  next.notes[addr.r - 1][addr.c - 1] ^= 1 << v
  return next
}

export function eraseCell(p: Progress, puzzle: Puzzle, addr: Addr): Progress {
  if (isGiven(puzzle, addr) || p.revealed) return p
  const next: Progress = { ...p, values: p.values.map((r) => [...r]), notes: p.notes.map((r) => [...r]), hinted: new Set(p.hinted) }
  next.values[addr.r - 1][addr.c - 1] = 0
  next.notes[addr.r - 1][addr.c - 1] = 0
  return next
}

export function revealSolution(p: Progress, puzzle: Puzzle): Progress {
  if (!puzzle.solution) return p
  const next: Progress = { ...p, values: p.values.map((r) => [...r]), notes: p.notes.map((r) => [...r]), hinted: new Set(p.hinted) }
  for (let r = 0; r < puzzle.spec.rows; r++)
    for (let c = 0; c < puzzle.spec.cols; c++) next.values[r][c] = puzzle.solution[r][c]
  next.revealed = true
  return next
}

/** 提示：盘面无误时填入一个空格（优先唯一候选格），有误时返回冲突提示。 */
export function applyHint(
  p: Progress,
  puzzle: Puzzle,
): { kind: 'filled'; addr: Addr; value: number } | { kind: 'conflict' } | { kind: 'done' } {
  if (p.revealed) return { kind: 'done' }
  const conflicts = findConflicts(p, puzzle)
  if (conflicts.size > 0) return { kind: 'conflict' }
  if (!puzzle.solution) return { kind: 'conflict' }
  const empties: Addr[] = []
  for (let r = 1; r <= puzzle.spec.rows; r++)
    for (let c = 1; c <= puzzle.spec.cols; c++)
      if (p.values[r - 1][c - 1] === 0) empties.push({ r, c })
  if (empties.length === 0) return { kind: 'done' }
  // 优先可行域只剩一个值的格子
  let pick = empties[0]
  let pickFeasible: number[] = []
  for (const addr of empties) {
    const f = feasibleValues(puzzle.spec, p.values, puzzle.constraints, addr)
    if (f.length === 1) {
      pick = addr
      pickFeasible = f
      break
    }
    if (pickFeasible.length === 0 || f.length < pickFeasible.length) {
      pick = addr
      pickFeasible = f
    }
  }
  const value = pickFeasible.length === 1 ? pickFeasible[0] : puzzle.solution[pick.r - 1][pick.c - 1]
  const next = setValue(p, puzzle, pick, value)
  next.hinted.add(`${pick.r},${pick.c}`)
  return { kind: 'filled', addr: pick, value }
}

/**
 * 冲突检测：返回有问题的格子集合（1 起 r,c 键）。
 * 含：行/列/宫重复、比较约束违背、与给定数矛盾（给定数本身不会错，标用户格）。
 */
export function findConflicts(p: Progress, puzzle: Puzzle): Set<string> {
  const bad = new Set<string>()
  const { values } = p
  const n = puzzle.spec

  // 行/列重复
  for (let r = 0; r < n.rows; r++) {
    const seen = new Map<number, number[]>()
    for (let c = 0; c < n.cols; c++) {
      const v = values[r][c]
      if (!v) continue
      const arr = seen.get(v) ?? []
      arr.push(c)
      seen.set(v, arr)
    }
    for (const arr of seen.values())
      if (arr.length > 1) arr.forEach((c) => bad.add(`${r + 1},${c + 1}`))
  }
  for (let c = 0; c < n.cols; c++) {
    const seen = new Map<number, number[]>()
    for (let r = 0; r < n.rows; r++) {
      const v = values[r][c]
      if (!v) continue
      const arr = seen.get(v) ?? []
      arr.push(r)
      seen.set(v, arr)
    }
    for (const arr of seen.values())
      if (arr.length > 1) arr.forEach((r) => bad.add(`${r + 1},${c + 1}`))
  }
  // 宫重复
  for (let br = 0; br < n.rows; br += n.boxRows)
    for (let bc = 0; bc < n.cols; bc += n.boxCols) {
      const seen = new Map<number, string[]>()
      for (let i = br; i < br + n.boxRows; i++)
        for (let j = bc; j < bc + n.boxCols; j++) {
          const v = values[i][j]
          if (!v) continue
          const arr = seen.get(v) ?? []
          arr.push(`${i + 1},${j + 1}`)
          seen.set(v, arr)
        }
      for (const arr of seen.values()) if (arr.length > 1) arr.forEach((k) => bad.add(k))
    }

  // 约束违背（两端都有值才判）
  for (const con of puzzle.constraints) {
    const va = values[con.a.r - 1][con.a.c - 1]
    const vb = values[con.b.r - 1][con.b.c - 1]
    if (!va || !vb) continue
    const ok =
      con.type === '>' ? va > vb : con.type === '<' ? va < vb : va === vb
    if (!ok) {
      // 只标非给定数的那一端；两端都是给定数说明题面错误（不应发生）
      if (!isGiven(puzzle, con.a)) bad.add(`${con.a.r},${con.a.c}`)
      if (!isGiven(puzzle, con.b)) bad.add(`${con.b.r},${con.b.c}`)
    }
  }
  return bad
}

export function isComplete(p: Progress, puzzle: Puzzle): boolean {
  for (let r = 0; r < puzzle.spec.rows; r++)
    for (let c = 0; c < puzzle.spec.cols; c++) if (!p.values[r][c]) return false
  return findConflicts(p, puzzle).size === 0
}

/**
 * 与权威解不符的用户数字（不违规但错了的「暗雷」也算）。
 * 仅在题目带 solution 时有意义。
 */
export function wrongVsSolution(p: Progress, puzzle: Puzzle): Set<string> {
  const bad = new Set<string>()
  if (!puzzle.solution) return bad
  for (let r = 0; r < puzzle.spec.rows; r++)
    for (let c = 0; c < puzzle.spec.cols; c++) {
      const v = p.values[r][c]
      if (!v || isGiven(puzzle, { r: r + 1, c: c + 1 })) continue
      if (v !== puzzle.solution[r][c]) bad.add(`${r + 1},${c + 1}`)
    }
  return bad
}

/** 区间提示：选中格的可行数字集合（空数组 = 已填/无候选）。 */
export function intervalOf(p: Progress, puzzle: Puzzle, addr: Addr): number[] {
  if (p.values[addr.r - 1][addr.c - 1] !== 0) return []
  return feasibleValues(puzzle.spec, p.values, puzzle.constraints, addr)
}

/** 同数高亮：与选中格数字相同的所有格 */
export function sameValueCells(p: Progress, addr: Addr | null): Set<string> {
  const out = new Set<string>()
  if (!addr) return out
  const v = p.values[addr.r - 1][addr.c - 1]
  if (!v) return out
  for (let r = 0; r < p.values.length; r++)
    for (let c = 0; c < p.values[r].length; c++) if (p.values[r][c] === v) out.add(`${r + 1},${c + 1}`)
  return out
}
