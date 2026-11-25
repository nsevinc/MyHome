import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { cabinetLight, defaultCabinetLed, fitCabinetLed } from '../src/cabinet-led'
import { makeBedroomFurniture } from '../src/bedroom-catalog'
import { furnitureParts } from '../src/furniture'
import { makeFurniture, makeMountedFurniture, makeProject, makeStackedWardrobe, makeWardrobe, furnitureSchema } from '../src/model'
import type { CabinetLed, Furniture } from '../src/model'
import { sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'
import { nativeLibrary } from '../src/library-models'
import { modelCatalog } from '../src/catalog'
import { previewFurnitureReplacement } from '../src/furniture-replacement'

const point = { x: 1700, z: 1800 }
function light(item: Furniture, placement: CabinetLed['placement']) {
  return cabinetLight({ ...item, cabinetLed: { ...defaultCabinetLed, placement } }, furnitureParts(item))!
}

test('LED strips follow individual shelves, partitions and changes to the interior', () => {
  const cabinet = makeWardrobe(2, point)
  cabinet.wardrobe!.interior = [{ shelves: [.3], drawers: 1 }, { shelves: [.4, .8], drawers: 0 }]
  const strips = light(cabinet, 'shelves').strips
  const shelves = furnitureParts(cabinet).filter(part => part.ledMount === 'shelf')
  assert.equal(strips.length, 3)
  strips.forEach((strip, i) => {
    assert.equal(strip.position[0], shelves[i].position[0])
    assert.ok(Math.abs(strip.position[1] - (shelves[i].position[1] - shelves[i].size[1] / 2)) < .001)
    assert.ok(strip.width < shelves[i].size[0])
    assert.deepEqual(strip.normal, [0, -1, 0])
  })
  cabinet.wardrobe!.interior[0] = { shelves: [], drawers: 1 }
  assert.equal(light(cabinet, 'shelves').strips.length, 2)
  assert.equal(light(cabinet, 'ceiling').strips.length, 2)
})

test('lights in stacked cabinets skip the niche and external drawers, top mount only on the highest surface', () => {
  for (const type of ['niche', 'drawers'] as const) {
    const cabinet = makeStackedWardrobe(type, point)
    const top = light(cabinet, 'top').strips
    assert.equal(top.length, 1)
    assert.ok(top[0].position[1] > cabinet.height / 1000)
    for (const side of ['left', 'right'] as const) {
      const strips = light(cabinet, side).strips
      assert.equal(strips.length, 2)
      assert.ok(strips[0].position[1] + strips[0].height / 2 < strips[1].position[1] - strips[1].height / 2)
      assert.equal(Math.sign(strips[0].position[0]), side === 'left' ? -1 : 1)
    }
  }
})

test('lighting travels with the wall cabinet, survives export and turning off preserves its settings', () => {
  const room = makeProject(false)
  const item = makeMountedFurniture('wall-cabinet', room.walls[1].id, 1200, room.height)
  item.cabinetLed = { ...defaultCabinetLed, placement: 'shelves', color: '#ff8040', brightness: 42 }
  room.items = [item]
  const loaded = readProject(JSON.parse(JSON.stringify(room)))
  const data = sceneData(loaded).items[0]
  assert.notEqual(data.angle, 0)
  assert.equal(data.position[1], 1.5)
  assert.deepEqual(data.cabinetLight, cabinetLight(item, furnitureParts(item)))
  assert.equal(data.cabinetLight!.strips.length, 1)
  assert.deepEqual(loaded.items[0].cabinetLed, item.cabinetLed)
  item.cabinetLed.on = false
  assert.equal(sceneData(room).items[0].cabinetLight, undefined)
  const headboard = makeBedroomFurniture('quilted-headboard', point, item.mount)
  assert.equal(furnitureSchema.safeParse({ ...headboard, cabinetLed: item.cabinetLed }).success, false)
  const legacy = makeFurniture('wardrobe', point)
  const fitted = { ...legacy, ...fitCabinetLed(legacy, defaultCabinetLed) }
  assert.ok(furnitureSchema.safeParse(fitted).success)
  assert.ok(light(fitted, 'shelves').strips.length)
})

test('every native and shipped GLB library card has a real WebP preview', () => {
  const entries = Object.values(nativeLibrary).flat()
  for (const { id } of [...entries, ...modelCatalog]) {
    const bytes = readFileSync(new URL(`../public/library/${id}.webp`, import.meta.url))
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
  }
  assert.equal(new Set(entries.map(e => e.id)).size, entries.length)
})

test('replacing a cabinet preserves its light and adapts it to the new interior', () => {
  const room = makeProject(false)
  const original = makeWardrobe(1, point)
  original.cabinetLed = { ...defaultCabinetLed, placement: 'shelves', color: '#f0ce88' }
  room.items = [original]
  const replacement = previewFurnitureReplacement(room, original, makeWardrobe(2, point), 'model')
  assert.equal(replacement.error, undefined)
  assert.deepEqual(replacement.item.cabinetLed, original.cabinetLed)
  assert.equal(sceneData(replacement.project).items[0].cabinetLight?.strips.length, 4)
  replacement.item.wardrobe!.interior = [{ shelves: [], drawers: 0 }, { shelves: [], drawers: 0 }]
  assert.equal(light(replacement.item, 'shelves').strips.length, 0)
})
