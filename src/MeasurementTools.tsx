import { Ruler } from 'lucide-react'
import { useState } from 'react'
import { Measure, TextField } from './fields'
import { measurementObstacles, passageText } from './measurements'
import type { MeasurementReading } from './measurements'
import type { WallEdge } from './geometry'
import type { DoorState } from './opening-door'
import { cm, maxMeasurements, uid } from './model'
import type { Furniture, Measurement } from './model'

type Fixed = Extract<Measurement, { kind: 'gap' | 'height' }>
type PassageMark = Extract<Measurement, { kind: 'passage' }>
export type PassagePick = { id?: string }

function FixedEditor({ kind, original, items, edges, itemId, save, cancel }: {
  kind: Fixed['kind']; original?: Fixed; items: Furniture[]; edges: WallEdge[]; itemId?: string;
  save: (measurement: Fixed) => void; cancel: () => void;
}) {
  const [source, setSource] = useState(original?.sourceId ?? itemId ?? items[0]?.id ?? '')
  const [target, setTarget] = useState(original?.kind === 'gap' ? original.targetId : items.find(item => item.id !== source)?.id ?? '')
  const [obstacle, setObstacle] = useState(original?.kind === 'height' ? original.obstacleId ?? '' : '')
  const sourceItem = items.find(item => item.id === source)
  const targetItem = items.find(item => item.id === target && item.id !== source)
  const obstacles = measurementObstacles(edges)
  const chosenObstacle = obstacles.find(entry => entry.obstacle.id === obstacle)
  return <fieldset className="render-fieldset">
    <legend>{kind === 'gap' ? 'Eşya arası ölçü' : 'Düşey boşluk'}</legend>
    <label className="measure"><span>Başlangıç eşyası</span>
      <select value={source} onChange={event => {
        setSource(event.target.value)
        if (target === event.target.value) setTarget(items.find(item => item.id !== event.target.value)?.id ?? '')
      }}>
        {!sourceItem && <option value={source}>Eşya seç</option>}
        {items.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
    </label>
    {kind === 'gap' ? <label className="measure"><span>Hedef eşya</span>
      <select value={target} onChange={event => setTarget(event.target.value)}>
        {!targetItem && <option value={target}>Eşya seç</option>}
        {items.filter(item => item.id !== source).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
      </select>
    </label> : <label className="measure"><span>Üst sınır</span>
      <select value={obstacle} onChange={event => setObstacle(event.target.value)}>
        <option value="">Tavan</option>
        {obstacle && !chosenObstacle && <option value={obstacle}>Çıkıntı seç</option>}
        {obstacles.map(({ obstacle, edge }) =>
          <option key={obstacle.id} value={obstacle.id}>{obstacle.name} · Duvar {edge.index + 1}</option>)}
      </select>
    </label>}
    <div className="measurement-actions">
      <button type="button" disabled={!sourceItem || (kind === 'gap' ? !targetItem : Boolean(obstacle && !chosenObstacle))}
        onClick={() => {
          if (!sourceItem) return
          if (kind === 'gap' && !targetItem) return
          const targetName = kind === 'gap' ? targetItem!.name : chosenObstacle?.obstacle.name ?? 'Tavan'
          const base = { id: original?.id ?? uid(), name: original?.name ?? `${sourceItem.name} / ${targetName}`.slice(0, 100),
            sourceId: source }
          save(kind === 'gap' ? { ...base, kind, targetId: target } : { ...base, kind, obstacleId: obstacle || undefined })
        }}>Ölçüyü kaydet</button>
      <button type="button" onClick={cancel}>Vazgeç</button>
    </div>
  </fieldset>
}

export function MeasurementTools({ open, toggle, choosing, startPick, notice, readings, selected, select, replace, remove,
  mode, setMode, projectHeight, items, edges, itemId }: {
  open: boolean; toggle: () => void; choosing?: PassagePick; startPick: (pick?: PassagePick) => void; notice: string;
  readings: MeasurementReading[]; selected?: MeasurementReading; select: (id: string) => void;
  replace: (measurement: Measurement) => void; remove: (id: string) => void;
  mode: DoorState; setMode: (mode: DoorState) => void; projectHeight: number; items: Furniture[]; edges: WallEdge[]; itemId?: string;
}) {
  const [fixedDraft, setFixedDraft] = useState<{ kind: Fixed['kind']; original?: Fixed }>()
  const limit = readings.length >= maxMeasurements
  const active = selected?.measurement
  const setPassage = (entry: PassageMark, patch: Partial<PassageMark>) => replace({ ...entry, ...patch })
  return <div className="passage-tool">
    <button type="button" aria-expanded={open} onClick={() => { setFixedDraft(undefined); toggle() }}>
      <Ruler size={17} /> Ölçümler
    </button>
    {open && <section className="passage-panel measurement-panel" aria-label="Kayıtlı ölçümler">
      {choosing ? <>
        <p className="meta" role="status">Planda geçişi ölçmek istediğin noktaya tıkla.</p>
        {notice && <p className="error-message" role="status">{notice}</p>}
        <button type="button" onClick={() => startPick(undefined)}>Nokta seçimini bitir</button>
      </> : <>
        <div className="measurement-actions">
          <button type="button" disabled={limit} onClick={() => { setFixedDraft(undefined); startPick({}) }}>Geçiş ölç</button>
          <button type="button" disabled={limit || items.length < 2} onClick={() => setFixedDraft({ kind: 'gap' })}>Eşya arası</button>
          <button type="button" disabled={limit || !items.length} onClick={() => setFixedDraft({ kind: 'height' })}>Düşey boşluk</button>
        </div>
        {readings.length > 0 && <div className="passage-results measurement-list" role="group" aria-label="Ölçü listesi">
          {readings.map(reading => <button type="button" key={reading.measurement.id} aria-pressed={active?.id === reading.measurement.id}
            className={reading.warning ? 'below-limit' : undefined} onClick={() => { setFixedDraft(undefined); select(reading.measurement.id) }}>
            <span>{reading.number}. {reading.measurement.name}</span><strong>{reading.text}</strong>
          </button>)}
        </div>}
        {fixedDraft ? <FixedEditor key={fixedDraft.original?.id ?? fixedDraft.kind} {...fixedDraft} items={items} edges={edges} itemId={itemId}
          cancel={() => setFixedDraft(undefined)} save={entry => { replace(entry); setFixedDraft(undefined) }} />
          : active && selected && <div className="selected-measurement" key={active.id}>
            <TextField label="Ölçü adı" value={active.name} change={name => replace({ ...active, name })} />
            <p className="meta">{selected.detail}</p>
            {active.kind === 'passage' && 'modes' in selected && <>
              <label className="measure"><span>Ölçüm yönü</span>
                <select value={active.axis} onChange={event => setPassage(active, { axis: event.target.value === 'z' ? 'z' : 'x' })}>
                  <option value="x">Yatay</option><option value="z">Dikey</option>
                </select>
              </label>
              <div className="field-grid">
                <Measure label="Alt genişlik sınırı" min={.1} value={active.minimum}
                  change={minimum => setPassage(active, { minimum })} />
                <Measure label="Denetlenen yükseklik" min={.1} max={cm(projectHeight)} value={active.headroom}
                  change={headroom => setPassage(active, { headroom })} />
              </div>
              <div className="passage-results" role="group" aria-label="Kapak durumu karşılaştırması">
                {selected.modes.map(reading => <button key={reading.mode} type="button" aria-pressed={mode === reading.mode}
                  className={reading.width < active.minimum ? 'below-limit' : undefined} onClick={() => setMode(reading.mode)}>
                  <span>{reading.label}</span><strong>{passageText(reading)}</strong>
                </button>)}
              </div>
            </>}
            <div className="measurement-actions">
              {active.kind === 'passage' ? <button type="button" onClick={() => startPick({ id: active.id })}>Noktayı taşı</button>
                : <button type="button" onClick={() => setFixedDraft({ kind: active.kind, original: active })}>Bağlantıyı düzenle</button>}
              <button type="button" onClick={() => remove(active.id)}>Ölçüyü kaldır</button>
            </div>
          </div>}
      </>}
    </section>}
  </div>
}
