import assert from 'node:assert/strict'
import { test } from 'node:test'
import { roomEdges } from '../src/geometry'
import { makeProject, makeWall, makeWardrobe, uid } from '../src/model'
import { sectionProfile, sectionSpans } from '../src/room-section'
import { wallSurvey } from '../src/wall-survey'

test('A cabinet can have a positive cut clearance and still hit the beam when raised', () => {
  const project = makeProject(false)
  const item = { ...makeWardrobe(2, { x: 1250, z: 301 }), height: 2200 }
  project.items = [item]
  project.walls[0].obstacles.push({ id: uid(), name: 'Kiriş', offset: 500, width: 1500, depth: 650, bottom: 2250, top: 2600 })
  const profile = sectionProfile(project, { axis: 'z', offset: item.x })
  assert.equal(profile.wardrobes[0].gap, 50)
  assert.equal(profile.wardrobes[0].ceiling, 2250)
  assert.match(profile.wardrobes[0].lift, /228,1 cm.*Kiriş/)
  assert.ok(profile.wardrobes[0].arc.length > 2)
  assert.deepEqual(sectionProfile(project, { axis: 'x', offset: 400 }).wardrobes[0].arc, [])
})

test('A cut through a recess yields two room spans without covering the recess', () => {
  const project = makeProject(false)
  project.walls = [
    makeWall(0, 4000), makeWall(1, 3000), makeWall(2, 1000), makeWall(3, 2000),
    makeWall(2, 2000), makeWall(1, 2000), makeWall(2, 1000), makeWall(3, 3000),
  ]
  assert.deepEqual(sectionSpans(project, { axis: 'x', offset: 2000 }), [{ from: 0, to: 1000 }, { from: 3000, to: 4000 }])
})

test('A wall survey uses all three widths and checks both ends without changing the room length', () => {
  const project = makeProject(false)
  const wall = project.walls[0]
  const before = wall.length
  project.items = [
    { ...makeWardrobe(2, { x: 550, z: 301 }), name: 'Sol modül', width: 900 },
    { ...makeWardrobe(2, { x: 2350, z: 301 }), name: 'Orta modül', width: 900 },
    { ...makeWardrobe(2, { x: 3900, z: 301 }), name: 'Sağ modül', width: 900 },
  ]
  wall.survey = { floor: 4500, middle: 4480, allowance: 120 }
  assert.equal(wallSurvey(project, roomEdges(project.walls)[0])?.result, undefined)
  wall.survey.upper = 4450
  const result = wallSurvey(project, roomEdges(project.walls)[0])?.result
  assert.equal(result?.usable, 4210)
  assert.deepEqual(result?.modules.map(row => row.deficit), [20, 0, 20])
  assert.equal(wall.length, before)
})
