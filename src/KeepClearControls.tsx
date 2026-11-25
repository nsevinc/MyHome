import { useState } from 'react'
import { Measure } from './fields'
import { fmt } from './model'
import type { Furniture, KeepClearRule, Project } from './model'

export function KeepClearControls({ project, item, apply }: { project: Project; item: Furniture; apply: (next: Project) => void }) {
  const run = item.wardrobeRun
  const owner = run ? 'run' : 'item'
  const ownerId = run?.id ?? item.id
  const [side, setSide] = useState<KeepClearRule['side']>('front')
  const rules = project.keepClear ?? []
  const saved = rules.find(rule => rule.owner === owner && rule.ownerId === ownerId && rule.side === side)
  const [distance, setDistance] = useState(800)
  function save(value?: number) {
    const rest = rules.filter(rule => rule !== saved)
    if (value !== undefined) rest.push({ owner, ownerId, side, distance: value })
    apply({ ...project, keepClear: rest.length ? rest : undefined })
  }
  return <details className="material-library">
    <summary>Bu alanı boş tut</summary>
    <div className="material-library-body">
      {run ? <p>Geçiş alanı dizideki {project.items.filter(i => i.wardrobeRun?.id === ownerId).length} modülün önüne uygulanır.</p>
        : <label className="measure">Korunacak kenar<select value={side} onChange={event => setSide(event.currentTarget.value as KeepClearRule['side'])}>
          <option value="front">{item.kind === 'bed' ? 'Ayak ucu' : 'Ön'}</option><option value="left">Sol yan</option>
          <option value="right">Sağ yan</option><option value="back">{item.kind === 'bed' ? 'Baş ucu' : 'Arka'}</option>
        </select></label>}
      <Measure label="Boş tutulacak mesafe" min={0.1} value={saved?.distance ?? distance}
        change={value => saved ? save(value) : setDistance(value)} />
      {saved ? <><span className="meta">{fmt(saved.distance)} cm geçiş planda işaretli.</span>
        <button type="button" onClick={() => save()}>Alanı kaldır</button></>
        : <button type="button" onClick={() => save(distance)}>Alanı ayır</button>}
    </div>
  </details>
}
