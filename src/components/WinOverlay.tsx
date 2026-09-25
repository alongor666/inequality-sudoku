interface WinOverlayProps {
  seconds: number
  isBase: boolean
  onAgain: () => void
  onVariant: () => void
  onClose: () => void
}

const fmtTime = (s: number): string =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export function WinOverlay({ seconds, isBase, onAgain, onVariant, onClose }: WinOverlayProps) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <h2>{isBase ? '🎉 书题 014 完成！' : '🎉 完成！'}</h2>
        <div className="stats">用时 {fmtTime(seconds)}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onVariant}>🔁 来个同构变体</button>
          <button onClick={onAgain}>🎲 随机新题</button>
          <button onClick={onClose}>回顾盘面</button>
        </div>
      </div>
    </div>
  )
}
