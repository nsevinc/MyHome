import { attachToWall, mountOffset, roomEdges, wallMountPose } from './geometry'
import { replaceFurniture } from './group-placement'
import { fitCabinetLed } from './cabinet-led'
import { measureGaps } from './layout'
import { resolveLinkedPlacement } from './linked-placement'
import { readMeasurements } from './measurements'
import { fmt, furnitureSchema, makeCurtain, makeFurniture, makeMountedFurniture, makePendant, makeSlidingWardrobe, makeStackedWardrobe, makeWardrobe, makeWideBed,
  supportsCabinetLed, wardrobeDoorCounts } from './model'
import type { BedroomModel, Furniture, MountedKind, Project } from './model'
import { bedroomCatalog, makeBedroomFurniture } from './bedroom-catalog'
import { mountingReview } from './mounting-review'
import type { ReviewFinding } from './mounting-review'

export type ReplacementSize = 'model' | 'existing'
export type ReplacementPreview = ReturnType<typeof previewFurnitureReplacement>

export function canUseFreeModel(item: Furniture) {
  return !item.mount && item.kind !== 'pendant'
}

export function nativeReplacementModels(project: Project, source: Furniture) {
  const point = { x: source.x, z: source.z }
  const catalog = Object.keys(bedroomCatalog) as BedroomModel[]
  const mount = source.mount
  if (mount) {
    const { wallId, offset } = mount
    const curtain = source.curtain
    if (curtain) {
      const wall = project.walls.find(wall => wall.id === wallId)
      const opening = wall?.openings.find(opening => opening.id === curtain.windowId && opening.kind === 'window')
      return wall && opening
        ? (['sheer', 'opaque'] as const).map(fabric => makeCurtain(wall, opening, fabric, project.height)) : []
    }
    const kind = source.kind as MountedKind
    const item = makeMountedFurniture(kind, wallId, offset, project.height)
    if (kind === 'wall-cabinet' || kind === 'mirror') return [item, ...catalog.filter(model => bedroomCatalog[model].kind === kind)
      .map(model => makeBedroomFurniture(model, point, mount))]
    return kind === 'sconce' ? [item, makeMountedFurniture(kind, wallId, offset, project.height, true)] : [item]
  }
  if (source.kind === 'pendant') return [makePendant(point, project.height)]
  const floorKinds = ['bed', 'sofa', 'table', 'wardrobe', 'rug', 'box'] as const
  const presets = [
    ...floorKinds.map(kind => makeFurniture(kind, point)), makeWideBed(point), makeSlidingWardrobe(point),
    ...wardrobeDoorCounts.map(count => makeWardrobe(count, point)),
    ...(['drawers', 'niche'] as const).map(type => makeStackedWardrobe(type, point)),
    ...catalog.filter(model => bedroomCatalog[model].bottom === undefined).map(model => makeBedroomFurniture(model, point)),
  ]
  const family = source.bedroomModel && bedroomCatalog[source.bedroomModel].family
  const rank = (item: Furniture) => family && item.bedroomModel && bedroomCatalog[item.bedroomModel].family === family ? 2 :
    Number(item.kind === source.kind)
  return presets.sort((a, b) => rank(b) - rank(a))
}

function measures(project: Project, item: Furniture) {
  const savedPassages = readMeasurements(project).filter(reading => reading.measurement.kind === 'passage')
  if (savedPassages.length) return savedPassages.map(({ measurement, text, warning }) =>
    ({ id: measurement.id, name: measurement.name, value: text, warning }))
  const edges = roomEdges(project.walls)
  return measureGaps(project, item, edges).map(gap => ({ id: gap.label, name: `${gap.label} kenar · ${gap.name}`,
    value: gap.overlap ? 'Çakışıyor' : `${fmt(Math.round(gap.distance))} cm`, warning: gap.overlap }))
}

export function previewFurnitureReplacement(project: Project, source: Furniture, model: Furniture, size: ReplacementSize) {
  const { x, z, angle, rotation, locked, mount } = source
  const { width, depth, height } = size === 'existing' ? source : model
  let candidate: Furniture = { ...model, id: source.id, x, z, rotation, angle, locked, width, depth, height, mount }
  if (source.cabinetLed && supportsCabinetLed(candidate)) Object.assign(candidate, fitCabinetLed(candidate, source.cabinetLed))
  if (candidate.kind === source.kind) {
    candidate = {
      ...candidate,
      ...(source.kind === 'wardrobe' && { wardrobeRun: source.wardrobeRun, assembly: source.assembly }),
      ...(source.kind === 'bed' && { liftAngle: source.liftAngle, separateHeadboard: source.separateHeadboard }),
      ...(source.fixture && candidate.fixture?.variant === source.fixture.variant && { fixture: source.fixture }),
    }
  }
  if (candidate.curtain && source.curtain) candidate = { ...candidate, curtain: {
    ...candidate.curtain, windowId: source.curtain.windowId, open: source.curtain.open, setback: source.curtain.setback,
  } }
  const edges = roomEdges(project.walls)
  const edge = mount && edges.find(edge => edge.wall.id === mount.wallId)
  const compatible = source.kind === model.kind || canUseFreeModel(source) && canUseFreeModel(model)
  let error = !compatible ? 'Duvara ve tavana monte edilen eşyalar için aynı türden bir model seç.' :
    source.locked ? 'Model değiştirmek için önce eşyanın konum kilidini aç.' : undefined
  if (edge && mount) {
    if (!source.curtain && Math.abs(mountOffset(edge, width, mount.offset) - mountOffset(edge, source.width, mount.offset)) > .5) {
      error ??= 'Yeni model duvardaki montaj merkezine sığmıyor.'
    }
    candidate = attachToWall(candidate, mount, edges)
  }
  if (!furnitureSchema.safeParse(candidate).success) error ??= 'Bu ölçüler veya montaj ayarları seçilen modele uygun değil.'
  let draft = { ...project, items: replaceFurniture(project.items, [candidate]) }
  const linked = resolveLinkedPlacement(project, draft)
  if (linked) draft = linked.project
  error ??= linked?.error
  const item = draft.items.find(item => item.id === source.id)!

  const affected = new Set([item.id, ...(linked?.items.map(item => item.id) ?? [])])
  for (const link of project.furnitureLinks ?? []) {
    if (link.referenceId === item.id) affected.add(link.itemId)
    if (link.itemId === item.id) affected.add(link.referenceId)
  }
  const items = draft.items.filter(item => affected.has(item.id)).map(item => wallMountPose(item, edges))
  const precedingWarnings = new Map(mountingReview(project).filter(row => row.status === 'warning').map(row => [row.key, row.shortfall]))
  const warnings = mountingReview(draft).filter(row => row.status === 'warning' &&
    (affected.has(findingItemId(row) ?? '') || !precedingWarnings.has(row.key)
      || row.shortfall && row.shortfall.value > (precedingWarnings.get(row.key)?.value ?? row.shortfall.value) + .05))
  const beforeById = new Map(measures(project, source).map(row => [row.id, row]))
  const measurements = measures(draft, item).map(row => ({ ...row, before: beforeById.get(row.id)?.value }))
  return { project: draft, item, items, linked, error, warnings, measurements }
}

function findingItemId({ target }: ReviewFinding) {
  if (target.kind === 'survey') return
  return target.kind === 'section' || target.kind === 'measurement' ? target.itemId : target.id
}

