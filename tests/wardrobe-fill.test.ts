import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeFurniture, makeProject, uid } from '../src/model'
import type { WardrobeFillArea } from '../src/model'
import { readProject } from '../src/storage'
import { proposeWardrobeFill } from '../src/wardrobe-fill'
import { buildWardrobeRun, changeWardrobeRunType } from '../src/wardrobe-run'

function fixture() {
  const project = makeProject(false)
  const [wall, doorWall] = project.walls
  wall.obstacles = [{ id: uid(), name: 'Kolon', offset: 1300, width: 800, depth: 200, bottom: 0, top: project.height },
    { id: uid(), name: 'Kiriş', offset: 2100, width: 1700, depth: 550, bottom: 2250, top: project.height }]
  const entrance = uid()
  doorWall.openings = [{ id: entrance, kind: 'door', offset: 1800, width: 1000, height: 2100, bottom: 0, swing: { hinge: 'start', angle: 90 } }]
  const area = { start: 300, end: 3800, depth: 650, margin: 50, passage: 800, profile: 'custom', entrance } satisfies WardrobeFillArea
  return { project, id: uid(), wallId: wall.id, area, fixed: [] }
}

test('A wall fill steps cabinet depth around the column and caps height below the beam', () => {
  const args = fixture()
  const [storage, passage] = proposeWardrobeFill(args).options
  assert.deepEqual(storage.modules.map(item => [item.wardrobeRun!.anchor!.inset, item.depth, item.height]),
    [[1, 600, 2600], [201, 440, 2600], [1, 600, 2200], [1, 600, 2200]])
  assert.ok(passage.modules.every(item => item.depth <= 400))
  assert.deepEqual(storage.check?.issues, [])
  assert.equal(storage.check?.route.status, 'verified')
  assert.equal(storage.check?.route.reached, storage.modules.length)
  const ready = proposeWardrobeFill({ ...args, area: { ...args.area, profile: 'ready' } }).options[0]
  assert.ok(ready.modules.every(item => [500, 750, 1000].includes(item.width) && [350, 580].includes(item.depth)))
  assert.ok(ready.modules.filter(item => item.wardrobeRun!.anchor!.start >= 2100).every(item => item.height === 2010))
})

test('A clear cabinet fitting can still fail the entrance route', () => {
  const args = fixture()
  args.project.items = [{ ...makeFurniture('box', { x: 3720, z: 2300 }), width: 450, depth: 980, height: 1200 }]
  const storage = proposeWardrobeFill(args).options[0]
  assert.deepEqual(storage.check?.issues, [])
  assert.equal(storage.check?.route.status, 'blocked')
  assert.equal(storage.check?.route.reached, 0)
})

test('A 55 cm entrance can reach the cabinets while their fronts are checked at 80 cm', () => {
  for (const hinge of ['start', 'end'] as const) {
    const args = fixture()
    const opening = args.project.walls[1].openings[0]
    args.project.walls[1].openings[0] = { ...opening, width: 550, swing: { hinge, angle: 90 } }

    const clear = proposeWardrobeFill(args).options[0].check!
    assert.equal(clear.route.status, 'verified')
    assert.equal(clear.route.entranceWidth, 550)
    assert.deepEqual(clear.front, { target: 800, total: 4, blocked: [] })

    args.project.items = [{ ...makeFurniture('box', { x: 800, z: 1300 }), width: 1000, depth: 100, height: 1200 }]
    const obstructed = proposeWardrobeFill(args).options[0].check!
    assert.deepEqual(obstructed.issues, [])
    assert.equal(obstructed.route.status, 'verified')
    assert.deepEqual(obstructed.front, { target: 800, total: 4, blocked: ['Gardırop modülü 1'] })
  }
})

test('Regeneration preserves a fixed module, including its type and physical position after reopening', () => {
  const args = fixture()
  const first = proposeWardrobeFill(args).options[0].modules[0]
  const changed = changeWardrobeRunType(first, 'drawers')
  const fixed = { ...changed, wardrobeRun: { ...changed.wardrobeRun!, anchor: { ...changed.wardrobeRun!.anchor!, fixed: true } } }
  const rerun = proposeWardrobeFill({ ...args, fixed: [fixed] }).options[1]
  assert.deepEqual(rerun.modules[0], fixed)
  assert.ok(rerun.modules.slice(1).every(item => item.depth <= 400))
  const built = buildWardrobeRun(args.project, args.id, args.wallId, args.area.start, rerun.modules, 0, args.area)!
  const restored = readProject(JSON.parse(JSON.stringify(built.project)))
  assert.equal(restored.items[0].wardrobeRun?.anchor?.fixed, true)
  assert.equal(restored.items[0].x, built.parts[0].item.x)
  assert.deepEqual(restored.items[0].wardrobe?.stack, fixed.wardrobe?.stack)
})

test('Standard bodies touch across column and beam boundaries and put the 10 cm remainder at the open end', () => {
  const args = fixture()
  const length = args.project.walls[0].length
  for (const [start, end, expectedStart] of [[length - 2600, length, length - 2500], [0, 2600, 0], [200, 2800, 200]]) {
    const area = { ...args.area, start, end, profile: 'ready' as const }
    for (const option of proposeWardrobeFill({ ...args, area }).options) {
      assert.equal(option.unused, 100)
      let cursor = expectedStart
      for (const item of option.modules) {
        assert.ok([500, 750, 1000].includes(item.width))
        assert.equal(item.wardrobeRun!.anchor!.start, cursor)
        if (cursor < 2100 && cursor + item.width > 1300) assert.equal(item.wardrobeRun!.anchor!.inset, 201)
        cursor += item.width
      }
      assert.equal(cursor, expectedStart + 2500)
      const run = buildWardrobeRun(args.project, args.id, args.wallId, start, option.modules, 0, area)!
      const restored = readProject(JSON.parse(JSON.stringify(run.project)))
      assert.ok(restored.items.every(item => item.wardrobeRun?.gap === 0))
    }
  }
})

test('A long wall fits more than eight standard bodies and preserves the zero seam on reopening', () => {
  const args = fixture()
  for (const wall of [args.project.walls[0], args.project.walls[2]]) wall.length = 9700
  args.project.walls[0].obstacles = []
  const area = { ...args.area, start: 100, end: 9700, profile: 'ready' as const }
  const option = proposeWardrobeFill({ ...args, area }).options[0]
  assert.equal(option.unused, 100)
  assert.equal(option.modules.length, 10)
  const run = buildWardrobeRun(args.project, args.id, args.wallId, area.start, option.modules, 0, area)!
  const restored = readProject(JSON.parse(JSON.stringify(run.project)))
  assert.equal(restored.items[9].wardrobeRun?.index, 9)
  assert.equal(run.parts[9].start + run.parts[9].item.width, 9700)
})

test('The two sides of a doorway pack independently, and substandard lengths stay empty', () => {
  const args = fixture()
  const wall = args.project.walls[0]
  wall.obstacles = []
  wall.openings = [{ id: uid(), kind: 'door', offset: 1450, width: 900, height: 2100, bottom: 0 }]
  const area = { ...args.area, start: 0, end: wall.length, profile: 'ready' as const }
  const option = proposeWardrobeFill({ ...args, area }).options[0]
  const ranges = option.modules.map(item => [item.wardrobeRun!.anchor!.start, item.wardrobeRun!.anchor!.start + item.width])
  const before = ranges.filter(([start]) => start < 1450), after = ranges.filter(([start]) => start >= 2350)
  assert.equal(before[0][0], 0)
  assert.equal(before.at(-1)![1], 1250)
  assert.equal(after[0][0], wall.length - Math.floor((wall.length - 2350) / 250) * 250)
  assert.equal(after.at(-1)![1], wall.length)
  assert.equal(before.length + after.length, ranges.length)
  for (const side of [before, after]) assert.ok(side.every(([start], i) => !i || side[i - 1][1] === start))
  const small = proposeWardrobeFill({ ...args, area: { ...area, end: 499 } }).options[0]
  assert.deepEqual(small.modules, [])
  assert.equal(small.unused, 499)
})
