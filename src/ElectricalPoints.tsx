import { Plus, Trash2 } from 'lucide-react'
import { Measure, TextField } from './fields'
import { electricalIcons, electricalNames, electricalPosition, newElectricalPoint } from './electrical-points'
import type { ElectricalReading } from './electrical-points'
import { maxElectricalPoints } from './model'
import type { ElectricalPoint, Wall } from './model'
import { useState } from 'react'

export function ElectricalPointEditor({ wall, height, readings, selectedId, select, save }: {
  wall: Wall; height: number; readings: ElectricalReading[]; selectedId?: string;
  select: (id?: string) => void; save: (points: ElectricalPoint[]) => boolean;
}) {
  const [kind, setKind] = useState<ElectricalPoint['kind']>('outlet')
  const points = wall.electricalPoints ?? []
  const point = points.find(point => point.id === selectedId) ?? points[0]
  const reading = readings.find(reading => reading.point.id === point?.id)
  const update = (fields: Partial<ElectricalPoint>) => point && save(points.map(row => row.id === point.id ? { ...row, ...fields } : row))
  return <section className="wall-electrical-panel" aria-label="Elektrik noktaları">
    <div className="wall-copy-controls wall-symmetry-fields">
      <label className="measure">Nokta türü <select value={kind} onChange={event => setKind(event.currentTarget.value as ElectricalPoint['kind'])}>
        {Object.entries(electricalNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button type="button" disabled={points.length >= maxElectricalPoints} onClick={() => {
        const next = newElectricalPoint(wall, height, kind)
        if (save([...points, next])) select(next.id)
      }}><Plus size={16} /> Nokta ekle</button>
      {point && <label className="measure">Düzenlenecek nokta <select value={point.id} onChange={event => select(event.currentTarget.value)}>
        {points.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>}
    </div>
    {point ? <>
      <div className="wall-copy-controls wall-symmetry-fields wall-electrical-fields">
        <TextField key={point.id} label="Nokta adı" value={point.name} change={name => update({ name })} />
        <Measure label="Duvar başından" value={point.offset} max={wall.length / 10} change={offset => update({ offset })} />
        <Measure label="Yerden yükseklik" value={point.height} max={height / 10} change={height => update({ height })} />
        <label className="measure check"><input type="checkbox" checked={Boolean(point.example)}
          onChange={event => update({ example: event.currentTarget.checked || undefined })} /> <span>Örnek ölçü</span></label>
        <button type="button" className="icon danger" aria-label="Elektrik noktasını kaldır" onClick={() => {
          if (save(points.filter(row => row.id !== point.id))) select(undefined)
        }}><Trash2 size={16} /></button>
      </div>
      {reading && <p className={reading.status === 'warning' ? 'error-message' : 'meta'} role="status">
        {reading.detail}{point.example ? ' · Örnek ölçü' : ''}
      </p>}
    </> : <p className="meta">Bu duvarda kayıtlı elektrik noktası yok.</p>}
  </section>
}

export function ElectricalMarker({ reading, x, y, radius, selected, choose }: {
  reading: ElectricalReading; x: number; y: number; radius: number; selected?: boolean; choose?: () => void;
}) {
  const { point, status, detail } = reading
  return <g className={`electrical-marker electrical-${status}`} transform={`translate(${x} ${y})`}
    role={choose ? 'button' : undefined} tabIndex={choose ? 0 : undefined} aria-label={choose ? point.name : undefined}
    aria-pressed={choose && selected !== undefined ? selected : undefined}
    onPointerDown={choose ? event => { if (event.button === 0) { event.stopPropagation(); choose() } } : undefined}
    onKeyDown={choose ? event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose() }
    } : undefined}>
    <circle r={radius} vectorEffect="non-scaling-stroke" />
    <text fontSize={radius * 1.02} textAnchor="middle" dominantBaseline="central" pointerEvents="none">{electricalIcons[point.kind]}</text>
    <title>{point.name} · {electricalPosition(reading)} · {detail}{point.example ? ' · Örnek ölçü' : ''}</title>
  </g>
}
