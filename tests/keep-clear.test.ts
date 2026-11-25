import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roomEdges } from '../src/geometry'
import { emptyRoomProject } from '../src/empty-room'
import { clearanceArchitecture, clearanceCorrection, readClearances } from '../src/keep-clear'
import { duplicateLayout, editLayoutItems, switchLayout } from '../src/layout-variants'
import { makeFurniture, makeProject } from '../src/model'
import type { Furniture, KeepClearRule } from '../src/model'
import { readProject } from '../src/storage'

function fixture() {
  const project = makeProject(false)
  const cabinet = { ...makeFurniture('wardrobe', { x: 1500, z: 301 }), width: 1000, depth: 600 }
  const bed = { ...makeFurniture('bed', { x: 1500, z: 1781 }), width: 700, depth: 1000 }
  project.keepClear = [{ owner: 'item', ownerId: cabinet.id, side: 'front', distance: 800 }]
  project.items = [cabinet, bed]
  const edges = roomEdges(project.walls)
  const architecture = clearanceArchitecture(project, edges)
  const read = (items: Furniture[], rules = project.keepClear!) => readClearances(rules, items, project.height, architecture)
  return { project, cabinet, bed, edges, architecture, read }
}

test('A bed at 68 cm needs 12 cm back, or 9 cm sideways when it entered across the edge', () => {
  const { project, cabinet, bed, edges, architecture, read } = fixture()
  const [row] = read([cabinet, bed])
  assert.equal(row.gap, 680)
  assert.equal(row.shortage, 120)
  assert.equal(clearanceCorrection(row, [row], project, edges, architecture, bed.id, { ...bed, z: bed.z + 200 })?.distance, 120)
  const sideways = { ...bed, x: 2260 }, before = { ...sideways, x: 2400 }
  const items = [cabinet, sideways]
  const [edgeRow] = read(items)
  const fix = clearanceCorrection(edgeRow, [edgeRow], { ...project, items }, edges, architecture, bed.id, before)
  assert.equal(fix?.retrace, true)
  assert.equal(fix.distance, 90)
  assert.equal(read([cabinet, { ...sideways, x: 2350 }])[0].shortage, 0)
})

test('A rotated clearance follows the furniture, rugs and items above headroom do not block it', () => {
  const { cabinet, bed, read } = fixture()
  const owner = { ...cabinet, x: 2500, z: 1500, angle: 90 }
  const next = { ...bed, x: 1170, z: 1500 }
  const rug = { ...makeFurniture('rug', { x: 2100, z: 1500 }), width: 600, depth: 600 }
  const upper = { ...bed, id: 'upper', x: 2110, z: 1500, mount: { wallId: 'mounted', bottom: 2100, offset: 0 } }
  const [row] = read([owner, next, rug, upper])
  assert.equal(row.nearest?.id, next.id)
  assert.equal(row.gap, 680)
  assert.equal(row.shortage, 120)
  assert.equal(read([owner, { ...next, x: 1050 }])[0].shortage, 0)
})

test('Stepped wardrobe fronts retain their individual offsets and a rule survives regeneration and layout switches', () => {
  const { project, cabinet, bed, read } = fixture()
  const run = { id: 'series', wallId: project.walls[0].id, index: 0 }
  const first = { ...cabinet, wardrobeRun: run }
  const second = { ...cabinet, id: 'second', x: 2500, depth: 350, z: 376, wardrobeRun: { ...run, index: 1 } }
  const rule: KeepClearRule = { owner: 'run', ownerId: run.id, side: 'front', distance: 800 }
  project.keepClear = [rule]
  project.items = [first, second, bed]
  assert.equal(readProject(emptyRoomProject(project)).keepClear, undefined)
  const rows = read(project.items)
  assert.deepEqual(rows.map(row => row.polygon[0].z), [601, 551])
  assert.equal(read([{ ...second, id: 'regenerated' }, bed])[0].owner.id, 'regenerated')
  const copy = readProject(JSON.parse(JSON.stringify(duplicateLayout(project))))
  const active = copy.layouts!.active
  const alternate = editLayoutItems(copy, active, items => items.filter(i => !i.wardrobeRun))
  assert.equal(alternate.keepClear, undefined)
  assert.deepEqual(switchLayout(alternate, copy.layouts!.entries[0].id).keepClear, [rule])
})

test('A blocked correction reports the physical travel available, including an obstacle on the way', () => {
  const { project, cabinet, bed, edges, architecture, read } = fixture()
  const stop = { ...bed, id: 'stop', z: bed.z + bed.depth / 2 + 30, depth: 20 }
  project.items = [cabinet, bed, stop]
  const rows = read(project.items)
  const fix = clearanceCorrection(rows[0], rows, project, edges, architecture, bed.id)
  assert.equal(fix?.distance, 120)
  assert.equal(fix.available, 20)
  assert.ok(fix.obstruction)
})
