import { attachToWall, footprintCorners, mountedCenter, overlapsShape, roomEdges, wallMountPose } from './geometry'
import type { WallEdge } from './geometry'
import { wallMountFit } from './furniture-gestures'
import { replaceFurniture } from './group-placement'
import { uid } from './model'
import type { Furniture, Point, Project, UpperCabinetRow } from './model'
import { isUpperCabinet, keepUpperRows } from './upper-row-data'

export function rowSelection(project: Project, items: Furniture[]) {
  if (!items.length || !items.every(i => isUpperCabinet(i) && i.mount!.wallId === items[0].mount!.wallId)) return
  const rows = project.upperCabinetRows?.filter(r => items.some(i => r.members.includes(i.id))) ?? []
  if (rows.length === 1 && items.every(i => rows[0].members.includes(i.id))) return { existing: rows[0] }
  if (!rows.length && items.length >= 2) return { existing: undefined }
}

export function newUpperRow(project: Project, items: Furniture[]): UpperCabinetRow {
  const edge = roomEdges(project.walls).find(e => e.wall.id === items[0].mount!.wallId)!
  const ordered = [...items].sort((a, b) => mountedCenter(a, edge) - mountedCenter(b, edge))
  const first = ordered[0]
  return { id: uid(), wallId: first.mount!.wallId, members: ordered.map(i => i.id), bottom: first.mount!.bottom, gap: 0,
    alignment: 'left', anchor: Math.max(0, mountedCenter(first, edge) - first.width / 2) }
}

export function alongRow(item: Point, edge: WallEdge) {
  return (item.x - edge.a.x) * edge.dx + (item.z - edge.a.z) * edge.dz
}

export function planUpperRow(project: Project, row: UpperCabinetRow, modules: Furniture[]) {
  const edges = roomEdges(project.walls)
  const edge = edges.find(e => e.wall.id === row.wallId)!
  const bed = project.items.find(i => i.id === row.bedId && i.kind === 'bed')
  const total = modules.reduce((sum, i) => sum + i.width, row.gap * (modules.length - 1))
  const start = row.alignment === 'bed' && bed ? alongRow(bed, edge) - total / 2 :
    row.alignment === 'right' ? row.anchor - total : row.anchor
  const end = start + total
  let cursor = start
  const errors: string[] = []
  if (start < 0 || end > edge.wall.length) errors.push('Sıra duvar sınırını aşıyor.')
  if (row.alignment === 'bed' && !bed) errors.push('Ortalamak için yatak seçin.')
  const modulesOnWall = modules.map(item => {
    const center = cursor + item.width / 2
    cursor += item.width + row.gap
    const placed = attachToWall(item, { wallId: row.wallId, offset: center, bottom: row.bottom }, edges)
    const original = project.items.find(i => i.id === item.id)
    if (original?.locked && (original.width !== item.width || original.mount?.bottom !== row.bottom || original.mount.offset !== center)) {
      errors.push(`${item.name} · Konumu kilitli.`)
    }
    return { item: placed, center }
  })
  const ids = new Set(project.items.map(i => i.id))
  const items = modulesOnWall.map(m => m.item)
  const draft: Project = { ...project, items: [...replaceFurniture(project.items, items), ...items.filter(i => !ids.has(i.id))],
    upperCabinetRows: [...(project.upperCabinetRows ?? []).filter(r => r.id !== row.id), row] }
  const beds = project.items.filter(i => i.kind === 'bed')
  const readings = modulesOnWall.map(({ item, center }) => {
    const fit = wallMountFit(draft, item, edges)
    if (fit.blocked) errors.push(`${item.name} · ${fit.blocked}`)
    const shape = footprintCorners(wallMountPose(item, edges))
    const underneath = beds.flatMap(b => {
      const footprint = footprintCorners(b)
      if (!overlapsShape(shape, footprint)) return []
      const along = footprint.map(point => alongRow(point, edge))
      const left = Math.max(center - item.width / 2, Math.min(...along))
      const right = Math.min(center + item.width / 2, Math.max(...along))
      return [{ name: b.name, gap: row.bottom - b.height, center: (left + right) / 2 }]
    }).sort((a, b) => a.gap - b.gap)
    return { item, center, fit, underneath }
  })
  return { project: draft, row, items, readings, edge, edges, total, start, end, errors }
}
export type UpperRowPlan = ReturnType<typeof planUpperRow>

// Run at the project transaction boundary, including a linked bed movement or a deletion.
export function reconcileUpperRows(before: Project, draft: Project): { project: Project; error?: string } {
  const rows = keepUpperRows(draft.upperCabinetRows, draft.items)
  let project = rows === draft.upperCabinetRows ? draft : { ...draft, upperCabinetRows: rows }
  if (!rows?.length || before.layouts?.active !== draft.layouts?.active || before.walls[0]?.id !== draft.walls[0]?.id) return { project }
  const prior = new Map(before.items.map(i => [i.id, i]))
  for (const rule of rows) {
    const old = before.upperCabinetRows?.find(r => r.id === rule.id)
    const items = rule.members.map(id => project.items.find(i => i.id === id)!)
    const edge = roomEdges(project.walls).find(e => e.wall.id === rule.wallId)
    if (!edge || items.some(i => i.mount!.wallId !== rule.wallId)) return { project: before, error: 'Montaj duvarını değiştirmeden önce üst dolap sırasını çözün.' }
    const bed = draft.items.find(i => i.id === rule.bedId)
    const oldEdge = before.walls !== draft.walls && roomEdges(before.walls).find(e => e.wall.id === rule.wallId)
    const bedShift = bed && prior.has(bed.id) && alongRow(bed, edge) !== alongRow(prior.get(bed.id)!, oldEdge || edge)
    const structuralChange = oldEdge && (oldEdge.wall.length !== edge.wall.length || oldEdge.dx !== edge.dx || oldEdge.dz !== edge.dz)
    if (rule === old && !structuralChange && !bedShift && items.every(i => {
      const p = prior.get(i.id)
      return p && p.width === i.width && p.height === i.height && p.depth === i.depth &&
        p.mount?.offset === i.mount!.offset && p.mount?.bottom === i.mount!.bottom
    })) continue
    let row = rule
    if (rule === old) {
      const shifts = new Set<number>(), lifts = new Set<number>()
      const resizing = items.some(i => prior.get(i.id)?.width !== i.width)
      for (const i of items) {
        const p = prior.get(i.id)?.mount
        if (!resizing && p && p.offset !== i.mount!.offset) shifts.add(i.mount!.offset - p.offset)
        if (p && p.bottom !== i.mount!.bottom) lifts.add(i.mount!.bottom - p.bottom)
      }
      if (shifts.size > 1 || lifts.size > 1 || (shifts.size && row.alignment === 'bed')) {
        return { project: before, error: 'Modüllerin konumunu değiştirmek için üst dolap sırasının hizasını düzenleyin.' }
      }
      if (shifts.size || lifts.size) row = { ...row, anchor: row.anchor + ([...shifts][0] ?? 0), bottom: row.bottom + ([...lifts][0] ?? 0) }
    }
    const plan = planUpperRow(project, row, items)
    const locked = plan.items.find(i => prior.get(i.id)?.locked && (prior.get(i.id)?.mount?.offset !== i.mount!.offset ||
      prior.get(i.id)?.mount?.bottom !== i.mount!.bottom || prior.get(i.id)?.width !== i.width))
    if (plan.errors.length || locked) return { project: before, error: plan.errors[0] ?? `${locked!.name} · Konumu kilitli.` }
    project = plan.project
  }
  return { project }
}
