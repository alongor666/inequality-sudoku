import type { Addr, Constraint, Puzzle } from '../core/types'
import type { Progress } from '../core/engine'

interface BoardProps {
  puzzle: Puzzle
  progress: Progress
  selected: Addr | null
  conflicts: Set<string>
  sameValues: Set<string>
  onSelect: (addr: Addr) => void
}

const signGlyph = (con: Constraint): string => {
  const horizontal = con.a.r === con.b.r
  if (horizontal) return con.type === '>' ? '>' : con.type === '<' ? '<' : '='
  // 纵向：a 在上。a > b 记 'v'（尖朝下指小），a < b 记 '^'
  if (con.type === '=') return '='
  return con.type === '>' ? 'v' : '^'
}

export function Board({ puzzle, progress, selected, conflicts, sameValues, onSelect }: BoardProps) {
  const n = puzzle.spec.rows
  const cells = []
  for (let r = 1; r <= n; r++)
    for (let c = 1; c <= n; c++) {
      const key = `r${r}c${c}`
      const v = progress.values[r - 1][c - 1]
      const isGiven = puzzle.givens.some((g) => g.addr.r === r && g.addr.c === c)
      const classes = ['cell']
      if (c === n) classes.push('right-edge')
      else if (c % puzzle.spec.boxCols === 0) classes.push('box-right')
      if (r === n) classes.push('bottom-edge')
      else if (r % puzzle.spec.boxRows === 0) classes.push('box-bottom')
      if (isGiven) classes.push('given')
      if (progress.hinted.has(`${r},${c}`)) classes.push('hinted')
      if (progress.revealed && !isGiven) classes.push('revealed')
      if (selected && selected.r === r && selected.c === c) classes.push('selected')
      if (sameValues.has(key)) classes.push('same-value')
      if (conflicts.has(key)) classes.push('conflict')

      const noteBits = progress.notes[r - 1][c - 1]
      cells.push(
        <div
          key={key}
          className={classes.join(' ')}
          onClick={() => onSelect({ r, c })}
          role="gridcell"
          aria-label={key}
        >
          {v ? (
            <span className="value">{v}</span>
          ) : noteBits ? (
            <span className="notes">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i}>{noteBits & (1 << (i + 1)) ? i + 1 : ''}</span>
              ))}
            </span>
          ) : null}
        </div>,
      )
    }

  return (
    <div className="board-wrap">
      <div className="board-grid" role="grid">
        {cells}
      </div>
      {puzzle.constraints.map((con, i) => {
        const horizontal = con.a.r === con.b.r
        const style = horizontal
          ? {
              left: `calc(var(--cell) * ${con.a.c})`,
              top: `calc(var(--cell) * ${con.a.r - 0.5})`,
            }
          : {
              left: `calc(var(--cell) * ${con.a.c - 0.5})`,
              top: `calc(var(--cell) * ${con.a.r})`,
            }
        return (
          <span key={i} className="sign" style={style}>
            {signGlyph(con)}
          </span>
        )
      })}
    </div>
  )
}
