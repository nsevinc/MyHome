import { furnitureVolumes, placement, roomEdges, wallMountPose, wallPoint } from './geometry'
import { passageReader } from './layout'
import { defaultWardrobe, defaultWardrobeGap, furnitureAngle, makeSlidingWardrobe, makeStackedWardrobe, makeWardrobe,
  maxWardrobeGap, maxFurnitureItems, normalizeAngle, wardrobeStackCatalog } from './model'
import type { Furniture, Project, WardrobeFillArea } from './model'
import { cabinetDoorClearance, cabinetDoorEnvironment, cabinetDoors, changeDoor, localToRoom } from './wardrobe'
import { assemblyObstacles, wardrobeAssembly } from './wardrobe-assembly'
import { motionParts, solveMotion } from './furniture-motion'
import { firstSlideOverlap, rectanglePoints } from './sweep'

export const maxWardrobeModules = maxFurnitureItems
const wallSpacing = 1

export const wardrobeRunTypes = {
  hinged: 'Askılı / menteşeli', sliding: 'Sürgülü',
  niche: wardrobeStackCatalog.niche.name, drawers: wardrobeStackCatalog.drawers.name,
} as const
export type WardrobeRunType = keyof typeof wardrobeRunTypes

export function wardrobeRunType(item: Furniture): WardrobeRunType {
  return item.wardrobe?.stack?.type ?? (item.wardrobe?.motion === 'sliding' ? 'sliding' : 'hinged')
}

export function newWardrobeModule(index: number, type: WardrobeRunType = 'hinged'): Furniture {
  const origin = { x: 0, z: 0 }
  if (type === 'niche' || type === 'drawers') return makeStackedWardrobe(type, origin)
  if (type === 'sliding') return makeSlidingWardrobe(origin)
  return { ...makeWardrobe(2, origin), name: `Gardırop modülü ${index + 1}`, width: 900, height: 2300 }
}

export function changeWardrobeRunType(item: Furniture, type: WardrobeRunType) {
  if (wardrobeRunType(item) === type) return item
  const preset = newWardrobeModule(0, type)
  const previous = item.wardrobe ?? defaultWardrobe
  if (type === 'sliding' && !previous.stack) {
    return { ...item, wardrobe: { ...previous, doors: 2, motion: 'sliding' as const, leaves: undefined } }
  }
  if (type === 'hinged' && previous.motion === 'sliding') {
    const { parking, slide, ...wardrobe } = previous
    return { ...item, wardrobe: { ...wardrobe, motion: 'hinged' as const } }
  }
  return { ...item, wardrobe: { ...preset.wardrobe!, front: previous.front, doors: type === 'sliding' ? 2 : previous.doors },
    appearances: { ...preset.appearances, ...item.appearances } }
}

export function moveWardrobeModule(items: Furniture[], index: number, step: -1 | 1) {
  const target = index + step
  if (!items[index] || !items[target]) return items
  const next = [...items]
  next[index] = items[target]
  next[target] = items[index]
  return next
}

export function wardrobeRunMembers(project: Project, id: string) {
  return project.items.filter(item => item.wardrobeRun?.id === id)
    .sort((a, b) => a.wardrobeRun!.index - b.wardrobeRun!.index)
}

export function wardrobeRunOffset(project: Project, item: Furniture) {
  const edge = roomEdges(project.walls).find(edge => edge.wall.id === item.wardrobeRun?.wallId)
  if (!edge) return 0
  return Math.max(0, Math.round((item.x - edge.a.x) * edge.dx + (item.z - edge.a.z) * edge.dz - item.width / 2))
}

export function buildWardrobeRun(project: Project, id: string, wallId: string, offset: number, modules: Furniture[],
  gap = modules[0]?.wardrobeRun?.gap ?? defaultWardrobeGap, fill?: WardrobeFillArea) {
  const edges = roomEdges(project.walls)
  const edge = edges.find(edge => edge.wall.id === wallId)
  if (!edge || !modules.length || modules.length > maxWardrobeModules || !Number.isInteger(gap)
    || gap < 0 || gap > maxWardrobeGap) return
  const existing = wardrobeRunMembers(project, id)
  const excluded = new Set(existing.map(item => item.id))
  const remaining = project.items.filter(item => !excluded.has(item.id))
  let distance = offset
  const angle = normalizeAngle(Math.atan2(-edge.nx, edge.nz) * 180 / Math.PI)
  const parts = modules.map((source, index) => {
    const anchor = fill ? source.wardrobeRun?.anchor : undefined
    const start = anchor?.start ?? distance
    const inset = anchor?.inset ?? wallSpacing
    const center = wallPoint(edge, start + source.width / 2, source.depth / 2 + inset)
    distance = start + source.width + gap
    const item: Furniture = { ...source, x: Math.round(center.x), z: Math.round(center.z), angle,
      wardrobe: source.wardrobe ?? { ...defaultWardrobe }, wardrobeRun: { id, wallId, index, ...(gap !== defaultWardrobeGap && { gap }),
        ...(fill && { fill, anchor: { start, inset, fixed: anchor?.fixed } }) } }
    return { item, start, inset }
  })
  const runItems = parts.map(part => part.item)
  const next = { ...project, items: [...remaining, ...runItems] }
  const end = Math.max(...parts.map(({ start, item }) => start + item.width))
  return { project: next, parts, edges, edge, length: end - offset, fill,
    remaining: edge.wall.length - end,
    overhang: Math.max(0, end - edge.wall.length), locked: existing.some(item => item.locked) }
}

export function inspectWardrobeRun(run: NonNullable<ReturnType<typeof buildWardrobeRun>>, margin: number, passage: number) {
  const { project, parts, edges, edge } = run
  const readPassage = passageReader(project, edges, project.items.map(item => wallMountPose(item, edges)))
  const obstacles = assemblyObstacles(project)
  const doorEnvironment = cabinetDoorEnvironment(project, edges)
  return parts.map(({ item, start, inset }) => {
    const fit = placement(project, item, edges)
    const volumes = furnitureVolumes(item, project.height)
    const conflicts = edge.wall.openings.filter(opening => opening.offset < start + item.width
      && opening.offset + opening.width > start && volumes.some(volume => volume.top > opening.bottom
        && volume.bottom < opening.bottom + opening.height))
    const doors = cabinetDoorClearance(project, item, edges, doorEnvironment)
    const doorSuggestion = !run.locked && item.wardrobe && doors.some(door => door.hit)
      ? suggestDoorChange(run, item, doors, doorEnvironment) : undefined
    const drawers = motionParts(item).map(part => solveMotion(project, item, part, obstacles))
    const slider = slideCheck(item, doorEnvironment)
    const origin = wallPoint(edge, start + item.width / 2, item.depth + inset + 5)
    const passageReadings = readPassage({ origin, axis: edge.nx === 0 ? 'z' : 'x',
      minimum: passage, headroom: Math.min(project.height, 2000) })
    const suggested = Math.floor((item.height + fit.clearance - margin) / 10) * 10
    return { item, fit, conflicts, doors, drawers, slider, doorSuggestion, passageReadings, assembly: wardrobeAssembly(project, item, obstacles),
      suggested: fit.clearance < margin && suggested >= 300 ? suggested : undefined }
  })
}

function suggestDoorChange(run: NonNullable<ReturnType<typeof buildWardrobeRun>>, item: Furniture,
  doors: ReturnType<typeof cabinetDoorClearance>, environment: ReturnType<typeof cabinetDoorEnvironment>) {
  const contacts = doors.filter(door => door.hit)
  const contact = contacts.find(door => door.hit?.wallId) ?? contacts[0]
  const details = { itemId: item.id, name: item.name, leaf: contact.label, obstacle: contact.hit!.label, angle: contact.hit!.angle }
  let reversed = item.wardrobe!
  const changes = contacts.map(door => {
    const hinge = door.side === 1 ? 'right' as const : 'left' as const
    reversed = changeDoor(reversed, door.index, { hinge })
    return { leaf: door.label, hinge, limit: door.limit }
  })
  if (cabinetDoorClearance(run.project, { ...item, wardrobe: reversed }, run.edges, environment).every(door => !door.hit)) {
    return { ...details, kind: 'hinge' as const, changes, wardrobe: reversed }
  }
  if (wardrobeRunType(item) !== 'hinged') return
  const candidate = changeWardrobeRunType(item, 'sliding')
  const preferred = candidate.wardrobe!.parking ?? 'left'
  for (const parking of [preferred, preferred === 'left' ? 'right' : 'left'] as const) {
    const wardrobe = { ...candidate.wardrobe!, parking }
    const slide = slideCheck({ ...candidate, wardrobe }, environment)
    if (slide && !slide.hit) return { ...details, kind: 'sliding' as const, travel: slide.limit, wardrobe }
  }
}

export type DoorSuggestion = NonNullable<ReturnType<typeof suggestDoorChange>>

function slideCheck(item: Furniture, environment: ReturnType<typeof cabinetDoorEnvironment>) {
  const wardrobe = item.wardrobe
  if (wardrobe?.motion !== 'sliding' || wardrobe.pose === 'none') return
  const panel = cabinetDoors({ ...item, wardrobe: { ...wardrobe, pose: 'open', slide: 1 } }).find(door => door.travel)
  if (!panel) return
  const limit = Math.abs(panel.travel)
  const angle = furnitureAngle(item) * Math.PI / 180
  const sign = Math.sign(panel.travel)
  const direction = { x: Math.cos(angle) * sign, z: Math.sin(angle) * sign }
  const shapes = [
    { shape: rectanglePoints(panel.center.x - panel.width / 2, panel.center.z - panel.depth / 2, panel.width, panel.depth),
      bottom: panel.y - panel.height / 2, top: panel.y + panel.height / 2 },
    { shape: rectanglePoints(panel.handle.x - panel.depth * .325, panel.handle.z - panel.depth * .08, panel.depth * .65, panel.depth * .16),
      bottom: panel.handleY - panel.handleHeight / 2, top: panel.handleY + panel.handleHeight / 2 },
  ]
  let hit: { distance: number; label: string } | undefined
  for (const shape of shapes) {
    const moving = shape.shape.map(point => localToRoom(item, point))
    for (const obstacle of environment) {
      if (obstacle.id === item.id || obstacle.top <= shape.bottom + .001 || obstacle.bottom >= shape.top - .001) continue
      const distance = firstSlideOverlap(moving, obstacle.shape, direction, hit?.distance ?? limit)
      if (distance !== undefined && (!hit || distance < hit.distance)) hit = { distance, label: obstacle.label }
    }
  }
  return { label: panel.label, limit, hit, start: localToRoom(item, panel.center), direction }
}
