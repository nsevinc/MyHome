import { useState } from 'react'
import { CircleHelp, Link2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { canLink } from './furniture-links'
import { alignmentNames } from './linked-placement'
import { fmt, maxFurnitureLinks, mm, uid } from './model'
import type { FurnitureLink, LinkAxis, Project } from './model'

type Position = LinkAxis['mode'] | ''
const hasGap = (mode: Position) => mode === 'before' || mode === 'after'
const choices = Object.keys(alignmentNames) as LinkAxis['mode'][]

function axisLabel(axis: 'x' | 'z', mode: Position) {
  switch (mode) {
    case 'before': return axis === 'x' ? 'Solunda boşluk bırak' : 'Üstünde boşluk bırak'
    case 'after': return axis === 'x' ? 'Sağında boşluk bırak' : 'Altında boşluk bırak'
    case 'start': return axis === 'x' ? 'Sol kenarları hizala' : 'Üst kenarları hizala'
    case 'end': return axis === 'x' ? 'Sağ kenarları hizala' : 'Alt kenarları hizala'
    case 'center': return alignmentNames.center
    default: return 'Serbest'
  }
}

function readAxis(mode: Position, text: string): LinkAxis | undefined {
  if (!mode) return
  if (mode === 'before' || mode === 'after') {
    const value = Number(text.replace(',', '.'))
    if (!text.trim() || !Number.isFinite(value) || value < 0 || value > 5000) return
    return { mode, gap: mm(value) }
  }
  return { mode }
}

export default function LinkedPlacementPanel({ project, ids, preview, remove, cancelPreview, close, help }: {
  project: Project; ids: readonly string[]; preview: (rule: FurnitureLink) => void; remove: (id: string) => void
  cancelPreview: () => void; close: () => void; help: () => void
}) {
  const items = project.items.filter(canLink)
  const links = project.furnitureLinks ?? []
  const initial = ids.filter(id => items.some(item => item.id === id))
  const [editing, setEditing] = useState<string>()
  const [referenceId, setReferenceId] = useState(initial[0] ?? '')
  const [itemId, setItemId] = useState(initial[1] ?? '')
  const [x, setX] = useState<Position>('center')
  const [z, setZ] = useState<Position>('center')
  const [gapX, setGapX] = useState('10')
  const [gapZ, setGapZ] = useState('10')
  const reference = items.find(item => item.id === referenceId)
  const follower = items.find(item => item.id === itemId)
  const constraintX = readAxis(x, gapX), constraintZ = readAxis(z, gapZ)
  const valid = reference && follower && reference.id !== follower.id && (constraintX || constraintZ)
    && (!x || constraintX) && (!z || constraintZ) && (editing || links.length < maxFurnitureLinks)
  const visibleFollowers = items.filter(item => item.id !== referenceId)

  function edit(link?: FurnitureLink) {
    cancelPreview()
    setEditing(link?.id)
    setReferenceId(link?.referenceId ?? initial[0] ?? '')
    setItemId(link?.itemId ?? initial[1] ?? '')
    setX(link?.x?.mode ?? (link ? '' : 'center'))
    setZ(link?.z?.mode ?? (link ? '' : 'center'))
    setGapX(link?.x && 'gap' in link.x ? String(link.x.gap / 10) : '10')
    setGapZ(link?.z && 'gap' in link.z ? String(link.z.gap / 10) : '10')
  }

  return <section className="smart-placement linked-panel" aria-label="Bağlı yerleşim">
    <header><div><Link2 size={17} /><h3>Bağlı yerleşim</h3></div>
      <div><button type="button" className="icon" aria-label="Bağlı yerleşim rehberi" onClick={help}><CircleHelp size={16} /></button>
        <button type="button" className="icon" aria-label="Bağlı yerleşimi kapat" onClick={close}><X size={17} /></button></div>
    </header>
    {links.length > 0 && <div className="linked-rules" aria-label="Kayıtlı kurallar">
      {links.map(link => {
        const label = `${items.find(item => item.id === link.referenceId)?.name} → ${items.find(item => item.id === link.itemId)?.name}`
        const details = (['x', 'z'] as const).flatMap(axis => {
          const rule = link[axis]
          return rule ? [`${axis.toUpperCase()} · ${axisLabel(axis, rule.mode)}${'gap' in rule ? ' · ' + fmt(rule.gap) + ' cm' : ''}`] : []
        })
        return <div className="linked-rule" key={link.id}>
          <div><strong>{label}</strong>{details.map(detail => <small key={detail}>{detail}</small>)}</div>
          <div><button type="button" className="icon" aria-label={`${label} · Kuralı düzenle`} onClick={() => edit(link)}>
            <Pencil size={14} /></button>
            <button type="button" className="icon" aria-label={`${label} · Kuralı kaldır`} onClick={() => {
              if (editing === link.id) edit()
              remove(link.id)
            }}><Trash2 size={14} /></button></div>
        </div>
      })}
    </div>}
    <form onSubmit={event => {
      event.preventDefault()
      if (!valid) return
      preview({ id: editing ?? uid(), referenceId, itemId, x: constraintX, z: constraintZ })
    }}>
      {editing && <button type="button" onClick={() => edit()}><Plus size={14} /> Yeni kural</button>}
      <label className="measure">Referans eşya<select value={reference?.id ?? ''} onChange={event => {
        const id = event.currentTarget.value
        setReferenceId(id)
        if (id === itemId) setItemId('')
        cancelPreview()
      }}><option value="">Eşya seç</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="measure">Bağlı eşya<select value={follower?.id ?? ''} onChange={event => {
        setItemId(event.currentTarget.value); cancelPreview()
      }}><option value="">Eşya seç</option>{visibleFollowers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {([
        ['x', x, setX, gapX, setGapX],
        ['z', z, setZ, gapZ, setGapZ],
      ] as const).map(([axis, mode, setMode, gap, setGap]) => <div className="linked-axis" key={axis}>
        <label className="measure">{axis === 'x' ? 'X · Sol / sağ' : 'Z · Üst / alt'}
          <select value={mode} onChange={event => { setMode(event.currentTarget.value as Position); cancelPreview() }}>
            <option value="">Serbest</option>
            {choices.map(choice => <option key={choice} value={choice}>{axisLabel(axis, choice)}</option>)}
          </select>
        </label>
        {hasGap(mode) && <label className="measure">{axis.toUpperCase()} aralığı (cm)<input type="number" min={0} max={5000} step=".1"
          value={gap} onChange={event => { setGap(event.currentTarget.value); cancelPreview() }} /></label>}
      </div>)}
      <button type="submit" disabled={!valid}>Kuralı önizle</button>
    </form>
  </section>
}
