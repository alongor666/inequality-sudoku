interface KeypadProps {
  noteMode: boolean
  digitDone: boolean[]
  onNumber: (v: number) => void
  onErase: () => void
  onToggleNoteMode: () => void
}

export function Keypad({ noteMode, digitDone, onNumber, onErase, onToggleNoteMode }: KeypadProps) {
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
      <button onClick={onErase}>擦除</button>
      <button className={noteMode ? 'toggled' : ''} onClick={onToggleNoteMode}>
        笔记{noteMode ? '开' : '关'}
      </button>
    </div>
  )
}
