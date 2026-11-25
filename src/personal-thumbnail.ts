import { Box3, DirectionalLight, Group, HemisphereLight, Mesh, OrthographicCamera, Scene, Texture, Vector3, WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { PersonalModel } from './personal-library'
import { glbBytes } from './catalog'

// The library opens without creating WebGL contexts. Render uploaded assets serially on demand.
let renderer: WebGLRenderer | undefined
let idle: ReturnType<typeof setTimeout>
export async function renderThumbnail(entry: PersonalModel) {
  if (entry.model.source !== 'upload') throw new Error('Kişisel GLB verisi bulunamadı.')
  const gltf = await new GLTFLoader().parseAsync(glbBytes(entry.model.data).buffer, '')
  const object = gltf.scene
  try {
    clearTimeout(idle)
    renderer ??= new WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(180, 144, false)
    const scene = new Scene()
    const bounds = new Box3().setFromObject(object, true)
    const size = bounds.getSize(new Vector3())
    const group = new Group()
    group.scale.set(entry.width / 1000 / size.x, entry.height / 1000 / size.y, entry.depth / 1000 / size.z)
    object.position.sub(bounds.getCenter(new Vector3()))
    group.add(object)
    scene.add(group, new HemisphereLight(0xffffff, 0xcebeab, 2.2))
    const light = new DirectionalLight(0xfff6ed, 2.8)
    light.position.set(3, 5, 4)
    scene.add(light)
    const radius = Math.hypot(entry.width, entry.depth, entry.height) / 2000
    const camera = new OrthographicCamera(-radius * 1.25, radius * 1.25, radius, -radius, .001, radius * 8 + 1)
    camera.position.set(.57, .47, 1).normalize().multiplyScalar(radius * 3)
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
    return renderer.domElement.toDataURL('image/webp')
  } finally {
    object.traverse(child => {
      if (!(child instanceof Mesh)) return
      child.geometry.dispose()
      for (const material of [child.material].flat()) {
        for (const value of Object.values(material)) if (value instanceof Texture) value.dispose()
        material.dispose()
      }
    })
    idle = setTimeout(() => { renderer?.dispose(); renderer?.forceContextLoss(); renderer = undefined }, 5000)
  }
}
