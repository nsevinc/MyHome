import { attachToWall, mountOffset, roomEdges } from './geometry'
import type { WallEdge } from './geometry'
import { wallMountFit } from './furniture-gestures'
import { elevationData } from './elevation-data'
import { replaceFurniture } from './group-placement'
import type { Furniture, Project } from './model'

export const canMoveWallMount = (item: Furniture) => Boolean(item.mount && !item.locked && !item.curtain)
export const canCopyWallMount = (item: Furniture) => Boolean(item.mount && !item.curtain)

export type MountAxis = 'offset' | 'bottom'

export function wallMovePreview(project: Project, item: Furniture, axis: MountAxis, value: number, edges: WallEdge[], step = 1) {
  const mount = item.mount
  if (!mount || !canMoveWallMount(item)) return
  const edge = edges.find(edge => edge.wall.id === mount.wallId)
  if (!edge) return
  const rounded = Math.round(value / step) * step
  const candidate = axis === 'bottom'
    ? { ...item, mount: { ...mount, bottom: Math.max(0, Math.min(Math.max(0, project.height - item.height), rounded)) } }
    : attachToWall(item, { ...mount, offset: mountOffset(edge, item.width, rounded) }, edges)
  return { item: candidate, ...wallMountFit(project, candidate, edges) }
}

export type MountSymmetry = { wallId: string; leftId: string; rightId: string; referenceId: string; distance: number }

export function wallSymmetryOptions(project: Project, edge: WallEdge, edges: WallEdge[]) {
  const { objects, mounted } = elevationData(project, edge, edges)
  const wallCenter = { id: '', name: 'Duvar merkezi', center: edge.wall.length / 2 }
  const references = objects.filter(({ item, center }) =>
    (item.kind === 'bed' || item.kind === 'mirror') && center > 0 && center < edge.wall.length)
    .map(({ item, center }) => ({ id: item.id, name: item.name, center }))
  return { references: [wallCenter, ...references], mounts: mounted.filter(({ item }) => canMoveWallMount(item)) }
}

export type WallSymmetryOptions = ReturnType<typeof wallSymmetryOptions>

export function newMountSymmetry(options: WallSymmetryOptions, wallId: string, selectedId?: string): MountSymmetry | undefined {
  const first = options.mounts.find(row => row.item.id === selectedId) ??
    options.mounts.find(row => row.item.kind === 'sconce') ?? options.mounts[0]
  if (!first) return
  const second = options.mounts.find(row => row !== first && row.item.kind === first.item.kind) ??
    options.mounts.find(row => row !== first)
  if (!second) return
  const [left, right] = first.center <= second.center ? [first, second] : [second, first]
  const reference = options.references.find(ref => ref.id && ![left.item.id, right.item.id].includes(ref.id)) ?? options.references[0]
  return { wallId, leftId: left.item.id, rightId: right.item.id, referenceId: reference.id,
    distance: Math.max(1, Math.round((right.center - left.center) / 2)) }
}

type SymmetrySide = { offset: number; name: string; item?: Furniture; blocked?: string; mirrorGap?: number }
export type SymmetryPreview = { center?: number; left?: SymmetrySide; right?: SymmetrySide; items: Furniture[]; error?: string }

export function wallSymmetryPreview(project: Project, setup: MountSymmetry, edges = roomEdges(project.walls)): SymmetryPreview {
  const edge = edges.find(edge => edge.wall.id === setup.wallId)
  if (!edge) return { items: [], error: 'Montaj duvarı bulunamadı.' }
  const { references, mounts } = wallSymmetryOptions(project, edge, edges)
  const ref = references.find(ref => ref.id === setup.referenceId)
  const left = mounts.find(row => row.item.id === setup.leftId)
  const right = mounts.find(row => row.item.id === setup.rightId)
  if (!left || !right || left === right) return { items: [], error: 'Aynı duvardan iki farklı montajlı eşya seç.' }
  if (!ref || ref.id === left.item.id || ref.id === right.item.id) return { items: [], error: 'İki eşyadan ayrı bir referans seç.' }
  if (!Number.isInteger(setup.distance) || setup.distance <= 0) return { items: [], error: 'Eksenden pozitif bir uzaklık gir.' }
  const offsets = [Math.floor(ref.center - setup.distance), Math.ceil(ref.center + setup.distance)]
  const rows: SymmetrySide[] = [left, right].map(({ item }, index) => {
    const offset = offsets[index]
    if (offset < Math.ceil(item.width / 2) || offset > edge.wall.length - Math.ceil(item.width / 2)) {
      return { name: item.name, offset, blocked: 'Bu konumda eşya duvar sınırını aşıyor.' }
    }
    return { name: item.name, offset, item: attachToWall(item, { ...item.mount!, offset }, edges) }
  })
  const items = rows.flatMap(row => row.item ? [row.item] : [])
  const candidate = { ...project, items: replaceFurniture(project.items, items) }
  const mirror = project.items.find(item => item.kind === 'mirror' && item.mount?.wallId === setup.wallId &&
    item.id !== setup.leftId && item.id !== setup.rightId &&
    Math.abs(mountOffset(edge, item.width, item.mount.offset) - ref.center) <= item.width / 2)
  const mirrorCenter = mirror && mountOffset(edge, mirror.width, mirror.mount!.offset)
  rows.forEach((row, index) => {
    if (!row.item) return
    row.blocked = wallMountFit(candidate, row.item, edges).blocked
    if (mirror && mirrorCenter !== undefined) {
      row.mirrorGap = index === 0 ? mirrorCenter - mirror.width / 2 - row.offset - row.item.width / 2
        : row.offset - row.item.width / 2 - mirrorCenter - mirror.width / 2
    }
  })
  return { center: ref.center, left: rows[0], right: rows[1], items }
}

export function copyName(name: string, items: Furniture[]) {
  const base = name.replace(/ kopyası(?: \d+)?$/, '') || name
  const names = new Set(items.map(item => item.name))
  for (let count = 1; count <= items.length + 1; count++) {
    const suffix = count === 1 ? ' kopyası' : ` kopyası ${count}`
    const candidate = base.slice(0, 100 - suffix.length).trimEnd() + suffix
    if (!names.has(candidate)) return candidate
  }
  return name
}

export type MountCopy = { id: string; sourceId: string; direction: -1 | 1; distance: number }

export function wallCopyPreview(project: Project, source: Furniture, options: MountCopy, edges = roomEdges(project.walls)):
  { item?: Furniture; blocked?: string } {
  if (options.sourceId !== source.id || !source.mount || !canCopyWallMount(source)) return { blocked: 'Bu eşya aynı kotta çoğaltılamıyor.' }
  if (project.items.length >= 300) return { blocked: 'Bir yerleşimde en fazla 300 eşya olabilir.' }
  const edge = edges.find(edge => edge.wall.id === source.mount?.wallId)
  if (!edge) return { blocked: 'Montaj duvarı bulunamadı.' }
  const offset = mountOffset(edge, source.width, source.mount.offset) + options.direction * options.distance
  if (offset < Math.ceil(source.width / 2) || offset > edge.wall.length - Math.ceil(source.width / 2)) {
    return { blocked: 'Bu aralıkta kopya duvar sınırını aşıyor.' }
  }
  const candidate = attachToWall({ ...source, id: options.id, name: copyName(source.name, project.items), locked: undefined },
    { ...source.mount, offset }, edges)
  return { item: candidate, blocked: wallMountFit(project, candidate, edges).blocked }
}

export function addFurnitureCopy(project: Project, sourceId: string, item: Furniture): Project {
  const designs = project.designs && { ...project.designs, entries: project.designs.entries.map(entry => {
    const paint = entry.items.find(row => row.id === sourceId)
    return paint ? { ...entry, items: [...entry.items, { ...paint, id: item.id }] } : entry
  }) }
  return { ...project, items: [...project.items, item], designs }
}

export { addFurnitureCopy as addWallMountCopy }
