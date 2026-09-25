import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Addr, Constraint, Difficulty, Puzzle } from './core/types'
import { CLASSIC_9 } from './core/types'
import { BASE_PUZZLE } from './data/puzzles'
import {
  emptyProgress,
  findConflicts,
  intervalOf,
  isComplete,
  isGiven,
  hintTarget,
  autoFillNotes,
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
import { solvePuzzle } from './core/solver'
import { Board } from './components/Board'
import { Keypad } from './components/Keypad'
import { Controls } from './components/Controls'
import { DigitTracker } from './components/DigitTracker'
import { WinOverlay } from './components/WinOverlay'

type Theme = 'book' | 'nature'

interface SaveData {
  puzzle: Puzzle
  progress: Progress
  seconds: number
  difficulty: Difficulty
}

type StatsMap = Record<string, { done: number; best: number }>
const STAT_KEYS = ['easy', 'medium', 'hard', 'book'] as const
const STAT_LABELS: Record<string, string> = {
  easy: '简单',
  medium: '中等',
  hard: '困难',
  book: '书题',
}

const loadStats = (): StatsMap => {
  try {
    return JSON.parse(localStorage.getItem('isudoku.stats') || '{}') as StatsMap
  } catch {
    return {}
  }
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

interface EditorState {
  givens: number[][]
  signs: Map<string, Constraint>
  sel: Addr | null
}

const emptyEditor = (): EditorState => ({
  givens: Array.from({ length: 9 }, () => new Array(9).fill(0)),
  signs: new Map(),
  sel: null,
})

export default function App() {
  const saved = useRef(loadSave())
  const [theme, setTheme] = useState<Theme>(
    (localStorage.getItem('isudoku.theme') as Theme) || 'book',
  )
  const [puzzle, setPuzzle] = useState<Puzzle>(saved.current?.puzzle ?? BASE_PUZZLE)
  const [progress, setProgress] = useState<Progress>(
    saved.current?.progress ?? emptyProgress(BASE_PUZZLE),
  )
  const [past, setPast] = useState<Snapshot[]>([])
  const [future, setFuture] = useState<Snapshot[]>([])
  const [selected, setSelected] = useState<Addr | null>(null)
  const [noteMode, setNoteMode] = useState(false)
  const [seconds, setSeconds] = useState(saved.current?.seconds ?? 0)
  const [difficulty, setDifficulty] = useState<Difficulty>(saved.current?.difficulty ?? 'medium')
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'warn' } | null>(null)
  const [solved, setSolved] = useState(false)
  const [trackerDigit, setTrackerDigit] = useState<number | null>(null)
  const [hintFocus, setHintFocus] = useState<Addr | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [stats, setStats] = useState<StatsMap>(loadStats)

  // 主题
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('isudoku.theme', theme)
  }, [theme])

  // 计时（页面隐藏时暂停；出题模式不计）
  useEffect(() => {
    if (solved || progress.revealed || editor) return
    const t = setInterval(() => {
      if (!document.hidden) setSeconds((s) => s + 1)
    }, 1000)
    return () => clearInterval(t)
  }, [solved, progress.revealed, editor])

  // 过关检测 + 统计记录
  useEffect(() => {
    if (solved || editor) return
    if (isComplete(progress, puzzle) && !progress.revealed) {
      const key = puzzle.id.startsWith('book') ? 'book' : difficulty
      setStats((prev) => {
        const cur = prev[key] ?? { done: 0, best: Number.POSITIVE_INFINITY }
        const next = {
          ...prev,
          [key]: { done: cur.done + 1, best: Math.min(cur.best, seconds) },
        }
        localStorage.setItem('isudoku.stats', JSON.stringify(next))
        return next
      })
      setSolved(true)
    }
  }, [progress, puzzle, solved, editor, difficulty, seconds])

  // 本地存档
  useEffect(() => {
    if (editor) return
    const data: SaveData = {
      puzzle,
      progress: { ...progress, hinted: [...progress.hinted] } as unknown as Progress,
      seconds,
      difficulty,
    }
    localStorage.setItem('isudoku.save', JSON.stringify(data))
  }, [puzzle, progress, seconds, difficulty, editor])

  const toastTimer = useRef<number | undefined>(undefined)
  const showToast = useCallback((text: string, tone: 'info' | 'warn' = 'info') => {
    setToast({ text, tone })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2600)
  }, [])

  const conflicts = useMemo(() => findConflicts(progress, puzzle), [progress, puzzle])
  const wrong = useMemo(() => wrongVsSolution(progress, puzzle), [progress, puzzle])
  const marked = useMemo(() => new Set([...conflicts, ...wrong]), [conflicts, wrong])
  const peerAddrs = useMemo(() => {
    const out = new Set<string>()
    if (!selected || editor) return out
    for (let r = 1; r <= 9; r++)
      for (let c = 1; c <= 9; c++) {
        if (selected.r === r && selected.c === c) continue
        if (
          selected.r === r ||
          selected.c === c ||
          (Math.floor((selected.r - 1) / 3) === Math.floor((r - 1) / 3) &&
            Math.floor((selected.c - 1) / 3) === Math.floor((c - 1) / 3))
        )
          out.add(`r${r}c${c}`)
      }
    return out
  }, [selected, editor])
  const sameValues = useMemo(() => {
    if (trackerDigit) {
      const out = new Set<string>()
      for (let r = 0; r < progress.values.length; r++)
        for (let c = 0; c < progress.values[r].length; c++)
          if (progress.values[r][c] === trackerDigit) out.add(`r${r + 1}c${c + 1}`)
      return out
    }
    return sameValueCells(progress, selected)
  }, [progress, selected, trackerDigit])
  const interval = useMemo(
    () => (selected && !editor ? intervalOf(progress, puzzle, selected) : []),
    [progress, puzzle, selected, editor],
  )
  const digitDone = useMemo(() => {
    const count = new Array(10).fill(0)
    for (let r = 0; r < puzzle.spec.rows; r++)
      for (let c = 0; c < puzzle.spec.cols; c++) {
        const v = progress.values[r][c]
        if (v && (!wrong.has(`${r + 1},${c + 1}`) || isGiven(puzzle, { r: r + 1, c: c + 1 }))) count[v]++
      }
    return count.map((c) => c >= puzzle.spec.rows)
  }, [progress, puzzle, wrong])
  const remaining = useMemo(() => {
    const placed = new Array(10).fill(0)
    for (const row of progress.values) for (const v of row) if (v) placed[v]++
    return placed.map((c) => puzzle.spec.rows - c)
  }, [progress])

  const hasUserInput = useMemo(() => {
    for (let r = 1; r <= puzzle.spec.rows; r++)
      for (let c = 1; c <= puzzle.spec.cols; c++) {
        if (!isGiven(puzzle, { r, c })) {
          if (progress.values[r - 1][c - 1]) return true
          if (progress.notes[r - 1][c - 1]) return true
        }
      }
    return false
  }, [progress, puzzle])

  const confirmDiscard = useCallback(
    (action: string): boolean => {
      if (!hasUserInput || window.confirm(`${action}将丢弃当前对局进度，确定？`)) return true
      return false
    },
    [hasUserInput],
  )

  const mutate = useCallback((fn: (p: Progress) => Progress) => {
    setProgress((prev) => {
      const snap: Snapshot = {
        values: prev.values.map((r) => [...r]),
        notes: prev.notes.map((r) => [...r]),
        hinted: new Set(prev.hinted),
      }
      setPast((h) => [...h, snap]) // 完整历史（super-sudoku：Full history tracking）
      setFuture([])
      return fn(prev)
    })
  }, [])

  const snapshotOf = (p: Progress): Snapshot => ({
    values: p.values.map((r) => [...r]),
    notes: p.notes.map((r) => [...r]),
    hinted: new Set(p.hinted),
  })

  const onUndo = useCallback(() => {
    setHintFocus(null)
    setPast((h) => {
      if (h.length === 0) return h
      const last = h[h.length - 1]
      setFuture((f) => [snapshotOf(progress), ...f])
      setProgress({ values: last.values, notes: last.notes, hinted: last.hinted, revealed: false })
      return h.slice(0, -1)
    })
  }, [progress])

  const onRedo = useCallback(() => {
    setHintFocus(null)
    setFuture((f) => {
      if (f.length === 0) return f
      const next = f[0]
      setPast((h) => [...h, snapshotOf(progress)])
      setProgress({ values: next.values, notes: next.notes, hinted: next.hinted, revealed: false })
      return f.slice(1)
    })
  }, [progress])

  const inputDigit = useCallback(
    (v: number) => {
      if (solved || progress.revealed) return
      if (editor) {
        if (!editor.sel) return
        setEditor((ed) => {
          if (!ed?.sel) return ed
          const givens = ed.givens.map((r) => [...r])
          givens[ed.sel.r - 1][ed.sel.c - 1] = v
          return { ...ed, givens }
        })
        return
      }
      if (!selected) return
      setHintFocus(null)
      mutate((p) => (noteMode ? toggleNote(p, puzzle, selected, v) : setValue(p, puzzle, selected, v)))
    },
    [selected, solved, progress.revealed, noteMode, puzzle, editor, mutate],
  )

  const onErase = useCallback(() => {
    if (editor) {
      if (!editor.sel) return
      setEditor((ed) => {
        if (!ed?.sel) return ed
        const givens = ed.givens.map((r) => [...r])
        givens[ed.sel.r - 1][ed.sel.c - 1] = 0
        return { ...ed, givens }
      })
      return
    }
    if (!selected) return
    setHintFocus(null)
    mutate((p) => eraseCell(p, puzzle, selected))
  }, [editor, selected, puzzle, mutate])

  const startPuzzle = useCallback(
    (p: Puzzle, label: string) => {
      setPuzzle(p)
      setProgress(emptyProgress(p))
      setPast([])
      setFuture([])
      setSeconds(0)
      setSolved(false)
      setSelected(null)
      setHintFocus(null)
      setTrackerDigit(null)
      showToast(label, 'info')
    },
    [showToast],
  )

  const onNewRandom = useCallback(() => {
    if (!confirmDiscard('开始新随机题')) return
    try {
      const p = generateRandom(CLASSIC_9, difficulty)
      startPuzzle(p, `已生成「${difficulty === 'easy' ? '简单' : difficulty === 'medium' ? '中等' : '困难'}」随机新题（唯一解已验证）`)
    } catch {
      showToast('生成失败，请再试一次', 'warn')
    }
  }, [difficulty, startPuzzle, showToast, confirmDiscard])

  const onVariant = useCallback(() => {
    if (!confirmDiscard('生成变体')) return
    try {
      const v = transformPuzzle(puzzle, FULL_TRANSFORM)
      startPuzzle(v, '已生成同构变体（唯一解已验证）')
    } catch {
      showToast('变体生成失败', 'warn')
    }
  }, [puzzle, startPuzzle, showToast, confirmDiscard])

  // 分档提示（super-sudoku：Smart Hints 不剧透）：第一档只高亮推导区域，第二档才填入
  const onHint = useCallback(() => {
    if (editor) return
    const res = hintTarget(progress, puzzle)
    if (res.kind === 'conflict') {
      showToast('盘面存在冲突或与解答不符的数字（红色格），先纠正再提示', 'warn')
      return
    }
    if (res.kind === 'done') {
      showToast('没有可提示的空格了', 'info')
      return
    }
    if (hintFocus && hintFocus.r === res.addr.r && hintFocus.c === res.addr.c) {
      const value =
        res.feasible.length === 1 ? res.feasible[0] : puzzle.solution![res.addr.r - 1][res.addr.c - 1]
      mutate((p) => {
        const next = setValue(p, puzzle, res.addr, value)
        next.hinted.add(`${res.addr.r},${res.addr.c}`)
        return next
      })
      setHintFocus(null)
      showToast(`已填入 r${res.addr.r}c${res.addr.c}=${value}`, 'info')
    } else {
      setHintFocus(res.addr)
      setSelected(res.addr)
      showToast(
        res.feasible.length === 1
          ? `r${res.addr.r}c${res.addr.c} 是唯一候选格（可行域仅 {${res.feasible[0]}}），再点一次提示填入`
          : `聚焦 r${res.addr.r}c${res.addr.c}（可行域 ${res.feasible.length} 个数），再点一次提示直接填入`,
        'info',
      )
    }
  }, [progress, puzzle, hintFocus, editor, mutate, showToast])

  const onCheck = useCallback(() => {
    const n = conflicts.size + wrong.size
    if (n === 0) {
      const remainingCount =
        puzzle.spec.rows * puzzle.spec.cols - progress.values.flat().filter((v) => v).length
      showToast(remainingCount === 0 ? '完成！' : `目前没有问题，还剩 ${remainingCount} 格`, 'info')
    } else {
      showToast(`发现 ${n} 处问题（冲突或与解答不符，红色标注）`, 'warn')
    }
  }, [conflicts, wrong, progress, puzzle])

  const onReveal = useCallback(() => {
    if (!puzzle.solution) {
      showToast('该题无预存解答', 'warn')
      return
    }
    if (!window.confirm('显示解答将标记本局放弃，确定？')) return
    mutate((p) => revealSolution(p, puzzle))
    showToast('已显示解答', 'info')
  }, [puzzle, mutate, showToast])

  const onRestart = useCallback(() => {
    if (!confirmDiscard('重开本题')) return
    setProgress(emptyProgress(puzzle))
    setPast([])
    setFuture([])
    setSolved(false)
    setSelected(null)
    setHintFocus(null)
    showToast('本题已重开', 'info')
  }, [puzzle, showToast, confirmDiscard])

  const onSmartNotes = useCallback(() => {
    mutate((p) => autoFillNotes(p, puzzle))
    showToast('已把所有空格的可行候选填入笔记', 'info')
  }, [puzzle, mutate, showToast])

  // ---------- 出题模式 ----------
  const onEditor = useCallback(() => {
    if (!confirmDiscard('进入出题模式')) return
    setEditor(emptyEditor())
    setSelected(null)
    setHintFocus(null)
    showToast('出题模式：点格子填给定数，点格子间的边界摆不等号，完成后点「验证开玩」', 'info')
  }, [confirmDiscard, showToast])

  const editorPuzzle = useMemo<Puzzle | null>(() => {
    if (!editor) return null
    const givens = []
    for (let r = 1; r <= 9; r++)
      for (let c = 1; c <= 9; c++)
        if (editor.givens[r - 1][c - 1]) givens.push({ addr: { r, c }, value: editor.givens[r - 1][c - 1] })
    return {
      id: 'editor-draft',
      name: '出题模式',
      spec: CLASSIC_9,
      givens,
      constraints: [...editor.signs.values()],
    }
  }, [editor])

  const editorProgress = useMemo<Progress | null>(() => {
    if (!editor) return null
    return {
      values: editor.givens.map((r) => [...r]),
      notes: editor.givens.map(() => new Array(9).fill(0)),
      hinted: new Set(),
      revealed: false,
    }
  }, [editor])

  const onEditorBorder = useCallback((key: string) => {
    setEditor((ed) => {
      if (!ed) return ed
      const signs = new Map(ed.signs)
      const [kind, r, c] = key.split(' ')
      const cur = signs.get(key)
      let next: Constraint | undefined
      if (kind === 'H') {
        const a = { r: Number(r), c: Number(c) }
        const b = { r: Number(r), c: Number(c) + 1 }
        next = !cur ? { type: '>', a, b } : cur.type === '>' ? { type: '<', a, b } : undefined
      } else {
        const a = { r: Number(r), c: Number(c) }
        const b = { r: Number(r) + 1, c: Number(c) }
        next = !cur ? { type: '>', a, b } : cur.type === '>' ? { type: '<', a, b } : undefined
      }
      if (next) signs.set(key, next)
      else signs.delete(key)
      return { ...ed, signs }
    })
  }, [])

  const onEditorValidate = useCallback(() => {
    if (!editor || !editorPuzzle) return
    if (editorPuzzle.givens.length === 0 && editorPuzzle.constraints.length === 0) {
      showToast('空盘无法验证：先摆至少一个给定数或符号', 'warn')
      return
    }
    const res = solvePuzzle(editorPuzzle.spec, editorPuzzle.givens, editorPuzzle.constraints, 2)
    if (res.count === 0) {
      showToast('验证失败：当前摆法无解（存在矛盾）', 'warn')
      return
    }
    if (res.count > 1) {
      showToast('验证失败：解不唯一——再多摆一些给定数或符号', 'warn')
      return
    }
    const p: Puzzle = {
      id: `custom-${Date.now().toString(36)}`,
      name: '自定义题',
      spec: CLASSIC_9,
      givens: editorPuzzle.givens,
      constraints: editorPuzzle.constraints,
      solution: res.solution!,
    }
    setEditor(null)
    startPuzzle(p, '自定义题验证通过（唯一解），开始！')
  }, [editor, editorPuzzle, showToast, startPuzzle])

  // ---------- 键盘 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (solved) return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        onRedo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) onRedo()
        else onUndo()
        return
      }
      if (e.key >= '1' && e.key <= '9') {
        inputDigit(Number(e.key))
        return
      }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        onErase()
        return
      }
      if (e.key === 'n' || e.key === 'N') {
        setNoteMode((m) => !m)
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
      if (e.key in moves) {
        e.preventDefault()
        const [dr, dc] = moves[e.key]
        const base = selected ?? { r: 1, c: 1 }
        setSelected({
          r: Math.min(9, Math.max(1, base.r + dr)),
          c: Math.min(9, Math.max(1, base.c + dc)),
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, solved, inputDigit, onErase, onHint, onUndo, onRedo])

  const statsLine = useMemo(() => {
    const parts = STAT_KEYS.filter((k) => stats[k]).map(
      (k) =>
        `${STAT_LABELS[k]} ${stats[k].done} 题${Number.isFinite(stats[k].best) ? `·最佳 ${fmtTime(stats[k].best)}` : ''}`,
    )
    return parts.length ? parts.join(' · ') : '尚无完成记录——解出一题就会出现在这里'
  }, [stats])

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>不等号数独</h1>
          <span className="puzzle-name">{editor ? '出题模式（自建不等号题）' : puzzle.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="timer">{editor ? '—' : fmtTime(seconds)}</span>
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
        puzzle={editor && editorPuzzle ? editorPuzzle : puzzle}
        progress={editor && editorProgress ? editorProgress : progress}
        selected={editor && editor.sel ? editor.sel : selected}
        conflicts={editor ? new Set() : marked}
        sameValues={editor ? new Set() : sameValues}
        peerAddrs={peerAddrs}
        hintFocus={hintFocus}
        onSelect={(addr) => {
          if (editor) setEditor((ed) => (ed ? { ...ed, sel: addr } : ed))
          else setSelected(addr)
        }}
        editor={editor ? { signs: editor.signs, sel: editor.sel, onBorder: onEditorBorder } : null}
      />

      {!editor && (
        <div className="digit-tracker-row">
          <DigitTracker remaining={remaining} active={trackerDigit} onPick={(d) => setTrackerDigit(d)} />
        </div>
      )}

      <div className="info-strip">
        <span>
          {noteMode && !editor && <span className="chip note-badge">✏️ 笔记模式</span>}
          {editor && <span className="chip note-badge">🛠 出题中</span>}
          选中
          <span className="addr">
            {' '}
            {editor
              ? editor.sel
                ? `r${editor.sel.r}c${editor.sel.c}`
                : '—'
              : selected
                ? `r${selected.r}c${selected.c}`
                : '—'}
          </span>
          {!editor && selected && isGiven(puzzle, selected) ? '（给定数）' : ''}
        </span>
        <span className="interval">
          {editor ? (
            <span className="empty">
              给定数 {editorPuzzle?.givens.length ?? 0} · 符号 {editor.signs.size} · 摆完点「验证开玩」
            </span>
          ) : interval.length > 0 ? (
            <>
              可行区间：
              {interval.map((v) => (
                <span key={v} className="chip">
                  {v}
                </span>
              ))}
            </>
          ) : selected ? (
            <span className="empty">
              {progress.values[selected.r - 1][selected.c - 1] ? '已填' : '无可行数字（检查冲突）'}
            </span>
          ) : (
            <span className="empty">点击格子查看可行区间</span>
          )}
        </span>
      </div>

      <Keypad
        noteMode={noteMode}
        digitDone={editor ? new Array(10).fill(false) : digitDone}
        onNumber={inputDigit}
        onErase={onErase}
        onToggleNoteMode={() => setNoteMode((m) => !m)}
      />

      {!editor && (
        <Controls
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          onNewRandom={onNewRandom}
          onVariant={onVariant}
          onBase={() => {
            if (confirmDiscard('回到书题 014')) startPuzzle(BASE_PUZZLE, '回到书题 014')
          }}
          onHint={onHint}
          onCheck={onCheck}
          onReveal={onReveal}
          onUndo={onUndo}
          onRedo={onRedo}
          onRestart={onRestart}
          onSmartNotes={onSmartNotes}
          onEditor={onEditor}
          canUndo={past.length > 0}
          canRedo={future.length > 0}
        />
      )}

      {editor && (
        <div className="controls">
          <button className="toggled" onClick={onEditorValidate}>
            ✅ 验证开玩（唯一解闸）
          </button>
          <button
            onClick={() => {
              setEditor(emptyEditor())
              showToast('出题板已清空', 'info')
            }}
          >
            🗑 清空出题板
          </button>
          <button
            onClick={() => {
              setEditor(null)
              showToast('已退出出题模式', 'info')
            }}
          >
            ✖ 退出出题
          </button>
        </div>
      )}

      {!editor && <div className="stats-line">📊 {statsLine}</div>}

      {toast && <div className={`toast ${toast.tone === 'info' ? 'info' : ''}`}>{toast.text}</div>}

      {solved && (
        <WinOverlay
          seconds={seconds}
          isBase={puzzle.id.startsWith('book')}
          statsLine={statsLine}
          onAgain={onNewRandom}
          onVariant={onVariant}
          onClose={() => setSolved(false)}
        />
      )}

      <footer className="credit">
        基础题源自谜题书「不等号数独 014」 · 设计吸纳 super-sudoku / sudokuJS / penpa-edit · 变体与随机题均由求解器把关
      </footer>
    </div>
  )
}
