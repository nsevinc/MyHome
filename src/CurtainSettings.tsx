import { attachToWall, curtainRadiatorReadings } from './geometry'
import type { WallEdge } from './geometry'
import { Measure, PercentField } from './fields'
import { fmt } from './model'
import type { Furniture, Project } from './model'

export function CurtainSettings({ project, item, edges, change }: {
  project: Project; item: Furniture; edges: WallEdge[]; change: (patch: Partial<Furniture>) => void;
}) {
  const { curtain, mount } = item
  if (!curtain || !mount) return null
  const windows = edges.flatMap(edge => edge.wall.openings.filter(opening => opening.kind === 'window')
    .map((window, index) => ({ edge, window, index })))
  const linked = windows.find(({ edge, window }) => edge.wall.id === mount.wallId && window.id === curtain.windowId)
  const readings = curtainRadiatorReadings(project, item, edges)
  return <fieldset className="render-fieldset">
    <legend>Perde ve pencere</legend>
    <label className="measure"><span>Bağlı pencere</span><select value={linked?.window.id ?? ''} onChange={event => {
      const target = windows.find(({ window }) => window.id === event.currentTarget.value)
      if (!target) return
      const { edge, window } = target
      change(attachToWall({ ...item, curtain: { ...curtain, windowId: window.id } },
        { ...mount, wallId: edge.wall.id, offset: Math.round(window.offset + window.width / 2) }, edges))
    }}>
      {!linked && <option value="" disabled>Pencere seç</option>}
      {windows.map(({ edge, window, index }) => <option key={window.id} value={window.id}>
        Duvar {edge.index + 1} · Pencere {index + 1} · {fmt(window.width)} cm
      </option>)}
    </select></label>
    <label className="measure"><span>Kumaş türü</span><select value={curtain.fabric} onChange={event => {
      change({ curtain: { ...curtain, fabric: event.currentTarget.value === 'sheer' ? 'sheer' : 'opaque' } })
    }}><option value="sheer">Işık geçiren tül</option><option value="opaque">Kalın kumaş</option></select></label>
    <div className="field-grid">
      <Measure label="Alt kot" value={mount.bottom} change={bottom => change({ mount: { ...mount, bottom } })} />
      <Measure label="Duvardan açıklık" value={curtain.setback} change={setback => change({ curtain: { ...curtain, setback } })} />
    </div>
    <PercentField label="Perde açıklığı" min={0} max={100} value={curtain.open}
      onChange={open => change({ curtain: { ...curtain, open } })} />
    {readings.map(({ id, name, clearance }) => <p className={clearance !== undefined && clearance <= 0 ? 'error-message' : 'meta'}
      key={id} role="status">{name} · {clearance === undefined ? 'Kumaş peteğin önünde değil' :
        clearance < 0 ? `${fmt(Math.round(-clearance))} cm çakışma` :
          clearance === 0 ? 'Kumaş peteğe temas ediyor' : `${fmt(Math.round(clearance))} cm boşluk`}</p>)}
  </fieldset>
}
