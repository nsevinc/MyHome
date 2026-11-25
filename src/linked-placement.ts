import { footprint, placement, roomEdges } from './geometry'
import { orderFurnitureLinks } from './furniture-links'
import { furnitureAngle } from './model'
import type { Furniture, FurnitureLink, LinkAxis, Point, Project } from './model'

export type LinkedPreview = { project: Project; items: Furniture[]; checked: FurnitureLink[]; error?: string }

export const alignmentNames = {
  center: 'Ortala', start: 'Başlangıç kenarını hizala', end: 'Bitiş kenarını hizala',
  before: 'Referanstan önce boşluk', after: 'Referanstan sonra boşluk',
} as const

function changedFootprint(a: Furniture, b?: Furniture) {
  return !b || a.x !== b.x || a.z !== b.z || a.width !== b.width || a.depth !== b.depth
    || a.height !== b.height || furnitureAngle(a) !== furnitureAngle(b)
}

function matchAxis(axis: keyof Point, item: Furniture, reference: Furniture, rule?: LinkAxis) {
  if (!rule || rule.mode === 'center') return rule ? reference[axis] : item[axis]
  const anchor = footprint(reference)
  const follower = footprint(item)
  const size = axis === 'x' ? 'width' : 'depth'
  const start = anchor[axis], end = start + anchor[size]
  const half = follower[size] / 2
  switch (rule.mode) {
    case 'start': return Math.round(start + half)
    case 'end': return Math.round(end - half)
    case 'before': return Math.floor(start - rule.gap - half + 1e-8)
    case 'after': return Math.ceil(end + rule.gap + half - 1e-8)
  }
}

export function resolveLinkedPlacement(before: Project, draft: Project): LinkedPreview | undefined {
  const links = draft.furnitureLinks
  if (!links?.length || before.items === draft.items && before.furnitureLinks === links) return
  const { ordered, error } = orderFurnitureLinks(draft.items, links)
  if (!ordered) return { project: draft, items: [], checked: [], error }

  const priorItems = new Map(before.items.map(item => [item.id, item]))
  const priorLinks = new Map(before.furnitureLinks?.map(link => [link.id, link]))
  const items = new Map(draft.items.map(item => [item.id, item]))
  const changed = new Set(draft.items.filter(item => changedFootprint(item, priorItems.get(item.id))).map(item => item.id))
  const affected = new Set<string>()
  const checked: FurnitureLink[] = []
  let blocked: string | undefined
  for (const link of ordered) {
    if (!changed.has(link.referenceId) && !changed.has(link.itemId) && priorLinks.get(link.id) === link) continue
    const reference = items.get(link.referenceId)!
    const item = items.get(link.itemId)!
    const x = matchAxis('x', item, reference, link.x)
    const z = matchAxis('z', item, reference, link.z)
    if (x !== item.x || z !== item.z) {
      if (item.locked) blocked ??= `${reference.name} → ${item.name} · Bağlı eşyanın konumu kilitli.`
      items.set(item.id, { ...item, x, z })
      changed.add(item.id)
    }
    checked.push(link)
    affected.add(reference.id)
    affected.add(item.id)
  }
  if (!checked.length) return

  const project = { ...draft, items: Array.from(items.values()) }
  const affectedItems = project.items.filter(item => affected.has(item.id))
  if (!blocked) {
    const edges = roomEdges(project.walls)
    for (const item of affectedItems) {
      if (!changedFootprint(item, priorItems.get(item.id))) continue
      const { warning, overlapping } = placement(project, item, edges, true)
      if (!warning.length) continue
      const link = checked.find(link => link.itemId === item.id) ?? checked.find(link => link.referenceId === item.id)!
      const description = `${items.get(link.referenceId)!.name} → ${items.get(link.itemId)!.name}`
      blocked = `${description} · ${item.name} · ${overlapping?.length ? overlapping.join(', ') + ' ile örtüşüyor.' : warning[0]}`
      break
    }
  }
  return { project, items: affectedItems, checked, error: blocked }
}

export function linkedItemsChanged(before: Project, preview: LinkedPreview) {
  const original = new Map(before.items.map(item => [item.id, item]))
  return preview.items.some(item => changedFootprint(item, original.get(item.id)))
}
