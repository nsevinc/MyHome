import assert from 'node:assert/strict'
import { test } from 'node:test'
import { adjacentCopies } from '../src/adjacent-copy'
import { placement, validateProject } from '../src/geometry'
import { makeFurniture, makeMountedFurniture, makeProject, makeWardrobe, maxFurnitureItems } from '../src/model'
import { addFurnitureCopy } from '../src/wall-mount-edit'

test('mounted copies fit exactly at a wall end and account for the height of furniture below', () => {
  const p = makeProject(false), wall = p.walls[0]
  const upper = { ...makeMountedFurniture('wall-cabinet', wall.id, 1050, p.height), width: 700 }
  const bed = makeFurniture('bed', { x: 1000, z: 1050 })
  p.items = [upper, bed]
  const options = adjacentCopies(p, upper)
  assert.deepEqual(options.map(o => o.item.mount?.offset), [1750, 350])
  assert.ok(options.every(o => o.item.mount!.bottom === upper.mount!.bottom))
  const left = { ...options[1].item, id: 'copy' }
  p.items.push(left)
  assert.deepEqual(adjacentCopies(p, left), [])
  assert.deepEqual(adjacentCopies(p, upper).map(o => o.side), [1])
  wall.obstacles.push({ id: 'beam', name: 'Kiriş', offset: 1620, width: 220, depth: 320, bottom: 1600, top: 2500 })
  assert.deepEqual(adjacentCopies(p, upper), [])
})

test('floor copies respect rotation, remain independent and preserve the original run', () => {
  const p = makeProject(false)
  const source = { ...makeWardrobe(1, { x: 2000, z: 1750 }), angle: 45, locked: true,
    wardrobeRun: { id: 'row', wallId: p.walls[0].id, index: 0 } }
  p.items = [source]
  const [right, left] = adjacentCopies(p, source)
  assert.ok(right.item.x > source.x && right.item.z > source.z)
  assert.ok(left.item.x < source.x && left.item.z < source.z)
  for (const { item } of [right, left]) {
    assert.ok(Math.abs(Math.hypot(item.x - source.x, item.z - source.z) - source.width) <= 1)
    assert.deepEqual(placement(p, item).warning, [])
    assert.deepEqual(item.wardrobe, source.wardrobe)
    assert.equal(item.angle, 45)
    assert.equal(item.wardrobeRun, undefined)
    assert.equal(item.locked, undefined)
  }
  const copy = { ...right.item, id: 'copy' }
  const next = addFurnitureCopy(p, source.id, copy)
  assert.deepEqual(next.items[0], source)
  assert.equal(validateProject(next), undefined)
  assert.deepEqual(adjacentCopies(next, source).map(o => o.side), [-1])
  assert.equal(adjacentCopies(next, copy)[0].item.name, source.name + ' kopyası 2')
})

test('obstructed door sweep, reserved side and furniture limit hide the appropriate controls', () => {
  const p = makeProject(false)
  const cabinet = makeWardrobe(1, { x: 1250, z: 500 })
  p.items = [cabinet]
  p.walls[0].openings.push({ id: 'door', kind: 'door', offset: 250, width: 750, bottom: 0, height: 2100 })
  assert.deepEqual(adjacentCopies(p, cabinet).map(o => o.side), [1])
  p.keepClear = [{ owner: 'item', ownerId: cabinet.id, side: 'right', distance: 800 }]
  assert.deepEqual(adjacentCopies(p, cabinet), [])
  p.keepClear = undefined
  p.items = Array.from({ length: maxFurnitureItems }, (_, i) => ({ ...cabinet, id: String(i) }))
  assert.deepEqual(adjacentCopies(p, p.items[0]), [])
})

test('copies keep half-millimetre mount centres and align with each of the four walls', () => {
  const p = makeProject(false)
  for (const wall of p.walls) {
    const mount = { wallId: wall.id, offset: 451.5, bottom: 1500 }
    const source = { ...makeMountedFurniture('wall-cabinet', wall.id, 451, p.height), width: 301, mount }
    p.items = [source]
    const options = adjacentCopies(p, source)
    assert.deepEqual(options.map(o => o.item.mount!.offset).sort((a, b) => a - b), [150.5, 752.5])
    const corner = { ...options.find(o => o.item.mount!.offset === 150.5)!.item, id: 'corner' }
    p.items.push(corner)
    assert.deepEqual(adjacentCopies(p, corner), [])
    assert.equal(validateProject(p), undefined)
  }
})
