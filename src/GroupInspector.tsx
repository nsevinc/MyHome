import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { alignFurniture, equalizeMountHeight, movementAxes, replaceFurniture, spaceFurniture } from './group-placement'
import type { WallEdge } from './geometry'
import type { Furniture, Point, Project } from './model'

export function GroupInspector({ project, items, edges, apply, remove }: {
  project: Project; items: Furniture[]; edges: WallEdge[]; apply: (next: Project) => void;
  remove: () => void;
}) {
  const [axisChoice, chooseAxis] = useState<keyof Point>('x')
  const [notice, setNotice] = useState('')
  const axes = movementAxes(items, edges)
  const axis = axes.includes(axisChoice) ? axisChoice : axes[0]
  const canLevel = items.every(item => item.mount && !item.locked)

  function update(moved: Furniture[] | undefined) {
    if (!moved) { setNotice('Seçili alana bu düzen uygulanamadı.'); return }
    setNotice('')
    apply({ ...project, items: replaceFurniture(project.items, moved) })
  }

  return <div className="control-section">
    <ul className="group-selection-list">{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
    {axis ? <fieldset className="render-fieldset">
      <legend>Hizalama</legend>
      <label className="measure"><span>Hizalama ekseni</span>
        <select value={axis} onChange={event => chooseAxis(event.currentTarget.value as keyof Point)}>
          {axes.map(value => <option key={value} value={value}>{value === 'x' ? 'Yatay (X)' : 'Dikey (Z)'}</option>)}
        </select>
      </label>
      <div className="group-align-actions">
        <button onClick={() => update(alignFurniture(items, edges, axis, 'start'))}>{axis === 'x' ? 'Sol kenar' : 'Üst kenar'}</button>
        <button onClick={() => update(alignFurniture(items, edges, axis, 'center'))}>Merkez</button>
        <button onClick={() => update(alignFurniture(items, edges, axis, 'end'))}>{axis === 'x' ? 'Sağ kenar' : 'Alt kenar'}</button>
      </div>
      <button disabled={items.length < 3} onClick={() => update(spaceFurniture(items, edges, axis))}>Eşit aralık</button>
    </fieldset> : <p className="meta">{items.some(item => item.locked)
      ? 'Hizalamak veya taşımak için önce seçimin kilidini aç.'
      : 'Plan üzerinde birlikte taşımak için serbest eşyaları veya aynı duvardaki sabit eşyaları seç.'}</p>}
    {canLevel && <button onClick={() => update(equalizeMountHeight(items))}>Alt kotları eşitle</button>}
    <div className="button-pair">
      <button disabled={items.every(item => item.locked)} onClick={() => update(items.map(item => ({ ...item, locked: true })))}>
        Seçimi kilitle</button>
      <button disabled={items.every(item => !item.locked)} onClick={() => update(items.map(item => ({ ...item, locked: undefined })))}>
        Kilitleri aç</button>
    </div>
    <button type="button" className="full danger" disabled={items.every(item => item.locked)} onClick={remove} aria-keyshortcuts="Delete">
      <Trash2 size={16} /> Seçili eşyaları kaldır
    </button>
    {notice && <p className="error-message" role="status">{notice}</p>}
  </div>
}
