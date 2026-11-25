import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeFurniture, makeProject, uid } from '../src/model'
import { makeBedroomFurniture } from '../src/bedroom-catalog'
import type { WardrobeFillArea } from '../src/model'
import { buildWardrobeRun, newWardrobeModule } from '../src/wardrobe-run'
import { doorSolution, inspectSolution, searchBedSolutions, solutionRun } from '../src/wardrobe-solutions'

function example() {
  const project = makeProject(false)
  const [wall, entry] = project.walls
  entry.openings = [{ id: uid(), kind: 'door', width: 550, height: 2100, bottom: 0, offset: 1400 }]
  const area: WardrobeFillArea = { start: 1000, end: 2000, depth: 600, margin: 50, passage: 800, profile: 'ready' }
  const bed = { ...makeFurniture('bed', { x: 1500, z: 1410 }), width: 1100, depth: 1400 }
  const stand = { ...makeBedroomFurniture('drawer-nightstand', { x: 2300, z: 1410 }), width: 400, depth: 400 }
  project.items = [stand, bed]
  project.furnitureLinks = [{ id: uid(), itemId: stand.id, referenceId: bed.id, x: { mode: 'after', gap: 50 }, z: { mode: 'center' } }]
  const cabinet = { ...newWardrobeModule(0), width: 1000, depth: 580 }
  const run = buildWardrobeRun(project, uid(), wall.id, area.start, [cabinet], 0, area)!
  return { run, bed, stand }
}

test('Changing hardware solves leaf contact only; 55 cm entrance and 80 cm front are independent', () => {
  const { run } = example()
  const source = structuredClone(run.project)
  const base = inspectSolution(run)
  assert.equal(base.front.gap, 129)
  assert.ok(base.checks[0].doors.some(d => d.hit))
  const doors = doorSolution(base.checks)!
  const changed = inspectSolution(solutionRun(run, doors))
  assert.ok(changed.checks[0].slider && !changed.checks[0].slider.hit)
  assert.equal(changed.front.shortage, 671)
  assert.ok(changed.reasons.length)
  assert.equal(changed.route.status !== 'missing' && changed.route.entranceWidth, 550)
  assert.deepEqual(run.project, source)
})

test('Search verifies a strip-edge move and translates linked furniture; a locked follower blocks the move', () => {
  const { run, bed, stand } = example()
  const original = structuredClone(run.project)
  const results = searchBedSolutions(run, bed.id)
  const choice = results.options.find(o => !o.doors.length)
  assert.ok(choice, results.blockers.join('\n'))
  // 80 cm from the handle tip, which protrudes another 16.2 mm.
  assert.deepEqual(choice.moves.map(m => [m.id, m.z]).sort(), [[bed.id, 2098], [stand.id, 2098]].sort())
  const applied = solutionRun(run, choice)
  const checked = inspectSolution(applied)
  assert.deepEqual(checked.reasons, [])
  assert.equal(checked.front.gap, 817)
  assert.equal(checked.route.status, 'verified')
  assert.deepEqual(applied.project.furnitureLinks, run.project.furnitureLinks)
  assert.deepEqual(run.project, original)
  stand.locked = true
  assert.equal(searchBedSolutions(run, bed.id).options.length, 0)
})
