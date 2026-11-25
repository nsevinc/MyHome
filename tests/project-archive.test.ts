import assert from 'node:assert/strict'
import { test } from 'node:test'
import { makeProject } from '../src/model'
import { readArchive } from '../src/project-archive'

test('A portable workspace validates revision links and preserves independent project snapshots', () => {
  const project = makeProject(false)
  const before = { ...project, title: 'Önceki oda', height: 2500 }
  const data = { format: 'myhome-workspace', version: 1, active: 'room', models: [],
    projects: [{ id: 'room', updated: 1, project }],
    revisions: [{ id: 'before', projectId: 'room', updated: 0, name: 'Montaj öncesi', project: before }] }
  const archive = readArchive(JSON.parse(JSON.stringify(data)))
  assert.equal(archive.projects[0].project.height, project.height)
  assert.equal(archive.revisions[0].project.height, 2500)
  assert.throws(() => readArchive({ ...data, active: 'missing' }))
  assert.throws(() => readArchive({ ...data, revisions: [{ ...data.revisions[0], projectId: 'missing' }] }))
  assert.throws(() => readArchive({ ...data, projects: [...data.projects, ...data.projects] }))
  const render = { projectId: 'room', name: 'Akşam', preset: '4k', png: 'A'.repeat(44) }
  assert.equal(readArchive({ ...data, renders: [render] }).renders?.[0].projectId, 'room')
  assert.throws(() => readArchive({ ...data, renders: [{ ...render, projectId: 'missing' }] }))
})
