interface HelpModalProps {
  onClose: () => void
}

/** 方向示例：两格 + 雪佛龙（与棋盘同一 SVG 语言） */
function Chevron({ dir }: { dir: 'right' | 'left' | 'down' | 'up' }) {
  const horizontal = dir === 'right' || dir === 'left'
  const w = 20
  const h = 24
  const pts =
    horizontal
      ? dir === 'right'
        ? '3.5,4 16.5,12 3.5,20'
        : '16.5,4 3.5,12 16.5,20'
      : dir === 'down'
        ? '4,3.5 10,20.5 16,3.5'
        : '4,20.5 10,3.5 16,20.5'
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={
        horizontal
          ? { width: 18, height: 22 }
          : { width: 22, height: 18 }
      }
    >
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={3.1} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MiniCell({ v }: { v: number | null }) {
  return (
    <span className="help-cell">
      {v ?? ''}
    </span>
  )
}

function SignExample({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <div className="help-example">
      <div className="help-example-board">{children}</div>
      <div className="help-example-caption">{caption}</div>
    </div>
  )
}

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card help-card" onClick={(e) => e.stopPropagation()}>
        <h2>玩法指引</h2>

        <section>
          <h3>① 数独基本规则</h3>
          <p>
            在 9×9 盘面填入 1–9：<b>每一行、每一列、每个 3×3 宫</b>内 1–9 各出现一次。
          </p>
        </section>

        <section>
          <h3>② 不等号：尖头指向较小的数</h3>
          <p>格子边界上的雪佛龙约束相邻两格的大小关系。</p>
          <div className="help-grid">
            <SignExample caption="4 ＞ 2：左格更大">
              <MiniCell v={4} />
              <span className="help-sign"><Chevron dir="right" /></span>
              <MiniCell v={2} />
            </SignExample>
            <SignExample caption="2 ＜ 5：右格更大">
              <MiniCell v={2} />
              <span className="help-sign"><Chevron dir="left" /></span>
              <MiniCell v={5} />
            </SignExample>
            <SignExample caption="v：上格 7 更大">
              <span className="help-vstack">
                <MiniCell v={7} />
                <span className="help-sign"><Chevron dir="down" /></span>
                <MiniCell v={3} />
              </span>
            </SignExample>
            <SignExample caption="^：下格 7 更大">
              <span className="help-vstack">
                <MiniCell v={3} />
                <span className="help-sign"><Chevron dir="up" /></span>
                <MiniCell v={7} />
              </span>
            </SignExample>
          </div>
          <p className="help-mnemonic">一句话记忆：<b>尖头永远指向较小的数字</b>。纵向符号坐在两行之间的横线上（示例中的竖排两格）。</p>
        </section>

        <section>
          <h3>③ 区间提示</h3>
          <p>
            选中任意空格，信息条会实时显示它当前<b>可以填的数字</b>（已排除行列宫冲突与不等号约束）——
            这是本游戏最重要的解题抓手。
          </p>
        </section>

        <section>
          <h3>④ 操作</h3>
          <p>
            点击选格 → 数字键盘填入；「笔记」记录候选，智能笔记一键铺满。
            键盘：方向键移动 · 1–9 填数 · <b>N</b> 笔记 · <b>H</b> 提示 · <b>Ctrl+Z / Y</b> 撤销重做。
            工具栏「⋯」里还有出题模式——自己摆一道不等号数独。
          </p>
        </section>

        <button className="primary help-start" onClick={onClose}>
          开始游戏
        </button>
      </div>
    </div>
  )
}
