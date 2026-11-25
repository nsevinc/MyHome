import { roomEdges } from './geometry'
import { replaceFurniture } from './group-placement'
import { wallSymmetryPreview } from './wall-mount-edit'
import type { SymmetryPreview } from './wall-mount-edit'
import type { Furniture, MountSymmetryRule, Project } from './model'

const movedMount = (before: Furniture | undefined, after: Furniture | undefined) =>
  before?.mount?.wallId !== after?.mount?.wallId || before?.mount?.offset !== after?.mount?.offset

function referenceChanged(before: Furniture | undefined, after: Furniture | undefined) {
  return before?.x !== after?.x || before?.z !== after?.z || before?.width !== after?.width || before?.depth !== after?.depth
    || before?.angle !== after?.angle || before?.rotation !== after?.rotation || movedMount(before, after)
}

export function mountSymmetryRuleConflict(rules: MountSymmetryRule[], current: MountSymmetryRule) {
  const other = rules.filter(rule => rule.id !== current.id)
  const participants = [current.leftId, current.rightId]
  if (other.some(rule => participants.some(id => id === rule.leftId || id === rule.rightId))) {
    return 'İki eşyadan biri başka bir simetri kuralında kullanılıyor.'
  }
  if (other.some(rule => participants.includes(rule.referenceId) ||
    current.referenceId === rule.leftId || current.referenceId === rule.rightId)) {
    return 'Hareket eden bir eşya başka bir simetri kuralında referans olarak kullanılamaz.'
  }
}

export function resolveMountSymmetries(before: Project, project: Project) {
  if (!project.mountSymmetries?.length || before.items === project.items && before.walls === project.walls) return
  const beforeItems = new Map(before.items.map(item => [item.id, item]))
  const afterItems = new Map(project.items.map(item => [item.id, item]))
  const oldRules = new Map(before.mountSymmetries?.map(rule => [rule.id, rule]))
  const edges = roomEdges(project.walls)
  const previousEdges = new Map(roomEdges(before.walls).map(edge => [edge.wall.id, edge]))
  const checks: { rule: MountSymmetryRule; preview: SymmetryPreview }[] = []
  let error: string | undefined
  for (const rule of project.mountSymmetries) {
    const prior = oldRules.get(rule.id)
    const previous = previousEdges.get(rule.wallId)
    const edge = edges.find(edge => edge.wall.id === rule.wallId)
    const wallChanged = previous?.a.x !== edge?.a.x || previous?.a.z !== edge?.a.z ||
      previous?.wall.dir !== edge?.wall.dir || previous?.wall.length !== edge?.wall.length
    const dependencyChanged = prior !== rule || wallChanged ||
      referenceChanged(beforeItems.get(rule.referenceId), afterItems.get(rule.referenceId))
    const moved = [rule.leftId, rule.rightId].find(id => movedMount(beforeItems.get(id), afterItems.get(id)))
    if (!dependencyChanged && !moved) continue
    const preview = wallSymmetryPreview(project, rule, edges)
    if (preview.items.length === 2 && preview.items.every(item => !movedMount(afterItems.get(item.id), item)) && !preview.error) continue
    if (!dependencyChanged && moved) {
      error ??= `${afterItems.get(moved)?.name ?? 'Montajlı eşya'} · yatay konumu kayıtlı simetri kuralı belirliyor.`
    }
    checks.push({ rule, preview })
  }
  if (!checks.length) return
  const items = checks.flatMap(({ preview }) => preview.items)
  const candidate = { ...project, items: replaceFurniture(project.items, items) }
  const results = checks.map(({ rule }) => ({ rule, preview: wallSymmetryPreview(candidate, rule, edges) }))
  const warning = results.map(({ preview }) => preview.error ?? preview.left?.blocked ?? preview.right?.blocked).find(Boolean)
  return { project: candidate, items, results, error: error ?? warning }
}

export type MountSymmetryChanges = NonNullable<ReturnType<typeof resolveMountSymmetries>>
