import { Measure } from './fields'
import { furnitureVolumes, roomEdges, sillAppearance, sillTouchesParts, sillVolume, sillWidthLimit, wallMountPose, windowSill } from './geometry'
import type { Opening, Project, Wall, WindowSill } from './model'
import { TrimMaterial } from './WallTrimFields'
import type { TrimMaterialControls } from './WallTrimFields'

export function WindowSillFields({ wall, opening, project, change, material }: {
  wall: Wall; opening: Opening; project: Project; change: (sill?: WindowSill) => void | boolean; material?: TrimMaterialControls;
}) {
  const sill = windowSill(wall, opening)
  const widthLimit = sillWidthLimit(wall, opening)
  const edges = sill ? roomEdges(project.walls) : []
  const edge = edges.find(candidate => candidate.wall.id === wall.id)
  const projection = edge && sillVolume(edge, opening, project.thickness, true)
  const clashes = projection ? project.items.filter(item =>
    sillTouchesParts(projection, furnitureVolumes(wallMountPose(item, edges), project.height))).map(item => item.name) : []
  function edit(patch: Partial<WindowSill>) {
    if (!sill) return
    const { start: _start, ...settings } = sill
    return change({ ...settings, ...patch })
  }
  return <fieldset className="render-fieldset window-sill-fields">
    <legend>Pencere denizliği</legend>
    <label className="measure check">
      <input type="checkbox" checked={Boolean(sill)} onChange={event => change(event.currentTarget.checked ? {
        width: Math.min(widthLimit, opening.width), depth: Math.min(1500, project.thickness + 70),
        thickness: Math.min(opening.height, 30), finish: 'white',
      } : undefined)} />
      Mermer denizlik ekle
    </label>
    {sill && <>
      <div className="field-grid">
        <Measure label="Denizlik genişliği" value={sill.width} min={.1} max={widthLimit / 10} change={width => edit({ width })} />
        <Measure label="Denizlik derinliği" value={sill.depth} min={.1} max={150} change={depth => edit({ depth })} />
        <Measure label="Denizlik kalınlığı" value={sill.thickness} min={.1} max={Math.min(150, opening.height) / 10}
          change={thickness => edit({ thickness })} />
        <label className="measure"><span>Mermer türü</span>
          <select value={sill.finish} onChange={event => edit({ finish: event.currentTarget.value === 'gray' ? 'gray' : 'white', appearance: undefined })}>
            <option value="white">Beyaz damarlı</option><option value="gray">Gri damarlı</option>
          </select>
        </label>
      </div>
      {material && <TrimMaterial controls={material} appearance={sill.appearance} fallback={sillAppearance({ ...sill, appearance: undefined })} />}
      {clashes.length > 0 && <p className="error-message" role="status">Çakışan eşyalar · {clashes.join(', ')}</p>}
      <p className="meta">Derinlik duvarın dış yüzünden içe doğru ölçülür. Denizlik pencere açıklığının alt kotuna oturur.</p>
    </>}
  </fieldset>
}
