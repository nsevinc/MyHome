import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicateLayout } from '../src/layout-variants'
import { makeFurniture, makeProject, makeWardrobe, projectSchema } from '../src/model'
import type { Point } from '../src/model'
import { measureUsageRoute } from '../src/usage-route'
import type { RouteBlock } from '../src/usage-route'
import { inspectUsageScenario, newUsageScenario, usageLayouts } from '../src/usage-scenarios'

const rectangle = (x: number, z: number, width: number, depth: number): Point[] =>
  [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }]

test('The route locates a one-millimetre section and respects the configured denetim height', () => {
  const points = [{ x: 500, z: 1500 }, { x: 3500, z: 1500 }]
  const outline = rectangle(0, 0, 4000, 3400)
  const blocks: RouteBlock[] = [
    { name: 'Cabinet edge', shape: rectangle(1841, 0, 1, 1300), bottom: 0, top: 2300 },
    { name: 'Bed', shape: rectangle(1750, 1900, 460, 1500), bottom: 0, top: 650 },
    { name: 'Beam', shape: rectangle(1800, 1350, 190, 250), bottom: 2000, top: 2650 },
  ]
  const result = measureUsageRoute(outline, blocks, points, 2000, 2650)!
  assert.equal(result.width, 600)
  assert.deepEqual(result.at, { x: 1841, z: 1500 })
  assert.deepEqual(result.limits, ['Cabinet edge', 'Bed'])
  const obstructed = measureUsageRoute(outline, blocks, points, 2001, 2650)!
  assert.equal(obstructed.reason, 'blocked')
  assert.deepEqual(obstructed.limits, ['Beam'])
})

test('A diagonal shortcut across a concave corner is outside even with both endpoints in the room', () => {
  const outline = [{ x: 0, z: 0 }, { x: 3500, z: 0 }, { x: 3500, z: 900 }, { x: 900, z: 900 },
    { x: 900, z: 3500 }, { x: 0, z: 3500 }]
  const reading = measureUsageRoute(outline, [], [{ x: 2200, z: 500 }, { x: 450, z: 2050 }], 2000, 2650)!
  assert.equal(reading.reason, 'outside')
  const indoor = measureUsageRoute(outline, [], [{ x: 2200, z: 500 }, { x: 450, z: 500 }, { x: 450, z: 2050 }], 2000, 2650)!
  assert.equal(indoor.reason, undefined)
  assert.equal(indoor.width, 900)
})

test('Simultaneous doors and drawers use per-layout geometry and never change the recorded poses', () => {
  const project = makeProject(false)
  const cabinet = makeWardrobe(2, { x: 800, z: 1800 })
  const drawer = { ...makeFurniture('box', { x: 2000, z: 1700 }), width: 600, depth: 400, height: 610, drawerTravel: 360 }
  const second = { ...drawer, id: 'other-drawer', x: 2870 }
  project.items = [cabinet, drawer, second]
  const variants = duplicateLayout(project, [cabinet, { ...drawer, z: 1500 }, second])!
  const original = structuredClone(variants)
  const scenario = newUsageScenario(variants)
  scenario.points = [{ x: 1450, z: 2150 }, { x: 2480, z: 2150 }]
  scenario.states = [
    { itemId: cabinet.id, partId: 'door:0', amount: 55 },
    { itemId: drawer.id, partId: 'drawer', amount: 350 },
    { itemId: second.id, partId: 'drawer', amount: 190 },
  ]
  const [left, right] = usageLayouts(variants, scenario)!
  const a = inspectUsageScenario(variants, scenario, left)
  const b = inspectUsageScenario(variants, scenario, right)
  assert.equal(a.project.items[0].wardrobe?.leaves?.[0]?.angle, 55)
  assert.deepEqual(a.trials.map(trial => trial.amount), [350, 190])
  assert.deepEqual(a.reading?.limits, [drawer.name])
  assert.equal(a.reading?.reason, 'blocked')
  assert.ok(b.reading && b.reading.width > 0)
  assert.deepEqual(variants, original)
  const reloaded = projectSchema.parse({ ...variants, usageScenarios: [scenario] })
  assert.deepEqual(reloaded.usageScenarios, [scenario])
})
