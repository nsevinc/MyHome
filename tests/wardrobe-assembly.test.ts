import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeProject, makeWardrobe, uid } from '../src/model'
import { checkTransport, emptyRoute, wardrobeAssembly } from '../src/wardrobe-assembly'

test('The same cabinet can fit upright while clipping the beam during the lift', () => {
  const project = makeProject(false)
  const item = { ...makeWardrobe(2, { x: 1250, z: 301 }), height: 2200 }
  project.items = [item]
  project.walls[0].obstacles.push({ id: uid(), name: 'Kiriş', offset: 500, width: 1500, depth: 650, bottom: 2250, top: 2600 })
  const result = wardrobeAssembly(project, item)
  assert.equal(result.diagonal, 2281)
  assert.deepEqual(result.raiseHits, ['Kiriş'])
  assert.deepEqual(result.standHits, [])
  assert.deepEqual(wardrobeAssembly(project, { ...item, assembly: { allowance: 60 } }).standHits, ['Kiriş'])
  project.walls[0].obstacles[0].depth = 100
  assert.deepEqual(wardrobeAssembly(project, item).raiseHits, [])
})

test('Transport uses the selected orientation and distinguishes incomplete measurements', () => {
  const item = { ...makeWardrobe(2, { x: 0, z: 0 }), height: 2200 }
  const input = { ...emptyRoute, doorWidth: 850, doorHeight: 2000, corridorWidth: 800, turnWidth: 2400, turnDepth: 2400 }
  assert.equal(checkTransport(item, input).door, false)
  assert.equal(checkTransport(item, emptyRoute).turn, undefined)
  assert.deepEqual(checkTransport(item, { ...input, orientation: 'side' }), {
    door: true, corridor: true, turn: true, width: 600, height: 1000, turnClearance: 2281,
  })
})
