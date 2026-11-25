import { NumberField } from './fields'
import { roomEdges } from './geometry'
import { defaultSunStudy } from './lighting'
import type { Project, SunStudy } from './model'

export function SunSettings({ project, sun, change }: { project: Project; sun?: SunStudy; change: (sun?: SunStudy) => void }) {
  const patch = (fields: Partial<SunStudy>) => change({ ...(sun ?? defaultSunStudy), ...fields })
  const windows = roomEdges(project.walls).filter(edge => edge.wall.openings.some(opening => opening.kind === 'window'))
  return <fieldset className="render-fieldset">
    <legend>Güneş çalışması</legend>
    <label className="measure check"><input type="checkbox" checked={Boolean(sun)}
      onChange={event => change(event.currentTarget.checked ? { ...defaultSunStudy } : undefined)} />
      <span>Güneş açısını elle ayarla</span></label>
    {sun && <>
      <div className="render-grid">
        <NumberField label="Kuzeyin plandaki açısı (°)" value={sun.north} min={0} max={359.9} step={.1}
          onChange={north => patch({ north })} />
        <NumberField label="Güneş azimutu (°)" value={sun.azimuth} min={0} max={359.9} step={.1}
          onChange={azimuth => patch({ azimuth })} />
        <NumberField label="Güneş yüksekliği (°)" value={sun.elevation} min={1} max={90} step={.1}
          onChange={elevation => patch({ elevation })} />
      </div>
      <div className="button-pair">
        <button type="button" onClick={() => patch({ azimuth: 90, elevation: 22 })}>Sabah açısı</button>
        <button type="button" onClick={() => patch({ azimuth: 270, elevation: 12 })}>Akşam açısı</button>
      </div>
      <p className="meta">Planın üstü 0°, sağı 90°. Azimut kuzeyden saat yönünde ölçülür. Hazır açılar örnek güneş konumlarıdır.</p>
      <p className="meta">{windows.length ? windows.map(edge => {
        const bearing = (Math.atan2(-edge.nx, edge.nz) * 180 / Math.PI - sun.north + 360) % 360
        return `Duvar ${edge.index + 1} pencereleri ${Math.round(bearing) % 360}°`
      }).join(' · ') : 'Pencere ekleyerek doğrudan güneş ışığının odaya girişini inceleyin.'}</p>
    </>}
  </fieldset>
}
