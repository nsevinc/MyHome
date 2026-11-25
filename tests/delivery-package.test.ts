import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDeliveryPackage, deliveryRenderStatus, deliveryVersion } from '../src/delivery-package'
import { duplicateLayout, layoutName, renameLayout, switchLayout } from '../src/layout-variants'
import { makeProject, uid } from '../src/model'
import { exportRevisionArchive, readArchive } from '../src/project-archive'
import type { RenderMetadata, SceneJob } from '../src/render-jobs'
import { projectCamera } from '../src/scene-data'

test('The delivery backup reopens the selected layout and retains its named revision', async () => {
  const initial = makeProject()
  const draft = duplicateLayout(initial)!
  const originalLayout = draft.layouts!.active
  draft.items = draft.items.map((item, i) => i === 0 ? { ...item, x: item.x + 100 } : item)
  const alternate = draft.layouts!.entries[0].id
  const selected = switchLayout(renameLayout(draft, alternate, 'Montaj A'), alternate)
  const revision = { id: uid(), projectId: uid(), name: 'Teslim A', updated: 0 }
  const version = await deliveryVersion(revision, selected)
  assert.equal(version.layout, 'Montaj A')
  assert.deepEqual(version.scene.items, initial.items)
  assert.equal(draft.layouts!.active, originalLayout)

  const backup = await exportRevisionArchive(revision, selected, [])
  const decoded = readArchive(JSON.parse(await backup.text()))
  assert.equal(layoutName(decoded.projects[0].project), 'Montaj A')
  assert.equal(decoded.revisions[0].name, 'Teslim A')
  assert.deepEqual(decoded.revisions[0].project.items, initial.items)
  assert.equal(decoded.renders?.length, 0)
})

test('A render with no verified match is excluded, even when packaging is called directly', async () => {
  const project = makeProject()
  const revision = { id: uid(), projectId: uid(), name: 'Montaj A', updated: 0 }
  const version = await deliveryVersion(revision, project)
  const metadata: RenderMetadata = { camera: projectCamera(project), cameraLabel: 'Oda', projectName: project.title,
    projectId: revision.projectId, light: 'day', fixtures: [] }
  const job: SceneJob = { id: uid(), name: 'Başka yerleşim', preset: 'preview', state: 'succeeded', order: 1,
    metadata: { ...metadata, layoutCode: '000000000000' } }

  assert.equal(deliveryRenderStatus(job, version.codes.layout), 'different')
  assert.equal(deliveryRenderStatus({ ...job, metadata }, version.codes.layout), 'unknown')
  assert.equal(deliveryRenderStatus({ ...job, metadata }, version.codes.layout, version.codes.layout), 'match')
  await assert.rejects(createDeliveryPackage(version, [job]), /yerleşimi seçilen sürümle doğrulanamadı/)
  await assert.rejects(createDeliveryPackage(version, [{ ...job, metadata }]), /yerleşimi seçilen sürümle doğrulanamadı/)
})

test('A delivery change summary rejects the same revision, a newer one, or one from another project', async () => {
  const project = makeProject()
  const revision = { id: uid(), projectId: uid(), name: 'Montaj B', updated: 100 }
  const version = await deliveryVersion(revision, project)
  const newer = await deliveryVersion({ ...revision, id: uid(), updated: 200 }, project)
  const fromElsewhere = await deliveryVersion({ ...revision, id: uid(), projectId: uid(), updated: 50 }, project)
  for (const baseline of [version, newer, fromElsewhere]) {
    await assert.rejects(createDeliveryPackage(version, [], baseline), /projeye ait önceki bir sürüm/)
  }
})
