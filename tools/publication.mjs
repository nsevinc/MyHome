import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { repo: { type: 'string' }, site: { type: 'string' } } })
if (!/^[a-zA-Z0-9-]+\/[a-zA-Z0-9_.-]+$/.test(values.repo ?? '')) throw new Error('Use --repo OWNER/MyHome')
function siteHomepage(value) {
  const site = new URL(value)
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname !== '/') {
    throw new Error('Use --site https://your-project.pages.dev')
  }
  return site.origin + '/'
}
const github = 'https://github.com/' + values.repo
const pkgFile = new URL('../package.json', import.meta.url)
const readmeFile = new URL('../README.md', import.meta.url)
const pkg = JSON.parse(await readFile(pkgFile, 'utf8'))
const readme = await readFile(readmeFile, 'utf8')
const block = /<!-- publication:start -->[\s\S]*?<!-- publication:end -->/
if (!block.test(readme)) throw new Error('Missing README publication links')
if (values.site !== undefined) pkg.homepage = siteHomepage(values.site)
const web = pkg.homepage ? '[Tarayıcıda aç / Open in browser](' + pkg.homepage + ')' : '[Web sürümü rehberi / Web guide](docs/start.md#web)'
const links = web + ' · [Windows için indir / Download for Windows](' + github + '/releases/latest) · [Kaynak koddan çalıştır / Run from source](#source)'
pkg.repository = { type: 'git', url: github }
await writeFile(pkgFile, JSON.stringify(pkg, null, 2) + '\n')
await writeFile(readmeFile, readme.replace(block, '<!-- publication:start -->\n' + links + '\n<!-- publication:end -->'))
console.log('README and package metadata updated locally.')
