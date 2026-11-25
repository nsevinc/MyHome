import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duplicateDesign } from '../src/design-variants'
import { duplicateLayout } from '../src/layout-variants'
import { makePendant, makeProject, projectSchema, uid } from '../src/model'
import type { Project, RenderScene } from '../src/model'
import { resolveRenderScene, sceneAmbience, sceneFixtures, sceneLighting } from '../src/render-scenes'
import { changeAmbience, renderFixtureStates, selectLightProfile } from '../src/lighting'
import { sceneData } from '../src/scene-data'

test('Named scenes bind a saved camera, layout, design and independent fixture states', () => {
  const original = makeProject(false)
  const pendant = makePendant({ x: 1000, z: 2000 }, original.height)
  original.items = [pendant]
  const camera = { id: uid(), name: 'Yatağa doğru', camera: { position: [1, 1.5, 2], target: [2, 1.3, 1], fov: 55 } } satisfies NonNullable<Project['cameraViews']>[number]
  let project = duplicateLayout({ ...original, cameraViews: [camera] })!
  project = duplicateDesign(project, '', 'Ceviz')
  const layoutId = project.layouts!.entries[0].id
  const scene = { id: uid(), name: 'Sarkıt açık', layoutId, designId: project.designs!.active,
    light: 'evening', cameraId: camera.id, fixtures: sceneFixtures(project, layoutId) } satisfies RenderScene
  const on = resolveRenderScene(project, scene).frame!
  const off = resolveRenderScene(project, { ...scene, name: 'Sarkıt kapalı', fixtures: [{ ...scene.fixtures[0], on: false }] }).frame!
  assert.deepEqual(on.camera, camera.camera)
  assert.deepEqual(off.camera, on.camera)
  assert.equal(on.style.light, 'evening')
  assert.equal(on.items[0].fixture?.on, true)
  assert.equal(off.items[0].fixture?.on, false)
  assert.equal(project.items[0].fixture?.on, true)
  assert.equal(off.layouts, undefined)
  assert.equal(off.designs, undefined)
})

test('A missing named scene dependency requires a new selection', () => {
  const project = makeProject(false)
  const scene: RenderScene = { id: uid(), name: 'Silinmiş seçimler', layoutId: 'removed-layout', cameraId: 'removed-camera',
    designId: 'removed-design', fixtures: [], light: 'day' }
  const bad = resolveRenderScene(project, scene)
  assert.equal(bad.frame, undefined)
  assert.equal(bad.problems.length, 3)
  const incomplete = resolveRenderScene(project, { ...scene, layoutId: undefined,
    fixtures: [{ id: 'removed-light', name: 'Sarkıt', on: false }] })
  assert.match(incomplete.problems.join(' '), /Sarkıt seçili yerleşimde bulunamadı/)
})

test('Day and evening preserve separate light levels, fixture settings and a named scene snapshot', () => {
  const project = makeProject(false)
  const fixture = makePendant({ x: 1000, z: 1800 }, project.height)
  project.items = [fixture]
  project.cameraViews = [{ id: uid(), name: 'Yatağa doğru', camera: { position: [1, 1.5, 3], target: [2, 1.3, 1], fov: 45 } }]
  project.style = changeAmbience(selectLightProfile(project.style, 'day'), { windowStrength: 1.4,
    whiteBalance: 6300, fixtures: { [fixture.id]: { on: false } } })
  assert.equal(sceneData(project).items[0].fixture, undefined)
  assert.deepEqual(renderFixtureStates(project), [{ name: fixture.name, on: false }])
  project.style = changeAmbience(selectLightProfile(project.style, 'evening'), { windowStrength: .6,
    whiteBalance: 5100, exposure: .35, fixtures: { [fixture.id]: { on: true, power: 22, temperature: 2800, diameter: 195 } } })
  const scene: RenderScene = { id: uid(), name: 'Sıcak akşam', light: 'evening', cameraId: project.cameraViews[0].id,
    ambience: sceneAmbience(project, 'evening'), lighting: sceneLighting(project, 'evening'), fixtures: sceneFixtures(project) }
  const restored = projectSchema.parse(JSON.parse(JSON.stringify({ ...project, renderScenes: [scene],
    style: changeAmbience(project.style, { exposure: 2, whiteBalance: 7000, fixtures: { [fixture.id]: { on: false } } }) })))
  const frame = resolveRenderScene(restored, restored.renderScenes![0]).frame!
  const data = sceneData(frame)
  assert.equal(data.ambience.exposure, .35)
  assert.equal(data.ambience.whiteBalance, 5100)
  assert.equal(data.items[0].fixture?.power, 22)
  assert.equal(data.items[0].fixture?.downlightDiameter, .195)
  assert.equal(data.style.lightStrength, .32)
  assert.equal(sceneData({ ...restored, style: selectLightProfile(restored.style, 'day') }).ambience.windowStrength, 1.4)
  const off = resolveRenderScene(restored, { ...scene, fixtures: [{ ...scene.fixtures[0], on: false }] }).frame!
  assert.equal(sceneData(off).items[0].fixture, undefined)
  assert.deepEqual(project.items[0], fixture)
})
