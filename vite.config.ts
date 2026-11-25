import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(async ({ command, mode, isPreview }) => {
  const plugins = []
  if (command === 'serve' && !isPreview) {
    const env = loadEnv(mode, process.cwd(), ['MYHOME_', 'BLENDER_BIN'])
    const { localCyclesPlugin } = await import('./tools/local-cycles')
    plugins.push(localCyclesPlugin(env.BLENDER_BIN, env.MYHOME_CYCLES_DEVICE, env.MYHOME_LOCAL_RENDER_DB))
  }
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
  const repo = pkg.repository?.url?.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)$/)?.[1]
  const windowsReleaseUrl = repo ? 'https://github.com/' + repo + '/releases/latest' : './windows.html'
  return {
    plugins,
    build: { license: { fileName: 'THIRD-PARTY-LICENSES.md' } },
    define: { 'import.meta.env.VITE_MYHOME_RELEASE_URL': JSON.stringify(windowsReleaseUrl) },
    optimizeDeps: { include: ['fflate', 'pdfjs-dist'] },
  }
})
