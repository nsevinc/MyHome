import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { localCyclesAvailable } from '../src/distribution'
import { makeProject } from '../src/model'
import { submitSceneJob } from '../src/scene-queue'

test('A static client rejects Cycles submission without contacting a render service', async t => {
  const network = t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected network access') })
  assert.equal(localCyclesAvailable, false)
  await assert.rejects(submitSceneJob({
    id: 'static-client', project: makeProject(false),
    context: { projectName: 'Demo', cameraLabel: 'Demo' },
  }, '4k'), /Windows sürümünü açın/)
  assert.equal(network.mock.callCount(), 0)
})

test('Publication sets the README links and package metadata locally and can be repeated', async t => {
  const fixture = await mkdtemp(join(tmpdir(), 'myhome-publication-'))
  t.after(() => rm(fixture, { recursive: true, force: true }))
  await mkdir(join(fixture, 'tools'))
  const script = join(fixture, 'tools', 'publication.mjs')
  await copyFile(new URL('../tools/publication.mjs', import.meta.url), script)
  const readme = join(fixture, 'README.md')
  const pkg = join(fixture, 'package.json')
  await writeFile(pkg, JSON.stringify({ name: 'myhome', license: 'MIT' }))
  await writeFile(readme, '# MyHome\n<!-- publication:start -->old<!-- publication:end -->\nEnd\n')
  const publish = (site?: string) => execFileSync(process.execPath,
    [script, '--repo', 'example/MyHome', ...(site === undefined ? [] : ['--site', site])], { stdio: 'pipe' })
  publish()
  const githubOnly = await readFile(readme, 'utf8')
  assert.ok(githubOnly.includes('(docs/start.md#web)'))
  assert.ok(githubOnly.includes('(https://github.com/example/MyHome/releases/latest)'))
  const githubPackage = JSON.parse(await readFile(pkg, 'utf8'))
  assert.equal(githubPackage.repository.url, 'https://github.com/example/MyHome')
  assert.equal(githubPackage.homepage, undefined)
  const site = 'https://demo.pages.dev'
  publish(site)
  const contents = await readFile(readme, 'utf8')
  assert.ok(contents.includes('(' + site + '/)'))
  assert.ok(contents.includes('(https://github.com/example/MyHome/releases/latest)'))
  assert.ok(contents.endsWith('End\n'))
  const metadata = JSON.parse(await readFile(pkg, 'utf8'))
  assert.equal(metadata.homepage, site + '/')
  assert.equal(metadata.repository.url, 'https://github.com/example/MyHome')
  assert.equal(metadata.license, 'MIT')
  publish(site)
  assert.equal(await readFile(readme, 'utf8'), contents)
  publish()
  assert.equal(await readFile(readme, 'utf8'), contents)
  assert.equal(JSON.parse(await readFile(pkg, 'utf8')).homepage, site + '/')
  assert.throws(() => publish('http://demo.pages.dev'))
  assert.equal(await readFile(readme, 'utf8'), contents)
})
