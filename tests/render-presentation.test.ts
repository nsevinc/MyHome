import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placement, roomEdges } from '../src/geometry'
import { activeLighting, changeLighting, selectLightProfile } from '../src/lighting'
import { cycles4k, cyclesPreview } from '../src/cycles-settings'
import { furnitureMaterialDefaults, textureBytes } from '../src/materials'
import { makeFurniture, makeProject, makeWardrobe, uid, wardrobeDoorCounts } from '../src/model'
import type { CameraView, Project, RoomLight } from '../src/model'
import { sameRenderFrame } from '../src/render-preview'
import { defaultCamera, nearWalls, sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'

const examplePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lV0AAAAASUVORK5CYII='

test('existing projects keep their camera, room and placement data', () => {
  const project = makeProject()
  project.camera = defaultCamera(project)
  assert.deepEqual(readProject(JSON.parse(JSON.stringify(project))), project)
})

test('textures, lights and camera views round-trip independently of architecture and placement', () => {
  const project = makeProject()
  const camera = { ...defaultCamera(project), fov: 54 }
  const view: CameraView = { id: uid(), name: 'Üst açı', camera }
  const updated: Project = {
    ...project, camera, cameraViews: [view],
    style: {
      ...project.style, wallFinish: 'concrete', lightStrength: .65,
      floorTexture: { data: examplePng, name: 'mineral.png', tileMm: 500 },
      lights: [{ id: uid(), name: 'Okuma ışığı', position: [1.2, 2.1, .6], power: 110, color: '#fff0d9' }],
    },
  }
  const restored = readProject(JSON.parse(JSON.stringify(updated)))
  assert.deepEqual(restored, updated)
  assert.deepEqual(restored.walls, project.walls)
  assert.deepEqual(restored.items, project.items)
  assert.deepEqual(sceneData(restored).boxes, sceneData(project).boxes)
  assert.deepEqual(sceneData(restored).style.lights, updated.style.lights)
  assert.deepEqual(sceneData(restored).camera, camera)
  assert.deepEqual(restored.items.map(item => placement(restored, item)), project.items.map(item => placement(project, item)))
})

test('embedded surface textures require PNG content and bounded dimensions', () => {
  const data = textureBytes(examplePng)
  new DataView(data.buffer).setUint32(16, 5000)
  assert.throws(() => textureBytes('data:image/png;base64,' + Buffer.from(data).toString('base64')))
  assert.throws(() => textureBytes('data:image/png;base64,Ym9ndXM='))
})

test('object material overrides, inherited finishes and explicit resets round-trip', () => {
  const project = makeProject(false)
  const table = makeFurniture('table', { x: 1000, z: 1400 })
  const updated: Project = { ...project, items: [table, { ...table, id: 'other-table', x: 3200, appearances: {
    all: { preset: 'concrete', color: '#806d64' },
    top: { preset: 'original', color: '#123456', direction: 42.5, scale: 1.27, relief: 1.6, roughness: .37,
      texture: { data: examplePng, name: 'wood.png', tileMm: 400 } },
    base: null,
  } }] }
  const restored = readProject(JSON.parse(JSON.stringify(updated)))
  assert.deepEqual(restored, updated)
  const [original, styled] = sceneData(restored).items
  assert.equal(original.fallback[0].appearance, undefined)
  assert.equal(styled.fallback[0].color, '#123456')
  assert.equal(styled.fallback[0].appearance?.direction, 42.5)
  assert.equal(styled.fallback[1].appearance, undefined)
  const invalid = structuredClone(updated)
  invalid.items[1].appearances!.top!.texture!.data = 'data:image/png;base64,Ym9ndZM='
  assert.throws(() => readProject(invalid))
})

test('wardrobes share saved glass, solid and open door geometry across renderer adapters', () => {
  const project = makeProject(false)
  project.items = wardrobeDoorCounts.map(doors => makeWardrobe(doors, { x: 2000, z: 1600 }))
  for (const [index, item] of sceneData(project).items.entries()) {
    assert.equal(item.fallback.filter(box => box.slot === 'doors').length, index + 1)
    assert.ok(item.fallback.some(box => box.slot === 'inside'))
    assert.ok(item.fallback.every(box => box.size.every(size => size > 0)))
  }
  const wardrobe = project.items[4]
  wardrobe.wardrobe = { doors: 5, front: 'glass', pose: 'open' }
  const restored = readProject(project)
  const glass = sceneData(restored).items[4].fallback.filter(box => box.glass)
  assert.equal(glass.length, 5)
  assert.ok(glass.every(box => box.angle !== 0 && box.position[2] > .3))
  wardrobe.wardrobe.pose = 'none'
  assert.ok(sceneData(project).items[4].fallback.every(box => !['doors', 'handles'].includes(box.slot ?? '')))
})

test('external cutaway associates each structural projection with its own wall, including older projects', () => {
  const project = makeProject()
  project.walls[2].obstacles.push({ ...project.walls[1].obstacles[0], id: uid(), name: 'Kolon', bottom: 0 })
  const edges = roomEdges(project.walls)
  assert.deepEqual([...nearWalls(edges, [5, 3, -1])], [project.walls[0].id, project.walls[1].id])
  assert.equal(nearWalls(edges, [2, 1.5, 1.5]).size, 0)
  const boxes = sceneData(readProject(JSON.parse(JSON.stringify(project)))).boxes
  assert.ok(boxes.some(box => box.wallIds?.length === 2))
  assert.deepEqual(boxes.filter(box => !box.wallIds).map(box => 'obstacleWallId' in box && [box.obstacleName, box.obstacleWallId]),
    project.walls.flatMap(wall => wall.obstacles.map(obstacle => [obstacle.name, wall.id])))
})

test('evening keeps its own lights and intensity when switching or saving a project', () => {
  const project = makeProject()
  const dayLight: RoomLight = { id: uid(), name: 'Dolgu', position: [1, 2, 2], color: '#e7efff', power: 28 }
  const day = { ...project.style, lightStrength: .7, lights: [dayLight] }
  const evening = selectLightProfile(day, 'evening')
  assert.deepEqual(activeLighting(evening), { lightStrength: .32, lights: [dayLight] })
  const nightLight = { ...dayLight, color: '#ffdead', power: 24 }
  const night = changeLighting(evening, { lightStrength: .4, lights: [nightLight] })
  const saved = readProject(JSON.parse(JSON.stringify({ ...project, style: selectLightProfile(night, 'day') })))
  assert.deepEqual(activeLighting(saved.style), { lightStrength: .7, lights: [dayLight] })
  const restored = { ...saved, style: selectLightProfile(saved.style, 'evening') }
  assert.deepEqual(activeLighting(restored.style), { lightStrength: .4, lights: [nightLight] })
  assert.deepEqual(sceneData(restored).style.lights, [nightLight])
  assert.deepEqual(restored.walls, project.walls)
  assert.deepEqual(restored.items, project.items)
})

test('surface grading passes a coherent palette to both renderers without mutating furniture or architecture', () => {
  const project = makeProject()
  const plain = sceneData(project)
  const styled = readProject({ ...project, style: { ...project.style, colorSaturation: 1.25, surfaceRelief: 1.65,
    wallTexture: { data: examplePng, name: 'Taş.png', tileMm: 500, originalColors: true } } })
  const color = sceneData(styled)
  assert.equal(color.style.surfaceRelief, 1.65)
  assert.equal(color.style.wallTexture?.originalColors, true)
  assert.notEqual(color.style.floor, plain.style.floor)
  assert.notEqual(color.items[0].fallback[0].color, plain.items[0].fallback[0].color)
  assert.deepEqual(color.floor, plain.floor)
  assert.deepEqual(color.boxes.map(box => box.size), plain.boxes.map(box => box.size))
  assert.deepEqual(color.items.map(item => item.position), plain.items.map(item => item.position))
  assert.deepEqual(styled.items, project.items)
})

test('Cycles previews compare lighting only for a shared frame and aspect ratio', () => {
  const project = makeProject()
  const camera = defaultCamera(project, true)
  const day = { ...project, camera }
  const night = { ...day, camera: { ...camera }, style: selectLightProfile(day.style, 'evening') }
  assert.equal(cyclesPreview.width / cyclesPreview.height, cycles4k.width / cycles4k.height)
  assert.ok(sameRenderFrame(day, night))
  assert.equal(sameRenderFrame(day, { ...night, camera: { ...camera, fov: 50 } }), false)
  assert.equal(sameRenderFrame(day, { ...night, items: night.items.slice(1) }), false)
  assert.equal(sameRenderFrame(day, { ...night, walls: [...night.walls] }), false)
  assert.equal(sameRenderFrame(day, { ...night, style: { ...night.style, surfaceRelief: 1.65 } }), false)
})

test('wardrobe and bedding finishes change only the intended render surfaces', () => {
  const project = makeProject(false)
  const wardrobe = makeFurniture('wardrobe', { x: 3650, z: 1400 })
  const bed = makeFurniture('bed', { x: 1700, z: 2200 })
  project.items = [wardrobe, bed]
  const oak = { ...furnitureMaterialDefaults['matte-oak'], preset: 'matte-oak' as const }
  const linen = { ...furnitureMaterialDefaults['woven-linen'], preset: 'woven-linen' as const, roughness: .91, scale: 1.2 }
  const updated = readProject({ ...project, items: [{ ...wardrobe, material: oak }, { ...bed, material: linen }] })
  assert.deepEqual(updated.items.map(({ material, ...item }) => item), project.items)
  assert.deepEqual(updated.items.map(item => placement(updated, item)), project.items.map(item => placement(project, item)))
  const original = sceneData(project)
  const styled = sceneData(updated)
  assert.deepEqual(styled.boxes, original.boxes)
  for (let i = 0; i < styled.items.length; i++) {
    const parts = styled.items[i].fallback.map(({ material, position, size }) => ({ position, size }))
    assert.deepEqual(parts, original.items[i].fallback.map(({ position, size }) => ({ position, size })))
  }
  assert.deepEqual(styled.items[0].fallback.filter(box => box.material).map(box => box.surface), ['wood', 'wood', 'wood'])
  assert.deepEqual(styled.items[1].fallback.filter(box => box.material).map(box => box.surface), ['fabric', 'quilt'])
  assert.equal(styled.items[1].fallback.find(box => box.surface === 'quilt')?.material?.roughness, .91)
  assert.throws(() => readProject({ ...project, items: [{ ...bed, material: oak }] }))
})
