import type { Addr, Puzzle } from '../core/types'
import { CLASSIC_9 } from '../core/types'

/**
 * 内置题库。基础题为书上的「谜题014 · 不等号数独」，
 * 经照片颜色分离提取 + 求解器唯一解验证 + 人工逐条目检修正（2026-09-25）。
 * 题面以数据形式存在（非硬编码逻辑），新增题目往 BUILTIN_PUZZLES 里加即可。
 */

const a = (r: number, c: number): Addr => ({ r, c })

export const BASE_PUZZLE: Puzzle = {
  id: 'book-014',
  name: '谜题014 · 不等号数独（书题）',
  spec: CLASSIC_9,
  givens: [
    { addr: a(1, 2), value: 7 },
    { addr: a(1, 4), value: 2 },
    { addr: a(1, 5), value: 5 },
    { addr: a(2, 5), value: 3 },
    { addr: a(3, 5), value: 7 },
    { addr: a(4, 5), value: 1 },
    { addr: a(5, 4), value: 9 },
    { addr: a(6, 2), value: 3 },
    { addr: a(7, 2), value: 2 },
    { addr: a(7, 4), value: 7 },
    { addr: a(8, 3), value: 5 },
    { addr: a(9, 3), value: 9 },
  ],
  constraints: [
    // 横向 16 条
    { type: '>', a: a(1, 3), b: a(1, 4) },
    { type: '<', a: a(1, 5), b: a(1, 6) },
    { type: '<', a: a(1, 8), b: a(1, 9) },
    { type: '<', a: a(2, 3), b: a(2, 4) },
    { type: '<', a: a(2, 8), b: a(2, 9) },
    { type: '>', a: a(3, 5), b: a(3, 6) },
    { type: '>', a: a(3, 6), b: a(3, 7) },
    { type: '>', a: a(4, 2), b: a(4, 3) },
    { type: '>', a: a(6, 3), b: a(6, 4) },
    { type: '<', a: a(6, 4), b: a(6, 5) },
    { type: '>', a: a(7, 3), b: a(7, 4) },
    { type: '<', a: a(7, 6), b: a(7, 7) },
    { type: '<', a: a(8, 2), b: a(8, 3) },
    { type: '<', a: a(8, 6), b: a(8, 7) },
    { type: '<', a: a(8, 7), b: a(8, 8) },
    { type: '<', a: a(9, 8), b: a(9, 9) },
    // 纵向 12 条
    { type: '>', a: a(1, 1), b: a(2, 1) },
    { type: '>', a: a(2, 6), b: a(1, 6) },
    { type: '>', a: a(1, 7), b: a(2, 7) },
    { type: '>', a: a(3, 7), b: a(2, 7) },
    { type: '>', a: a(3, 9), b: a(2, 9) },
    { type: '>', a: a(3, 7), b: a(4, 7) },
    { type: '>', a: a(4, 8), b: a(3, 8) },
    { type: '>', a: a(4, 3), b: a(5, 3) },
    { type: '>', a: a(7, 9), b: a(6, 9) },
    { type: '>', a: a(8, 9), b: a(7, 9) },
    { type: '>', a: a(7, 6), b: a(8, 6) },
    { type: '>', a: a(8, 4), b: a(9, 4) },
  ],
  solution: [
    [9, 7, 3, 2, 5, 8, 4, 1, 6],
    [6, 5, 1, 4, 3, 9, 2, 7, 8],
    [2, 8, 4, 1, 7, 6, 5, 3, 9],
    [5, 9, 6, 8, 1, 7, 3, 4, 2],
    [8, 1, 2, 9, 4, 3, 7, 6, 5],
    [4, 3, 7, 5, 6, 2, 9, 8, 1],
    [1, 2, 8, 7, 9, 4, 6, 5, 3],
    [3, 4, 5, 6, 2, 1, 8, 9, 7],
    [7, 6, 9, 3, 8, 5, 1, 2, 4],
  ],
}

export const BUILTIN_PUZZLES: Puzzle[] = [BASE_PUZZLE]
