import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TestContext } from 'node:test'
import { LocalRenderStore } from '../tools/local-render-store'
import type { RenderMetadata } from '../src/render-jobs'

function localStore(t: TestContext) {
  const store = new LocalRenderStore(':memory:')
  t.after(() => store.close())
  return store
}

const metadata: RenderMetadata = { projectName: 'Oda', cameraLabel: 'Yatağa doğru',
  camera: { position: [1, 1, 1], target: [2, 1, 2], fov: 55 }, light: 'day', fixtures: [] }

test('Render submission is idempotent, serial and retains result metadata', t => {
  const store = localStore(t)
  assert.equal(store.add('first', 'Gündüz', '4k', metadata, '{}'), 'created')
  assert.equal(store.add('first', 'Gündüz', '4k', metadata, '{}'), 'existing')
  assert.equal(store.add('first', 'Gündüz', '4k', { ...metadata, layoutCode: '000000000000' }, '{}'), 'existing')
  assert.equal(store.add('first', 'Gündüz', 'preview', metadata, '{}'), 'conflict')
  store.add('second', 'Akşam', '4k', { ...metadata, light: 'evening' }, '{}')
  const first = store.claim(1000)!
  assert.equal(first.id, 'first')
  assert.equal(store.snapshot('first'), undefined)
  assert.equal(store.claim(1001), undefined)
  assert.equal(store.tryDirect(1001), undefined)
  assert.equal(store.finish(first.id, first.owner, { image: new Uint8Array([1, 2]) }), true)
  assert.deepEqual(store.image('first'), new Uint8Array([1, 2]))
  assert.equal(store.get('first')!.metadata!.light, 'day')
  assert.equal(store.get('first')!.hasSnapshot, true)
  assert.equal(store.snapshot('first'), '{}')
  const second = store.claim(1002)!
  assert.equal(second.id, 'second')
  assert.equal(second.frame, first.frame)
  assert.equal(store.finish(second.id, second.owner, { image: new Uint8Array([3]) }), true)
  assert.equal(store.remove('first'), true)
  assert.equal(store.snapshot('first'), undefined)
  assert.equal(store.snapshot('second'), '{}')
})

test('Interrupted work is reclaimed and stale workers cannot publish results', t => {
  const store = localStore(t)
  store.add('job', 'Sahne', '4k', metadata, '{"frozen":true}')
  const first = store.claim(1000)!
  assert.equal(store.heartbeat(first.owner, 5000), true)
  assert.equal(store.claim(34_999), undefined)
  const recovered = store.claim(35_001)!
  assert.equal(recovered.frame, first.frame)
  assert.equal(store.finish('job', first.owner, { image: new Uint8Array([0]) }), false)
  assert.equal(store.finish('job', recovered.owner, { error: 'Test failure' }), true)
  assert.equal(store.retry('job'), true)
  assert.equal(store.claim(35_002)!.frame, first.frame)
})
