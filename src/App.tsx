import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Addr, Difficulty, Puzzle } from './core/types'
import { BASE_PUZZLE } from './data/puzzles'
import {
  emptyProgress,
  findConflicts,
  intervalOf,
  isComplete,
  isGiven,
  applyHint,
  eraseCell,
  revealSolution,
  setValue,
  sameValueCells,
  toggleNote,
  wrongVsSolution,
  type Progress,
  type Snapshot,
} from './core/engine'
import { generateRandom } from './core/generator'
import { FULL_TRANSFORM, transformPuzzle } from './core/variants'
import { CLASSIC_9 } from './core/types'
import { Board } from './components/Board'
import { Keypad } from './components/Keypad'
import { Controls } from './components/Controls'
import { WinOverlay } from './components/WinOverlay'

type Theme = 'book' | 'nature'

interface SaveData {
  puzzle: Puzzle
  progress: Progress
  seconds: number
  difficulty: Difficulty
}

const loadSave = (): SaveData | null => {
  try {
    const raw = localStorage.getItem('isudoku.save')
    if (!raw) return null
    const data = JSON.parse(raw) as SaveData
    const pz = data?.puzzle
    const pg = data?.progress
    const okShape =
      pz &&
      pz.spec &&
      typeof pz.spec.rows === 'number' &&
      Array.isArray(pz.givens) &&
      Array.isArray(pz.constraints) &&
      pg &&
      Array.isArray(pg.values) &&
      pg.values.length === pz.spec.rows &&
      pg.values.every((row: unknown) => Array.isArray(row) && row.length === pz.spec.cols) &&
      Array.isArray(pg.notes) &&
      typeof pg.hinted !== 'undefined'
    if (!okShape) return null
    data.progress.hinted = new Set(data.progress.hinted)
    return data
  } catch {
    return null
  }
}

const fmtTime = (s: number): string =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function App() {
  const saved = useRef(loadSave())
  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem('isudoku.theme') as Theme) || 'book',
  )
  const [puzzle, setPuzzle] = useState<Puzzle>(saved.current?.puzzle ?? BASE_PUZZLE)
  const [progress, setProgress] = useState<Progress>(
    saved.current?.progress ?? emptyProgress(BASE_PUZZLE),
  )
  const [history, setHistory] = useState<Snapshot[]>([])
  const [selected, setSelected] = useState<Addr | null>(null)
  const [noteMode, setNoteMode] = useState(false)
  const [seconds, setSeconds] = useState(saved.current?.seconds ?? 0)
  const [difficulty, setDifficulty] = useState<Difficulty>(saved.current?.difficulty ?? 'medium')
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'warn' } | null>(null)
  const [solved, setSolved] = useState(false)

  // 主题
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('isudoku.theme', theme)
  }, [theme])

  // 计时（页面隐藏时暂停，避免用时虚高）
  useEffect(() => {
    if (solved || progress.revealed) return
    const t = setInterval(() => {
      if (!document.hidden) setSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [solved, progress.revealed])

  // 过关检测
  useEffect(() => {
    if (!solved && isComplete(progress, puzzle) && !progress.revealed) setSolved(true)
  }, [progress, puzzle, solved])

  // 本地存档
  useEffect(() => {
    const data: SaveData = {
      puzzle,
      progress: { ...progress, hinted: [...progress.hinted] } as unknown as Progress,
      seconds,
      difficulty,
    }
    localStorage.setItem('isudoku.save', JSON.stringify(data))
  }, [puzzle, progress, seconds, difficulty])

  const toastTimer = useRef<number | undefined>(undefined)
  const showToast = useCallback((text: string, tone: 'info' | 'warn' = 'info') => {
    setToast({ text, tone })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const conflicts = useMemo(() => findConflicts(progress, puzzle), [progress, puzzle])
  const wrong = useMemo(() => wrongVsSolution(progress, puzzle), [progress, puzzle])
  const marked = useMemo(() => new Set([...conflicts, ...wrong]), [conflicts, wrong])
  const sameValues = useMemo(() => sameValueCells(progress, selected), [progress, selected])
  const interval = useMemo(
    () => (selected ? intervalOf(progress, puzzle, selected) : []),
    [progress, puzzle, selected],
  )
  const digitDone = useMemo(() => {
    // 只统计「正确就位」的数字：给定数或与权威解一致的用户填入
    const count = new Array(10).fill(0)
    for (let r = 0; r < puzzle.spec.rows; r++)
      for (let c = 0; c < puzzle.spec.cols; c++) {
        const v = progress.values[r][c]
        if (v && (!wrong.has(`${r + 1},${c + 1}`) || isGiven(puzzle, { r: r + 1, c: c + 1 }))) count[v]++
      }
    return count.map((c) => c >= puzzle.spec.rows)
  }, [progress, puzzle, wrong])

  const mutate = useCallback(
    (fn: (p: Progress) => Progress) => {
      setProgress((prev) => {
        const snapshot: Snapshot = {
          values: prev.values.map((r) => [...r]),
          notes: prev.notes.map((r) => [...r]),
          hinted: new Set(prev.hinted),
        }
        setHistory((h) => [...h.slice(-199), snapshot])
        return fn(prev)
      })
    },
    [],
  )

  const inputDigit = useCallback(
    (v: number) => {
      if (!selected || solved || progress.revealed) return
      mutate((p) => (noteMode ? toggleNote(p, puzzle, selected, v) : setValue(p, puzzle, selected, v)))
    },
    [selected, solved, progress.revealed, noteMode, puzzle, mutate],
  )

  const startPuzzle = useCallback((p: Puzzle, label: string) => {
    setPuzzle(p)
    setProgress(emptyProgress(p))
    setHistory([])
    setSeconds(0)
    setSolved(false)
    setSelected(null)
    showToast(label, 'info')
  }, [showToast])

  const onNewRandom = useCallback(() => {
    try {
      const p = generateRandom(CLASSIC_9, difficulty)
      startPuzzle(p, `已生成「${difficulty === 'easy' ? '简单' : difficulty === 'medium' ? '中等' : '困难'}」随机新题（唯一解已验证）`)
    } catch (e) {
      showToast('生成失败，请再试一次', 'warn')
    }
  }, [difficulty, startPuzzle, showToast])

  const onVariant = useCallback(() => {
    try {
      const v = transformPuzzle(puzzle, FULL_TRANSFORM)
      startPuzzle(v, '已生成同构变体（唯一解已验证）')
    } catch (e) {
      showToast('变体生成失败', 'warn')
    }
  }, [puzzle, startPuzzle, showToast])

  const onHint = useCallback(() => {
    const res = applyHint(progress, puzzle)
    if (res.kind === 'conflict') {
      showToast('盘面存在冲突或与解答不符的数字（红色格），先纠正再提示', 'warn')
      return
    }
    if (res.kind === 'done') {
      showToast('没有可提示的空格了', 'info')
      return
    }
    mutate((p) => {
      const next = setValue(p, puzzle, res.addr, res.value)
      next.hinted.add(`${res.addr.r},${res.addr.c}`)
      return next
    })
    setSelected(res.addr)
  }, [progress, puzzle, mutate, showToast])

  const onCheck = useCallback(() => {
    const n = conflicts.size + wrong.size
    if (n === 0) {
      const remaining =
        puzzle.spec.rows * puzzle.spec.cols - progress.values.flat().filter((v) => v).length
      showToast(remaining === 0 ? '完成！' : `目前没有问题，还剩 ${remaining} 格`, 'info')
    } else {
      showToast(`发现 ${n} 处问题（冲突或与解答不符，红色标注）`, 'warn')
    }
  }, [conflicts, wrong, progress, puzzle])

  const onReveal = useCallback(() => {
    if (!puzzle.solution) {
      showToast('该题无预存解答', 'warn')
      return
    }
    mutate((p) => revealSolution(p, puzzle))
    showToast('已显示解答', 'info')
  }, [puzzle, mutate, showToast])

  const onUndo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h
      const last = h[h.length - 1]
      setProgress({ values: last.values, notes: last.notes, hinted: last.hinted, revealed: false })
      return h.slice(0, -1)
    })
  }, [])

  const onRestart = useCallback(() => {
    setProgress(emptyProgress(puzzle))
    setHistory([])
    setSolved(false)
    setSelected(null)
    showToast('本题已重开', 'info')
  }, [puzzle, showToast])

  // 键盘操作
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (solved) return
      if (e.key >= '1' && e.key <= '9') {
        inputDigit(Number(e.key))
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        if (selected) mutate((p) => eraseCell(p, puzzle, selected))
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        setNoteMode((m) => !m)
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        onUndo()
        return
      }
      if (e.key === 'h' || e.key === 'H') {
        onHint()
        return
      }
      const moves: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      }
      if (e.key in moves && selected) {
        e.preventDefault()
        const [dr, dc] = moves[e.key]
        const r = Math.min(9, Math.max(1, selected.r + dr))
        const c = Math.min(9, Math.max(1, selected.c + dc))
        setSelected({ r, c })
      } else if (e.key in moves) {
        setSelected({ r: 1, c: 1 })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, solved, inputDigit, mutate, puzzle, onHint, onUndo])

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>不等号数独</h1>
          <span className="puzzle-name">{puzzle.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="timer">{fmtTime(seconds)}</span>
          <button
            onClick={() => setTheme((t) => (t === 'book' ? 'nature' : 'book'))}
            title="切换主题"
            style={{ padding: '5px 10px' }}
          >
            {theme === 'book' ? '🌙 自然' : '📕 书风'}
          </button>
        </div>
      </header>

      <Board
        puzzle={puzzle}
        progress={progress}
        selected={selected}
        conflicts={marked}
        sameValues={sameValues}
        onSelect={setSelected}
      />

      <div className="info-strip">
        <span>
          选中
          <span className="addr"> {selected ? `r${selected.r}c${selected.c}` : '—'}</span>
          {selected && isGiven(puzzle, selected) ? '（给定数）' : ''}
        </span>
        <span className="interval">
          {interval.length > 0 ? (
            <>
              可行区间：
              {interval.map((v) => (
                <span key={v} className="chip">
                  {v}
                </span>
              ))}
            </>
          ) : selected ? (
            <span className="empty">{progress.values[selected.r - 1][selected.c - 1] ? '已填' : '无可行数字（检查冲突）'}</span>
          ) : (
            <span className="empty">点击格子查看可行区间</span>
          )}
        </span>
      </div>

      <Keypad
        noteMode={noteMode}
        digitDone={digitDone}
        onNumber={inputDigit}
        onErase={() => selected && mutate((p) => eraseCell(p, puzzle, selected))}
        onToggleNoteMode={() => setNoteMode((m) => !m)}
      />

      <Controls
        difficulty={difficulty}
        onDifficulty={setDifficulty}
        onNewRandom={onNewRandom}
        onVariant={onVariant}
        onBase={() => startPuzzle(BASE_PUZZLE, '回到书题 014')}
        onHint={onHint}
        onCheck={onCheck}
        onReveal={onReveal}
        onUndo={onUndo}
        onRestart={onRestart}
        canUndo={history.length > 0}
      />

      {toast && <div className={`toast ${toast.tone === 'info' ? 'info' : ''}`}>{toast.text}</div>}

      {solved && (
        <WinOverlay
          seconds={seconds}
          isBase={puzzle.id === BASE_PUZZLE.id}
          onAgain={onNewRandom}
          onVariant={onVariant}
          onClose={() => setSolved(false)}
        />
      )}

      <footer className="credit">
        基础题源自谜题书「不等号数独 014」，经照片提取 + 唯一解验证 · 变体与随机题均由求解器把关
      </footer>
    </div>
  )
}
