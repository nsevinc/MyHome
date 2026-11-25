import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const runtimeName = 'node-v22.23.5-win-x64'
const checksum = '4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3'

export async function unpackRuntime(cache, staging) {
  await mkdir(cache, { recursive: true })
  const archive = join(cache, runtimeName + '.zip')
  let existing = true
  try { await access(archive) }
  catch (err) { if (err.code !== 'ENOENT') throw err; existing = false }
  if (!existing) {
    const response = await fetch('https://nodejs.org/dist/v22.23.5/' + runtimeName + '.zip')
    if (!response.ok) throw new Error('Node.js arşivi indirilemedi: ' + response.status)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== checksum) throw new Error('Node.js SHA-256 uyuşmuyor.')
    const partial = archive + '.' + process.pid
    await writeFile(partial, bytes, { flag: 'wx' })
    await rename(partial, archive)
  }
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(archive)) hash.update(chunk)
  if (hash.digest('hex') !== checksum) throw new Error('Önbellekteki Node.js arşivinin SHA-256 değeri geçersiz: ' + archive)
  execFileSync(join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe'), ['-xf', archive, '-C', staging], { windowsHide: true })
  return join(staging, runtimeName)
}
