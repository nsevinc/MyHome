import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Measure } from './fields'
import { fmt, maxFurnitureItems } from './model'
import type { Project, UpperCabinetRow } from './model'
import { makeBedroomFurniture } from './bedroom-catalog'
import { bounds, footprintCorners, mountedCenter } from './geometry'
import { elevationData } from './elevation-data'
import { newUpperRow, planUpperRow } from './upper-cabinet-row'
import type { UpperRowPlan } from './upper-cabinet-row'
import { jointDoorTrial } from './upper-row-doors'

export type RowEdit = { ids: string[]; widthEdit?: { id: string; width: number } }

export default function UpperRowDialog({ project, edit, apply, close }: {
  project: Project; edit: RowEdit; apply: (project: Project, ids: string[]) => boolean; close: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const saved = project.upperCabinetRows?.find(r => r.members.includes(edit.ids[0]))
  const [row, setRow] = useState(() => saved ?? newUpperRow(project, edit.ids.map(id => project.items.find(i => i.id === id)!)))
  const [modules, setModules] = useState(() => row.members.map(id => {
    const item = project.items.find(i => i.id === id)!
    return edit.widthEdit?.id === id ? { ...item, width: edit.widthEdit.width } : item
  }))
  const [failure, setFailure] = useState('')
  const plan = useMemo(() => planUpperRow(project, row, modules), [project, row, modules])
  const beds = project.items.filter(i => i.kind === 'bed')
  useEffect(() => { const d = dialog.current; d?.showModal(); return () => d?.close() }, [])
  function align(alignment: UpperCabinetRow['alignment']) {
    const first = project.items.find(i => i.id === modules[0].id)
    const last = project.items.find(i => i.id === modules.at(-1)?.id)
    const left = first?.mount ? mountedCenter(first, plan.edge) - first.width / 2 : plan.start
    const right = last?.mount ? mountedCenter(last, plan.edge) + last.width / 2 : plan.end
    setRow({ ...row, alignment, anchor: Math.max(0, alignment === 'right' ? right : left),
      bedId: alignment === 'bed' ? row.bedId ?? beds[0]?.id : undefined })
  }
  function add(atStart: boolean) {
    const item = makeBedroomFurniture('upper-cabinet', { x: 0, z: 0 }, { wallId: row.wallId, offset: 0, bottom: row.bottom })
    const next = atStart ? [item, ...modules] : [...modules, item]
    setModules(next)
    setRow({ ...row, members: next.map(i => i.id) })
  }
  const atLimit = plan.project.items.length >= maxFurnitureItems
  return <dialog ref={dialog} className="draw-dialog upper-row-dialog" aria-labelledby="upper-row-title"
    onCancel={e => { e.preventDefault(); close() }}>
    <header className="dialog-header"><div><h2 id="upper-row-title">Üst dolap sırası</h2><p>Duvar {plan.edge.index + 1} · {modules.length} modül</p></div>
      <button className="icon" onClick={close} aria-label="Sıra düzenleyicisini kapat"><X size={20}/></button></header>
    <div className="wardrobe-run-body">
      <div className="wardrobe-run-controls">
        <label className="measure">Sıra hizası<select value={row.alignment} onChange={e => align(e.target.value as UpperCabinetRow['alignment'])}>
          <option value="left">Sol ucu sabitle</option><option value="right">Sağ ucu sabitle</option>
          <option disabled={!beds.length} value="bed">Yatağa ortala</option></select></label>
        {row.alignment === 'bed' && <label className="measure">Referans yatak<select value={row.bedId} onChange={e => setRow({ ...row, bedId: e.target.value })}>
          {beds.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}
        <Measure label="Modüller arası boşluk" value={row.gap} change={gap => setRow({ ...row, gap })}/>
        <Measure label="Ortak alt kot" value={row.bottom} change={bottom => setRow({ ...row, bottom })}/>
      </div>
      <p aria-live="polite"><strong>Toplam en {fmt(plan.total)} cm</strong> · Solda {fmt(plan.start)} cm · Sağda {fmt(plan.edge.wall.length - plan.end)} cm</p>
      <RowElevation plan={plan}/>
      <div className="upper-row-modules">{plan.readings.map(({ item, fit, underneath }, i) => <fieldset key={item.id}>
        <legend>{i + 1}. modül · {item.name}</legend>
        <Measure label="En" value={item.width} min={.1} disabled={item.locked}
          change={width => setModules(modules.map(m => m.id === item.id ? { ...m, width } : m))}/>
        <p>{fit.obstruction ?? 'Tavan'} · {fmt(Math.abs(fit.clearance))} cm {fit.clearance < 0 ? 'çakışma' : 'üst boşluk'}</p>
        {underneath.map((b, j) => <p key={j}>{b.name} üstünde {fmt(b.gap)} cm açıklık</p>)}
      </fieldset>)}</div>
      <div className="draw-actions"><button disabled={atLimit} onClick={() => add(true)}>Sol uca modül ekle</button>
        <button disabled={atLimit} onClick={() => add(false)}>Sağ uca modül ekle</button></div>
      <RowDoorCheck plan={plan}/>
      {plan.errors.length > 0 && <ul className="error-message">{plan.errors.map((s, i) => <li key={i}>{s}</li>)}</ul>}
      {failure && <p role="alert">{failure}</p>}
    </div>
    <footer className="dialog-footer">
      {saved && <button onClick={() => { const rows = project.upperCabinetRows!.filter(r => r.id !== saved.id)
        if (!apply({ ...project, upperCabinetRows: rows.length ? rows : undefined }, saved.members)) setFailure('Sıra çözülemedi.')
      }}>Sırayı çöz</button>}
      <button onClick={close}>Vazgeç</button><button className="primary" disabled={!!plan.errors.length} onClick={() => {
        if (!apply(plan.project, row.members)) setFailure('Sıra kaydedilemedi. Konum kilitlerini ve yerleşim kurallarını kontrol edin.')
      }}>Sırayı uygula</button></footer>
  </dialog>
}

function RowElevation({ plan }: { plan: UpperRowPlan }) {
  const { project, edge, row, readings } = plan
  const h = project.height, length = edge.wall.length
  const objects = elevationData(project, edge, plan.edges).objects.filter(o => !row.members.includes(o.item.id))
  const font = Math.max(72, Math.min(length / 35, h / 18))
  const aboveBed = readings.flatMap(m => m.underneath).find(b => b.gap > 0)
  return <svg role="img" aria-label="Üst dolap sırası duvar görünüşü" className="wardrobe-run-elevation"
    viewBox={`-45 -45 ${length + 90} ${h + 90}`}>
    <rect width={length} height={h} fill="#f4eddf" stroke="#706957" strokeWidth="10"/>
    {edge.wall.openings.map(o => <rect key={o.id} x={o.offset} y={h-o.bottom-o.height} width={o.width} height={o.height} fill="#c0dce3"/>)}
    {objects.map(o => <g key={o.item.id}><title>{o.item.name}</title>
      <rect x={o.left} y={h-o.top} width={o.width} height={o.top-o.bottom} fill="#b9ab9c"/>
      {o.item.kind === 'bed' && <text x={o.center} y={h-o.bottom-35} fontSize={font} textAnchor="middle">{o.item.name}</text>}</g>)}
    {readings.map(({ item, center }, i) => <g key={item.id}><rect x={center-item.width/2} y={h-row.bottom-item.height}
      width={item.width} height={item.height} fill={item.color} stroke="#47554a" strokeWidth="8"/>
      <text x={center} y={h-row.bottom-item.height/2} dominantBaseline="middle" textAnchor="middle" fontSize={Math.min(font, item.width/6)}>
        {i+1} · {fmt(item.width)} cm</text></g>)}
    {aboveBed && <g stroke="#386652" fill="#284836" strokeWidth="7">
      <path d={`M ${aboveBed.center} ${h-row.bottom} v ${aboveBed.gap} m -20 0 h 40 M ${aboveBed.center-20} ${h-row.bottom} h 40`} fill="none"/>
      <text x={aboveBed.center+35} y={h-row.bottom+aboveBed.gap/2} fontSize={font} stroke="none">{fmt(aboveBed.gap)} cm</text>
    </g>}
    {edge.wall.obstacles.map(o => <g key={o.id}><rect x={o.offset} y={h-o.top} width={o.width} height={o.top-o.bottom}
      fill="#96662b" fillOpacity=".54"/><title>{o.name}</title>
      <text x={o.offset+o.width/2} y={h-(o.top+o.bottom)/2} dominantBaseline="middle" textAnchor="middle"
        fontSize={Math.min(font, o.width/(o.name.length || 1)*1.5)}>{o.name}</text></g>)}
  </svg>
}

function RowDoorCheck({ plan }: { plan: UpperRowPlan }) {
  const [index, setIndex] = useState(0)
  const [requested, setRequested] = useState(0)
  const seam = Math.min(index, plan.items.length - 2)
  const trial = useMemo(() => jointDoorTrial(plan, seam), [plan, seam])
  const degrees = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + '°'
  const angle = Math.min(requested, trial?.limit ?? 0, trial?.hit?.angle ?? Infinity)
  return <section className="upper-row-trial" aria-label="Komşu kapak denemesi">
    <h3>Komşu kapakları birlikte dene</h3>
    {plan.items.length > 2 && <label className="measure">Modül çifti<select value={seam} onChange={e => { setIndex(+e.target.value); setRequested(0) }}>
      {plan.items.slice(1).map((_, i) => <option key={i} value={i}>{i+1}. ve {i+2}. modül</option>)}</select></label>}
    {trial ? <>
      <label className="measure">Birlikte açılım <input type="range" min={0} max={trial.limit} step={.1}
        value={Math.min(requested, trial.limit)} onChange={e => setRequested(+e.target.value)}/></label>
      <p>{trial.leaves.map((leaf, i) => `${seam+i+1}. modül · ${leaf.door.label} · ${degrees(Math.min(angle, leaf.door.limit))}`).join(' / ')}</p>
      <p className={trial.hit ? 'error-message' : undefined}>{trial.hit ? `İlk temas ${degrees(trial.hit.angle)} · ${trial.hit.labels.join(' ↔ ')}`
        : `${degrees(trial.limit)}’ye kadar birlikte açılım serbest.`}</p>
      <DoorPlan trial={trial} angle={angle}/>
    </> : <p>Bu deneme için ortak kenarın iki tarafında da menteşeli kapak gerekir.</p>}
  </section>
}

function DoorPlan({ trial, angle }: { trial: NonNullable<ReturnType<typeof jointDoorTrial>>; angle: number }) {
  const shapes = trial.leaves.map(l => footprintCorners(l.item))
  const box = bounds([...shapes.flat(), ...trial.leaves.flatMap(l => {
    const r = l.radius
    return [{x:l.pivot.x-r,z:l.pivot.z-r},{x:l.pivot.x+r,z:l.pivot.z+r}]
  })])
  const points = (p: ReturnType<typeof footprintCorners>) => p.map(v => `${v.x},${v.z}`).join(' ')
  const touching = trial.hit && angle >= trial.hit.angle
  return <svg className="upper-row-plan" role="img" aria-label="İki komşu kapağın üstten açılımı"
    viewBox={`${box.x-25} ${box.z-25} ${box.width+50} ${box.depth+50}`}>
    {shapes.map((shape,i) => <polygon key={i} points={points(shape)} fill="#dfd4c3" stroke="#726958" strokeWidth="4"/>)}
    {trial.leaves.map((l,i) => <g key={i}>{l.at(angle).map((v,j) => <polygon key={j} points={points(v.points)}
      fill={touching ? '#bd4d35' : '#3c7360'} strokeWidth="2" stroke="#263d34"/>)}
      <circle cx={l.pivot.x} cy={l.pivot.z} r="8" fill="#23392f"/></g>)}
  </svg>
}
