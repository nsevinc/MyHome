import { furnitureVolumes, overlapsShape, placement, roomEdges, wallMountPose } from './geometry'
import { movementAxes, replaceFurniture, selectedFurniture, translateFurniture } from './group-placement'
import { measureGaps, passageReader } from './layout'
import { passageText, savedMeasurements } from './measurements'
import { furnitureAngle, normalizeAngle } from './model'
import type { Furniture, Point, Project } from './model'
import { motionParts, solveMotion } from './furniture-motion'
import { cabinetDoorClearance, cabinetDoorEnvironment, cabinetFurnitureObstacles } from './wardrobe'
import { assemblyObstacles } from './wardrobe-assembly'
import { orderFurnitureLinks } from './furniture-links'
import { resolveLinkedPlacement } from './linked-placement'

export type PlacementOptions = { radius: 500 | 1000 | 1500; rotate: boolean }
export type PlacementSuggestion = {
  items: Furniture[]; dx: number; dz: number; turn: number
  passages: { id: string; name: string; value: string }[]
  sideGap?: { direction: string; name: string; distance: number }
}
export type PlacementResult = { suggestions: PlacementSuggestion[]; currentIssues: string[]; blockers: string[] }
type OpeningCheck = { key: string; label: string; obstacle?: string; missing: number }
type CandidateOffset = { x: number; z: number; turn: number; cost: number }

// Restrict the worker message to geometry and clearance inputs. Embedded images and GLBs stay in the editor.
export function placementSearchScene(project: Project): Project {
  return {
    version: project.version, title: project.title, height: project.height, thickness: project.thickness,
    walls: project.walls.map(({ baseboard, openings, ...wall }) => ({ ...wall,
      baseboard: baseboard && { ...baseboard, appearance: undefined },
      openings: openings.map(({ sill, trim, ...opening }) => ({ ...opening,
        sill: sill && { ...sill, appearance: undefined }, trim: trim && { ...trim, appearance: undefined } })),
    })),
    style: { wall: project.style.wall, floor: project.style.floor, light: project.style.light },
    passage: project.passage, measurements: project.measurements, keepClear: project.keepClear,
    furnitureLinks: project.furnitureLinks,
    items: project.items.map(({ model, material, appearances, fixture, ...item }) => item),
  }
}

function searchOffsets(axes: (keyof Point)[], range: number, rotates: boolean) {
  const steps = Array.from({ length: range / 25 + 1 }, (_, index) => (index - range / 50) * 50)
  const turns = rotates ? [0, 90, -90, 180] : [0]
  const points = (values: number[]) => (axes.includes('x') ? values : [0]).flatMap(x =>
    (axes.includes('z') ? values : [0]).flatMap(z => Math.hypot(x, z) <= range ? [{ x, z }] : []))
  const nearby = points([-40, -30, -20, -10, 0, 10, 20, 30, 40])
    .filter(point => point.x !== 0 || point.z !== 0).map(point => ({ ...point, turn: 0, cost: Math.hypot(point.x, point.z) }))
  return [...nearby, ...points(steps).flatMap(({ x, z }) => turns.flatMap(turn =>
    x || z || turn ? [{ x, z, turn, cost: Math.hypot(x, z) + Math.abs(turn) / 90 * 150 }] : []))]
    .sort((a, b) => a.cost - b.cost || Math.abs(a.turn) - Math.abs(b.turn))
}

type PlacementConstraints = {
  offsets: Point[]
  check: (draft: Project) => string[]
  limit: number
}

export function findPlacements(project: Project, ids: readonly string[], options: PlacementOptions, constraints?: PlacementConstraints): PlacementResult {
  const edges = roomEdges(project.walls)
  const scene = { ...project, items: project.items.map(item => wallMountPose(item, edges)) }
  const selected = selectedFurniture(scene.items, ids)
  const axes = movementAxes(selected, edges)
  if (selected.length !== ids.length || !axes.length) {
    return { suggestions: [], currentIssues: ['Kilitli eşyalar, perde ve farklı duvarlara bağlı gruplar taşınamaz.'], blockers: [] }
  }
  const fixed = new Set(ids)
  const orderedLinks = orderFurnitureLinks(scene.items, scene.furnitureLinks ?? []).ordered ?? []
  for (const link of orderedLinks) {
    if (fixed.has(link.referenceId)) fixed.add(link.itemId)
  }
  const movingIds = [...fixed]
  const anchor = selected[0]
  const canTurn = selected.length === 1 && !anchor.mount && options.rotate
  const doors = cabinetDoorEnvironment(scene, edges).filter(entry => !entry.id || !fixed.has(entry.id))
  const obstacles = assemblyObstacles(scene).filter(entry => !entry.id || !fixed.has(entry.id))
  const roomDoors = doors.filter(entry => !entry.id && entry.label.endsWith(' kapısı'))
  const movers = scene.items.filter(item => item.kind === 'wardrobe' || item.wardrobe || item.liftAngle || item.drawerTravel)
  const neighbors = movers.filter(item => !fixed.has(item.id)).map(item => ({ item, parts: motionParts(item) }))
  const measurements = savedMeasurements(scene).filter(measure => measure.kind === 'passage')

  function prepare(items: Furniture[]) {
    const moved = items.map(item => wallMountPose(item, edges))
    const draft = { ...scene, items: replaceFurniture(scene.items, moved) }
    const shapes = moved.flatMap(item => furnitureVolumes(item, scene.height).map(volume =>
      ({ ...volume, id: item.id, name: item.name })))
    return { moved, draft, shapes,
      doorEnvironment: [...doors, ...moved.flatMap(item => cabinetFurnitureObstacles(item, scene.height))],
      motionObstacles: [...obstacles, ...shapes] }
  }

  function openingChecks(item: Furniture, state: ReturnType<typeof prepare>, parts = motionParts(item)): OpeningCheck[] {
    return [
      ...cabinetDoorClearance(state.draft, item, edges, state.doorEnvironment).map(door => ({
        key: `${item.id}/door/${door.index}`, label: `${item.name} · ${door.index + 1}. kapak`,
        obstacle: door.hit?.label, missing: door.hit ? door.limit - door.hit.angle : 0,
      })),
      ...parts.map(part => {
        const { contact } = solveMotion(state.draft, item, part, state.motionObstacles)
        return { key: `${item.id}/motion/${part.id}`, label: `${item.name} · ${part.name}`,
          obstacle: contact?.name, missing: contact ? part.max - contact.amount : 0 }
      }),
    ]
  }

  function itemIssues(state: ReturnType<typeof prepare>, exhaustive = false) {
    const problems: string[] = []
    for (const item of state.moved) {
      problems.push(...placement(state.draft, item, edges).warning.map(warning => `${item.name} · ${warning}`))
    }
    if (problems.length && !exhaustive) return problems
    for (const door of roomDoors) {
      if (state.shapes.some(shape => shape.bottom < door.top && shape.top > door.bottom && overlapsShape(shape.shape, door.shape))) {
        problems.push(`${door.label} · Kayıtlı kapı konumuyla çakışıyor.`)
      }
    }
    if (problems.length && !exhaustive) return problems
    for (const item of state.moved) {
      for (const check of openingChecks(item, state)) {
        if (check.obstacle) problems.push(`${check.label} · Engel: ${check.obstacle}`)
      }
    }
    return problems
  }

  function readPassages(draft: Project) {
    if (!measurements.length) return []
    const read = passageReader(draft, edges, draft.items)
    return measurements.map(measurement => ({ measurement, reading: read(measurement)[1] }))
  }

  const current = prepare(selectedFurniture(scene.items, movingIds))
  const currentIssues = [...new Set(itemIssues(current, true))]
  const oldChecks = new Map(neighbors.flatMap(({ item, parts }) => openingChecks(item, current, parts))
    .map(check => [check.key, check]))
  const oldPassages = readPassages(scene)
  const suggestions: PlacementSuggestion[] = []
  const rejected = new Map<string, number>()
  const tested = new Set<string>()
  const offsets = searchOffsets(axes, options.radius, canTurn)
  if (constraints) {
    for (const { x, z } of constraints.offsets) {
      const cost = Math.hypot(x, z)
      if (cost && cost <= options.radius) offsets.push({ x, z, turn: 0, cost })
    }
    offsets.sort((a, b) => a.cost - b.cost)
  }
  function reject(problems: string[]) {
    for (const problem of new Set(problems)) rejected.set(problem, (rejected.get(problem) ?? 0) + 1)
  }

  function evaluate(offset: CandidateOffset) {
    const moved = translateFurniture(scene, ids, anchor.id, { x: anchor.x + offset.x, z: anchor.z + offset.z }, edges)
    if (!moved.length) return
    if (offset.turn) moved[0] = { ...moved[0], angle: normalizeAngle(furnitureAngle(anchor) + offset.turn) }
    const dx = Math.round(moved[0].x - anchor.x), dz = Math.round(moved[0].z - anchor.z)
    if ((!dx && !dz && !offset.turn) || moved.some(item => Math.abs(item.x) > 200000 || Math.abs(item.z) > 200000)) return
    const key = `${dx}/${dz}/${offset.turn}`
    if (tested.has(key)) return
    tested.add(key)
    if (suggestions.some(option => option.turn === offset.turn && Math.hypot(dx - option.dx, dz - option.dz) < 200)) return
    const proposed = { ...scene, items: replaceFurniture(scene.items, moved) }
    const linked = orderedLinks.length ? resolveLinkedPlacement(scene, proposed) : undefined
    if (linked?.error) { reject([linked.error]); return }
    const group = selectedFurniture(linked?.project.items ?? proposed.items, movingIds)
    if (linked && moved.some(item => {
      const resolved = linked.project.items.find(candidate => candidate.id === item.id)
      return resolved?.x !== item.x || resolved.z !== item.z
    })) {
      reject(['Seçili eşyanın konumunu bağlantı kuralı belirliyor.'])
      return
    }
    const state = prepare(group)
    const problems = itemIssues(state)
    if (!problems.length) {
      for (const { item, parts } of neighbors) {
        for (const check of openingChecks(item, state, parts)) {
          const previous = oldChecks.get(check.key)
          if (check.obstacle && (!previous?.obstacle || check.missing > previous.missing + .05)) {
            problems.push(`${check.label} · Açılımı kısıtlanıyor (${check.obstacle}).`)
          }
        }
      }
    }
    const passages = !problems.length ? readPassages(state.draft) : []
    passages.forEach(({ measurement, reading }, index) => {
      if (reading.width + .5 < Math.min(measurement.minimum, oldPassages[index].reading.width)) {
        problems.push(`${measurement.name} · Kayıtlı geçiş daralıyor.`)
      }
    })
    if (problems.length) {
      reject(problems)
      return
    }
    const constrained = constraints?.check(state.draft)
    if (constrained?.length) { reject(constrained); return }
    const gap = !passages.length ? state.moved.flatMap(item => measureGaps(state.draft, item, edges))
      .filter(gap => !gap.overlap).sort((a, b) => b.distance - a.distance)[0] : undefined
    suggestions.push({ items: group, dx, dz, turn: offset.turn,
      passages: passages.map(({ measurement, reading }) => ({ id: measurement.id, name: measurement.name, value: passageText(reading) })),
      sideGap: gap && { direction: gap.label, name: gap.name, distance: gap.distance } })
  }

  for (const offset of offsets) {
    evaluate(offset)
    if (suggestions.length === (constraints?.limit ?? 3)) break
  }
  const blockers = [...rejected].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([message]) => message)
  return { suggestions, currentIssues, blockers }
}
