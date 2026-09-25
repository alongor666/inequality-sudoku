import { useEffect, useRef, useState } from 'react'
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
  { key: 'easy', label: '简' },
  { key: 'medium', label: '中' },
  { key: 'hard', label: '难' },
]

export function Controls(p: ControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const menuItem = (label: string, fn: () => void) => (
    <button
      className="menu-item"
      onClick={() => {
        setMenuOpen(false)
        fn()
      }}
    >
      {label}
    </button>
  )

  return (
    <div className="toolbar">
      <div className="difficulty" role="radiogroup" aria-label="下次生成难度">
        {DIFFS.map((d) => (
          <button
            key={d.key}
            className={p.difficulty === d.key ? 'active' : ''}
            onClick={() => p.onDifficulty(d.key)}
            title={`下次生成「${d.key === 'easy' ? '简单' : d.key === 'medium' ? '中等' : '困难'}」难度`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <button className="tb primary" onClick={p.onNewRandom} title="生成随机新题">
        🎲 新题
      </button>
      <button className="tb" onClick={p.onVariant} title="把当前题变成同构变体">
        变体
      </button>
      <span className="sep" />
      <button className="tb icon" onClick={p.onHint} title="提示（H）">
        💡
      </button>
      <button className="tb icon" onClick={p.onCheck} title="检查">
        ✓
      </button>
      <button
        className="tb icon"
        onClick={p.onUndo}
        disabled={!p.canUndo}
        title="撤销（Ctrl+Z）"
        style={{ opacity: p.canUndo ? 1 : 0.35 }}
      >
        ↩
      </button>
      <button
        className="tb icon"
        onClick={p.onRedo}
        disabled={!p.canRedo}
        title="重做（Ctrl+Y）"
        style={{ opacity: p.canRedo ? 1 : 0.35 }}
      >
        ↪
      </button>
      <div className="menu-wrap" ref={menuRef}>
        <button className="tb icon" onClick={() => setMenuOpen((m) => !m)} title="更多">
          ⋯
        </button>
        {menuOpen && (
          <div className="menu">
            {menuItem('✨ 智能笔记（铺全部候选）', p.onSmartNotes)}
            {menuItem('👀 显示解答', p.onReveal)}
            {menuItem('⟲ 重开本题', p.onRestart)}
            {menuItem('✏️ 出题模式', p.onEditor)}
            {menuItem('📖 书题 014', p.onBase)}
          </div>
        )}
      </div>
    </div>
  )
}
