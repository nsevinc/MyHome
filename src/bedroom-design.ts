import { bedroomCatalog, makeBedroomFurniture } from './bedroom-catalog'
import type { BedroomHeadboard } from './bedroom-catalog'
import { attachToWall, bounds, footprintCorners, placement, roomEdges, wallMountPose } from './geometry'
import type { WallEdge } from './geometry'
import { duplicateLayout, renameLayout } from './layout-variants'
import { furnitureAngle, makeMountedFurniture, uid } from './model'
import type { Furniture, Project } from './model'
import { cabinetDoorClearance, cabinetDoorEnvironment, doorCollisionText } from './wardrobe'

export const bedroomDesignNames = { simple: 'Sade yatak başı', storage: 'Depolama odaklı' } as const
export type BedroomPreset = keyof typeof bedroomDesignNames
export type BedroomDimensions = Pick<Furniture, 'width' | 'depth' | 'height'> & { bottom: number }
export type BedroomDesign = {
  headboard: BedroomHeadboard
  headboardId: string
  headboardSize: BedroomDimensions
  lights: boolean
  nightstands: boolean
  modules: Furniture[]
}

const moduleGap = 20
const bedsideGap = 65
const [nightstandWidth] = bedroomCatalog['floating-nightstand'].size
const alongWall = (item: Pick<Furniture, 'x' | 'z'>, edge: WallEdge) =>
  (item.x - edge.a.x) * edge.dx + (item.z - edge.a.z) * edge.dz
const centeredSpace = (offset: number, edge: WallEdge) => 2 * Math.min(offset, edge.wall.length - offset)

function behindBed(bed: Furniture, edge: WallEdge) {
  const radians = furnitureAngle(bed) * Math.PI / 180
  return -Math.sin(radians) * edge.nx + Math.cos(radians) * edge.nz >= .995
}

function bedWallGap(bed: Furniture, edge: WallEdge) {
  return Math.min(...footprintCorners(bed).map(point =>
    (point.x - edge.a.x) * edge.nx + (point.z - edge.a.z) * edge.nz))
}

export function suggestBedroomWall(bed: Furniture, edges: WallEdge[]) {
  return edges.filter(edge => behindBed(bed, edge) && bedWallGap(bed, edge) >= -.01 &&
    centeredSpace(alongWall(bed, edge), edge) > 0)
    .sort((a, b) => bedWallGap(bed, a) - bedWallGap(bed, b))[0]
}

export function headboardDimensions(model: BedroomHeadboard, bed: Furniture, edge: WallEdge) {
  const { size: [, depth, height], bottom } = bedroomCatalog[model]
  return { width: Math.max(10, Math.floor(Math.min(bed.width, centeredSpace(alongWall(bed, edge), edge)))),
    depth: Math.max(10, Math.floor(Math.min(depth, bedWallGap(bed, edge) + .000001))),
    height, bottom: bottom ?? 0 }
}

export function newBedroomModule(kind: 'upper-cabinet' | 'side-cabinet', wallId: string) {
  return makeBedroomFurniture(kind, { x: 0, z: 0 }, { wallId, offset: 0, bottom: bedroomCatalog[kind].bottom! })
}

export function defaultBedroomDesign(project: Project, bed: Furniture, edge: WallEdge, preset: BedroomPreset): BedroomDesign {
  const headboard = preset === 'storage' ? 'slatted-panel' : 'upholstered-headboard'
  const headboardSize = headboardDimensions(headboard, bed, edge)
  const cutWidth = Math.min(bed.width + 2 * nightstandWidth, headboardSize.width +
    2 * Math.max(0, Math.min(nightstandWidth, (centeredSpace(alongWall(bed, edge), edge) - bed.width) / 2)))
  const top = Math.max(0, project.height - 70)
  const modules = preset === 'storage' ? (['side-cabinet', 'upper-cabinet', 'side-cabinet'] as const).map((kind, i): Furniture => {
    const item = newBedroomModule(kind, edge.wall.id)
    const wing = Math.max(140, Math.floor((cutWidth - 2 * moduleGap) * .26))
    const width = i === 1 ? Math.max(200, Math.floor(cutWidth - 2 * wing - 2 * moduleGap)) : wing
    return { ...item, name: i === 1 ? item.name : `${item.name} · ${i === 0 ? '1' : '2'}`,
      width, mount: { ...item.mount!, bottom: Math.max(0, top - item.height) },
      wardrobe: i === 2 ? { ...item.wardrobe!, leaves: [{ hinge: 'right' }] } : item.wardrobe }
  }) : []
  return { headboard, headboardSize, headboardId: uid(),
    lights: preset === 'simple', nightstands: preset === 'simple', modules }
}

export function buildBedroomDesign(project: Project, bed: Furniture, edge: WallEdge, design: BedroomDesign) {
  const offset = alongWall(bed, edge)
  const edges = roomEdges(project.walls)
  const notes: string[] = []
  const errors: string[] = []
  const items: Furniture[] = []
  const layoutPart = (item: Furniture, center: number, bottom: number) => {
    const at = Math.round(center)
    if (at < Math.ceil(item.width / 2) || edge.wall.length - at < Math.ceil(item.width / 2)) {
      errors.push(`${item.name} duvara sığmıyor. Genişliğini azalt veya başka duvar seç.`)
    }
    items.push(attachToWall(item, { wallId: edge.wall.id, offset: at, bottom }, edges))
  }
  if (!behindBed(bed, edge) || bedWallGap(bed, edge) < -.01 || centeredSpace(offset, edge) <= 0) {
    errors.push('Yatağın başı seçilen duvara paralel ve duvar aralığında olmalı.')
  }
  const headboard = { ...makeBedroomFurniture(design.headboard, { x: 0, z: 0 }), id: design.headboardId }
  const { bottom, ...size } = design.headboardSize
  layoutPart({ ...headboard, ...size }, offset, bottom)
  const spread = design.modules.reduce((sum, item) => sum + item.width, moduleGap * Math.max(0, design.modules.length - 1))
  let start = offset - spread / 2
  for (const item of design.modules) {
    layoutPart(item, start + item.width / 2, item.mount!.bottom)
    start += item.width + moduleGap
  }
  const nightstandOffset = bed.width / 2 + bedsideGap + nightstandWidth / 2
  if (design.nightstands) {
    for (const side of [-1, 1]) {
      const at = offset + side * nightstandOffset
      if (at - nightstandWidth / 2 < 0 || at + nightstandWidth / 2 > edge.wall.length) continue
      layoutPart(makeBedroomFurniture('floating-nightstand', { x: 0, z: 0 }), at, bedroomCatalog['floating-nightstand'].bottom!)
    }
    const count = items.filter(item => item.bedroomModel === 'floating-nightstand').length
    if (count < 2) notes.push(count === 0 ? 'Bu duvarda yatağın yanında askılı komodin için yeterli yer yok.'
      : 'Bu duvarda yatağın yalnızca bir yanında askılı komodin için yer var.')
  }
  if (design.lights) {
    const sideOffset = Math.min(bed.width * .34, centeredSpace(offset, edge) / 2 - 110)
    const bottom = Math.max(1340, design.headboardSize.bottom + design.headboardSize.height + 140)
    if (sideOffset < 115) notes.push('Bu duvarda iki aplik için yeterli yer yok.')
    else for (const side of [-1, 1]) {
      const light = makeMountedFurniture('sconce', edge.wall.id, offset, project.height)
      layoutPart({ ...light, name: side < 0 ? 'Yatak başı apliki · 1' : 'Yatak başı apliki · 2' }, offset + side * sideOffset, bottom)
    }
  }
  if (project.items.length + items.length > 300) errors.push('Bir yerleşimde en fazla 300 eşya olabilir.')
  const draft = { ...project, items: [
    ...project.items.map(item => item.id === bed.id ? { ...item, separateHeadboard: true } : item), ...items,
  ] }
  const environment = cabinetDoorEnvironment(draft, edges)
  const bedBounds = bounds(footprintCorners(bed))
  const bedWidthOnWall = edge.dx ? bedBounds.width : bedBounds.depth
  const readings = items.map(item => {
    const fit = placement(draft, item, edges, true)
    const doors = cabinetDoorClearance(draft, wallMountPose(item, edges), edges, environment)
    const warnings = fit.warning.map(warning => warning === 'Başka bir eşyanın alanıyla örtüşüyor.' && fit.overlapping?.length
      ? `Çakışan eşyalar · ${fit.overlapping.join(', ')}` : warning)
    const aboveBed = item.wardrobe && Math.abs(item.mount!.offset - offset) < (bedWidthOnWall + item.width) / 2
      && item.depth > bedWallGap(bed, edge)
      ? item.mount!.bottom - bed.height : undefined
    const doorWarnings = doors.flatMap(door => door.hit ? [doorCollisionText(door.index, door.hit, door.label)] : [])
    return { item, fit, warnings, aboveBed, doors, doorWarnings }
  })
  return { project: draft, items, notes, errors, readings, bed, edge, offset }
}

export type BedroomPreview = ReturnType<typeof buildBedroomDesign>

export function saveBedroomAlternative(project: Project, preview: BedroomPreview, preset: BedroomPreset) {
  const copy = duplicateLayout(project, preview.project.items)
  if (!copy?.layouts) return
  const title = bedroomDesignNames[preset]
  const titles = new Set(project.layouts?.entries.map(entry => entry.name))
  let name: string = title
  for (let number = 2; titles.has(name); number++) name = `${title} ${number}`
  return renameLayout(copy, copy.layouts.active, name)
}
