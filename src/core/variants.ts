import type { Addr, Constraint, Puzzle } from './types'
import { hasUniqueSolution } from './solver'

/**
 * 置换变体：对题目做数独的**位置类**对称变换（行带内行交换 / 行带交换 / 列同理 / 转置），
 * 从变换后的解重推每条约束的方向，得到与原题同构的新题。
 *
 * 为什么没有数字置换：不等号约束依赖数字的**序**关系，任意 1..9 置换不保序
 * （5>3 置换后可能变 2<7），重推方向得到的约束集弱于原题，唯一性不再保持。
 * 位置类变换完全保序（a>b 在新位置仍是 a>b），唯一性天然保持；
 * 出口仍强制唯一解验证，fail-closed。
 */

export interface TransformOptions {
  permuteRows: boolean // 行带内行交换 + 行带整体交换
  permuteCols: boolean
  transpose: boolean
}

export const FULL_TRANSFORM: TransformOptions = {
  permuteRows: true,
  permuteCols: true,
  transpose: true,
}

function shuffled<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function permWithinBands(n: number, band: number, rng: () => number): number[] {
  const bands: number[][] = []
  for (let b = 0; b < n; b += band) {
    bands.push(shuffled(Array.from({ length: band }, (_, i) => b + i), rng))
  }
  return shuffled(bands, rng).flat()
}

function transposeGrid(g: number[][]): number[][] {
  return g[0].map((_, j) => g.map((row) => row[j]))
}

export function transformPuzzle(
  p: Puzzle,
  opts: TransformOptions,
  rng: () => number = Math.random,
): Puzzle {
  if (!p.solution) throw new Error('变体生成需要题目带有权威解（solution）')
  const spec = p.spec
  let sol = p.solution.map((r) => [...r])

  // 位置映射（0 起）：newGrid[i][j] = oldGrid[rowMap[i]][colMap[j]]
  const rowMap = opts.permuteRows ? permWithinBands(spec.rows, spec.boxRows, rng) : Array.from({ length: spec.rows }, (_, i) => i)
  const colMap = opts.permuteCols ? permWithinBands(spec.cols, spec.boxCols, rng) : Array.from({ length: spec.cols }, (_, i) => i)

  // 旧地址 → 新地址用逆映射（newGrid[rowInv[oldR]][colInv[oldC]] = oldGrid[oldR][oldC]）
  const invert = (perm: number[]): number[] => {
    const out = new Array<number>(perm.length)
    perm.forEach((v, i) => {
      out[v] = i
    })
    return out
  }
  const rowInv = invert(rowMap)
  const colInv = invert(colMap)
  const mapAddr = (a: Addr): Addr => ({ r: rowInv[a.r - 1] + 1, c: colInv[a.c - 1] + 1 })

  // 应用位置变换（行重排 = 按 rowMap 取整行，不是行内按位重排）
  sol = rowMap.map((oi) => sol[oi])
  sol = sol.map((row) => colMap.map((oc) => row[oc]))
  if (opts.transpose) sol = transposeGrid(sol)

  const swap = (a: Addr): Addr => ({ r: a.c, c: a.r })
  const imageOf = opts.transpose ? (a: Addr): Addr => swap(mapAddr(a)) : mapAddr

  const givens = p.givens.map((g) => ({ addr: imageOf(g.addr), value: g.value }))
  const constraints = p.constraints.map((con) =>
    deriveConstraint(imageOf(con.a), imageOf(con.b), sol, con.type),
  )

  return finalize(p, sol, givens, constraints, rng)
}

/** 从变换后的解重推两格关系；位置变换下应与原方向一致，不一致即上游 bug。 */
function deriveConstraint(a: Addr, b: Addr, sol: number[][], originalType: Constraint['type']): Constraint {
  const va = sol[a.r - 1][a.c - 1]
  const vb = sol[b.r - 1][b.c - 1]
  if (originalType === '=') return { type: '=', a, b }
  const derived: Constraint['type'] = va > vb ? '>' : '<'
  if (derived !== originalType) {
    throw new Error(
      `方向不一致：原 ${originalType}，变换后推出 ${derived}（r${a.r}c${a.c}/${va} vs r${b.r}c${b.c}/${vb}）——位置变换不应改变大小关系`,
    )
  }
  return { type: derived, a, b }
}

function finalize(
  p: Puzzle,
  sol: number[][],
  givens: { addr: Addr; value: number }[],
  constraints: Constraint[],
  rng: () => number,
): Puzzle {
  const variant: Puzzle = {
    id: `${p.id}-v${Math.floor(rng() * 1e6).toString(36)}`,
    name: `${p.name} · 变体`,
    spec: p.spec,
    givens,
    constraints,
    solution: sol,
  }
  if (!hasUniqueSolution(variant)) {
    // 同构变换理论上必唯一；万一触发说明上游有 bug，带诊断明细抛错（fail-closed，不产坏题）
    const problems: string[] = []
    for (const g of givens) {
      const actual = sol[g.addr.r - 1][g.addr.c - 1]
      if (actual !== g.value) problems.push(`给定 r${g.addr.r}c${g.addr.c}=${g.value} 但解为 ${actual}`)
    }
    for (const con of constraints) {
      const va = sol[con.a.r - 1][con.a.c - 1]
      const vb = sol[con.b.r - 1][con.b.c - 1]
      const ok = con.type === '>' ? va > vb : con.type === '<' ? va < vb : va === vb
      if (!ok)
        problems.push(`约束 r${con.a.r}c${con.a.c} ${con.type} r${con.b.r}c${con.b.c}（解为 ${va}/${vb}）`)
    }
    throw new Error(`变体唯一性验证失败：上游变换存在 bug\n${problems.slice(0, 10).join('\n')}`)
  }
  return variant
}
