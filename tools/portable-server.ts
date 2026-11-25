import { spawn } from 'node:child_process'
import { existsSync, createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { delimiter, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { localCyclesPath, localRenderJobsPath, renderDevices } from '../src/cycles-settings'
import { createLocalCycles } from './local-cycles'

const root = fileURLToPath(new URL('../../', import.meta.url))
const host = '127.0.0.1'
const identityPath = '/__myhome/portable'
const identityHeader = 'X-MyHome-Portable'
const settingsSchema = z.object({
  port: z.number().int().min(1024).max(65535).default(5188),
  blender: z.string().trim().default(''),
  device: z.enum(renderDevices).default('CPU'),
})
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2',
}

function answer(res: ServerResponse, status: number, text: string) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(text)
}

async function readSettings() {
  let raw
  try { raw = await readFile(join(root, 'ayarlar.json'), 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return settingsSchema.parse({})
    throw error
  }
  try { return settingsSchema.parse(JSON.parse(raw.replace(/^\uFEFF/, ''))) }
  catch { throw new Error('ayarlar.json okunamadı. Port, Blender yolu ve render cihazını kontrol edin.') }
}

function findBlender(configured: string) {
  if (configured) {
    const explicit = resolve(root, configured)
    return existsSync(explicit) ? explicit : undefined
  }
  const installed = [process.env.ProgramFiles, process.env.ProgramW6432]
    .flatMap(home => home ? [join(home, 'Blender Foundation', 'Blender 4.5', 'blender.exe')] : [])
  const onPath = (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(path => resolve(path, 'blender.exe'))
  return [join(root, 'blender', 'blender.exe'), ...installed, ...onPath].find(path => existsSync(path))
}

function openBrowser(url: string) {
  if (process.argv.includes('--no-browser')) return
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { windowsHide: true, detached: true, stdio: 'ignore' })
  browser.on('error', () => console.log(`Tarayıcıdan açın · ${url}`))
  browser.unref()
}

async function staticFile(req: IncomingMessage, res: ServerResponse, pathname: string, dist: string) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD')
    return answer(res, 405, 'Bu istek türü desteklenmiyor.')
  }
  let target: string
  try {
    const path = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
    if (/[\\:\0]/.test(path) || path.startsWith('//')) return answer(res, 404, 'Dosya bulunamadı.')
    target = await realpath(resolve(dist, '.' + path))
  } catch {
    return answer(res, 404, 'Dosya bulunamadı.')
  }
  const localPath = relative(dist, target)
  if (!localPath || localPath === '..' || localPath.startsWith('..' + sep) || isAbsolute(localPath)) {
    return answer(res, 404, 'Dosya bulunamadı.')
  }
  const file = await stat(target).catch(() => undefined)
  if (!file?.isFile()) return answer(res, 404, 'Dosya bulunamadı.')
  res.writeHead(200, {
    'Content-Type': mime[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': file.size, 'Cache-Control': 'no-cache',
  })
  if (req.method === 'HEAD') { res.end(); return }
  const stream = createReadStream(target)
  stream.on('error', () => res.destroy())
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}

async function start() {
  const settings = await readSettings()
  const { port, device } = settings
  const url = `http://${host}:${port}`
  const dist = await realpath(fileURLToPath(new URL('../dist/', import.meta.url)))
  const home = process.env.MYHOME_DATA_DIR || join(process.env.LOCALAPPDATA || root, 'MyHome')
  const blender = findBlender(process.env.BLENDER_BIN?.trim() || settings.blender)
  const missing = 'Cycles için Blender bulunamadı. Blender 4.5 LTS kurun veya ayarlar.json dosyasında blender.exe yolunu belirtin.'
  const local = createLocalCycles(blender, device, resolve(home, 'local-renders.sqlite'),
    [fileURLToPath(new URL('./local-render-worker.mjs', import.meta.url))], blender ? undefined : missing)
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (req.headers.host !== `${host}:${port}` || !req.url?.startsWith('/') || req.url.startsWith('//')) {
      return answer(res, 403, 'MyHome’u başlatıcının gösterdiği yerel adresten açın.')
    }
    try {
      const { pathname, search } = new URL(req.url, url)
      if (pathname === identityPath && req.method === 'GET') {
        res.setHeader(identityHeader, '1')
        return answer(res, 200, 'MyHome')
      }
      if (pathname.startsWith(localRenderJobsPath + '/')) {
        req.url = pathname.slice(localRenderJobsPath.length) + search
        return await local.manage(req, res)
      }
      if (pathname === localCyclesPath) return await local.handle(req, res)
      await staticFile(req, res, pathname, dist)
    } catch {
      if (res.headersSent) res.destroy()
      else answer(res, 500, 'Yerel istek tamamlanamadı.')
    }
  })
  server.once('close', local.close)
  try {
    await new Promise<void>((success, reject) => {
      server.once('error', reject)
      server.listen(port, host, success)
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
    const running = await fetch(url + identityPath, { signal: AbortSignal.timeout(1800) }).catch(() => undefined)
    if (running?.headers.get(identityHeader) !== '1') {
      throw new Error(`${port} numaralı port kullanımda. ayarlar.json dosyasında boş bir port seçin.`)
    }
    console.log(`MyHome zaten açık · ${url}`)
    openBrowser(url)
    return
  }
  console.log(`MyHome hazır · ${url}`)
  console.log(blender ? `Cycles · ${device}` : missing)
  console.log('Kapatmak için Ctrl+C.')
  try { local.wakeWorker() } catch { /* The gallery reports storage errors. */ }
  openBrowser(url)
}

try { await start() }
catch (error) {
  console.error(error instanceof Error ? error.message : 'MyHome başlatılamadı.')
  process.exitCode = 1
}
