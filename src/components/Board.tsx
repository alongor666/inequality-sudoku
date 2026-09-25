import type { Addr, Constraint, Puzzle } from '../core/types'
import type { Progress } from '../core/engine'

interface BoardProps {
  puzzle: Puzzle
  progress: Progress
  selected: Addr | null
  conflicts: Set<string>
  sameValues: Set<string>
  /** 选中格的行/列/宫同伴（十字高亮） */
  peerAddrs?: Set<string>
  /** 分档提示第一档：聚焦格（连同其行列宫强调高亮） */
  hintFocus?: Addr | null
  onSelect: (addr: Addr) => void
  /** 出题模式：渲染可点击的边界热区并使用编辑中的符号 */
  editor?: {
    signs: Map<string, Constraint>
    sel: Addr | null
    onBorder: (key: string) => void
  } | null
}

const signGlyph = (con: Constraint): string => {
  const horizontal = con.a.r === con.b.r
  if (con.type === '=') return '='
  if (horizontal) return con.type === '>' ? '>' : '<'
  return con.type === '>' ? 'v' : '^'
}

const borderKey = (horizontal: boolean, r: number, c: number) => `${horizontal ? 'H' : 'V'} ${r} ${c}`

export function Board({
  puzzle,
  progress,
  selected,
  conflicts,
  sameValues,
  peerAddrs,
  hintFocus,
  onSelect,
  editor,
}: BoardProps) {
  const n = puzzle.spec.rows
  const inHintZone = (r: number, c: number): boolean => {
    if (!hintFocus) return false
    return (
      hintFocus.r === r ||
      hintFocus.c === c ||
      (Math.floor((hintFocus.r - 1) / puzzle.spec.boxRows) === Math.floor((r - 1) / puzzle.spec.boxRows) &&
        Math.floor((hintFocus.c - 1) / puzzle.spec.boxCols) === Math.floor((c - 1) / puzzle.spec.boxCols))
    )
  }

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
      else if (peerAddrs?.has(key)) classes.push('peer')
      if (sameValues.has(key)) classes.push('same-value')
      if (conflicts.has(key)) classes.push('conflict')
      if (hintFocus && hintFocus.r === r && hintFocus.c === c) classes.push('hint-focus-cell')
      else if (inHintZone(r, c)) classes.push('hint-zone')

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

  const constraints: Constraint[] = editor ? [...editor.signs.values()] : puzzle.constraints

  return (
    <div className="board-wrap">
      <div className="board-grid" role="grid">
        {cells}
      </div>
      {constraints.map((con, i) => {
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
      {editor &&
        Array.from({ length: n }, (_, r) => r + 1).flatMap((r) =>
          Array.from({ length: n }, (_, c) => c + 1).flatMap((c) => {
            const spots: React.ReactNode[] = []
            if (c < n)
              spots.push(
                <span
                  key={`hb-${r}-${c}`}
                  className="border-hotspot"
                  style={{
                    left: `calc(var(--cell) * ${c})`,
                    top: `calc(var(--cell) * ${r - 0.5})`,
                  }}
                  onClick={() => editor.onBorder(borderKey(true, r, c))}
                  title="点击切换横向符号：无 → > → <"
                />,
              )
            if (r < n)
              spots.push(
                <span
                  key={`vb-${r}-${c}`}
                  className="border-hotspot vertical"
                  style={{
                    left: `calc(var(--cell) * ${c - 0.5})`,
                    top: `calc(var(--cell) * ${r})`,
                  }}
                  onClick={() => editor.onBorder(borderKey(false, r, c))}
                  title="点击切换纵向符号：无 → v（上大）→ ^（下大）"
                />,
              )
            return spots
          }),
        )}
    </div>
  )
}
