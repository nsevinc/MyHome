import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placement, roomEdges, sillVolume, windowSill } from '../src/geometry'
import { makeFurniture, makeProject, projectSchema } from '../src/model'
import type { Opening } from '../src/model'
import { sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'

test('A window sill has shared measured geometry and follows the window center and lower edge', () => {
  const project = makeProject(false)
  project.thickness = 150
  const [wall] = project.walls
  const opening = { id: 'test-window', kind: 'window', offset: 850, width: 1100, height: 950, bottom: 870,
    sill: { width: 1240, depth: 320, thickness: 30, finish: 'gray' } } satisfies Opening
  wall.openings = [opening]
  const restored = readProject(JSON.parse(JSON.stringify(project)))
  assert.deepEqual(restored.walls[0].openings[0], opening)
  const edge = roomEdges(restored.walls)[0]
  assert.deepEqual(sillVolume(edge, opening, 150, true), { x: 780, z: 0, width: 1240, depth: 170, bottom: 870, top: 900 })
  const data = sceneData(restored)
  const slab = data.boxes.find(box => box.windowSill)
  assert.deepEqual(slab?.position, [1.4, .885, .01])
  assert.deepEqual(slab?.size, [1.24, .03, .32])
  assert.equal(slab?.appearance?.preset, 'marble')
  assert.equal(data.windows[0].sillThickness, .03)
  const moved = { ...opening, offset: 0, bottom: 950 }
  assert.equal(windowSill(wall, moved)?.start, 0)
  assert.equal(sillVolume(edge, moved, 150)?.top, 980)
  assert.equal(projectSchema.safeParse({ ...project, walls: project.walls.map(current => current === wall
    ? { ...wall, openings: [{ ...opening, kind: 'door', bottom: 0 }] } : current) }).success, false)
})

test('Only the sill projection into the room affects furniture clearances', () => {
  const project = makeProject(false)
  project.thickness = 150
  const [wall] = project.walls
  const window = { id: 'test-window', kind: 'window', offset: 550, width: 1200, height: 1000, bottom: 900,
    sill: { width: 1200, depth: 250, thickness: 30, finish: 'white' } } satisfies Opening
  const cabinet = { ...makeFurniture('box', { x: 1100, z: 150 }), width: 450, depth: 220, height: 910 }
  wall.openings = [window]
  assert.ok(placement(project, cabinet).warning.includes('Pencere denizliği ile çakışıyor.'))
  assert.ok(!placement(project, { ...cabinet, height: 899 }).warning.includes('Pencere denizliği ile çakışıyor.'))
  wall.openings = [{ ...window, sill: { ...window.sill, depth: 150 } }]
  assert.ok(!placement(project, cabinet).warning.includes('Pencere denizliği ile çakışıyor.'))
})
