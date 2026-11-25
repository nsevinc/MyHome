import { useEffect, useMemo, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { Measure, NumberField } from './fields'
import type { WallEdge } from './geometry'
import { fmt, wardrobeDoorCounts, wardrobeZones } from './model'
import type { Furniture, Project, Wardrobe } from './model'
import { cabinetDoorClearance, changeDoor, defaultInterior, doorCollisionText, doorLeaf, openDoor, resizeWardrobeDoors } from './wardrobe'

type Props = {
  project: Project; item: Furniture; wardrobe: Wardrobe; edges: WallEdge[];
  update: (wardrobe: Wardrobe) => void; visible: boolean; toggle: () => void;
  doorFocus?: { index: number };
}

export function WardrobeSettings({ project, item, wardrobe, edges, update, visible, toggle, doorFocus }: Props) {
  const [chosenDoor, chooseDoor] = useState(doorFocus?.index ?? 0)
  useEffect(() => { if (doorFocus) chooseDoor(doorFocus.index) }, [doorFocus])
  const stack = wardrobe.stack
  const index = Math.min(chosenDoor, wardrobe.doors * (stack ? 2 : 1) - 1)
  const sliding = wardrobe.motion === 'sliding'
  const state = doorLeaf(wardrobe, index)
  const clearance = useMemo(() => cabinetDoorClearance(project, item, edges), [project, item, edges])
  const warnings = clearance.flatMap(door => door.hit ? [doorCollisionText(door.index, door.hit, door.label)] : [])
  return <>
    <fieldset className="render-fieldset">
      <legend>Gardırop</legend>
      {!stack && <label className="measure"><span>Kapak hareketi</span>
        <select value={wardrobe.motion ?? 'hinged'} onChange={event => {
          const motion = event.target.value === 'sliding' ? 'sliding' : 'hinged'
          update({ ...wardrobe, motion, doors: motion === 'sliding' ? 2 : wardrobe.doors })
        }}><option value="hinged">Menteşeli</option><option value="sliding">Sürgülü · 2 panel</option></select>
      </label>}
      {!sliding && <label className="measure"><span>{stack ? 'Her katta kapak sayısı' : 'Kapak sayısı'}</span>
        <select value={wardrobe.doors} onChange={event => {
          chooseDoor(0)
          update(resizeWardrobeDoors(wardrobe, Number(event.target.value)))
        }}>
          {wardrobeDoorCounts.map(count => <option key={count}>{count}</option>)}
        </select>
      </label>}
      <label className="measure"><span>Kapak tipi</span>
        <select value={wardrobe.front} onChange={event => update({ ...wardrobe, front: event.target.value === 'glass' ? 'glass' : 'solid' })}>
          <option value="solid">Opak kapak</option><option value="glass">Cam kapak</option>
        </select>
      </label>
      <label className="measure"><span>Projede kapak durumu</span>
        <select value={wardrobe.pose} onChange={event => {
          const pose = event.target.value
          if (pose === 'closed' || pose === 'open' || pose === 'none') update({ ...wardrobe, pose })
        }}><option value="closed">Kapalı</option><option value="open">Açık</option><option value="none">Kapaksız</option></select>
      </label>
      {wardrobe.pose !== 'none' && <label className="measure check">
        <input type="checkbox" checked={visible} onChange={toggle} /><span>Kapakları 3B düzenleyicide göster</span>
      </label>}
    </fieldset>
    {stack && <WardrobeStackFields item={item} wardrobe={wardrobe} update={update} />}
    {wardrobe.pose !== 'none' && <fieldset className="render-fieldset" data-review-anchor="door">
      <legend>{sliding ? 'Sürgü ayarları' : 'Kapak açılımı'}</legend>
      {sliding ? <>
        <label className="measure"><span>Panelleri topla</span>
          <select value={wardrobe.parking ?? 'left'} onChange={event =>
            update({ ...wardrobe, parking: event.target.value === 'right' ? 'right' : 'left' })}>
            <option value="left">Sola</option><option value="right">Sağa</option>
          </select>
        </label>
        <NumberField label="Kaydırma (%)" min={0} max={100} value={wardrobe.pose === 'open' ? (wardrobe.slide ?? 1) * 100 : 0}
          onChange={value => update({ ...wardrobe, pose: 'open', slide: Math.round(value) / 100 })} />
      </> : <>
        <label className="measure"><span>Düzenlenecek kapak</span>
          <select value={index} onChange={event => chooseDoor(Number(event.target.value))}>
            {clearance.map(door => <option key={door.index} value={door.index}>{door.label}</option>)}
          </select>
        </label>
        <label className="measure"><span>Menteşe tarafı</span>
          <select value={state.hinge} onChange={event =>
            update(changeDoor(wardrobe, index, { hinge: event.target.value === 'right' ? 'right' : 'left' }))}>
            <option value="left">Sol</option><option value="right">Sağ</option>
          </select>
        </label>
        <div className="field-grid">
          <NumberField label="Kapak açısı (°)" min={0} max={state.limit} step={.1} value={state.angle}
            onChange={angle => update(openDoor(wardrobe, index, Math.round(angle * 10) / 10))} />
          <NumberField label="Azami açı (°)" min={1} max={110} step={.1} value={state.limit}
            onChange={limit => update(changeDoor(wardrobe, index, { limit: Math.round(limit * 10) / 10 }))} />
        </div>
        {warnings.length ? <div className="fit-card warning" role="status"><CircleAlert size={16} />
          <div>{warnings.map(warning => <p key={warning}>{warning}</p>)}</div>
        </div> : <p className="meta" role="status">Kapak açılımında çakışma yok.</p>}
      </>}
    </fieldset>}
    <InteriorSettings wardrobe={wardrobe} update={update} />
  </>
}

export function WardrobeStackFields({ item, wardrobe, update }: Pick<Props, 'item' | 'wardrobe' | 'update'>) {
  const stack = wardrobe.stack
  if (!stack) return null
  const zones = wardrobeZones(item)
  return <fieldset className="render-fieldset">
    <legend>Gardırop bölümleri</legend>
    <div className="field-grid">
      <Measure label="Alt dolap yüksekliği" value={Math.round(item.height * stack.lower)}
        min={Math.ceil(item.height * .1) / 10} max={Math.floor(item.height * Math.min(.7, .9 - stack.middle) + 1e-7) / 10}
        change={lower => update({ ...wardrobe, stack: { ...stack, lower: lower / item.height } })} />
      <Measure label={stack.type === 'drawers' ? 'Çekmece bandı yüksekliği' : 'Açık niş yüksekliği'} value={Math.round(item.height * stack.middle)}
        min={Math.ceil(item.height * .08) / 10} max={Math.floor(item.height * Math.min(.6, .9 - stack.lower) + 1e-7) / 10}
        change={middle => update({ ...wardrobe, stack: { ...stack, middle: middle / item.height } })} />
    </div>
    <p className="meta">Üst dolap yüksekliği · {fmt(Math.round(zones.top - zones.upperBottom))} cm</p>
    {stack.type === 'drawers' && <label className="measure"><span>Dış çekmece sayısı</span>
      <select value={stack.drawers} onChange={event => update({ ...wardrobe, stack: { ...stack, drawers: Number(event.target.value) } })}>
        {[1, 2, 3].map(count => <option key={count}>{count}</option>)}
      </select>
    </label>}
  </fieldset>
}

function InteriorSettings({ wardrobe, update }: Pick<Props, 'wardrobe' | 'update'>) {
  const [chosen, choose] = useState(0)
  const index = Math.min(chosen, wardrobe.doors - 1)
  const interior = wardrobe.interior?.[index] ?? defaultInterior(index)
  function change(patch: Partial<typeof interior>) {
    update({ ...wardrobe, interior: Array.from({ length: Math.max(wardrobe.interior?.length ?? 0, index + 1) },
      (_, i) => i === index ? { ...interior, ...patch } : wardrobe.interior?.[i] ?? null) })
  }
  return <details className="element-card wardrobe-interior">
    <summary>{wardrobe.stack ? 'Üst dolap iç düzeni' : 'İç düzen'}</summary>
    <label className="measure"><span>Gardırop bölmesi</span>
      <select value={index} onChange={event => choose(Number(event.target.value))}>
        {Array.from({ length: wardrobe.doors }, (_, i) => <option value={i} key={i}>{i + 1}. bölme</option>)}
      </select>
    </label>
    {!wardrobe.stack && <label className="measure"><span>Çekmece sayısı</span>
      <select value={interior.drawers} onChange={event => change({ drawers: Number(event.target.value) })}>
        {[0, 1, 2, 3].map(count => <option key={count}>{count}</option>)}
      </select>
    </label>}
    <label className="measure check">
      <input type="checkbox" checked={interior.rail !== undefined} onChange={event => change({ rail: event.target.checked ? .73 : undefined })} />
      <span>Askı borusu</span>
    </label>
    {interior.rail !== undefined && <NumberField label="Askı kotu (%)" value={Math.round(interior.rail * 100)}
      min={20} max={94} onChange={value => change({ rail: Math.round(value) / 100 })} />}
    {interior.shelves.map((level, i) => <div className="shelf-row" key={i}>
      <NumberField label={`${i + 1}. raf kotu (%)`} value={Math.round(level * 100)} min={10} max={90}
        onChange={value => change({ shelves: interior.shelves.map((height, j) => i === j ? Math.round(value) / 100 : height) })} />
      <button aria-label={`${i + 1}. rafı kaldır`} onClick={() => change({ shelves: interior.shelves.filter((_, j) => j !== i) })}>Kaldır</button>
    </div>)}
    <button disabled={interior.shelves.length >= 5} onClick={() => {
      const levels = [0, ...interior.shelves].sort((a, b) => a - b)
      const spaces = levels.map((start, i) => ({ start, end: levels[i + 1] ?? 1 }))
      const { start, end } = spaces.reduce((best, space) => space.end - space.start > best.end - best.start ? space : best)
      change({ shelves: [...interior.shelves, Math.round((start + end) * 50) / 100] })
    }}>Raf ekle</button>
    <p className="meta">{wardrobe.stack ? 'Raf ve askı kotları üst dolap yüksekliğinin yüzdesidir.' : 'Raf ve askı kotları çekmecelerin üzerindeki alanın yüzdesidir.'}</p>
  </details>
}
