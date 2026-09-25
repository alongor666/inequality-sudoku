import type { Difficulty } from '../core/types'

interface ControlsProps {
  difficulty: Difficulty
  onDifficulty: (d: Difficulty) => void
  onNewRandom: () => void
  onVariant: () => void
  onBase: () => void
  onHint: () => void
  onCheck: () => void
  onReveal: () => void
  onUndo: () => void
  onRedo: () => void
  onRestart: () => void
  onSmartNotes: () => void
  onEditor: () => void
  canUndo: boolean
  canRedo: boolean
}

const DIFFS: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: '简单' },
  { key: 'medium', label: '中等' },
  { key: 'hard', label: '困难' },
]

export function Controls(p: ControlsProps) {
  return (
    <>
      <div className="controls">
        <div className="difficulty" role="radiogroup" aria-label="难度">
          {DIFFS.map((d) => (
            <button
              key={d.key}
              className={p.difficulty === d.key ? 'active' : ''}
              onClick={() => p.onDifficulty(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <button onClick={p.onNewRandom}>🎲 新随机题</button>
        <button onClick={p.onVariant}>🔁 做个变体</button>
        <button onClick={p.onBase}>📖 书题 014</button>
      </div>
      <div className="controls">
        <button onClick={p.onHint}>💡 提示</button>
        <button onClick={p.onCheck}>✓ 检查</button>
        <button onClick={p.onReveal}>👀 解答</button>
        <button onClick={p.onUndo} disabled={!p.canUndo} style={{ opacity: p.canUndo ? 1 : 0.45 }}>
          ↩ 撤销
        </button>
        <button onClick={p.onRedo} disabled={!p.canRedo} style={{ opacity: p.canRedo ? 1 : 0.45 }}>
          ↪ 重做
        </button>
        <button onClick={p.onRestart}>⟲ 重开本题</button>
      </div>
      <div className="controls">
        <button onClick={p.onSmartNotes}>✨ 智能笔记</button>
        <button onClick={p.onEditor}>✏️ 出题模式</button>
      </div>
    </>
  )
}
