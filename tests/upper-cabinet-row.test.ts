import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeBedroomFurniture } from '../src/bedroom-catalog'
import { roomEdges, validateProject, wallMountPose } from '../src/geometry'
import { duplicateLayout, switchLayout } from '../src/layout-variants'
import { makeFurniture, makeProject, projectSchema, uid } from '../src/model'
import { newUpperRow, planUpperRow, reconcileUpperRows, rowSelection } from '../src/upper-cabinet-row'
import { jointDoorTrial } from '../src/upper-row-doors'
import { emptyRoomProject } from '../src/empty-room'

function example() {
  const project = makeProject(false)
  const wallId = project.walls[0].id
  const cabinets = [1000, 1720].map((offset, i) => ({ ...makeBedroomFurniture('upper-cabinet', { x: 0, z: 0 },
    { wallId, offset, bottom: 1900 }), name: 'Üst dolap ' + (i + 1) }))
  const bed = makeFurniture('bed', { x: 1600, z: 1000 })
  project.items = [bed, ...cabinets]
  const row = newUpperRow(project, [...cabinets].reverse())
  return { project, row, cabinets, bed }
}

test('Row width and common elevation persist, keep exact seams and survive JSON, layout copies and dissolution', () => {
  const { project, row, cabinets } = example()
  assert.ok(rowSelection(project, cabinets))
  const base = planUpperRow(project, row, cabinets)
  assert.deepEqual(base.errors, [])
  assert.equal(base.total, 1440)
  const next = planUpperRow(base.project, row, [{ ...cabinets[0], width: 800 }, cabinets[1]])
  assert.deepEqual([next.start, next.total, next.end], [640, 1520, 2160])
  assert.equal(next.items[1].mount!.offset, 1800)
  assert.equal(next.readings[0].underneath[0].gap, 950)
  assert.deepEqual(next.items.map(i => i.wardrobe), cabinets.map(i => i.wardrobe))
  const committed = reconcileUpperRows(base.project, next.project)
  assert.equal(committed.error, undefined)
  const loaded = projectSchema.parse(JSON.parse(JSON.stringify(committed.project)))
  assert.equal(validateProject(loaded), undefined)
  assert.equal(rowSelection(loaded, [loaded.items[1]])?.existing?.id, row.id)
  const copy = duplicateLayout(loaded)!
  assert.deepEqual(switchLayout(copy, copy.layouts!.entries[0].id).upperCabinetRows, loaded.upperCabinetRows)
  const removed = reconcileUpperRows(loaded, { ...loaded, items: loaded.items.filter(i => i.id !== cabinets[0].id) })
  assert.equal(removed.project.upperCabinetRows, undefined)
  assert.equal(emptyRoomProject(loaded).upperCabinetRows, undefined)
  const right = planUpperRow(project, { ...row, alignment: 'right', anchor: 2080 }, [{ ...cabinets[0], width: 801 }, cabinets[1]])
  assert.equal(right.end, 2080)
  const [a, b] = right.items.map(i => wallMountPose(i, roomEdges(project.walls)))
  assert.equal(a.x + a.width / 2, b.x - b.width / 2)
  assert.equal(validateProject(right.project), undefined)
})

test('A bed-centred row follows the bed atomically and reports blocks, overhangs and locked neighbours', () => {
  const { project, row, cabinets, bed } = example()
  const plan = planUpperRow(project, { ...row, alignment: 'bed', bedId: bed.id }, cabinets)
  const moved = { ...plan.project, items: plan.project.items.map(i => i.id === bed.id ? { ...i, x: i.x + 250 } : i) }
  const next = reconcileUpperRows(plan.project, moved)
  assert.equal(next.error, undefined)
  assert.deepEqual(next.project.items.slice(1).map(i => i.mount!.offset), [1490, 2210])
  const lostBed = reconcileUpperRows(next.project, { ...next.project, items: next.project.items.filter(i => i.id !== bed.id) })
  assert.equal(lostBed.project.upperCabinetRows?.[0].alignment, 'left')
  assert.deepEqual(lostBed.project.items.map(i => i.mount?.offset), [1490, 2210])
  const locked = { ...plan.project, items: plan.project.items.map(i => i.id === cabinets[1].id ? { ...i, locked: true } : i) }
  assert.match(reconcileUpperRows(locked, { ...locked, items: locked.items.map(i => i.id === bed.id ? { ...i, x: 1800 } : i) }).error!, /kilitli/)
  assert.ok(planUpperRow(project, { ...row, anchor: 4000 }, cabinets).errors.length)
  project.walls[0].obstacles.push({ id: uid(), name: 'Kiriş', bottom: 2200, top: 2650, width: 500, depth: 400, offset: 800 })
  assert.ok(planUpperRow(project, row, cabinets).errors.some(s => s.includes('Kiriş')))
})

test('Synchronized neighbouring fronts respect both limits, identify real panel contact and fixed obstacles', () => {
  const { project, row, cabinets } = example()
  const testPair = () => jointDoorTrial(planUpperRow(project, row, cabinets), 0)!
  assert.deepEqual(testPair().leaves.map(l => l.door.index), [1, 0])
  assert.equal(testPair().hit, undefined)
  cabinets[0].wardrobe!.leaves = [null, { limit: 110 }]
  cabinets[1].wardrobe!.leaves = [{ limit: 110 }]
  const hit = testPair().hit!
  // The projecting handles meet slightly before the panels reach 90°.
  assert.ok(Math.abs(hit.angle - 87.7) < .1)
  assert.deepEqual(hit.labels, ['1. modül · 2. kapak', '2. modül · 1. kapak'])
  project.items.push({ ...makeFurniture('box', { x: 1130, z: 465 }), width: 180, depth: 160, height: 2400, name: 'Öndeki dolap' })
  assert.ok(testPair().hit?.labels.includes('Öndeki dolap'))
  assert.ok(cabinets.every(i => i.wardrobe!.pose === 'closed'))
})
