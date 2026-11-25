import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

// The exporter uses FileReader for its final Blob. Catalog meshes have no external images.
class NodeFileReader {
  result: ArrayBuffer | null = null
  onloadend?: () => void
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.() })
  }
}
Object.defineProperty(globalThis, 'FileReader', { value: NodeFileReader })
const material = (color: string) => new MeshStandardMaterial({ color, roughness: .73 })
const wood = material('#9b6b46')
const trim = material('#5b3d2b')
const upholstery = material('#718b79')
const fabricAccent = material('#5f756a')

function catalogMeshes(high: boolean) {
  const segments = high ? 4 : 1
  const radial = high ? 64 : 20
  function add(group: Group, geo: RoundedBoxGeometry | CylinderGeometry, mat: MeshStandardMaterial,
    x: number, y: number, z: number, rotation = 0) {
    const mesh = new Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.rotation.x = rotation
    group.add(mesh)
  }
  function padded(group: Group, mat: MeshStandardMaterial, position: [number, number, number],
    size: [number, number, number], radius: number, rotation = 0) {
    add(group, new RoundedBoxGeometry(...size, segments, radius), mat, ...position, rotation)
  }

  const chair = new Group()
  padded(chair, trim, [0, .20, 0], [.78, .11, .73], .025)
  padded(chair, upholstery, [0, .62, -.285], [.72, .55, .17], .066, -.10)
  padded(chair, upholstery, [0, .315, .045], [.57, .18, .62], .070)
  for (const x of [-.349, .349]) {
    padded(chair, fabricAccent, [x, .42, .003], [.13, .29, .73], .051)
    for (const z of [-.27, .27]) add(chair, new CylinderGeometry(.036, .023, .15, radial), trim, x * .88, .075, z)
  }

  const console = new Group()
  padded(console, wood, [0, .41, 0], [1.30, .54, .39], .03)
  padded(console, wood, [0, .70, 0], [1.34, .076, .44], .015)
  for (const x of [-.416, 0, .416]) {
    padded(console, wood, [x, .413, .205], [.406, .47, .047], .018)
    padded(console, trim, [x, .531, .236], [.102, .014, .022], .006)
  }
  for (const x of [-.55, .55]) for (const z of [-.15, .15]) {
    add(console, new CylinderGeometry(.031, .023, .16, radial), trim, x, .08, z)
  }

  const table = new Group()
  add(table, new CylinderGeometry(.26, .249, .055, radial), wood, 0, .463, 0)
  add(table, new CylinderGeometry(.121, .165, .44, radial), trim, 0, .22, 0)
  if (high) for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2
    add(table, new CylinderGeometry(.008, .011, .416, 8), wood, Math.cos(angle) * .143, .226, Math.sin(angle) * .143, Math.sin(angle) * .1)
  }
  return { 'luna-armchair': chair, 'pera-console': console, 'ada-side-table': table }
}

for (const variant of ['web', 'render'] as const) {
  const directory = new URL(variant === 'web' ? '../public/models/' : '../assets/models/', import.meta.url)
  await mkdir(fileURLToPath(directory), { recursive: true })
  for (const [id, object] of Object.entries(catalogMeshes(variant === 'render'))) {
    const binary = await new GLTFExporter().parseAsync(object, { binary: true })
    if (!(binary instanceof ArrayBuffer)) throw new Error('Beklenen GLB çıktısı alınamadı.')
    await writeFile(fileURLToPath(new URL(`${id}.v1.${variant}.glb`, directory)), Buffer.from(binary))
  }
}
