import { bounds, roomEdges, wallMountPose } from './geometry'
import { cabinetDoorBlocks, furniturePartBlock, walkingObstacles } from './layout'
import { motionParts, motionTrial, motionValue, solveMotion } from './furniture-motion'
import type { MotionTrial } from './furniture-motion'
import { defaultLayoutPair, layoutScene, resolveLayoutPair } from './layout-variants'
import { fmt, uid } from './model'
import type { Furniture, Project, UsageScenario } from './model'
import { cabinetDoorClearance, cabinetDoorEnvironment, doorLeaf, openDoor } from './wardrobe'
import { measureUsageRoute } from './usage-route'

export type UsagePart = { id: string; name: string; maximum: number; unit: '°' | '%' | 'cm' }

export function usageParts(item: Furniture): UsagePart[] {
  const wardrobe = item.wardrobe
  const doors: UsagePart[] = !wardrobe || wardrobe.pose === 'none' ? [] : wardrobe.motion === 'sliding'
    ? [{ id: 'slide', name: 'Sürgülü kapak', maximum: 100, unit: '%' }]
    : Array.from({ length: wardrobe.doors }, (_, index) => {
      const leaf = doorLeaf(wardrobe, index)
      return { id: `door:${index}`, name: `${index + 1}. kapak`, maximum: leaf.limit, unit: '°' }
    })
  return [...doors, ...motionParts(item).map(part => ({
    id: part.id, name: part.name, maximum: part.max, unit: part.pivot ? '°' as const : 'cm' as const,
  }))]
}

export const usageAmount = (part: UsagePart, amount: number) =>
  part.unit === 'cm' ? `${fmt(Math.round(amount))} cm` : `${fmt(Math.round(amount * 10))}${part.unit}`

export function newUsageScenario(project: Project): UsageScenario {
  const names = new Set(project.usageScenarios?.map(entry => entry.name))
  let number = 1
  while (names.has(`Kullanım ${number}`)) number++
  return { id: uid(), name: `Kullanım ${number}`, states: [], points: [],
    minimum: project.passage?.minimum ?? 750, headroom: Math.min(2000, project.height), layouts: defaultLayoutPair(project) }
}

export function usageLayouts(project: Project, scenario: UsageScenario) {
  return resolveLayoutPair(project, scenario.layouts)
}

export function inspectUsageScenario(source: Project, scenario: Pick<UsageScenario, 'states' | 'points' | 'headroom'>, layoutId?: string) {
  const scene = layoutScene(source, layoutId)
  const edges = roomEdges(scene.walls)
  const items = new Map(scene.items.map(item => [item.id, wallMountPose(item, edges)]))
  const warnings: string[] = []
  const trials: MotionTrial[] = []
  const selected = scenario.states.flatMap(state => {
    const item = items.get(state.itemId)
    const part = item && usageParts(item).find(part => part.id === state.partId)
    if (item && part) return [{ state, item, part }]
    warnings.push(`${source.items.find(item => item.id === state.itemId)?.name ?? item?.name ?? 'Kayıtlı eşya'} · bu yerleşimde hareket bulunamadı.`)
    return []
  })
  const movingDoors = selected.filter(({ part }) => part.id.startsWith('door:') || part.id === 'slide')
  const motion = selected.filter(row => !movingDoors.includes(row))
  const doorIndex = (part: UsagePart) => Number(part.id.slice(5))
  for (const { item, part } of movingDoors) {
    const current = items.get(item.id)!
    const wardrobe = current.wardrobe!
    items.set(item.id, { ...current, wardrobe: part.id === 'slide' ? { ...wardrobe, pose: 'closed' }
      : openDoor(wardrobe, doorIndex(part), 0) })
  }
  // Each trial rebuilds the moving fronts below from its current door states.
  const fixed = selected.length ? cabinetDoorEnvironment(scene, edges, false) : []
  const doorBlocks = () => cabinetDoorBlocks([...items.values()], 'saved', scene.height)
  for (const { state, item, part } of movingDoors) {
    const current = items.get(item.id)!
    const wardrobe = current.wardrobe!
    const desired = Math.min(state.amount, part.maximum)
    if (!desired) continue
    if (part.id === 'slide') {
      items.set(item.id, { ...current, wardrobe: { ...wardrobe, pose: 'open', slide: desired / 100 } })
      if (desired < state.amount - .001) {
        warnings.push(`${item.name} · ${part.name} · ${usageAmount(part, desired)} açıldı · Açılım sınırı.`)
      }
      continue
    }
    const environment = [...fixed, ...doorBlocks().map(block => ({ ...block, label: block.name, bounds: bounds(block.shape) }))]
    const door = cabinetDoorClearance(scene, current, edges, environment)[doorIndex(part)]
    const actual = Math.min(desired, door?.hit?.angle ?? desired)
    if (actual < state.amount - .001) warnings.push(`${item.name} · ${part.name} · ${usageAmount(part, actual)} açıldı${door?.hit
      ? ` · Engel: ${door.hit.label}` : ' · Açılım sınırı'}.`)
    items.set(item.id, { ...current, wardrobe: openDoor(wardrobe, doorIndex(part), actual) })
  }
  const project = { ...scene, items: [...items.values()] }
  const obstacles = motion.length ? [
    ...fixed.map(({ label, ...entry }) => ({ ...entry, name: label })),
    ...doorBlocks(),
  ] : []
  for (const { state, item, part } of motion) {
    const current = items.get(item.id)!
    const moving = motionParts(current).find(candidate => candidate.id === part.id)!
    const trial = motionTrial(solveMotion(project, current, moving, obstacles), Math.min(state.amount, moving.max))
    if (trial.amount < state.amount - .001) warnings.push(`${item.name} · ${part.name} · ${motionValue(moving, trial.amount)} açıldı${trial.contact
      ? ` · Engel: ${trial.contact.name}` : ' · Açılım sınırı'}.`)
    if (trial.amount <= 0) continue
    trials.push(trial)
    obstacles.push(...trial.parts.map(box => furniturePartBlock(current, box, project.height)))
  }
  const reading = scenario.points.length > 1 ? measureUsageRoute(edges.map(edge => edge.a), [
    ...walkingObstacles(project, edges),
    ...trials.flatMap(trial => trial.parts.map(box => furniturePartBlock(trial.item, box, project.height))),
  ], scenario.points, scenario.headroom, project.height) : undefined
  return { project, trials, reading, warnings }
}

export type UsageInspection = ReturnType<typeof inspectUsageScenario>

export function usageRouteStatus(reading: UsageInspection['reading'], minimum: number) {
  if (!reading) return 'Rota için en az iki nokta seç.'
  if (reading.reason === 'outside') return 'Rota oda sınırından çıkıyor.'
  if (reading.reason === 'ceiling') return 'Denetim yüksekliği tavanı aşıyor.'
  if (reading.reason === 'blocked') return 'Rota bir engelin içinden geçiyor.'
  if (reading.width < minimum - .001) return `Hedefin ${fmt(Math.round(minimum - reading.width))} cm altında`
  return 'Geçiş hedefini karşılıyor'
}
