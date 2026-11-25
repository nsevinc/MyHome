import { placement, roomEdges, trimContactText, wallMountPose } from './geometry'
import type { TrimContact } from './geometry'
import { measureGaps, passageReader } from './layout'
import { resolveLinkedPlacement } from './linked-placement'
import { passageText, savedMeasurements } from './measurements'
import type { Furniture, Project } from './model'

export function previewTrimClearance(project: Project, item: Furniture, wallId: string, contacts: TrimContact[]) {
  const edges = roomEdges(project.walls)
  const edge = edges.find(edge => edge.wall.id === wallId)
  const distance = Math.max(0, ...contacts.filter(contact => contact.wallId === wallId).map(contact => contact.distance))
  if (!edge || !distance || item.locked || item.mount || item.kind === 'pendant' || item.wardrobeRun) return

  const x = item.x + edge.nx * distance, z = item.z + edge.nz * distance
  const proposed = { ...project, items: project.items.map(row => row.id === item.id ? { ...row, x, z } : row) }
  const linked = resolveLinkedPlacement(project, proposed)
  const draft = linked?.project ?? proposed
  const priorItems = new Map(project.items.map(row => [row.id, row]))
  const moved = draft.items.filter(row => {
    const prior = priorItems.get(row.id)!
    return row.x !== prior.x || row.z !== prior.z
  })
  const target = draft.items.find(row => row.id === item.id)!
  let error = linked?.error
  if (target.x !== x || target.z !== z) error ??= 'Bu yöndeki konumu bağlı yerleşim kuralı belirliyor.'

  for (const row of moved) {
    const before = placement(project, priorItems.get(row.id)!, edges, true)
    const after = placement(draft, row, edges, true)
    const newContact = after.trim.find(contact => (contact.wallId === wallId && row.id === item.id) ||
      contact.distance > Math.max(0, ...before.trim.filter(previous => previous.wallId === contact.wallId && previous.kind === contact.kind)
        .map(previous => previous.distance)))
    const newNeighbor = after.overlapping?.find(name => !before.overlapping?.includes(name))
    const newWarning = after.warning.find(message => !before.warning.includes(message)
      && !after.trim.some(contact => trimContactText(contact) === message))
    if (newContact) error ??= `${row.name} · Duvar detayı çakışması sürüyor veya artıyor.`
    if (newNeighbor) error ??= `${row.name} · ${newNeighbor} ile yeni çakışma oluşuyor.`
    if (newWarning) error ??= `${row.name} · ${newWarning}`
    if (Math.abs(row.x) > 200000 || Math.abs(row.z) > 200000) error ??= `${row.name} · Konum desteklenen sınırı aşıyor.`
  }

  const beforePassages = passageReader(project, edges, project.items.map(row => wallMountPose(row, edges)))
  const afterPassages = passageReader(draft, edges, draft.items.map(row => wallMountPose(row, edges)))
  const passages = savedMeasurements(project).flatMap(measurement => {
    if (measurement.kind !== 'passage') return []
    const before = beforePassages(measurement)[1], after = afterPassages(measurement)[1]
    if (after.width + .5 < Math.min(measurement.minimum, before.width)) {
      error ??= `${measurement.name} · Hareket, kayıtlı geçişi alt sınırın altında daraltıyor.`
    }
    return [{ id: measurement.id, name: measurement.name, before: passageText(before), after: passageText(after) }]
  })

  const axis = edge.nx ? 'x' : 'z', sign = edge.nx || edge.nz
  const gap = (scene: Project, row: Furniture) => measureGaps(scene, row, edges)
    .find(gap => gap.axis === axis && gap.sign === sign)
  return { project: draft, items: moved, distance, passages, gap: { before: gap(project, item), after: gap(draft, target) }, error }
}

export type TrimClearancePreview = NonNullable<ReturnType<typeof previewTrimClearance>>
