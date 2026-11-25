import assert from 'node:assert/strict'
import { test } from 'node:test'
import { elevationData } from '../src/elevation-data'
import { itemBottom, placement, roomEdges } from '../src/geometry'
import { passageReadings } from '../src/layout'
import { fixtureColor } from '../src/lighting'
import { makeMountedFurniture, makePendant, makeProject } from '../src/model'
import type { Passage } from '../src/model'
import { sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'

test('the pendant follows the ceiling and its shade can limit the measured passage', () => {
  const project = makeProject(false)
  const lamp = { ...makePendant({ x: 1400, z: 415 }, project.height), height: 640 }
  project.items = [lamp]
  const edges = roomEdges(project.walls)
  const marker: Passage = { origin: { x: 1400, z: 415 }, axis: 'x', minimum: 800, headroom: 2000 }
  assert.equal(itemBottom(lamp, project.height), 2010)
  assert.equal(passageReadings(project, marker, edges, project.items)[1].width, 4200)
  assert.equal(passageReadings(project, { ...marker, headroom: 2050 }, edges, project.items)[1].reason, 'blocked')
  assert.equal(sceneData({ ...project, height: 2750 }).items[0].position[1], 2.11)

  project.walls[0].obstacles.push({ id: 'beam', name: 'Tavan kirişi', offset: 1000, width: 800, depth: 300, bottom: 2420, top: 2650 })
  assert.equal(placement(project, lamp, edges).warning.length, 0)
  assert.equal(placement(project, { ...lamp, z: 220 }, edges).obstruction, 'Tavan kirişi')
})

test('the saved lamp emits the shared warm color and the mirror retains its reflective face', () => {
  const project = makeProject(false)
  const lamp = makePendant({ x: 1400, z: 1400 }, project.height)
  const mirror = makeMountedFurniture('mirror', project.walls[2].id, 1000, project.height)
  const checked = readProject(JSON.parse(JSON.stringify({ ...project, items: [lamp, mirror] })))
  const [lit, glass] = sceneData(checked).items
  assert.equal(lit.fixture?.color, fixtureColor(lamp.fixture!))
  assert.ok((lit.fixture?.downlightDiameter ?? 0) > 0)
  assert.ok(lit.fallback.some(part => part.emission === lit.fixture!.color))
  const [unlit] = sceneData({ ...checked, items: [{ ...lamp, fixture: { ...lamp.fixture!, on: false } }, mirror] }).items
  assert.equal(unlit.fixture, undefined)
  assert.ok(unlit.fallback.every(part => !part.emission))
  assert.equal(glass.fallback.filter(part => part.mirror).length, 1)
  assert.equal(glass.position[1], 1.2)
  assert.equal(elevationData(checked, roomEdges(checked.walls)[2]).mounted[0].item.id, mirror.id)
})
