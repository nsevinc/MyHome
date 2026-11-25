import { readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { renderDevices } from '../src/cycles-settings'
import type { RenderDevice } from '../src/cycles-settings'
import { makeProject } from '../src/model'
import { readProject } from '../src/storage'
import { renderProject } from './cycles'

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true, options: {
      demo: { type: 'boolean' }, width: { type: 'string', default: '1920' },
      height: { type: 'string', default: '1080' }, samples: { type: 'string', default: '96' },
      device: { type: 'string', default: 'CPU' },
    },
  })
  const [input, output] = values.demo ? [undefined, positionals[0]] : positionals
  const width = Number(values.width), height = Number(values.height), samples = Number(values.samples)
  const device = values.device as RenderDevice
  if ((!input && !values.demo) || !output || positionals.length !== (values.demo ? 1 : 2)) {
    throw new Error('Kullanım: npm run render -- proje.myhome.json render.png [--width 1920 --height 1080 --samples 96 --device CPU]')
  }
  if (!Number.isInteger(width) || width < 64 || width > 3840 || !Number.isInteger(height) || height < 64 || height > 2160
    || !Number.isInteger(samples) || samples < 1 || samples > 512 || !renderDevices.includes(device)) {
    throw new Error('Çözünürlük, örnek sayısı veya render cihazı geçersiz.')
  }
  if (input && (await stat(input)).size > 60 * 1024 * 1024) throw new Error('Proje dosyası en fazla 60 MB olmalı.')
  const project = input ? readProject(JSON.parse(await readFile(input, 'utf8'))) : makeProject()
  await renderProject(project, output, { width, height, samples, device })
  console.log(resolve(output))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
