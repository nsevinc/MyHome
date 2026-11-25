import type { CopySide } from './adjacent-copy'

export function AdjacentCopyHandle({ side, x, y, radius, hot, add }: {
  side: CopySide; x: number; y: number; radius: number; hot: boolean; add: (side: CopySide) => void;
}) {
  const label = side === 1 ? 'Sağa bitişik kopyala' : 'Sola bitişik kopyala'
  return <g className="adjacent-copy-handle" role="button" tabIndex={0} aria-label={label}
    data-hot={hot || undefined} transform={`translate(${x} ${y})`}
    onPointerDown={e => e.stopPropagation()}
    onClick={e => { e.stopPropagation(); add(side) }}
    onKeyDown={e => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault(); e.stopPropagation()
      if (!e.repeat) add(side)
    }}>
    <title>{label}</title>
    <circle r={radius * 1.18} fill="transparent" />
    <g className="copy-glyph" pointerEvents="none">
      <circle r={radius} fill="#176955" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <path d={`M ${-radius * .44} 0 H ${radius * .44} M 0 ${-radius * .44} V ${radius * .44}`}
        stroke="white" strokeWidth={radius * .2} strokeLinecap="round" />
    </g>
  </g>
}
