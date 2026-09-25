/** 格子地址，1 起。r1c1 = 左上角。 */
export interface Addr {
  r: number
  c: number
}

/** 比较约束：a 与 b 之间满足 type 关系。'>' 表示 a > b。 */
export type ConstraintType = '>' | '<' | '='

export interface Constraint {
  type: ConstraintType
  a: Addr
  b: Addr
}

/** 盘面规格：rows × cols，宫为 boxRows × boxCols。数字范围 1..N（N = rows，方形盘）。 */
export interface GridSpec {
  rows: number
  cols: number
  boxRows: number
  boxCols: number
}

export const CLASSIC_9: GridSpec = { rows: 9, cols: 9, boxRows: 3, boxCols: 3 }

/** 一道题：给定数 + 约束集。solution 存在时即该题的权威解。 */
export interface Puzzle {
  id: string
  name: string
  spec: GridSpec
  givens: { addr: Addr; value: number }[]
  constraints: Constraint[]
  solution?: number[][]
}

export type Difficulty = 'easy' | 'medium' | 'hard'

export const DIFFICULTY_PRESETS: Record<
  Difficulty,
  { label: string; givens: number; signProb: number }
> = {
  easy: { label: '简单', givens: 40, signProb: 0.35 },
  medium: { label: '中等', givens: 32, signProb: 0.25 },
  hard: { label: '困难', givens: 26, signProb: 0.18 },
}

export const addrKey = (a: Addr): string => `r${a.r}c${a.c}`
export const keyAddr = (key: string): Addr => {
  const m = /^r(\d+)c(\d+)$/.exec(key)
  if (!m) throw new Error(`非法格子地址: ${key}`)
  return { r: Number(m[1]), c: Number(m[2]) }
}
