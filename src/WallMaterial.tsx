import { useState } from 'react'
import { Measure } from './fields'
import { MaterialFields } from './ItemMaterial'
import { maxWallRegions } from './model'
import type { RoomSurface, Wall, WallCovering, WallRegion } from './model'
import { coveringAppearance } from './wall-coverings'
import { captureAppearance } from './material-pipette'
import type { MaterialPipette } from './material-pipette'

export function WallMaterial({ wall, height, style, change, startDrawing, pipette }: {
  wall: Wall; height: number; style: RoomSurface;
  change: (update: (covering: WallCovering) => WallCovering) => void; startDrawing: () => void; pipette: MaterialPipette;
}) {
  const [picked, setPicked] = useState('')
  const covering = style.wallCoverings?.[wall.id]
  const regions = covering?.regions ?? []
  const region = regions.find(value => value.id === picked)
  const committed = region?.appearance ?? covering?.base ?? null
  const color = covering?.base?.color ?? style.wall
  const patchRegion = (patch: Partial<WallRegion>) => change(current => ({
    ...current, regions: current.regions.map(value => value.id === region?.id ? { ...value, ...patch } : value),
  }))
  return <fieldset className="render-fieldset wall-material">
    <legend>Duvar malzemesi</legend>
    <label className="measure"><span>Kaplanacak yüzey</span>
      <select value={region?.id ?? ''} onChange={event => setPicked(event.currentTarget.value)}>
        <option value="">Tüm duvar</option>
        {regions.map((value, index) => <option key={value.id} value={value.id}>Kaplama {index + 1}</option>)}
      </select>
    </label>
    <button type="button" onClick={startDrawing} disabled={regions.length >= maxWallRegions}>Kaplama alanı çiz</button>
    {region && <div className="field-grid">
      <Measure label="Kaplama başlangıcı" value={region.start} max={Math.max(0, wall.length - region.width) / 10}
        change={start => patchRegion({ start })} />
      <Measure label="Kaplama alt kotu" value={region.bottom} max={Math.max(0, height - region.height) / 10}
        change={bottom => patchRegion({ bottom })} />
      <Measure label="Kaplama genişliği" min={.1} value={region.width} max={Math.max(1, wall.length - region.start) / 10}
        change={width => patchRegion({ width })} />
      <Measure label="Kaplama yüksekliği" min={.1} value={region.height} max={Math.max(1, height - region.bottom) / 10}
        change={height => patchRegion({ height })} />
    </div>}
    <MaterialFields key={region?.id ?? 'wall'} current={committed} color={color}
      transfer={{ pipette, label: region ? `Duvar kaplaması ${regions.indexOf(region) + 1}` : 'Duvar yüzeyi',
        source: captureAppearance(coveringAppearance(committed ?? { preset: 'original' }, style), color) }}
      apply={value => {
        if (region) patchRegion({ appearance: value ?? covering?.base ?? { preset: 'original' } })
        else change(current => ({ ...current, base: value ?? undefined }))
      }} />
    {region && <button type="button" className="danger" onClick={() => {
      change(current => ({ ...current, regions: current.regions.filter(value => value.id !== region.id) }))
      setPicked('')
    }}>Kaplama alanını kaldır</button>}
  </fieldset>
}
