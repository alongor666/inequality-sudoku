interface KeypadProps {
  noteMode: boolean
  digitDone: boolean[]
  onNumber: (v: number) => void
}

/** 纯数字键盘：擦除/笔记已上移到信息条（贴近它们作用的选中格） */
export function Keypad({ noteMode, digitDone, onNumber }: KeypadProps) {
  return (
    <div className="keypad">
      {Array.from({ length: 9 }, (_, i) => i + 1).map((v) => (
        <button
          key={v}
          className={`num${digitDone[v] ? ' done' : ''}${noteMode ? ' active-note' : ''}`}
          onClick={() => onNumber(v)}
        >
          {v}
        </button>
      ))}
    </div>
  )
}
