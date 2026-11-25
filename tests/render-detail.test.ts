import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeProject, projectSchema } from '../src/model'
import type { Project, RenderScene, Wall } from '../src/model'
import { mountingLayoutCode } from '../src/mounting-codes'
import { renderCorridor, renderDoorChoices } from '../src/render-detail'
import { sameRenderFrame } from '../src/render-preview'
import { resolveRenderScene } from '../src/render-scenes'
import { sceneData } from '../src/scene-data'

test('The render corridor is attached beyond the selected door and stops before an opposite room wing', () => {
  const project = makeProject(false)
  project.thickness = 150
  const runs: [Wall['dir'], number][] = [[0, 4000], [1, 4000], [2, 1200], [3, 3000],
    [2, 1600], [1, 3000], [2, 1200], [3, 4000]]
  project.walls = runs.map(([dir, length], i) => ({ id: `wall-${i}`, dir, length, openings: [], obstacles: [] }))
  project.walls[5].openings.push({ id: 'door', kind: 'door', offset: 400, width: 800, height: 2040, bottom: 0 })
  const [door] = renderDoorChoices(project)
  const setting = { ...door, depth: 3200, color: '#ac9f90', power: 26 }
  const corridor = renderCorridor(project, setting)!
  assert.deepEqual(corridor.origin, [1.35, 0, 1.8])
  assert.deepEqual(corridor.outward.map(value => value || 0), [1, 0, 0])
  assert.equal(corridor.depth, 1.288)
  assert.equal(corridor.width, .8)
  assert.equal(renderCorridor(project, { ...setting, openingId: 'missing' }), undefined)
})

test('Named visual details stay with the saved camera without changing the measured room or furniture', async () => {
  const original = makeProject()
  original.walls[0].openings = [
    { id: 'door', kind: 'door', offset: 250, width: 750, height: 2000, bottom: 0 },
    { id: 'window', kind: 'window', offset: 1250, width: 1200, height: 1000, bottom: 900 },
  ]
  const [door] = renderDoorChoices(original)
  const detail = {
    corridor: { wallId: door.wallId, openingId: door.openingId, depth: 1800, color: '#b2a495', power: 26 },
    exterior: { brightness: .75 }, detailedBedding: true,
  }
  const camera = { position: [2, 1.5, 2], target: [1, 1.2, 1], fov: 52 } satisfies NonNullable<Project['camera']>
  const named: RenderScene = { id: 'night', name: 'Akşam', cameraId: 'view', light: 'evening', fixtures: [], renderDetail: detail }
  const saved = projectSchema.parse(JSON.parse(JSON.stringify({ ...original, cameraViews: [{ id: 'view', name: 'Kadraj', camera }],
    style: { ...original.style, renderDetail: { exterior: { brightness: 0 } } }, renderScenes: [named] })))
  const frame = resolveRenderScene(saved, saved.renderScenes![0]).frame!
  const data = sceneData(frame)
  assert.deepEqual(data.camera, camera)
  assert.deepEqual(frame.style.renderDetail, detail)
  assert.equal(data.renderDetail.corridor?.power, 26)
  assert.equal(data.renderDetail.exterior?.brightness, .75)
  assert.equal(data.renderDetail.detailedBedding, true)
  assert.deepEqual(frame.walls, saved.walls)
  assert.deepEqual(frame.items, saved.items)
  assert.equal(await mountingLayoutCode(frame), await mountingLayoutCode(original))
  assert.equal(sameRenderFrame(frame, { ...frame, style: saved.style }), false)
  assert.deepEqual(resolveRenderScene(saved, { ...named, renderDetail: {} }).frame?.style.renderDetail, {})
})
