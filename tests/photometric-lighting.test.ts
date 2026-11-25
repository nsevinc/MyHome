import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validIesProfile } from '../src/ies-profile'
import { sunDirection } from '../src/lighting'
import { makePendant, makeProject, uid } from '../src/model'
import { resolveRenderScene } from '../src/render-scenes'
import { defaultCamera, sceneData } from '../src/scene-data'
import { readProject } from '../src/storage'

const ies = 'IESNA:LM-63-2002\n[TEST] beam\nTILT=NONE\n1 -1 1 3 1 1 2 0 0 0\n1 1 20\n0 90 180\n0\n4200 0 0'

test('Only bounded embedded Type C photometric profiles are accepted', () => {
  assert.equal(validIesProfile(ies), true)
  assert.equal(validIesProfile(ies.replace('TILT=NONE', 'TILT=other.ies')), false)
  assert.equal(validIesProfile(ies.replace('1 -1 1 3', '1 -1 1 999999999')), false)
  assert.equal(validIesProfile(ies.replace('0 90 180', '0 0 180')), false)
  assert.equal(validIesProfile(ies.replace('4200', '0x42')), false)
})

test('Sun study preserves the camera and only applies the saved bearings to that scene', () => {
  const project = makeProject(false)
  const camera = { id: uid(), name: 'Kadraj', camera: defaultCamera(project, true) }
  project.cameraViews = [camera]
  project.style.sun = { north: 90, azimuth: 90, elevation: 30 }
  const item = makePendant({ x: 1500, z: 1500 }, project.height)
  project.items = [{ ...item, fixture: { ...item.fixture!, ies: { text: ies, name: 'beam.ies', gain: 1, aim: 'down' } } }]
  const source = readProject(project)
  const fixture = sceneData(source).items[0].fixture
  assert.equal(fixture?.ies?.text, ies)
  const base = { id: uid(), name: 'Akşam', cameraId: camera.id, light: 'day' as const, fixtures: [] }
  const sun = { north: 0, azimuth: 270, elevation: 22 }
  const evening = resolveRenderScene(source, { ...base, sun }).frame!
  assert.deepEqual(evening.camera, camera.camera)
  assert.deepEqual(sceneData(evening).sunDirection, sunDirection(sun))
  assert.ok(sunDirection(sun)[0] < 0)
  assert.ok(sunDirection(project.style.sun)[2] > 0)
  assert.equal(sceneData(resolveRenderScene(source, { ...base, sun: null }).frame!).sunDirection, undefined)
  assert.deepEqual(source.style.sun, project.style.sun)
})
