import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { bedroomCatalog, makeBedroomFurniture } from '../src/bedroom-catalog'
import { bedroomFamilies, bedroomModels } from '../src/bedroom-models'
import type { BedroomFamily } from '../src/bedroom-models'
import { buildBedroomDesign, defaultBedroomDesign, saveBedroomAlternative, suggestBedroomWall } from '../src/bedroom-design'
import { furnitureParts } from '../src/furniture'
import { motionParts } from '../src/furniture-motion'
import { roomEdges, validateProject } from '../src/geometry'
import { layoutScene } from '../src/layout-variants'
import { bedroomModelKinds, furnitureSchema, makeFurniture, makeProject, makeWideBed } from '../src/model'
import type { BedroomModel } from '../src/model'
import { editableParts } from '../src/object-appearance'
import { sceneData } from '../src/scene-data'

function bedroom() {
  const project = makeProject(false)
  const bed = makeWideBed({ x: 2100, z: 1060 })
  const rug = makeFurniture('rug', { x: bed.x, z: bed.z })
  project.items = [bed, rug]
  project.furnitureLinks = [
    { id: 'rug-link', itemId: rug.id, referenceId: bed.id, x: { mode: 'center' }, z: { mode: 'center' } },
  ]
  const edge = suggestBedroomWall(bed, roomEdges(project.walls))!
  return { project, bed, edge }
}

test('Bedroom presets center the headboard and retain the source layout and its links', () => {
  const { project, bed, edge } = bedroom()
  const result = buildBedroomDesign(project, bed, edge, defaultBedroomDesign(project, bed, edge, 'simple'))
  assert.equal(edge.wall.id, project.walls[0].id)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.notes, [])
  assert.deepEqual(result.readings.flatMap(row => row.warnings), [])
  assert.equal(result.items.filter(item => item.bedroomModel === 'floating-nightstand').length, 2)
  const [headboard] = result.items
  assert.equal(headboard.mount!.offset, bed.x)
  const alternative = saveBedroomAlternative(project, result, 'simple')!
  const source = layoutScene(alternative, alternative.layouts!.entries[0].id)
  assert.deepEqual(source.items, project.items)
  assert.deepEqual(source.furnitureLinks, project.furnitureLinks)
  assert.deepEqual(alternative.furnitureLinks, project.furnitureLinks)
  assert.deepEqual(alternative.items[0], { ...bed, separateHeadboard: true })
  assert.equal(validateProject(alternative), undefined)
  assert.ok(furnitureParts(bed).some(part => part.slot === 'headboard'))
  assert.ok(!furnitureParts(alternative.items[0]).some(part => part.slot === 'headboard'))
})

test('The storage preview reads the beam and checks door swings for wall-mounted modules', () => {
  const { project, bed, edge } = bedroom()
  edge.wall.obstacles.push({ id: 'beam', name: 'Kiriş', offset: 1800, width: 600, depth: 250, bottom: 2470, top: 2650 })
  project.items.push({ ...makeFurniture('box', { x: 2320, z: 480 }), name: 'Kapak önü engeli', width: 100, depth: 90, height: 2310 })
  const result = buildBedroomDesign(project, bed, edge, defaultBedroomDesign(project, bed, edge, 'storage'))
  const upper = result.readings.find(({ item }) => item.bedroomModel === 'upper-cabinet')!
  assert.equal(upper.fit.obstruction, 'Kiriş')
  assert.equal(upper.fit.clearance, -110)
  assert.equal(upper.aboveBed, 2130 - bed.height)
  assert.ok(upper.doorWarnings.some(message => message.includes('Kapak önü engeli')))
})

test('Each bedroom model retains its subtype and parts through the render scene adapter', () => {
  const { project } = bedroom()
  for (const kind of Object.keys(bedroomCatalog) as BedroomModel[]) {
    const { bottom } = bedroomCatalog[kind]
    const mount = bottom === undefined ? undefined : { wallId: project.walls[0].id, offset: 2100, bottom }
    const item = furnitureSchema.parse(makeBedroomFurniture(kind, { x: 2100, z: 1000 }, mount))
    assert.equal(item.bedroomModel, kind)
    assert.equal(item.kind, bedroomModelKinds[kind])
    const [sceneItem] = sceneData({ ...project, items: [item] }).items
    assert.equal(sceneItem.position[1], (bottom ?? 0) / 1000)
    const slots = new Set(sceneItem.fallback.map(part => part.slot))
    for (const slot of editableParts(item)) assert.ok(slots.has(slot.id), `${kind} · ${slot.id}`)
    if (item.drawerTravel) assert.equal(motionParts(item)[0]?.id, 'drawer')
  }
})

test('Every bedroom family offers three or four different geometries at catalogue scale', () => {
  for (const family of Object.keys(bedroomFamilies) as BedroomFamily[]) {
    const ids = bedroomModels.filter(id => bedroomCatalog[id].family === family)
    assert.ok(ids.length >= 3 && ids.length <= 4, family)
    const silhouettes = ids.map(id => {
      const thumbnail = readFileSync(new URL(`../public/bedroom/${id}.webp`, import.meta.url))
      assert.equal(thumbnail.toString('ascii', 8, 12), 'WEBP', id)
      const item = makeBedroomFurniture(id, { x: 0, z: 0 })
      const scale = Math.max(item.width, item.depth, item.height) / 1000
      return JSON.stringify(furnitureParts(item).map(p => [p.cylinder ?? p.round ?? 'box',
        ...[...p.position, ...p.size].map(value => Math.round(value / scale * 1000))]))
    })
    assert.equal(new Set(silhouettes).size, ids.length, family)
  }
})
