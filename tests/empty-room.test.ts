import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicateDesign, editDesignSurface } from '../src/design-variants'
import { emptyRoomProject } from '../src/empty-room'
import { duplicateLayout } from '../src/layout-variants'
import { makeProject, uid } from '../src/model'
import { itemSelection, removeSelectedFurniture } from '../src/selection'
import { readProject } from '../src/storage'

test('Deleting a group retains locked and unselected objects', () => {
  const [sofa, table, wardrobe] = makeProject().items
  const locked = { ...table, locked: true }
  const items = [sofa, locked, wardrobe]
  assert.deepEqual(removeSelectedFurniture(items, itemSelection([sofa.id, locked.id])), {
    items: [locked, wardrobe], selection: { kind: 'item', id: locked.id },
  })
  assert.equal(removeSelectedFurniture(items, itemSelection([locked.id])), undefined)
  assert.equal(removeSelectedFurniture(items, { kind: 'wall', id: sofa.id }), undefined)
})

test('An empty copy keeps the measured room and its visible finishes without carrying furniture across layouts', () => {
  const original = makeProject()
  original.walls[0].openings = [{ id: uid(), kind: 'window', offset: 900, width: 800, bottom: 900, height: 1100,
    trim: { width: 65, depth: 18 } }]
  original.walls[0].obstacles = [{ id: uid(), name: 'Kiriş', offset: 0, width: 800, depth: 250, bottom: 2200, top: 2500 }]
  original.measurements = [{ id: uid(), kind: 'height', sourceId: original.items[0].id, name: 'Eşya kotu' },
    { id: uid(), name: 'Giriş', kind: 'passage', origin: { x: 900, z: 900 }, axis: 'x', minimum: 750, headroom: 2000 }]
  original.style.lights = [{ id: uid(), name: 'Nokta ışık', position: [1, 2, 1], power: 10, color: '#eeeeaa' }]
  original.style.eveningLighting = { lightStrength: 1, lights: original.style.lights }
  const variant = duplicateDesign(duplicateLayout(original)!, '', 'Duvar rengi')
  const source = editDesignSurface(variant, variant.designs!.active!, { wall: '#dde1db' })
  const empty = readProject(JSON.parse(JSON.stringify(emptyRoomProject(source))))
  assert.deepEqual(empty.walls, source.walls)
  assert.equal(empty.height, source.height)
  assert.equal(empty.thickness, source.thickness)
  assert.equal(empty.style.wall, '#dde1db')
  assert.equal(empty.style.lights, undefined)
  assert.deepEqual(empty.style.eveningLighting?.lights, [])
  assert.deepEqual(empty.measurements, [source.measurements![1]])
  assert.deepEqual(empty.items, [])
  assert.equal(empty.layouts, undefined)
  assert.equal(empty.designs, undefined)
  assert.ok(source.items.length > 0 && source.layouts && source.designs)
})
