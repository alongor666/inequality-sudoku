interface DigitTrackerProps {
  /** remaining[v] = 数字 v 还剩几个未填（1..9） */
  remaining: number[]
  active: number | null
  onPick: (d: number | null) => void
}

/** 数字余量追踪条（super-sudoku Number Tracking）：点击高亮该数字的所有位置 */
export function DigitTracker({ remaining, active, onPick }: DigitTrackerProps) {
  return (
    <div className="digit-tracker" role="toolbar" aria-label="数字余量">
      {Array.from({ length: 9 }, (_, i) => i + 1).map((v) => (
        <button
          key={v}
          className={`tracker-chip${active === v ? ' active' : ''}${remaining[v] === 0 ? ' done' : ''}`}
          onClick={() => onPick(active === v ? null : v)}
          title={`数字 ${v} 还剩 ${remaining[v]} 个`}
        >
          <span className="d">{v}</span>
          <span className="r">{remaining[v]}</span>
        </button>
      ))}
    </div>
  )
}
