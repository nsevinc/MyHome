import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placement } from '../src/geometry'
import { motionParts, solveMotion } from '../src/furniture-motion'
import { makeFurniture, makeProject } from '../src/model'
import { findPlacements } from '../src/placement-search'

const nearby = { radius: 500, rotate: false } as const

test('Placement suggestions clear the drawer movement and leave the working scene unchanged', () => {
  const project = makeProject(false)
  const drawer = { ...makeFurniture('box', { x: 1100, z: 1000 }), width: 800, depth: 500, height: 600, drawerTravel: 500 }
  const blocker = { ...makeFurniture('box', { x: 1100, z: 1886 }), width: 600, depth: 400, height: 600 }
  project.items = [drawer, blocker]
  const result = findPlacements(project, [drawer.id], nearby)
  assert.match(result.currentIssues[0], /Çekmece · Engel/)
  assert.ok(result.suggestions.length > 0)
  for (const suggestion of result.suggestions) {
    const [candidate] = suggestion.items
    const scene = { ...project, items: [candidate, blocker] }
    assert.equal(placement(scene, candidate).warning.length, 0)
    assert.equal(solveMotion(scene, candidate, motionParts(candidate)[0]).contact, undefined)
    assert.equal(candidate.drawerTravel, 500)
    assert.equal(suggestion.turn, 0)
    assert.ok(Math.hypot(suggestion.dx, suggestion.dz) <= nearby.radius)
  }
  assert.equal(project.items[0], drawer)
  assert.equal(drawer.z, 1000)
})

test('Rotations are opt-in and group movement preserves member spacing', () => {
  const project = makeProject(false)
  project.walls = project.walls.map((wall, i) => ({ ...wall, length: i % 2 ? 3400 : 2400 }))
  const cabinet = { ...makeFurniture('box', { x: 1200, z: 1700 }), width: 2900, depth: 800 }
  project.items = [cabinet]
  assert.equal(findPlacements(project, [cabinet.id], nearby).suggestions.length, 0)
  assert.ok(findPlacements(project, [cabinet.id], { ...nearby, rotate: true }).suggestions
    .some(suggestion => Math.abs(suggestion.turn) === 90))

  const first = { ...cabinet, width: 300, depth: 400, x: 800 }
  const second = { ...makeFurniture('box', { x: 1200, z: 1700 }), width: 300, depth: 400 }
  project.items = [first, second]
  const results = findPlacements(project, [first.id, second.id], { ...nearby, rotate: true })
  assert.ok(results.suggestions.length > 0)
  for (const option of results.suggestions) {
    assert.equal(option.items[1].x - option.items[0].x, 400)
    assert.equal(option.items[1].z - option.items[0].z, 0)
    assert.equal(option.turn, 0)
  }
})

test('A low beam can rule out every nearby position without changing furniture height', () => {
  const project = makeProject(false)
  project.walls[0].obstacles.push({ id: 'beam', name: 'Tavan kirişi', offset: 0,
    width: project.walls[0].length, depth: 2200, bottom: 1600, top: project.height })
  const cabinet = { ...makeFurniture('box', { x: 1600, z: 1050 }), height: 2100 }
  project.items = [cabinet]
  const result = findPlacements(project, [cabinet.id], nearby)
  assert.deepEqual(result.suggestions, [])
  assert.ok(result.currentIssues.some(issue => issue.includes('Tavan kirişi')))
  assert.ok(result.blockers.some(issue => issue.includes('Tavan kirişi')))
  assert.equal(cabinet.height, 2100)
})
