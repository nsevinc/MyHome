import { Measure, NumberField, PercentField } from './fields'
import type { Project, RenderDetail } from './model'
import { renderCorridor, renderDoorChoices } from './render-detail'

export function RenderDetailFields({ project, value, change }: {
  project: Project; value: RenderDetail; change: (patch: Partial<RenderDetail>) => void;
}) {
  const choices = renderDoorChoices(project)
  const { corridor, exterior } = value
  const available = choices.findIndex(door => door.wallId === corridor?.wallId && door.openingId === corridor.openingId)
  const extent = corridor && renderCorridor(project, corridor)
  const hasWindow = project.walls.some(wall => wall.openings.some(opening => opening.kind === 'window'))
  const hasBed = project.items.some(item => item.kind === 'bed')
  return <div className="render-stack">
    <fieldset className="render-fieldset">
      <legend>Kapı arkası</legend>
      <label className="render-checkbox">
        <input type="checkbox" checked={Boolean(corridor)} disabled={!choices.length && !corridor}
          onChange={event => change({ corridor: event.currentTarget.checked && choices.length ? {
            wallId: choices[0].wallId, openingId: choices[0].openingId, depth: 1800, color: '#b2a495', power: 26,
          } : undefined })} /> Koridoru göster
      </label>
      {!choices.length && <p className="meta">Koridor eklemek için planda bir kapı açıklığı olmalı.</p>}
      {corridor && choices.length > 0 && <>
        <label className="measure"><span>Koridorun bağlandığı kapı</span>
          <select value={available < 0 ? '' : available} onChange={event => {
            const { wallId, openingId } = choices[Number(event.target.value)]
            change({ corridor: { ...corridor, wallId, openingId } })
          }}>
            {available < 0 && <option value="" disabled>Bir kapı seç</option>}
            {choices.map((door, i) => <option value={i} key={i}>{door.label}</option>)}
          </select>
        </label>
        <div className="render-grid">
          <Measure label="Koridor derinliği" min={50} max={400} value={corridor.depth}
            change={depth => change({ corridor: { ...corridor, depth } })} />
          <label className="measure"><span>Koridor duvar rengi</span>
            <input type="color" value={corridor.color} onChange={event => change({ corridor: { ...corridor, color: event.target.value } })} />
          </label>
          <NumberField label="Koridor ışığı (W)" min={0} max={150} value={corridor.power}
            onChange={power => change({ corridor: { ...corridor, power } })} />
        </div>
        {available >= 0 && !extent && <p className="meta">Kapı arkasında koridor için yeterli alan bulunamadı.</p>}
        {extent && extent.depth * 1000 < corridor.depth &&
          <p className="meta">Koridor, karşı duvara kadar olan alanla sınırlı.</p>}
      </>}
    </fieldset>
    <fieldset className="render-fieldset">
      <legend>Pencere dışı</legend>
      <label className="render-checkbox">
        <input type="checkbox" checked={Boolean(exterior)} disabled={!hasWindow && !exterior}
          onChange={event => change({ exterior: event.currentTarget.checked ? { brightness: 1 } : undefined })} /> Akşam manzarasını göster
      </label>
      {!hasWindow && <p className="meta">Manzara için planda bir pencere açıklığı olmalı.</p>}
      {exterior && <PercentField label="Manzara parlaklığı" min={0} max={300} value={exterior.brightness}
        onChange={brightness => change({ exterior: { brightness } })} />}
    </fieldset>
    <fieldset className="render-fieldset">
      <legend>Yatak tekstilleri</legend>
      <label className="render-checkbox">
        <input type="checkbox" checked={value.detailedBedding ?? false} disabled={!hasBed && !value.detailedBedding}
          onChange={event => change({ detailedBedding: event.currentTarget.checked })} /> Örtü sarkması ve dikişleri göster
      </label>
      {!hasBed && <p className="meta">Tekstil ayrıntıları katalogdaki ölçülü yataklara uygulanır.</p>}
    </fieldset>
  </div>
}
