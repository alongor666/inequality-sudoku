import { describe, expect, it } from 'vitest'
import { BASE_PUZZLE } from '../data/puzzles'
import { solvePuzzle } from '../core/solver'
import { FULL_TRANSFORM, transformPuzzle } from '../core/variants'
import { generateRandom } from '../core/generator'
import { emptyProgress, findConflicts, intervalOf, isComplete, setValue, toggleNote } from '../core/engine'
import type { Addr } from '../core/types'

const KNOWN_SOLUTION = [
  [9, 7, 3, 2, 5, 8, 4, 1, 6],
  [6, 5, 1, 4, 3, 9, 2, 7, 8],
  [2, 8, 4, 1, 7, 6, 5, 3, 9],
  [5, 9, 6, 8, 1, 7, 3, 4, 2],
  [8, 1, 2, 9, 4, 3, 7, 6, 5],
  [4, 3, 7, 5, 6, 2, 9, 8, 1],
  [1, 2, 8, 7, 9, 4, 6, 5, 3],
  [3, 4, 5, 6, 2, 1, 8, 9, 7],
  [7, 6, 9, 3, 8, 5, 1, 2, 4],
]

describe('基础题（谜题014）', () => {
  it('恰好唯一解', () => {
    const res = solvePuzzle(BASE_PUZZLE.spec, BASE_PUZZLE.givens, BASE_PUZZLE.constraints, 2)
    expect(res.count).toBe(1)
  })

  it('解与人工核验的答案一致', () => {
    const res = solvePuzzle(BASE_PUZZLE.spec, BASE_PUZZLE.givens, BASE_PUZZLE.constraints, 1)
    expect(res.solution).toEqual(KNOWN_SOLUTION)
  })

  it('题面数据完好：12 给定数 + 28 约束', () => {
    expect(BASE_PUZZLE.givens).toHaveLength(12)
    expect(BASE_PUZZLE.constraints).toHaveLength(28)
  })

  it('数据完整性：每条约束、每个给定数都必须与权威解自洽（防翻译错方向）', () => {
    const sol = BASE_PUZZLE.solution!
    for (const g of BASE_PUZZLE.givens) expect(sol[g.addr.r - 1][g.addr.c - 1]).toBe(g.value)
    for (const con of BASE_PUZZLE.constraints) {
      const va = sol[con.a.r - 1][con.a.c - 1]
      const vb = sol[con.b.r - 1][con.b.c - 1]
      const ok = con.type === '>' ? va > vb : con.type === '<' ? va < vb : va === vb
      expect(ok, `约束 r${con.a.r}c${con.a.c} ${con.type} r${con.b.r}c${con.b.c} 不满足`).toBe(true)
    }
  })
})

describe('置换变体', () => {
  const SEED_RNG = (seed: number) => {
    let s = seed
    return (): number => {
      s = (s * 16807) % 2147483647
      return s / 2147483647
    }
  }

  it('全变换变体唯一解且与原题同构（给定数/约束数量不变、位置变换不改变符号方向）', () => {
    const rng = SEED_RNG(42)
    for (let i = 0; i < 8; i++) {
      const v = transformPuzzle(BASE_PUZZLE, FULL_TRANSFORM, rng)
      expect(v.givens).toHaveLength(BASE_PUZZLE.givens.length)
      expect(v.constraints).toHaveLength(BASE_PUZZLE.constraints.length)
      const res = solvePuzzle(v.spec, v.givens, v.constraints, 2)
      expect(res.count).toBe(1)
      expect(res.solution).toEqual(v.solution)
      for (const row of v.solution!) expect([...row].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    }
  })

  it('单维度变换（仅行/仅列/仅转置）各自也保持唯一解', () => {
    const cases = [
      { name: '仅行', opts: { permuteRows: true, permuteCols: false, transpose: false } },
      { name: '仅列', opts: { permuteRows: false, permuteCols: true, transpose: false } },
      { name: '仅转置', opts: { permuteRows: false, permuteCols: false, transpose: true } },
    ] as const
    const rng = SEED_RNG(99)
    for (const c of cases) {
      const v = transformPuzzle(BASE_PUZZLE, c.opts, rng)
      expect(solvePuzzle(v.spec, v.givens, v.constraints, 2).count, c.name).toBe(1)
    }
  })

  it('回归存档：数字置换对不等号数独不保唯一性（引擎因此不提供数字置换变体）', () => {
    // 把原题解做 1<->2 对换、约束方向按新解重推后，同一约束集出现多解
    const perm = [1, 0, 2, 3, 4, 5, 6, 7, 8]
    const sol = BASE_PUZZLE.solution!.map((row) => row.map((v) => perm[v - 1] + 1))
    const givens = BASE_PUZZLE.givens.map((g) => ({ addr: g.addr, value: perm[g.value - 1] + 1 }))
    const cons = BASE_PUZZLE.constraints.map((c) => {
      const va = sol[c.a.r - 1][c.a.c - 1]
      const vb = sol[c.b.r - 1][c.b.c - 1]
      return va > vb ? { type: '>' as const, a: c.a, b: c.b } : { type: '<' as const, a: c.a, b: c.b }
    })
    expect(solvePuzzle(BASE_PUZZLE.spec, givens, cons, 2).count).toBeGreaterThan(1)
  })
})

describe('随机生成器', () => {
  it('三种难度各生成若干题，全部唯一解且派生自解盘', () => {
    let seeded = 7
    const rng = (): number => {
      seeded = (seeded * 48271) % 2147483647
      return seeded / 2147483647
    }
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      for (let i = 0; i < 2; i++) {
        const p = generateRandom(BASE_PUZZLE.spec, difficulty, rng)
        const res = solvePuzzle(p.spec, p.givens, p.constraints, 2)
        expect(res.count).toBe(1)
        expect(res.solution).toEqual(p.solution)
        for (const row of p.solution!) expect([...row].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
      }
    }
  })
})

describe('对局引擎', () => {
  const addr = (r: number, c: number): Addr => ({ r, c })

  it('区间提示：开局 r1c1 可行集 = {1,3,4,6,8,9}', () => {
    const p = emptyProgress(BASE_PUZZLE)
    expect(intervalOf(p, BASE_PUZZLE, addr(1, 1))).toEqual([1, 3, 4, 6, 8, 9])
  })

  it('行重复被标记为冲突', () => {
    let p = emptyProgress(BASE_PUZZLE)
    p = setValue(p, BASE_PUZZLE, addr(1, 1), 7) // 与 r1c2=7 同行
    expect(findConflicts(p, BASE_PUZZLE).has('1,1')).toBe(true)
  })

  it('违反比较符号被标记为冲突（r1c3 必须 > r1c4=2）', () => {
    let p = emptyProgress(BASE_PUZZLE)
    p = setValue(p, BASE_PUZZLE, addr(1, 3), 1)
    expect(findConflicts(p, BASE_PUZZLE).has('1,3')).toBe(true)
    p = setValue(p, BASE_PUZZLE, addr(1, 3), 3)
    expect(findConflicts(p, BASE_PUZZLE).has('1,3')).toBe(false)
  })

  it('候选笔记开关与擦除', () => {
    let p = emptyProgress(BASE_PUZZLE)
    p = toggleNote(p, BASE_PUZZLE, addr(1, 1), 3)
    expect(p.notes[0][0] & (1 << 3)).toBeTruthy()
    p = toggleNote(p, BASE_PUZZLE, addr(1, 1), 3)
    expect(p.notes[0][0] & (1 << 3)).toBeFalsy()
  })

  it('按解答填满即完成且无冲突', () => {
    let p = emptyProgress(BASE_PUZZLE)
    for (let r = 1; r <= 9; r++)
      for (let c = 1; c <= 9; c++) if (!p.values[r - 1][c - 1]) p = setValue(p, BASE_PUZZLE, addr(r, c), KNOWN_SOLUTION[r - 1][c - 1])
    expect(isComplete(p, BASE_PUZZLE)).toBe(true)
  })

  it('可行域收窄：r1c3 填 1 后，因 r1c3>2 成立无冲突；但填 1 会让 r1c1 的可行集收缩', () => {
    let p = emptyProgress(BASE_PUZZLE)
    p = setValue(p, BASE_PUZZLE, addr(1, 3), 4)
    const f = intervalOf(p, BASE_PUZZLE, addr(1, 1))
    // r1c3=4 与 r1c1 同行 → 4 被排除；r1c1 > r2c1（空）无上界
    expect(f).toEqual([1, 3, 6, 8, 9])
  })
})
