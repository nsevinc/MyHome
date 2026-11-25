import { unpackRuntime } from './portable-runtime.mjs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { build as bundle } from 'esbuild'
import { build as buildWeb } from 'vite'

const repository = fileURLToPath(new URL('../', import.meta.url))
const releases = join(repository, 'output', 'packages')
const { values } = parseArgs({ options: { runtime: { type: 'string' } } })
const app = JSON.parse(await readFile(join(repository, 'package.json'), 'utf8'))
const zipName = `MyHome-Windows-x64-${app.version}.zip`

async function copyLicenses(target) {
  const lock = JSON.parse(await readFile(join(repository, 'package-lock.json'), 'utf8'))
  for (const [directory, dependency] of Object.entries(lock.packages)) {
    if (!directory.startsWith('node_modules/') || dependency.dev) continue
    const source = join(repository, directory)
    const files = await readdir(source).catch(() => [])
    for (const file of files.filter(name => /^(licen[cs]e|notice)(\.|$)/i.test(name))) {
      const destination = join(target, directory.replaceAll('/node_modules/', '/').slice('node_modules/'.length), file)
      await mkdir(dirname(destination), { recursive: true })
      await copyFile(join(source, file), destination)
    }
  }
}

async function sha256(file) {
  const hash = createHash('sha256')
  for await (const block of createReadStream(file)) hash.update(block)
  return hash.digest('hex')
}

async function packageWindows() {
  if (process.platform !== 'win32') throw new Error('Bu paket komutu Windows üzerinde çalışır.')
  await mkdir(releases, { recursive: true })
  const staging = await mkdtemp(join(releases, '.myhome-stage-'))
  try {
    const runtime = values.runtime ? resolve(values.runtime) : await unpackRuntime(join(repository, 'output', 'work', 'portable-runtime'), staging)
    const node = join(runtime, 'node.exe')
    const nodeLicense = join(runtime, 'LICENSE')
    try { await Promise.all([access(node), access(nodeLicense)]) }
    catch { throw new Error(`Node.js Windows x64 ZIP arşivini çıkarın ve --runtime ile dizinini belirtin. Aranan dizin · ${runtime}`) }
    const identity = JSON.parse(execFileSync(node, ['-p', 'JSON.stringify({platform:process.platform,arch:process.arch,version:process.versions.node})'],
      { encoding: 'utf8', windowsHide: true }))
    const [major, minor] = identity.version.split('.').map(Number)
    if (identity.platform !== 'win32' || identity.arch !== 'x64' || !(major === 22 && minor >= 13 || major >= 24)) {
      throw new Error('Windows x64 Node.js 22.13+ veya Node.js 24+ gerekir.')
    }

    const portable = join(staging, 'MyHome')
    const appFolder = join(portable, 'app')
    const appTools = join(appFolder, 'tools')
    const runtimeFolder = join(portable, 'runtime')
    await mkdir(appTools, { recursive: true })
    await mkdir(runtimeFolder, { recursive: true })
    execFileSync(process.execPath, [join(repository, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'],
      { cwd: repository, stdio: 'inherit', windowsHide: true })
    await buildWeb({ root: repository, mode: 'portable', build: { outDir: join(appFolder, 'dist') } })
    await bundle({
      absWorkingDir: repository,
      entryPoints: ['tools/portable-server.ts', 'tools/local-render-worker.ts'],
      outdir: appTools,
      outExtension: { '.js': '.mjs' },
      platform: 'node', format: 'esm', target: 'node22', bundle: true, legalComments: 'linked',
    })
    await Promise.all([
      copyFile(join(repository, 'LICENSE'), join(portable, 'LICENSE')),
      copyFile(node, join(runtimeFolder, 'node.exe')),
      copyFile(nodeLicense, join(runtimeFolder, 'Node-LICENSE.txt')),
      copyFile(join(repository, 'tools', 'render-scene.py'), join(appTools, 'render-scene.py')),
      cp(join(repository, 'assets', 'models'), join(appFolder, 'assets', 'models'), { recursive: true }),
      copyFile(join(repository, 'docs', 'windows-portable.md'), join(portable, 'BASLANGIC.md')),
      copyFile(join(repository, 'tools', 'portable', 'MyHome.cmd'), join(portable, 'MyHome.cmd')),
      copyFile(join(repository, 'tools', 'portable', 'ayarlar.json'), join(portable, 'ayarlar.json')),
      copyLicenses(join(portable, 'licenses')),
    ])
    const stagedZip = join(staging, zipName)
    const tar = join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe')
    execFileSync(tar, ['-a', '-cf', stagedZip, '-C', staging, 'MyHome'], { windowsHide: true, stdio: 'inherit' })
    const checksum = await sha256(stagedZip)
    await rename(stagedZip, join(releases, zipName))
    await writeFile(join(releases, zipName + '.sha256'), `${checksum}  ${zipName}\n`)
    console.log(`MyHome ${app.version} · Node.js ${identity.version}\n${join(releases, zipName)}`)
  } finally {
    const target = resolve(staging)
    if (dirname(target) === resolve(releases) && basename(target).startsWith('.myhome-stage-')) {
      await rm(target, { recursive: true, force: true, maxRetries: 3 })
    }
  }
}

try { await packageWindows() }
catch (error) { console.error(error.message); process.exitCode = 1 }
