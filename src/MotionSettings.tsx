import { Measure, NumberField } from './fields'
import { motionParts, motionValue } from './furniture-motion'
import type { MotionTrial, TrialSelection } from './furniture-motion'
import type { Furniture } from './model'

export function MotionSettings({ item, trial, change, choose }: {
  item: Furniture; trial?: MotionTrial; change: (fields: Partial<Furniture>) => void
  choose: (value?: TrialSelection) => void
}) {
  const parts = motionParts(item)
  const canHaveDrawer = item.kind === 'box' || item.bedroomModel === 'floating-nightstand'
  if (!parts.length && !canHaveDrawer && item.kind !== 'bed') return null
  const active = trial?.item.id === item.id ? trial : undefined
  return <fieldset className="render-fieldset" data-review-anchor="motion">
    <legend>Kullanım provası</legend>
    {canHaveDrawer && <label className="measure check"><input type="checkbox" checked={Boolean(item.drawerTravel)}
      onChange={event => change({ drawerTravel: event.currentTarget.checked ? Math.min(500, Math.max(10, item.depth - 30)) : undefined })} />
      <span>Çekmeceli gövde</span></label>}
    {item.drawerTravel && <Measure label="Çekmece tam açılımı" value={item.drawerTravel} min={1} max={300}
      change={drawerTravel => change({ drawerTravel })} />}
    {item.kind === 'bed' && <label className="measure check"><input type="checkbox" checked={Boolean(item.liftAngle)}
      onChange={event => change({ liftAngle: event.currentTarget.checked ? 55 : undefined })} />
      <span>Açılır baza</span></label>}
    {item.liftAngle && <NumberField label="Baza tam açılımı (°)" value={item.liftAngle} min={5} max={70}
      onChange={liftAngle => change({ liftAngle: Math.round(liftAngle) })} />}
    {parts.length > 0 && <label className="measure"><span>Prova parçası</span>
      <select value={active?.part.id ?? ''} onChange={event => {
        const partId = event.currentTarget.value
        choose(partId ? { itemId: item.id, partId, amount: 0 } : undefined)
      }}>
        <option value="">Prova kapalı</option>
        {parts.map(part => <option key={part.id} value={part.id}>{part.name}</option>)}
      </select>
    </label>}
    {active && <>
      <label className="measure"><span>İstenen açılım · {motionValue(active.part, active.request)}</span>
        <input type="range" aria-label="İstenen açılım" min={0} max={active.part.max} step={1} value={active.request}
          onChange={event => choose({ itemId: item.id, partId: active.part.id, amount: event.currentTarget.valueAsNumber })} />
      </label>
      <button type="button" onClick={() => choose({ itemId: item.id, partId: active.part.id, amount: active.part.max })}>Tam açılımı dene</button>
      <p role="status" className={active.reached ? 'error-message' : 'meta'}>{active.contact
        ? `${active.contact.name} · ilk temas ${motionValue(active.part, active.contact.amount)} · tam açılım için ${motionValue(active.part, active.part.max - active.contact.amount)} eksik`
        : `Tam açılım ${motionValue(active.part, active.part.max)} · çakışma bulunmadı`}</p>
      <p className="meta">Açılımı 3B tutamaçla da deneyebilirsin. Prova durumu geçicidir.</p>
    </>}
  </fieldset>
}
