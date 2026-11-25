import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeProject, uid } from '../src/model'
import type { WardrobeFillArea } from '../src/model'
import { buildWardrobeRun, newWardrobeModule } from '../src/wardrobe-run'
import { rebalanceWardrobe } from '../src/wardrobe-rebalance'

function fixture() {
  const project = makeProject(false)
  const [wall] = project.walls
  wall.length = project.walls[2].length = 4900
  wall.obstacles.push({ id: uid(), name: 'Kolon', offset: 3410, width: 540, bottom: 0, top: 2650, depth: 200 })
  const id = uid()
  const fill: WardrobeFillArea = { start: 2300, end: 4900, depth: 650, profile: 'ready', margin: 50, passage: 800 }
  const sources = [1000, 750, 750].map((width, index) => ({
    ...newWardrobeModule(index), width, depth: index === 1 ? 350 : 580, height: 2360,
    wardrobeRun: { id, wallId: wall.id, index, gap: 0, fill, anchor: { start: [2400, 3400, 4150][index], inset: index === 1 ? 201 : 1 } },
  }))
  const run = buildWardrobeRun(project, id, wall.id, fill.start, sources, 0, fill)!
  return { project: run.project, modules: run.project.items, fill, edit: { itemId: sources[1].id, width: 1000 } }
}

test('A 260 cm window-end span balances 75 + 100 + 75, retaining module identity and the 10 cm entrance-side gap', () => {
  const { project, modules, fill, edit } = fixture()
  const original = structuredClone(project)
  const result = rebalanceWardrobe(project, modules, fill, 0, edit)
  assert.ok('modules' in result)
  assert.equal(result.summary.excess, 150)
  assert.deepEqual(result.modules.map(m => [m.wardrobeRun!.anchor!.start, m.width, m.depth, m.wardrobeRun!.anchor!.inset]),
    [[2400, 750, 580, 1], [3150, 1000, 350, 201], [4150, 750, 580, 1]])
  assert.deepEqual(result.modules.map(m => [m.id, m.wardrobe]), modules.map(m => [m.id, m.wardrobe]))
  assert.deepEqual(project, original)
})

test('A fixed donor forces the other neighbor to shrink, two pinned ends reject an impossible width', () => {
  const { project, modules, fill, edit } = fixture()
  modules[0].wardrobeRun!.anchor!.fixed = true
  const result = rebalanceWardrobe(project, modules, fill, 0, edit)
  assert.ok('modules' in result)
  assert.equal(result.modules[0], modules[0])
  assert.deepEqual(result.modules.map(m => m.width), [1000, 1000, 500])
  modules[2].wardrobeRun!.anchor!.fixed = true
  assert.ok('error' in rebalanceWardrobe(project, modules, fill, 0, edit))
  assert.ok('error' in rebalanceWardrobe(project, modules, fill, 0, { itemId: modules[0].id, width: 750 }))
})

test('Rebalancing refits a standard body and its height at a new column and beam crossing', () => {
  const { project, modules, fill, edit } = fixture()
  project.walls[0].obstacles[0].offset = 3160
  project.walls[0].obstacles[0].width = 170
  project.walls[0].obstacles.push({ id: uid(), name: 'Kiriş', offset: 3170, width: 160, depth: 620, bottom: 2250, top: 2650 })
  modules[1].depth = 580
  modules[1].wardrobeRun!.anchor!.inset = 1
  // Pin the terminal cabinet to move the first joint to 315 cm.
  modules[2].wardrobeRun!.anchor!.fixed = true
  const result = rebalanceWardrobe(project, modules, fill, 0, edit)
  assert.ok('modules' in result)
  assert.deepEqual([result.modules[1].height, result.modules[1].depth, result.modules[1].wardrobeRun!.anchor!.inset], [2010, 350, 201])
})
