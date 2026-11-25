import { useEffect, useState } from 'react'
import { fmt, maxSections, mm } from './model'
import type { Project, RoomSection } from './model'
import { sectionMark, sectionProfile, sectionRange, sectionSpans } from './room-section'

type Props = {
  project: Project; section?: RoomSection; axis: RoomSection['axis']
  select: (id: string) => void; setAxis: (axis: RoomSection['axis']) => void
  pick: (name: string) => void; save: (section: Omit<RoomSection, 'id'>) => void; remove: () => void
}

export function SectionView({ project, section, axis, select, setAxis, pick, save, remove }: Props) {
  const sections = project.sections ?? []
  const [name, setName] = useState(section?.name ?? '')
  const [offset, setOffset] = useState(section ? String(section.offset / 10) : '')
  useEffect(() => {
    setName(section?.name ?? '')
    setOffset(section ? String(section.offset / 10) : '')
  }, [section])
  const profile = section && sectionProfile(project, section)
  const area = profile?.area
  const [min, max] = sectionRange(project, axis)
  const at = mm(Number(offset.replace(',', '.')))
  const valid = offset !== '' && at > min && at < max && sectionSpans(project, { axis, offset: at }).length > 0
  return <section className="wall-elevation-view editor-pane room-section" aria-label="Ölçülü oda kesiti">
    <div className="section-controls">
      <label>Kesit <select value={section?.id ?? ''} onChange={event => select(event.currentTarget.value)}>
        <option value="">Yeni kesit</option>
        {sections.map((entry, index) => <option value={entry.id} key={entry.id}>{sectionMark(index)} · {entry.name}</option>)}
      </select></label>
      <label>Yön <select value={axis} onChange={event => setAxis(event.currentTarget.value as RoomSection['axis'])}>
        <option value="x">Yatay (X)</option><option value="z">Dikey (Z)</option>
      </select></label>
      <button type="button" disabled={!section && sections.length >= maxSections} onClick={() => pick(name.trim())}>2B plandan seç</button>
    </div>
    <form className="section-controls" onSubmit={event => {
      event.preventDefault()
      if (valid && name.trim()) save({ name: name.trim(), axis, offset: at })
    }}>
      <label>Kesit adı <input maxLength={100} value={name} onChange={event => setName(event.currentTarget.value)} /></label>
      <label>{axis === 'x' ? 'Z' : 'X'} konumu (cm) <input type="number" step=".1" value={offset}
        onChange={event => setOffset(event.currentTarget.value)} /></label>
      <button type="submit" disabled={!valid || !name.trim() || !section && sections.length >= maxSections}>Kesiti kaydet</button>
      {section && <button type="button" onClick={remove}>Kesiti sil</button>}
    </form>
    {!!profile?.rooms.length && area ? <>
      <svg role="img" aria-label={section?.name} viewBox={`${area.x - 150} ${area.z - 170} ${area.width + 300} ${area.depth + 340}`}>
        {profile.rooms.map(({ from, to }) => <rect key={from} x={from} y={-profile.height} width={to - from} height={profile.height}
          fill="#f5f3e9" stroke="#50665b" strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        {[...profile.furniture, ...profile.blocks].map(({ from, to, bottom, top, name, color }, index) =>
          <rect key={index} x={from} y={-top} width={to - from} height={top - bottom}
            fill={color} fillOpacity=".8" stroke="#50665b" vectorEffect="non-scaling-stroke"><title>{name} · {fmt(bottom)}–{fmt(top)} cm</title></rect>)}
        {profile.portals.map(({ from, bottom, top, name, color }, index) =>
          <line key={index} x1={from} x2={from} y1={-bottom} y2={-top} stroke={color}
            strokeWidth="5" vectorEffect="non-scaling-stroke"><title>{name}</title></line>)}
        {profile.wardrobes.map(({ item, top, ceiling, gapAt, gap, arc }) => <g key={item.id}>
          <line x1={gapAt} x2={gapAt} y1={-top} y2={-ceiling} stroke={gap < 0 ? '#9f4634' : '#167966'}
            strokeWidth="3" vectorEffect="non-scaling-stroke" />
          {arc.length > 0 && <polyline points={arc.map(p => `${p.x},${p.z}`).join(' ')} fill="none" stroke="#9c532b"
            strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
        </g>)}
      </svg>
      <div className="section-readings">
        <p>Bitmiş zemin 0 cm · Tavan {fmt(profile.height)} cm</p>
        {profile.blocks.map((block, index) => <p key={index}>{block.name} · alt kot {fmt(block.bottom)} cm · düşey ölçü {fmt(block.top - block.bottom)} cm</p>)}
        {profile.wardrobes.map(({ item, label, lift, arc }) => <p key={item.id}><strong>{label}</strong><br />
          {lift}{arc.length === 0 && ' · Yayı görmek için gardırop derinliğine paralel bir kesit seçin.'}</p>)}
      </div>
    </> : <p className="meta">Kesit çizgisini 2B planda oda içine yerleştirin veya konumunu cm olarak girin.</p>}
  </section>
}
