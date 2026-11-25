import { bounds, volumeBox, wallPoint } from './geometry'
import type { Box, WallEdge } from './geometry'
import type { Appearance, Project, RoomSurface, WallCovering, WallRegion } from './model'

type Area = Pick<WallRegion, 'start' | 'bottom' | 'width' | 'height'>
export type CoveringCell = Area & { appearance: Appearance; color: string }

export function replaceWallCovering(surface: RoomSurface, wallId: string, covering: WallCovering) {
  const entries = Object.entries(surface.wallCoverings ?? {}).filter(([id]) => id !== wallId)
  if (covering.base || covering.regions.length) entries.push([wallId, covering])
  return entries.length ? Object.fromEntries(entries) : undefined
}

export function coveringAppearance(appearance: Appearance, style: RoomSurface): Appearance {
  if (appearance.preset !== 'original' || appearance.texture) return appearance
  const finish = style.wallFinish ?? 'plain'
  const texture = style.wallTexture
  return { ...appearance, preset: finish === 'wood' ? 'matte-oak' : finish, texture,
    color: appearance.color ?? (texture && !texture.originalColors ? style.wall : undefined),
    relief: appearance.relief ?? style.surfaceRelief }
}

export function wallCoveringCells(style: RoomSurface, wall: WallEdge['wall'], height: number): CoveringCell[] {
  const covering = style.wallCoverings?.[wall.id]
  if (!covering) return []
  const regions = covering.regions.filter(region => region.start < wall.length && region.bottom < height).map(region => ({
    ...region, width: Math.min(region.width, wall.length - region.start), height: Math.min(region.height, height - region.bottom),
  })).reverse()
  const holes = wall.openings.map(opening => ({ ...opening, start: opening.offset }))
  const cuts = [...holes, ...regions]
  const xs = [...new Set([0, wall.length, ...cuts.flatMap(area => [area.start, area.start + area.width])])].sort((a, b) => a - b)
  const ys = [...new Set([0, height, ...cuts.flatMap(area => [area.bottom, area.bottom + area.height])])].sort((a, b) => a - b)
  const appearances = new Map<Appearance, Appearance>()
  const cells: CoveringCell[] = []
  for (let row = 0; row < ys.length - 1; row++) {
    const bottom = ys[row], top = ys[row + 1]
    let previous: CoveringCell | undefined
    for (let col = 0; col < xs.length - 1; col++) {
      const start = xs[col], end = xs[col + 1]
      const contains = (area: Area) => start >= area.start && end <= area.start + area.width
        && bottom >= area.bottom && top <= area.bottom + area.height
      const source = holes.some(contains) ? undefined : regions.find(contains)?.appearance ?? covering.base
      if (!source) { previous = undefined; continue }
      let appearance = appearances.get(source)
      if (!appearance) {
        appearance = coveringAppearance(source, style)
        appearances.set(source, appearance)
      }
      if (previous?.appearance === appearance) previous.width += end - start
      else {
        previous = { start, bottom, width: end - start, height: top - bottom, appearance,
          color: appearance.color ?? covering.base?.color ?? style.wall }
        cells.push(previous)
      }
    }
  }
  return cells
}

export function wallCoveringBoxes(project: Project, edges: WallEdge[]): (Box & { wallIds: string[] })[] {
  return edges.flatMap(edge => wallCoveringCells(project.style, edge.wall, project.height).map(cell => {
    const rect = bounds([wallPoint(edge, cell.start), wallPoint(edge, cell.start + cell.width, .75)])
    return { ...volumeBox({ ...rect, bottom: cell.bottom, top: cell.bottom + cell.height }, cell.color),
      appearance: cell.appearance, wallIds: [edge.wall.id], wallCovering: true }
  }))
}
