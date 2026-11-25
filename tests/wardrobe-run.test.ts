import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateProject } from '../src/geometry'
import { makeFurniture, makeProject, uid } from '../src/model'
import { buildWardrobeRun, changeWardrobeRunType, inspectWardrobeRun, moveWardrobeModule, newWardrobeModule,
  wardrobeRunMembers, wardrobeRunOffset, wardrobeRunType } from '../src/wardrobe-run'
import { loadWardrobeTemplate, makeWardrobeTemplate } from '../src/wardrobe-templates'

test('A wall strike tries the opposite hinge first, then a sliding panel only if its track is clear', () => {
  const project = makeProject(false)
  const wall = project.walls[0]
  const source = newWardrobeModule(0)
  const module = { ...source, width: 940, wardrobe: { ...source.wardrobe!, front: 'glass' as const,
    interior: [{ drawers: 1, shelves: [.7] }] } }
  const start = wall.length - module.width
  const id = uid()
  const run = buildWardrobeRun(project, id, wall.id, start, [module])!
  const [reading] = inspectWardrobeRun(run, 50, 800)
  const suggestion = reading.doorSuggestion!
  assert.equal(suggestion.kind, 'hinge')
  assert.equal(suggestion.obstacle, 'Duvar 2')
  assert.equal(suggestion.leaf, '2. kapak')
  assert.equal(suggestion.itemId, module.id)
  assert.equal(wardrobeRunType(run.parts[0].item), 'hinged')
  assert.equal(suggestion.wardrobe.front, 'glass')
  assert.deepEqual(suggestion.wardrobe.interior, module.wardrobe.interior)
  const accepted = buildWardrobeRun(project, id, wall.id, start, [{ ...module, wardrobe: suggestion.wardrobe }])!
  assert.deepEqual(accepted.parts[0].item, { ...run.parts[0].item, wardrobe: suggestion.wardrobe })
  const [after] = inspectWardrobeRun(accepted, 50, 800)
  assert.deepEqual(suggestion.changes, [{ leaf: '2. kapak', hinge: 'left', limit: 78 }])
  assert.equal(after.doors.length, 2)
  assert.ok(after.doors.every(door => !door.hit))
  assert.equal(after.doorSuggestion, undefined)

  project.items.push({ ...makeFurniture('box', { x: start + 550, z: 825 }), width: 25, depth: 80, height: 1500 })
  const failedHinge = buildWardrobeRun(project, id, wall.id, start, [module])!
  const fallback = inspectWardrobeRun(failedHinge, 50, 800)[0].doorSuggestion!
  assert.equal(fallback.kind, 'sliding')
  const sliding = buildWardrobeRun(project, id, wall.id, start, [{ ...module, wardrobe: fallback.wardrobe }])!
  assert.equal(inspectWardrobeRun(sliding, 50, 800)[0].slider?.limit, fallback.travel)
  assert.equal(inspectWardrobeRun(sliding, 50, 800)[0].slider?.hit, undefined)

  project.items.push({ ...makeFurniture('box', { x: start + 290, z: 590 }), width: 25, depth: 130, height: 1500 })
  const blocked = buildWardrobeRun(project, id, wall.id, start, [module])!
  const [obstructed] = inspectWardrobeRun(blocked, 50, 800)
  assert.equal(obstructed.doors[1].hit?.wallId, project.walls[1].id)
  assert.equal(obstructed.doorSuggestion, undefined)
})

test('A stepped wardrobe measures the beam and proposes a height with the requested margin', () => {
  const project = makeProject(false)
  const wall = project.walls[0]
  wall.obstacles.push({ id: uid(), name: 'Tavan kirişi', offset: 100, width: 900, depth: 450, bottom: 2250, top: 2650 })
  const existing = { ...makeFurniture('box', { x: 330, z: 950 }), name: 'Komodin', width: 500, depth: 450, height: 500 }
  project.items = [existing]
  const id = uid()
  const modules = [newWardrobeModule(0), { ...newWardrobeModule(1), depth: 550, height: 2450 }]
  const initial = buildWardrobeRun(project, id, wall.id, 100, modules)!
  assert.equal(validateProject(initial.project), undefined)
  assert.deepEqual(initial.project.walls, project.walls)
  assert.equal(initial.project.items[0], existing)
  assert.equal(initial.overhang, 0)
  const report = inspectWardrobeRun(initial, 50, 800)
  assert.equal(report[0].fit.obstruction, 'Tavan kirişi')
  assert.equal(report[0].fit.clearance, -50)
  assert.equal(report[0].suggested, 2200)
  assert.ok(report[0].doors.some(door => door.hit?.label === 'Komodin'))
  assert.ok(report[0].passageReadings.find(row => row.mode === 'closed')!.width < 800)
  assert.equal(report[1].fit.clearance, 200)
  assert.ok(report.every(part => part.passageReadings.length === 3))
  assert.equal(initial.parts[0].item.height, 2300)

  const lowered = [{ ...modules[0], height: report[0].suggested! }, modules[1]]
  const revised = buildWardrobeRun(initial.project, id, wall.id, 100, lowered)!
  assert.equal(inspectWardrobeRun(revised, 50, 800)[0].fit.clearance, 50)
  assert.deepEqual(wardrobeRunMembers(revised.project, id).map(item => item.id), modules.map(item => item.id))
  assert.equal(wardrobeRunOffset(revised.project, revised.parts[0].item), 100)
})

test('The run aims each cabinet front into the room and detects wall overhang and edit locks', () => {
  const project = makeProject(false)
  const wall = project.walls[1]
  const id = uid()
  const run = buildWardrobeRun(project, id, wall.id, 100, [newWardrobeModule(0)])!
  assert.equal(run.parts[0].item.angle, 90)
  assert.equal(run.parts[0].item.x, 3899)
  assert.equal(inspectWardrobeRun(run, 50, 800)[0].fit.warning.length, 0)
  const locked = { ...run.parts[0].item, locked: true }
  const changed = buildWardrobeRun({ ...run.project, items: [locked] }, id, wall.id, 2950, [locked])!
  assert.equal(changed.locked, true)
  assert.equal(changed.overhang, 450)
})

test('Mixed runs preserve widths and identity when changing type and reordering, with real niche height and drawer travel', () => {
  const project = makeProject(false)
  const wall = project.walls[0]
  const hinged = newWardrobeModule(0)
  const niche = { ...changeWardrobeRunType(newWardrobeModule(1), 'niche'), height: 2200 }
  const drawers = newWardrobeModule(2, 'drawers')
  wall.openings = [{ id: uid(), kind: 'window', offset: 1200, width: 400, bottom: 650, height: 300 }]
  const blocker = { ...makeFurniture('box', { x: 2400, z: 850 }), width: 300, depth: 200, height: 1000, name: 'Test engeli' }
  project.items.push(blocker)
  const run = buildWardrobeRun(project, uid(), wall.id, 100, [hinged, niche, drawers])!
  assert.deepEqual(run.parts.map(part => wardrobeRunType(part.item)), ['hinged', 'niche', 'drawers'])
  assert.deepEqual(run.parts.map(part => part.item.width), [900, 900, 1000])
  assert.equal(run.remaining, wall.length - 2904)
  const rows = inspectWardrobeRun(run, 50, 800)
  assert.deepEqual(rows[1].conflicts, [])
  assert.ok(rows[1].doors.some(door => door.hit?.label === hinged.name))
  const spaced = buildWardrobeRun(run.project, run.parts[0].item.wardrobeRun!.id, wall.id, 100, run.parts.map(({ item }) => item), 10)!
  assert.equal(spaced.length - run.length, 16)
  assert.ok(inspectWardrobeRun(spaced, 50, 800)[1].doors.every(door => !door.hit))
  assert.ok(rows[2].drawers.every(drawer => drawer.contact?.name === 'Test engeli' && drawer.contact.amount < drawer.part.max))
  const swapped = moveWardrobeModule([hinged, niche, drawers], 1, 1)
  assert.deepEqual(swapped.map(item => item.id), [hinged.id, drawers.id, niche.id])
  const sliding = changeWardrobeRunType(niche, 'sliding')
  assert.equal(sliding.wardrobe?.doors, 2)
  assert.equal(sliding.id, niche.id)
  assert.equal(sliding.width, niche.width)
  const slideProject = makeProject(false)
  const sliderRun = buildWardrobeRun(slideProject, uid(), slideProject.walls[0].id, 300, [sliding])!
  const slider = inspectWardrobeRun(sliderRun, 50, 800)[0].slider!
  assert.ok(slider.limit > 0)
  assert.equal(slider.hit, undefined)
})

test('Saved templates copy finishes, internal fittings and order with fresh project-independent module ids', () => {
  const project = makeProject(false)
  const first = { ...newWardrobeModule(0), appearances: { doors: { preset: 'matte-lacquer' as const, color: '#ccaabb' } },
    assembly: { allowance: 20, routePath: { entrance: uid(), points: [], finish: 'x' as const } } }
  const second = newWardrobeModule(1, 'niche')
  const run = buildWardrobeRun(project, uid(), project.walls[0].id, 100, [first, second])!
  const template = makeWardrobeTemplate('İki modül', run.parts.map(({ item }) => item), 10)
  const restored = loadWardrobeTemplate(template)
  assert.deepEqual(restored.map(wardrobeRunType), ['hinged', 'niche'])
  assert.deepEqual(restored[0].appearances, first.appearances)
  assert.deepEqual(restored[0].wardrobe, first.wardrobe)
  assert.deepEqual(restored[0].assembly, { allowance: 20 })
  assert.ok(restored.every((item, index) => item.x === 0 && item.z === 0 && !item.wardrobeRun && item.id !== template.modules[index].id))
  const other = makeProject(false)
  const applied = buildWardrobeRun(other, uid(), other.walls[1].id, 300, restored, template.gap)!
  assert.equal(validateProject(applied.project), undefined)
  assert.ok(applied.parts.every(part => part.item.wardrobeRun?.wallId === other.walls[1].id))
  assert.equal(applied.parts[1].start - applied.parts[0].start - first.width, 10)
})
