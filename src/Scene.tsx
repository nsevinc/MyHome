import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Component, Fragment, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Box3, BoxGeometry, BufferGeometry, CylinderGeometry, DataTexture, DoubleSide, EdgesGeometry, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, MeshStandardMaterial, Object3D, PerspectiveCamera, SphereGeometry,
  NoColorSpace, RepeatWrapping, Shape, SRGBColorSpace, TextureLoader, Vector2, Vector3 } from 'three'
import type { Group, Material, Mesh, Texture } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Aperture, Camera, DoorOpen, Footprints, Layers3, Lightbulb, Magnet, Move, Scan } from 'lucide-react'
import { itemBottom, moveAlongWall, placement, roomEdges, wallMountPose } from './geometry'
import { dragWallTarget, movedPose, wallDropWarning } from './furniture-gestures'
import type { Box } from './geometry'
import type { LedStrip } from './cabinet-led'
import { appearanceTextures, fmt, furnitureAngle, normalizeAngle, uid } from './model'
import type { Appearance, Furniture, Project, RoomLight, SurfaceTexture, Wardrobe } from './model'
import type { Selection } from './selection'
import { selectedFurniture } from './group-placement'
import { catalogUrl } from './catalog'
import { activeLighting, changeLighting } from './lighting'
import { defaultCamera, makePointLight, nearWalls, projectCamera, renderFurnitureParts, sceneData } from './scene-data'
import { levelCamera, sameCamera, setCameraProjection } from './camera-pose'
import { HandleProjection, SceneHandles } from './SceneHandles'
import type { Handle, HandleId, HandleMove } from './SceneHandles'
import type { CopyControls, CopySide } from './adjacent-copy'
import { download, projectFilename } from './storage'
import { appearanceFor } from './object-appearance'
import { snapFurniture } from './layout'
import { CameraPanel } from './CameraPanel'
import type { SnapGuide } from './layout'
import { cabinetDoorClearance, cabinetDoors, doorCollisionText, isCabinetDoorBox, localToRoom, movedDoorPoint, openDoor } from './wardrobe'
import type { Finish } from './materials'
import { roomWalk } from './room-walk'
import type { WalkPose } from './room-walk'
import { WalkRig } from './WalkRig'
import { motionFromHandle } from './furniture-motion'
import type { MotionTrial } from './furniture-motion'
import type { FurnitureFocus } from './room-item-view'

type CameraState = NonNullable<Project['camera']>
type SceneData = ReturnType<typeof sceneData>
type RoomElements = { wallLayers: RefObject<Group | null>; ceiling: RefObject<Mesh | null>; overlay: RefObject<Group | null> }
type Pose = Pick<Furniture, 'x' | 'z' | 'angle' | 'mount'>

function AlignmentGuides({ guides, height }: { guides: SnapGuide[]; height: number }) {
  const points = useMemo(() => new Float32Array(guides.flatMap(guide => {
    const [at, low, high] = [guide.at, guide.low - 60, guide.high + 60].map(value => value / 1000)
    return guide.axis === 'x' ? [at, height, low, at, height, high] : [low, height, at, high, height, at]
  })), [guides, height])
  return <lineSegments renderOrder={9}><bufferGeometry><bufferAttribute attach="attributes-position" args={[points, 3]} /></bufferGeometry>
    <lineBasicMaterial color="#237b99" depthTest={false} />
  </lineSegments>
}

function CameraAimLine({ position, target }: Pick<CameraState, 'position' | 'target'>) {
  const points = useMemo(() => new Float32Array([...position, ...target]), [position, target])
  return <lineSegments renderOrder={9} frustumCulled={false}><bufferGeometry>
    <bufferAttribute attach="attributes-position" args={[points, 3]} />
  </bufferGeometry><lineBasicMaterial color="#237b99" depthTest={false} depthWrite={false} /></lineSegments>
}

function ItemOutline({ item, bottom, radius, warning }: { item: Furniture; bottom: number; radius: number; warning: boolean }) {
  const [width, height, depth] = [item.width, item.height, item.depth].map(value => value / 1000)
  const outline = useMemo(() => {
    const box = new BoxGeometry(width + .018, height + .018, depth + .018)
    const edges = new EdgesGeometry(box)
    box.dispose()
    return edges
  }, [width, height, depth])
  useEffect(() => () => outline.dispose(), [outline])
  const color = warning ? '#c47a2e' : '#267e62'
  return <group position={[item.x / 1000, bottom / 1000, item.z / 1000]}>
    <lineSegments position={[0, height / 2, 0]} rotation={[0, -furnitureAngle(item) * Math.PI / 180, 0]} renderOrder={10}>
      <primitive object={outline} attach="geometry" /><lineBasicMaterial color={color} depthTest={false} depthWrite={false} />
    </lineSegments>
    {!item.mount && <mesh position={[0, .035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - .016, radius + .016, 64]} /><meshBasicMaterial color={color} side={DoubleSide} />
    </mesh>}
  </group>
}

function editingView(project: Project, camera: CameraState) {
  const overview = defaultCamera(project)
  const [x, y, z] = overview.target
  const span = (overview.position[0] - x) / .8
  const positions = [camera.position, camera.target, ...activeLighting(project.style).lights.map(light => light.position)]
  const radius = Math.max(...positions.map(([px, py, pz]) => Math.hypot(px - x, py - y, pz - z)))
  if (radius < span * .85) return overview
  const verticalCenter = (Math.max(project.height / 1000, ...positions.map(point => point[1]))
    + Math.min(0, ...positions.map(point => point[1]))) / 2
  const result: CameraState = {
    position: [x - radius * 1.18, verticalCenter + radius * 1.46, z + radius * 1.23],
    target: [x, verticalCenter, z], fov: 52,
  }
  return result
}

class GraphicsBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

function BoxMesh({ box, map, originalColors, bump = 0, normalMap, roughnessMap }: {
  box: Box; map?: Texture | null; originalColors?: boolean; bump?: number; normalMap?: Texture; roughnessMap?: Texture;
}) {
  const mapped = Boolean(map || normalMap || roughnessMap)
  const material = box.appearance ?? box.material
  const texture = appearanceTextures(box.appearance)[0]
  const preset = material?.preset
  const baseTile = texture ? (box.appearance?.tileMm ?? texture.tileMm) / 1000
    : preset === 'matte-oak' || preset === 'walnut' ? .36
    : preset === 'woven-linen' || preset === 'cotton' || preset === 'pique' ? .048 : preset === 'marble' ? .65 : 1
  const tile = material ? (material.scale ?? 1) * baseTile : 1
  const direction = (box.appearance?.direction ?? 0) * Math.PI / 180
  const local = Boolean(box.appearance) && !box.wallCovering
  const folds = box.curtain?.folds
  const sheer = box.curtain?.sheer
  const geometry = useMemo(() => {
    if (folds) {
      const positions: number[] = [], indices: number[] = [], uvs: number[] = []
      const [width, height, depth] = box.size
      const steps = folds * 10
      const cos = Math.cos(direction), sin = Math.sin(direction)
      for (let step = 0; step <= steps; step++) {
        const fraction = step / steps
        const x = (fraction - .5) * width
        const z = Math.cos(fraction * 2 * Math.PI * folds) * depth / 2
        for (const y of [-height / 2, height / 2]) {
          positions.push(x, y, z)
          uvs.push((x * cos - y * sin) / tile, (x * sin + y * cos) / tile)
        }
        const base = step * 2
        if (step < steps) indices.push(base, base + 2, base + 3, base, base + 3, base + 1)
      }
      const mesh = new BufferGeometry()
      mesh.setAttribute('position', new Float32BufferAttribute(positions, 3))
      mesh.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
      mesh.setIndex(indices)
      mesh.computeVertexNormals()
      return mesh
    }
    if (!mapped && !box.shade && !box.cylinder) return
    const mesh = box.shade ? new CylinderGeometry(.22, .5, 1, 48, 1, true).scale(...box.size) :
      box.cylinder ? new CylinderGeometry(.5, .5, 1, 40).rotateX(box.cylinder === 'front' ? Math.PI / 2 : 0).scale(...box.size) :
      box.round ? new SphereGeometry(.5, 24, 16).scale(...box.size) : new BoxGeometry(...box.size)
    if (!mapped) return mesh
    const { position, normal, uv } = mesh.attributes
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) + (local ? 0 : box.position[0])
      const y = position.getY(i) + (local ? 0 : box.position[1])
      const z = position.getZ(i) + (local ? 0 : box.position[2])
      const top = Math.abs(normal.getY(i)) > .5
      const u = top || Math.abs(normal.getX(i)) <= .5 ? x : z
      const v = top ? -z : y
      const c = Math.cos(direction), s = Math.sin(direction)
      uv.setXY(i, (u * c - v * s) / tile, (u * s + v * c) / tile)
    }
    return mesh
  }, [box.size, box.position, box.round, box.shade, box.cylinder, mapped, tile, direction, local, folds])
  useEffect(() => () => geometry?.dispose(), [geometry])
  return <mesh position={box.position} rotation={[box.pitch ?? 0, -(box.angle ?? 0), 0]} scale={box.round && !geometry ? box.size : undefined}
    castShadow={!box.glass && !sheer} receiveShadow>
    {geometry ? <primitive object={geometry} attach="geometry" /> : box.round ? <sphereGeometry args={[.5, 24, 16]} /> : <boxGeometry args={box.size} />}
    <meshStandardMaterial color={box.mirror ? '#adbdc7' : map && originalColors ? '#ffffff' : box.color}
      roughness={roughnessMap ? 1 : material?.roughness ?? (box.glass || box.mirror ? .12 : .8)}
      metalness={box.mirror ? .36 : box.surface === 'metal' && (!box.appearance || box.appearance.preset === 'original') ? .55 : 0}
      transparent={Boolean(box.glass || sheer)} opacity={box.glass ? .25 : sheer ? .48 : 1}
      depthWrite={!box.glass && !sheer} side={box.glass || box.shade || folds ? DoubleSide : undefined}
      emissive={box.emission ?? '#000000'} emissiveIntensity={box.emission ? .75 : 0}
      map={map ?? null} bumpMap={!normalMap && bump ? map ?? null : null} bumpScale={bump}
      roughnessMap={roughnessMap ?? null} normalMap={normalMap ?? null}
      normalScale={normalMap ? [material?.relief ?? 1, material?.relief ?? 1] : undefined} />
  </mesh>
}

type FinishMaps = Record<string, Texture | null>

function configureTexture(texture: Texture, flipY: boolean, dataMap = false) {
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.colorSpace = dataMap ? NoColorSpace : SRGBColorSpace
  texture.flipY = flipY
  texture.needsUpdate = true
  return texture
}

function MappedBox({ box, fallbackMap }: { box: Box; fallbackMap?: Texture | null }) {
  const appearance = box.appearance!
  const channels = [appearance.texture, appearance.roughnessMap, appearance.normalMap]
  const sources = channels.flatMap(texture => texture ? [texture.data] : [])
  const originals = useLoader(TextureLoader, sources)
  const maps = useMemo(() => {
    let index = 0
    return [Boolean(appearance.texture), Boolean(appearance.roughnessMap), Boolean(appearance.normalMap)]
      .map((enabled, channel) => enabled ? configureTexture(originals[index++].clone(), true, channel > 0) : undefined)
  }, [originals, appearance.texture, appearance.roughnessMap, appearance.normalMap])
  useEffect(() => () => maps.forEach(map => map?.dispose()), [maps])
  const [map, roughnessMap, normalMap] = maps
  return <BoxMesh box={box} map={map ?? fallbackMap} originalColors={Boolean(map && !appearance.color)}
    bump={(appearance.relief ?? 1) * .0018} roughnessMap={roughnessMap} normalMap={normalMap} />
}

function ModelMesh({ url, size, appearances, maps }: {
  url: string; size: [number, number, number]; appearances?: Furniture['appearances']; maps: FinishMaps;
}) {
  const gltf = useLoader(GLTFLoader, url)
  const sources = useMemo(() => [...new Set(Object.values(appearances ?? {}).flatMap(appearanceTextures)
    .map(texture => texture.data))], [appearances])
  const images = useLoader(TextureLoader, sources)
  const model = useMemo(() => {
    const object = gltf.scene.clone(true)
    const replacements = new Map<Material, Material>()
    const textures: Texture[] = []
    function replace(original: Material) {
      const index = gltf.parser.associations.get(original)?.materials
      const value = appearanceFor(appearances, `glb-${index ?? 'default'}`)
      if (!value) return original
      const existing = replacements.get(original)
      if (existing) return existing
      const material = value.preset === 'original' && !value.texture && (original instanceof MeshStandardMaterial ||
        original instanceof MeshBasicMaterial && !value.roughnessMap && !value.normalMap)
        ? original.clone() : new MeshStandardMaterial({
          color: original instanceof MeshStandardMaterial || original instanceof MeshBasicMaterial ? original.color : '#ffffff',
          side: original.side,
        })
      const image = value.texture ? images[sources.indexOf(value.texture.data)] : undefined
      const map = image ?? maps[value.preset] ?? material.map
      const repeatFor = (tileMm?: number) => (tileMm ? size[0] * 1000 / tileMm : 1) / (value.scale ?? 1)
      const tile = value.tileMm ?? appearanceTextures(value)[0]?.tileMm
      const adjust = (source: Texture, uploaded: boolean, dataMap = false) => {
        const clone = source.clone()
        if (uploaded || source === maps[value.preset]) configureTexture(clone, false, dataMap)
        if (uploaded) clone.channel = 0
        clone.repeat.multiplyScalar(repeatFor(uploaded ? tile : undefined))
        clone.rotation -= (value.direction ?? 0) * Math.PI / 180
        textures.push(clone)
        return clone
      }
      if (map) {
        material.map = adjust(map, Boolean(image))
        if (material instanceof MeshStandardMaterial) {
          if (image || maps[value.preset]) {
            material.bumpMap = material.map
            material.bumpScale = (value.relief ?? 1) * .002
            material.normalMap = null
          } else {
            if (material.normalMap) material.normalMap = adjust(material.normalMap, false)
            if (material.roughnessMap && value.roughness === undefined) material.roughnessMap = adjust(material.roughnessMap, false)
            material.normalScale.multiplyScalar(value.relief ?? 1)
          }
        }
      }
      if (value.color || image) material.color.set(value.color ?? '#ffffff')
      if (material instanceof MeshStandardMaterial && value.roughness !== undefined) {
        material.roughness = value.roughness
        material.roughnessMap = null
      }
      if (material instanceof MeshStandardMaterial) {
        if (value.roughnessMap) {
          material.roughnessMap = adjust(images[sources.indexOf(value.roughnessMap.data)], true, true)
          material.roughness = 1
        }
        if (value.normalMap) {
          material.normalMap = adjust(images[sources.indexOf(value.normalMap.data)], true, true)
          material.normalScale.setScalar(value.relief ?? 1)
          material.bumpMap = null
        }
      }
      replacements.set(original, material)
      return material
    }
    object.traverse(child => {
      child.castShadow = true
      child.receiveShadow = true
      const mesh = child as Mesh
      if (!mesh.isMesh || !appearances) return
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(replace) : replace(mesh.material)
    })
    const box = new Box3().setFromObject(object, true)
    const center = box.getCenter(new Vector3())
    const bounds = box.getSize(new Vector3())
    return { object, origin: [-center.x, -box.min.y, -center.z] as [number, number, number], bounds, replacements, textures }
  }, [gltf, appearances, maps, images, sources, size[0]])
  useEffect(() => () => {
    for (const material of model.replacements.values()) material.dispose()
    for (const texture of model.textures) texture.dispose()
  }, [model])
  return <group scale={[size[0] / model.bounds.x, size[1] / model.bounds.y, size[2] / model.bounds.z]}>
    <group position={model.origin}><primitive object={model.object} /></group>
  </group>
}

function finishTexture(finish: Finish | Appearance['preset']) {
  if (finish === 'plain' || finish === 'original' || finish === 'matte-lacquer' || finish === 'gloss-lacquer') return null
  const size = 128
  const data = new Uint8Array(size * size * 4)
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const noise = (Math.imul(x + 1, 15479) ^ Math.imul(z + 7, 734683)) & 31
    let shade = 246 - noise / 3
    if (finish === 'concrete') shade = 222 + noise
    if (finish === 'wood') {
      const plank = Math.floor(z / 20)
      const seam = z % 20 === 0 || (x + plank * 43) % size === 0
      shade = seam ? 211 : 246 + 7 * Math.sin(z * 1.4 + Math.sin(x / 19)) - (plank % 3) * 6 - noise / 5
    }
    if (finish === 'tile') shade = x % 64 < 2 || z % 64 < 2 ? 183 : 246 - noise / 4
    if (finish === 'matte-oak' || finish === 'walnut') {
      const across = x / size * 2 * Math.PI
      const along = z / size * 2 * Math.PI
      shade = 227 + 10 * Math.sin(7 * across + .55 * Math.sin(along)) +
        8 * Math.sin(25 * across + .7 * Math.cos(2 * along)) - noise * .3
    }
    if (finish === 'woven-linen' || finish === 'cotton' || finish === 'pique') {
      const warp = (1 + Math.sin(x / size * 2 * Math.PI * 13)) / 2
      const weft = (1 + Math.sin(z / size * 2 * Math.PI * 15)) / 2
      shade = 214 + 29 * warp * weft - noise / 5
    }
    if (finish === 'marble') {
      const u = 2 * Math.PI * x / size, v = 2 * Math.PI * z / size
      const vein = Math.abs(Math.sin(u + v + 1.1 * Math.sin(v) + .5 * Math.sin(2 * u - v)))
      shade = 245 - 61 * Math.exp(-vein * 12) - noise * .17
    }
    const i = (z * size + x) * 4
    data.set([shade, shade, shade, 255], i)
  }
  const texture = new DataTexture(data, size, size)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function useSurfaceTexture(finish: Finish = 'plain', custom?: SurfaceTexture) {
  const invalidate = useThree(state => state.invalidate)
  const fallback = useMemo(() => finishTexture(finish), [finish])
  const [loaded, setLoaded] = useState<{ data: string; texture: Texture }>()
  const data = custom?.data
  const tileMm = custom?.tileMm
  useEffect(() => () => fallback?.dispose(), [fallback])
  useEffect(() => {
    if (!data || !tileMm) {
      setLoaded(undefined)
      return
    }
    let active = true
    const pending = new TextureLoader().load(data, texture => {
      if (!active) return
      texture.wrapS = texture.wrapT = RepeatWrapping
      texture.repeat.setScalar(1000 / tileMm)
      texture.colorSpace = SRGBColorSpace
      setLoaded({ data, texture })
      invalidate()
    }, undefined, () => { if (active) setLoaded(undefined) })
    return () => { active = false; pending.dispose() }
  }, [data, tileMm, invalidate])
  return loaded && loaded.data === data ? loaded.texture : fallback
}

function Downlight({ fixture }: { fixture: NonNullable<SceneData['items'][number]['fixture']> }) {
  const target = useMemo(() => {
    const object = new Object3D()
    object.position.y = -1
    return object
  }, [])
  return <group position={fixture.position}>
    <primitive object={target} />
    <spotLight target={target} angle={Math.PI / 3} penumbra={.72} color={fixture.color} intensity={fixture.power / 3} />
  </group>
}

function ObstacleGuides({ boxes }: { boxes: Box[] }) {
  const shape = useMemo(() => new BoxGeometry(), [])
  const outline = useMemo(() => new EdgesGeometry(shape), [shape])
  useEffect(() => () => { outline.dispose(); shape.dispose() }, [shape, outline])
  return boxes.map((box, index) => <group key={index} position={box.position} scale={box.size}>
    <mesh geometry={shape}>
      <meshBasicMaterial color="#668690" transparent opacity={.08} depthWrite={false} />
    </mesh>
    <lineSegments geometry={outline} renderOrder={1}>
      <lineBasicMaterial color="#476671" transparent opacity={.36} depthWrite={false} />
    </lineSegments>
  </group>)
}

function PreviewStripLight({ strip, color, brightness }: {
  strip: LedStrip; color: string; brightness: number
}) {
  const target = useMemo(() => new Object3D(), [])
  const length = Math.max(strip.width, strip.height)
  return <group position={strip.position}>
    <primitive object={target} position={strip.normal} />
    <spotLight target={target} color={color} intensity={brightness * Math.min(length, 1.4) * .035}
      angle={1.3} penumbra={.65} distance={2.4} castShadow shadow-mapSize={[256, 256]}
      shadow-camera-near={.008} shadow-normalBias={.002} />
  </group>
}

function CabinetLighting({ light, preview }: {
  light: NonNullable<SceneData['items'][number]['cabinetLight']>; preview: Set<LedStrip>
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [], indices: number[] = []
    for (const strip of light.strips) {
      const center = new Vector3(...strip.position), normal = new Vector3(...strip.normal)
      const across = normal.y ? new Vector3(1, 0, 0) : new Vector3(0, 0, -1)
      const along = normal.cross(across).multiplyScalar(strip.height / 2)
      across.multiplyScalar(strip.width / 2)
      const i = positions.length / 3
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        positions.push(...center.clone().addScaledVector(across, x).addScaledVector(along, y).toArray())
      }
      indices.push(i, i + 1, i + 2, i, i + 2, i + 3)
    }
    const mesh = new BufferGeometry()
    mesh.setAttribute('position', new Float32BufferAttribute(positions, 3))
    mesh.setIndex(indices)
    mesh.computeVertexNormals()
    return mesh
  }, [light.strips])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <>
    <mesh geometry={geometry}><meshStandardMaterial color={light.color} emissive={light.color} emissiveIntensity={light.brightness * .055} /></mesh>
    {light.strips.map((strip, i) => preview.has(strip) &&
      <PreviewStripLight key={i} strip={strip} color={light.color} brightness={light.brightness} />)}
  </>
}

function Room({ data, edges, wallsHidden, autoWalls, editing, hideRoof, lights, elements, activeItems, selectItem, hiddenDoors,
  doorPreview, trial, trials, visibleItems, onCopyHover, selectedId }: {
  onCopyHover?: (side?: CopySide) => void;
  data: SceneData; edges: ReturnType<typeof roomEdges>; wallsHidden: Set<string>; autoWalls: boolean;
  editing: boolean; hideRoof?: boolean; lights: RoomLight[]; elements: RoomElements;
  activeItems?: ReadonlyMap<string, Furniture>; selectItem: (id: string, extend: boolean) => void; hiddenDoors: ReadonlySet<string>;
  doorPreview?: { id: string; parts: Box[] };
  trial?: MotionTrial; trials?: MotionTrial[]; visibleItems?: ReadonlySet<string>; selectedId?: string;
}) {
  const floor = useMemo(() => {
    const shape = new Shape()
    data.floor.forEach(([x, z], i) => i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z))
    shape.closePath()
    return shape
  }, [data.floor])
  const floorMap = useSurfaceTexture(data.style.floorFinish, data.style.floorTexture)
  const wallMap = useSurfaceTexture(data.style.wallFinish, data.style.wallTexture)
  const presets = ['matte-oak', 'woven-linen', 'concrete', 'tile', 'walnut', 'cotton', 'pique', 'marble'] as const
  const used = new Set([...data.boxes.map(box => box.appearance?.preset), ...data.items.flatMap(item => [
    ...item.fallback.map(box => box.appearance?.preset ?? box.material?.preset),
    ...Object.values(item.appearances ?? {}).map(value => value?.preset),
  ])])
  const finishKey = presets.filter(preset => used.has(preset)).join(',')
  const maps = useMemo<FinishMaps>(() => Object.fromEntries(finishKey.split(',').filter(Boolean)
    .map(preset => [preset, finishTexture(preset as Appearance['preset'])])), [finishKey])
  useEffect(() => () => { for (const map of Object.values(maps)) map?.dispose() }, [maps])
  const wallGroups = useMemo(() => {
    type WallLayer = { ids: string[]; boxes: Box[]; doors: Box[]; obstacles: Box[] }
    const groups = new Map<string, WallLayer>()
    function layer(ids: string[]) {
      const key = JSON.stringify(ids)
      const previous = groups.get(key)
      if (previous) return previous
      const entry: WallLayer = { ids, boxes: [], doors: [], obstacles: [] }
      groups.set(key, entry)
      return entry
    }
    for (const box of data.boxes) {
      if ('obstacleWallId' in box && box.obstacleWallId) {
        const owner = layer([box.obstacleWallId])
        owner.boxes.push(box)
        owner.obstacles.push(box)
      } else layer(box.wallIds ?? []).boxes.push(box)
    }
    for (const { wallId, ...door } of data.doors) layer([wallId]).doors.push(door)
    return groups
  }, [data.boxes, data.doors])
  useFrame(({ camera }) => {
    const automatic = autoWalls ? nearWalls(edges, [camera.position.x, camera.position.y, camera.position.z]) : null
    for (const layer of elements.wallLayers.current?.children ?? []) {
      const ids: string[] = layer.userData.wallIds
      const cut = ids.some(id => wallsHidden.has(id) || automatic?.has(id))
      layer.visible = layer.userData.obstacleGuide ? cut : !cut
    }
  })
  function paintedBox(box: Box) {
    const material = box.appearance ?? box.material
    const map = material ? maps[material.preset] : null
    const mesh = <BoxMesh box={box} map={map} bump={material ? (material.relief ?? 1) * .0018 : 0} />
    return appearanceTextures(box.appearance).length
      ? <Suspense fallback={mesh}><MappedBox box={box} fallbackMap={map} /></Suspense> : mesh
  }
  const motion = trials ?? (trial ? [trial] : [])
  // Spread the real-time shadow budget across visible cabinets; Cycles uses every diffuser.
  const previewStrips = useMemo(() => {
    const eligible = data.items.filter(item => item.cabinetLight?.strips.length && (!visibleItems || visibleItems.has(item.id))
      && (!item.cabinetLight.enclosed || hiddenDoors.has(item.id) || item.id === doorPreview?.id))
    eligible.sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId))
    const chosen = new Set<LedStrip>()
    for (let pass = 0; pass < 3; pass++) for (const item of eligible) {
      const strips = item.cabinetLight!.strips
      const index = [Math.floor(strips.length / 2), 0, strips.length - 1][pass]
      if (chosen.size < 6) chosen.add(strips[index])
    }
    return chosen
  }, [data.items, visibleItems, hiddenDoors, doorPreview?.id, selectedId])
  const fallback = (item: SceneData['items'][number]) => (item.id === doorPreview?.id ? doorPreview.parts : item.fallback).map((box, index) => {
    const hidden = isCabinetDoorBox(box) && hiddenDoors.has(item.id)
    const motionHidden = motion.some(trial => trial.item.id === item.id && trial.part.id === box.motionPart && trial.amount > 0)
    return <group key={index} visible={!hidden && !motionHidden} userData={{ editorHiddenDoor: hidden, editorMotionOriginal: motionHidden }}>
      {paintedBox(box)}
    </group>
  })
  const evening = data.style.light === 'evening'
  const warm = data.style.light !== 'day'
  const strength = data.style.lightStrength
  const bump = (data.style.surfaceRelief ?? 1) * .003
  const [centerX, centerZ] = data.floor.reduce(([sumX, sumZ], [x, z]) => [sumX + x / data.floor.length, sumZ + z / data.floor.length], [0, 0])
  const sun = data.sunDirection
  const target = useMemo(() => new Object3D(), [])
  return <>
    <color attach="background" args={[evening ? '#374a66' : warm ? '#e6d9c7' : '#dfe9e3']} />
    <hemisphereLight args={[warm ? '#fff2de' : '#fffaf0', '#7c8179', (warm ? 2.15 : 2.05) * strength]} />
    {sun && <primitive object={target} position={[centerX, 0, centerZ]} />}
    <directionalLight color={data.ambience.windowColor ?? (sun ? sun[1] < .35 ? '#ffc99c' : '#fff4df' : evening ? '#a7c1ff' : warm ? '#ffe2bd' : '#fff4df')}
      intensity={(sun ? 2.65 : evening ? .42 : warm ? 2.2 : 2.65) * (data.ambience.windowStrength ?? strength)}
      target={sun ? target : undefined}
      position={sun ? [centerX + sun[0] * 14, sun[1] * 14, centerZ + sun[2] * 14]
        : [centerX + 2.3, data.height + 5, centerZ - 1.9]} castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-9} shadow-camera-right={9}
      shadow-camera-top={9} shadow-camera-bottom={-9} shadow-normalBias={.023} />
    {lights.map(light => <pointLight key={light.id} position={light.position}
      color={light.color} intensity={light.power / 8} />)}
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[floor]} /><meshStandardMaterial
        color={floorMap && data.style.floorTexture?.originalColors ? '#ffffff' : data.style.floor} map={floorMap}
        bumpMap={bump ? floorMap : null} bumpScale={bump}
        roughness={data.style.floorFinish === 'tile' ? .48 : .82} side={DoubleSide} />
    </mesh>
    <mesh ref={elements.ceiling} visible={data.enclosed && !editing && !hideRoof} position={[0, data.height, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <shapeGeometry args={[floor]} /><meshStandardMaterial color="#eeeae1" roughness={.92} side={DoubleSide} />
    </mesh>
    <group ref={elements.wallLayers}>
      {[...wallGroups].map(([key, layer]) => <Fragment key={key}>
        <group userData={{ wallIds: layer.ids }}>
          {layer.boxes.map((box, index) => box.wallCovering || box.windowSill || box.architecturalTrim ? <group key={index}>{paintedBox(box)}</group> :
            <BoxMesh key={index} box={box} map={wallMap} originalColors={data.style.wallTexture?.originalColors} bump={bump} />)}
          {layer.doors.map((door, index) => <BoxMesh key={`door-${index}`} box={door} />)}
        </group>
        {layer.obstacles.length > 0 && <group visible={false} userData={{ wallIds: layer.ids, obstacleGuide: true }}>
          <ObstacleGuides boxes={layer.obstacles} />
        </group>}
      </Fragment>)}
    </group>
    {data.items.map(item => {
      const asset = item.asset
      const active = activeItems?.get(item.id)
      const hidden = Boolean(visibleItems && !visibleItems.has(item.id))
      return <group key={item.id} position={active ? [active.x / 1000, item.position[1], active.z / 1000] : item.position}
        rotation={[0, -(active ? furnitureAngle(active) * Math.PI / 180 : item.angle), 0]}
        visible={!hidden} userData={{ editorHiddenFurniture: hidden }}
        onPointerMove={!hidden && active && onCopyHover ? event => {
          const a = furnitureAngle(active) * Math.PI / 180
          const across = (event.point.x * 1000 - active.x) * Math.cos(a) + (event.point.z * 1000 - active.z) * Math.sin(a)
          onCopyHover(across >= 0 ? 1 : -1)
        } : undefined}
        onPointerOut={active && onCopyHover ? () => onCopyHover() : undefined}
        onClick={hidden ? undefined : event => {
          if (editing || event.delta > 3) return
          event.stopPropagation()
          selectItem(item.id, event.shiftKey)
        }}>
        {item.fixture && (item.fixture.downlightDiameter ? <Downlight fixture={item.fixture} /> :
          <pointLight position={item.fixture.position} intensity={item.fixture.power / 8} color={item.fixture.color} />)}
        {Boolean(item.cabinetLight?.strips.length) && <CabinetLighting light={item.cabinetLight!} preview={previewStrips} />}
        {asset
          ? <GraphicsBoundary key={asset.source === 'catalog' ? asset.id : asset.data.length} fallback={fallback(item)}>
            <Suspense fallback={fallback(item)}>
              <ModelMesh size={item.size} url={asset.source === 'catalog' ? catalogUrl(asset.id) : asset.data}
                appearances={item.appearances} maps={maps} />
            </Suspense>
          </GraphicsBoundary>
          : fallback(item)}
        {motion.filter(trial => trial.item.id === item.id && trial.amount > 0).map(trial => <group key={trial.part.id}
          userData={{ editorMotionPreview: true }}>
          {trial.parts.map((part, index) => <group key={index}>{paintedBox(part)}</group>)}
        </group>)}
      </group>
    })}
  </>
}

function CameraControls({ state, save, capture, onReady, renderCamera, enclosed, elements }: {
  onReady: (ready: boolean) => void;
  state: CameraState; save: (state: CameraState) => void;
  capture: RefObject<(() => Promise<Blob>) | null>; renderCamera: CameraState; enclosed: boolean; elements: RoomElements;
}) {
  const { camera, scene, gl, invalidate } = useThree()
  const controls = useRef<OrbitControls>(null)
  const saveRef = useRef(save)
  const shiftRef = useRef(state.verticalShift)
  saveRef.current = save
  shiftRef.current = state.verticalShift
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const orbit = new OrbitControls(camera, gl.domElement)
    controls.current = orbit
    orbit.minDistance = .001
    const update = () => invalidate()
    const end = () => saveRef.current(levelCamera({
      position: camera.position.toArray(), target: orbit.target.toArray(), fov: camera.fov, verticalShift: shiftRef.current,
    }))
    orbit.addEventListener('change', update)
    orbit.addEventListener('end', end)
    return () => { orbit.dispose(); controls.current = null }
  }, [camera, gl, invalidate])
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return
    camera.position.set(...state.position)
    controls.current.target.set(...state.target)
    const straight = state.verticalShift !== undefined
    controls.current.minPolarAngle = straight ? Math.PI / 2 : 0
    controls.current.maxPolarAngle = straight ? Math.PI / 2 : Math.PI
    setCameraProjection(camera, state)
    controls.current.update()
    invalidate()
  }, [camera, state, invalidate])
  useLayoutEffect(() => {
    capture.current = () => {
      if (!(camera instanceof PerspectiveCamera)) return Promise.reject(new Error('Kamera hazırlanıyor.'))
      const width = 1920, height = 1080
      const size = gl.getSize(new Vector2())
      const pixelRatio = gl.getPixelRatio()
      const exportCamera = camera.clone()
      exportCamera.position.set(...renderCamera.position)
      exportCamera.lookAt(...renderCamera.target)
      exportCamera.aspect = width / height
      setCameraProjection(exportCamera, renderCamera)
      return new Promise<Blob>((resolve, reject) => {
        const visibility = new Map<Object3D, boolean>()
        for (const item of elements.wallLayers.current?.children ?? []) {
          visibility.set(item, item.visible)
          item.visible = !item.userData.obstacleGuide
        }
        scene.traverse(object => {
          if (!object.userData.editorHiddenDoor && !object.userData.editorMotionOriginal && !object.userData.editorMotionPreview
            && !object.userData.editorHiddenFurniture) return
          visibility.set(object, object.visible)
          object.visible = !object.userData.editorMotionPreview
        })
        const roof = elements.ceiling.current
        if (roof) {
          visibility.set(roof, roof.visible)
          roof.visible = enclosed
        }
        const overlay = elements.overlay.current
        if (overlay) {
          visibility.set(overlay, overlay.visible)
          overlay.visible = false
        }
        try {
          gl.setPixelRatio(1)
          gl.setSize(width, height, false)
          gl.render(scene, exportCamera)
          gl.domElement.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG oluşturulamadı.')), 'image/png')
        } finally {
          for (const [item, visible] of visibility) item.visible = visible
          gl.setPixelRatio(pixelRatio)
          gl.setSize(size.x, size.y, false)
          invalidate()
        }
      })
    }
    return () => { capture.current = null }
  }, [camera, gl, scene, invalidate, capture, renderCamera, enclosed, elements])
  useEffect(() => {
    onReady(Boolean(capture.current))
    return () => onReady(false)
  }, [capture, camera, onReady])
  return null
}

const noHiddenItems = new Set<string>()
export function ScenePreview({ project, inspection }: { project: Project; inspection?: {
  trials: MotionTrial[]; reading: import('./usage-route').RouteReading; warning: boolean;
} }) {
  const data = useMemo(() => sceneData(project), [project])
  const edges = useMemo(() => roomEdges(project.walls), [project.walls])
  const wallLayers = useRef<Group>(null)
  const ceiling = useRef<Mesh>(null)
  const overlay = useRef<Group>(null)
  const fallback = <p className="canvas-message">3B önizleme için WebGL 2 gerekiyor.</p>
  return <div className="design-preview">
    <GraphicsBoundary fallback={fallback}>
      <Canvas shadows frameloop="demand" dpr={1} gl={{ powerPreference: 'low-power' }} fallback={fallback}
        camera={{ near: .035, far: 180 }}>
        <Room data={data} edges={edges} autoWalls={Boolean(inspection)} wallsHidden={noHiddenItems}
          editing={false} lights={data.style.lights} elements={{ wallLayers, ceiling, overlay }}
          hiddenDoors={noHiddenItems} hideRoof={Boolean(inspection)} trials={inspection?.trials} selectItem={() => {}} />
        {inspection && <UsageMarker reading={inspection.reading} warning={inspection.warning} />}
        <FixedCamera state={data.camera} />
      </Canvas>
    </GraphicsBoundary>
  </div>
}

function UsageMarker({ reading: { at, start, end, width }, warning }:
  Omit<NonNullable<Parameters<typeof ScenePreview>[0]['inspection']>, 'trials'>) {
  const color = warning ? '#c8412e' : '#0a9b86'
  return <group>
    <mesh position={[at.x / 1000, .105, at.z / 1000]} renderOrder={5}>
      <sphereGeometry args={[.075, 16, 12]} /><meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
    </mesh>
    {width > 0 && <mesh position={[(start.x + end.x) / 2000, .065, (start.z + end.z) / 2000]}
      rotation={[0, -Math.atan2(end.z - start.z, end.x - start.x), 0]} renderOrder={4}>
      <boxGeometry args={[width / 1000, .025, .043]} /><meshBasicMaterial color={color} depthTest={false} depthWrite={false} />
    </mesh>}
  </group>
}

function FixedCamera({ state }: { state: CameraState }) {
  const { camera, invalidate } = useThree()
  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.position.set(...state.position)
    camera.lookAt(...state.target)
    setCameraProjection(camera, state)
    invalidate()
  }, [camera, invalidate, state])
  return null
}

export default function Scene({ project, saveCamera, saveImage, update, selection, select, hiddenDoors, snapPosition, setSnapPosition,
  planPreview, paired, trial, changeTrial, personal, itemFocus, visibleItems, clearItemView, copyControls }: {
  copyControls?: CopyControls;
  project: Project; saveCamera: (camera: CameraState) => void; update: (change: (project: Project) => Project) => boolean;
  saveImage?: (image: Blob, camera: CameraState) => Promise<void>;
  selection: Selection; select: (selection: Selection, extend?: boolean) => void; hiddenDoors: ReadonlySet<string>;
  snapPosition: boolean; setSnapPosition: (value: boolean) => void;
  planPreview?: Furniture[]; paired: boolean;
  trial?: MotionTrial; changeTrial: (amount: number) => void; personal: boolean;
  itemFocus?: FurnitureFocus; visibleItems?: ReadonlySet<string>; clearItemView: () => void;
}) {
  const capture = useRef<(() => Promise<Blob>) | null>(null)
  const [captureReady, setCaptureReady] = useState(false)
  const markers = useRef(new Map<HandleId, HTMLButtonElement>())
  const [hoverCopy, setHoverCopy] = useState<CopySide>()
  const startDrag = useRef<Parameters<typeof HandleProjection>[0]['startDrag']['current']>(null)
  const wallLayers = useRef<Group>(null)
  const ceiling = useRef<Mesh>(null)
  const overlay = useRef<Group>(null)
  const elements = useMemo(() => ({ wallLayers, ceiling, overlay }), [])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [overviewDraft, setOverview] = useState<CameraState>()
  const [focusOrbit, setFocusOrbit] = useState<{ request: FurnitureFocus; camera: CameraState }>()
  const overview = paired || itemFocus ? undefined : overviewDraft
  const [wallsHidden, setWallsHidden] = useState<Set<string>>(() => new Set())
  const [autoWalls, setAutoWalls] = useState(false)
  const [mode, setMode] = useState<'floor' | 'height'>('floor')
  const [selected, setSelected] = useState<HandleId>('camera')
  const [draft, setDraft] = useState<HandleMove>()
  const [itemDraft, setItemDraft] = useState<{ id: string; pose: Pose; guides: SnapGuide[]; blocked?: string }>()
  const [doorDraft, setDoorDraft] = useState<{ id: string; wardrobe: Wardrobe }>()
  const [showDoorHandles, setShowDoorHandles] = useState(false)
  const [snap, setSnap] = useState(false)
  const [graphicsReady, setGraphicsReady] = useState(false)
  const [cameraPanel, setCameraPanel] = useState(false)
  const [walkStart, setWalkStart] = useState<WalkPose>()
  useEffect(() => {
    setFocusOrbit(undefined)
    if (!itemFocus) return
    setOverview(undefined)
    setWalkStart(undefined)
    setCameraPanel(false)
    setDraft(undefined)
    setItemDraft(undefined)
    setDoorDraft(undefined)
  }, [itemFocus])
  const walkCapture = useRef<(() => CameraState) | null>(null)
  const exitWalk = useCallback(() => setWalkStart(undefined), [])
  const walkSpace = useMemo(() => walkStart ? roomWalk(project) : undefined, [project, walkStart])
  const camera = useMemo(() => projectCamera(project), [project])
  const itemCamera = itemFocus && (focusOrbit?.request === itemFocus ? focusOrbit.camera : itemFocus.camera)
  const editorCamera = itemCamera ?? overview ?? camera
  const data = useMemo(() => sceneData({ ...project, camera }), [project, camera])
  const edges = useMemo(() => roomEdges(project.walls), [project.walls])
  const lights = data.style.lights
  const renderHandles: Handle[] = [
    { id: 'camera', label: 'Render kamerasını', position: camera.position },
    { id: 'target', label: 'Kamera hedefini', position: camera.target },
    ...lights.map(light => ({ id: `light:${light.id}` as const, label: light.name, position: light.position })),
  ]
  const selectedItem = useMemo(() => {
    const item = selection.kind === 'item' && !overview ? project.items.find(item => item.id === selection.id) : undefined
    return item && wallMountPose(item, edges)
  }, [selection, overview, project.items, edges])
  const selectedPreview = selectedItem && planPreview?.find(item => item.id === selectedItem.id)
  const activeItem = selectedPreview ??
    (selectedItem && itemDraft?.id === selectedItem.id ? { ...selectedItem, ...itemDraft.pose } : selectedItem)
  const group = useMemo(() => !overview && selection.kind === 'items'
    ? selectedFurniture(project.items, selection.ids).map(item => wallMountPose(item, edges)) : [],
  [overview, selection, project.items, edges])
  const movedItems = new Map(planPreview?.map(item => [item.id, item]))
  if (activeItem) movedItems.set(activeItem.id, activeItem)
  const activeGroup = group.map(item => movedItems.get(item.id) ?? item)
  const activeBottom = activeItem ? itemBottom(activeItem, project.height) : 0
  const radius = activeItem ? Math.hypot(activeItem.width, activeItem.depth) / 2000 + .19 : 0
  const itemAngle = activeItem ? furnitureAngle(activeItem) : 0
  const itemHandles: Handle[] = activeItem && !activeItem.curtain && !activeItem.locked ? [
    { id: 'item-move', label: 'Eşyayı taşı',
      position: [activeItem.x / 1000, activeItem.kind === 'pendant' ? activeBottom / 1000 - .08 :
        (activeBottom + activeItem.height) / 1000 + .10, activeItem.z / 1000] },
  ] : []
  if (activeItem && !activeItem.mount && !activeItem.locked) {
    itemHandles.push({ id: 'item-rotate', label: 'Eşyayı döndür', pivot: [activeItem.x / 1000, activeItem.z / 1000], angleStep: snap ? 15 : 1,
      position: [activeItem.x / 1000 + radius * Math.cos(itemAngle * Math.PI / 180), activeBottom / 1000 + .035,
        activeItem.z / 1000 + radius * Math.sin(itemAngle * Math.PI / 180)] })
  }
  const canHandleDoors = Boolean(activeItem?.wardrobe && !activeItem.locked && activeItem.wardrobe.motion !== 'sliding'
    && activeItem.wardrobe.pose !== 'none' && !hiddenDoors.has(activeItem.id))
  const previewCabinet = activeItem && doorDraft?.id === activeItem.id ? { ...activeItem, wardrobe: doorDraft.wardrobe } : undefined
  const leafHandles = activeItem && canHandleDoors && showDoorHandles ? cabinetDoors(previewCabinet ?? activeItem).map(door => {
    const pivot = localToRoom(activeItem, door.hinge)
    const marker = localToRoom(activeItem, movedDoorPoint(door, { x: door.hinge.x + door.side * door.width * .82, z: door.hinge.z }))
    return { id: `door:${door.index}` as const, label: `${door.label} · Aç veya kapat`,
      position: [marker.x / 1000, (activeBottom + door.handleY + door.height * .05) / 1000, marker.z / 1000],
      pivot: [pivot.x / 1000, pivot.z / 1000], angleDirection: door.side, angleStep: 2 } satisfies Handle
  }) : []
  itemHandles.push(...leafHandles)
  const copies = activeItem && copyControls?.sourceId === activeItem.id && !walkStart && !itemDraft && !doorDraft && !trial ? copyControls : undefined
  if (activeItem && copies) for (const { side } of copies.options) {
    const p = localToRoom(activeItem, { x: side * (activeItem.width / 2 + 50), z: activeItem.depth / 2 })
    itemHandles.push({ id: side === 1 ? 'copy-right' : 'copy-left', label: side === 1 ? 'Sağa bitişik kopyala' : 'Sola bitişik kopyala',
      position: [p.x / 1000, (activeBottom + activeItem.height * .65) / 1000, p.z / 1000],
      activate: () => copies.add(side), hot: hoverCopy === side })
  }
  const currentTrial = !overview && !walkStart && !itemDraft && !selectedPreview ? trial : undefined
  if (currentTrial) {
    const { handle, forward, part } = currentTrial
    itemHandles.push({ id: 'item-motion', label: `${part.name} açılımını sürükle`,
      position: [handle.x / 1000, handle.y / 1000, handle.z / 1000], dragMode: part.pivot ? 'height' : 'floor',
      keyAxis: part.pivot ? [0, 1, 0] : [forward.x, 0, forward.z] })
  }
  const handles = overview ? renderHandles : itemHandles
  const liveHandles = handles.map(handle => handle.id === draft?.id ? { ...handle, position: draft.position } : handle)
  const liveLights = lights.map(light => `light:${light.id}` === draft?.id ? { ...light, position: draft.position } : light)
  const currentHandle = liveHandles.find(handle => handle.id === selected) ?? liveHandles[0]
  const fit = activeItem && placement(project, activeItem, edges)
  const doorPreview = previewCabinet && { id: previewCabinet.id,
    parts: renderFurnitureParts(previewCabinet, project.style.colorSaturation) }
  const doorDiagnostics = useMemo(() => selectedItem && showDoorHandles ?
    cabinetDoorClearance(project, selectedItem, edges) : [], [selectedItem, showDoorHandles, project, edges])
  const activeDoor = currentHandle?.id.startsWith('door:') && activeItem
    ? cabinetDoors(previewCabinet ?? activeItem)[Number(currentHandle.id.slice(5))] : undefined
  const activeCollision = activeDoor && doorDiagnostics[activeDoor.index]?.hit

  function changedDoor(move: HandleMove) {
    if (!selectedItem?.wardrobe || !move.id.startsWith('door:')) return
    const index = Number(move.id.slice(5))
    const door = cabinetDoors(selectedItem)[index]
    if (!door) return
    const pivot = localToRoom(selectedItem, door.hinge)
    const x = move.position[0] * 1000 - pivot.x, z = move.position[2] * 1000 - pivot.z
    if (Math.hypot(x, z) < 5) return
    const base = furnitureAngle(selectedItem) + (door.side < 0 ? 180 : 0)
    const angle = normalizeAngle((Math.atan2(z, x) * 180 / Math.PI - base) * door.side)
    const limited = Math.min(door.limit, angle > 180 ? 0 : angle)
    if (limited !== door.angle) return openDoor(selectedItem.wardrobe, index, limited)
    return selectedItem.wardrobe
  }
  function poseOf(move: HandleMove): { pose: Pose; guides: SnapGuide[]; blocked?: string } | undefined {
    if (!selectedItem || selectedItem.locked || selectedItem.curtain || !move.position.every(Number.isFinite)) return
    const [x, , z] = move.position
    if (move.id === 'item-rotate') {
      if (selectedItem.mount) return
      const dx = x - selectedItem.x / 1000, dz = z - selectedItem.z / 1000
      if (Math.hypot(dx, dz) < .04) return
      const angle = Math.atan2(dz, dx) * 180 / Math.PI
      return { pose: { x: selectedItem.x, z: selectedItem.z, angle: normalizeAngle(snap ? Math.round(angle / 15) * 15 : angle) }, guides: [] }
    }
    const safeCoordinate = (value: number) => Math.max(-200000, Math.min(200000, Math.round(value * 1000)))
    const target = { x: safeCoordinate(x), z: safeCoordinate(z) }
    const aimed = dragWallTarget(selectedItem, target, edges, 190)
    const posed = wallMountPose(aimed.item, edges)
    const result = snapPosition && !move.free ? snapFurniture(project, posed, edges, 50) : { position: posed, guides: [] }
    const next = moveAlongWall(posed, result.position, edges)
    return { pose: { x: next.x, z: next.z, mount: next.mount, angle: next.angle }, guides: result.guides,
      blocked: aimed.destination && wallDropWarning(project, next, edges) }
  }
  function previewHandle(move?: HandleMove) {
    if (overview) { setDraft(move); return }
    if (move?.id === 'item-motion' && currentTrial) { changeTrial(motionFromHandle(currentTrial, move.position)); return }
    if (move?.id.startsWith('door:')) {
      const wardrobe = changedDoor(move)
      if (selectedItem && wardrobe) setDoorDraft({ id: selectedItem.id, wardrobe })
      return
    }
    setDoorDraft(undefined)
    const next = move && poseOf(move)
    setItemDraft(selectedItem && next ? { id: selectedItem.id, ...next } : undefined)
  }
  function commit(move: HandleMove) {
    if (move.id === 'item-motion' && currentTrial) { changeTrial(motionFromHandle(currentTrial, move.position)); return }
    if (!overview && selectedItem) {
      if (move.id.startsWith('door:')) {
        const wardrobe = changedDoor(move)
        if (wardrobe && wardrobe !== selectedItem.wardrobe) {
          update(current => ({ ...current, items: current.items.map(item => item.id === selectedItem.id ? { ...item, wardrobe } : item) }))
        }
        return
      }
      const next = poseOf(move)
      if (!next) return
      const { pose, blocked } = next
      if (blocked) { setNotice(blocked); return }
      if (!movedPose(selectedItem, wallMountPose({ ...selectedItem, ...pose }, edges))) return
      setNotice('')
      update(current => ({ ...current, items: current.items.map(item => item.id === selectedItem.id ? { ...item, ...pose } : item) }))
      return
    }
    const position = move.position.map(value => Math.round(value * 1000) / 1000) as HandleMove['position']
    if (!position.every(Number.isFinite) || handles.find(handle => handle.id === move.id)?.position.every((value, i) => value === position[i])) return
    update(current => {
      if (move.id.startsWith('light:')) {
        const movedLights = activeLighting(current.style).lights.map(light =>
          `light:${light.id}` === move.id ? { ...light, position } : light)
        return { ...current, style: changeLighting(current.style, { lights: movedLights }) }
      }
      const currentCamera = projectCamera(current)
      return { ...current, camera: levelCamera({ ...currentCamera, [move.id === 'camera' ? 'position' : 'target']: position }) }
    })
  }
  function addLight() {
    const light = makePointLight(project, lights.length)
    if (update(current => ({ ...current, style: changeLighting(current.style, { lights: [...activeLighting(current.style).lights, light] }) }))) {
      setSelected(`light:${light.id}`)
    }
  }
  const fallback = <div className="canvas-message">3B önizleme için WebGL 2 gerekiyor. Çiziminizi 2B planda düzenleyebilirsiniz.</div>
  return <div className="scene">
    <div className="scene-viewport">
    <div className={`scene-frame${walkStart ? ' walking' : ''}`}><GraphicsBoundary fallback={fallback}>
      <Canvas shadows frameloop="demand" dpr={[1, 1.35]} gl={{ powerPreference: 'low-power' }} fallback={fallback}
        camera={{ near: .035, far: 180, fov: 43 }} onCreated={({ gl }) => { gl.outputColorSpace = SRGBColorSpace; setGraphicsReady(true) }}>
        <Room data={walkStart ? { ...data, enclosed: true } : data} edges={edges} autoWalls={!walkStart && (autoWalls || Boolean(itemFocus))}
          wallsHidden={walkStart ? noHiddenItems : wallsHidden} editing={!walkStart && Boolean(overview)}
          lights={liveLights} elements={elements} activeItems={movedItems} hiddenDoors={walkStart ? noHiddenItems : hiddenDoors}
          doorPreview={walkStart ? undefined : doorPreview} trial={currentTrial} hideRoof={Boolean(itemFocus)}
          visibleItems={walkStart ? undefined : visibleItems} selectedId={activeItem?.id}
          onCopyHover={copies?.options.length ? setHoverCopy : undefined}
          selectItem={(id, extend) => { if (!walkStart) { setItemDraft(undefined); setDoorDraft(undefined); select({ kind: 'item', id }, extend) } }} />
        <group ref={overlay} visible={!walkStart}>
          {overview && <CameraAimLine position={draft?.id === 'camera' ? draft.position : camera.position}
            target={draft?.id === 'target' ? draft.position : camera.target} />}
          {activeItem && <>
            <ItemOutline item={activeItem} bottom={activeBottom} radius={radius} warning={Boolean(fit?.warning.length)} />
            {itemDraft?.id === activeItem.id && itemDraft.guides.length > 0 &&
              <AlignmentGuides guides={itemDraft.guides} height={activeBottom / 1000 + .025} />}
          </>}
          {activeGroup.map(item => <ItemOutline key={item.id} item={item} bottom={itemBottom(item, project.height)}
            radius={Math.hypot(item.width, item.depth) / 2000 + .19} warning={false} />)}
        </group>
        {walkStart && walkSpace ? <WalkRig initial={walkStart} space={walkSpace} capture={walkCapture} exit={exitWalk} />
          : <CameraControls state={editorCamera} save={next => {
          if (sameCamera(editorCamera, next)) return
          if (itemFocus) setFocusOrbit({ request: itemFocus, camera: next })
          else if (overview) setOverview(next)
          else saveCamera(next)
        }} capture={capture} onReady={setCaptureReady}
          renderCamera={camera} enclosed={data.enclosed} elements={elements} />}
        {!walkStart && liveHandles.length > 0 && <HandleProjection handles={liveHandles} elements={markers} startDrag={startDrag} />}
      </Canvas>
      {!walkStart && currentHandle && <SceneHandles key={selectedItem?.id ?? 'render'} handles={liveHandles} elements={markers}
        startDrag={startDrag} mode={overview ? mode : 'floor'} selected={currentHandle.id}
        select={setSelected} preview={previewHandle} commit={commit} />}
      {!walkStart && !overview && !itemFocus && cameraPanel && <CameraPanel camera={camera} views={project.cameraViews ?? []}
        personal={personal}
        change={camera => update(current => ({ ...current, camera }))}
        saveView={view => update(current => ({ ...current, cameraViews: [...(current.cameraViews ?? []), view] }))}
        close={() => setCameraPanel(false)} />}
    </GraphicsBoundary></div>
    </div>
    <div className="scene-tools">
      <button aria-pressed={Boolean(walkStart)} disabled={!graphicsReady} onClick={() => {
        setNotice('')
        if (walkStart) { exitWalk(); return }
        const start = roomWalk(project).startingPose()
        if (!start) { setNotice('Odada yürüyüşe başlamak için yeterli boş alan bulunamadı.'); return }
        clearItemView()
        setOverview(undefined)
        setCameraPanel(false)
        setDraft(undefined)
        setItemDraft(undefined)
        setDoorDraft(undefined)
        setWalkStart(start)
      }}><Footprints size={16} /> {walkStart ? 'Turu bitir' : 'Odayı dolaş'}</button>
      {walkStart ? <>
        <button className="primary" disabled={(project.cameraViews?.length ?? 0) >= 12} onClick={() => {
          const camera = walkCapture.current?.()
          if (!camera) return
          update(current => {
            const saved = current.cameraViews ?? []
            if (saved.length >= 12) return current
            let number = 1
            while (saved.some(view => view.name === `Oda turu ${number}`)) number++
            return { ...current, camera, cameraViews: [...saved, { id: uid(), name: `Oda turu ${number}`, camera }] }
          })
          setNotice('Bakış kamera olarak kaydedildi.')
        }}><Camera size={16} /> Bu bakışı kaydet</button>
        <span className="meta">WASD veya ok tuşlarıyla yürü, fareyi sürükleyerek bak.</span>
      </> : <>
      {!paired && <button aria-pressed={Boolean(overview || itemFocus)} disabled={!graphicsReady} onClick={() => {
        setDraft(undefined)
        setItemDraft(undefined)
        setDoorDraft(undefined)
        if (itemFocus) { clearItemView(); return }
        setOverview(overview ? undefined : editingView(project, camera))
      }}><Move size={16} /> {overview || itemFocus ? 'Kameradan bak' : 'Render objelerini düzenle'}</button>}
      {!overview && <>
        <button type="button" aria-pressed={cameraPanel} onClick={() => {
          if (itemFocus) clearItemView()
          setCameraPanel(!cameraPanel)
        }}><Camera size={16} /> Kamera ayarları</button>
        <button onClick={() => { if (itemFocus) clearItemView(); saveCamera(defaultCamera(project)) }}><Scan size={16} /> Üstten</button>
        <button onClick={() => { if (itemFocus) clearItemView(); saveCamera(defaultCamera(project, true)) }}><Aperture size={16} /> İç mekân</button>
        {activeItem && !activeItem.locked && !paired && <button type="button" aria-pressed={snapPosition} title="Sürüklerken Alt tuşuyla geçici olarak kapat"
          onClick={() => setSnapPosition(!snapPosition)}><Magnet size={15} /> Hizala</button>}
        {canHandleDoors && <button type="button" aria-pressed={showDoorHandles} onClick={() => {
          setShowDoorHandles(!showDoorHandles)
          setDoorDraft(undefined)
        }}><DoorOpen size={16} /> Kapak tutamaçları</button>}
        {activeItem && !activeItem.mount && !activeItem.locked && <label className="scene-snap"><input type="checkbox" checked={snap}
          onChange={event => setSnap(event.target.checked)} />15° yakala</label>}
      </>}
      {overview && <>
        <button onClick={addLight} disabled={lights.length >= 8}><Lightbulb size={16} /> Işık ekle</button>
        <div className="scene-movement">
          <select aria-label="Hareket ekseni" value={mode} onChange={event => setMode(event.target.value === 'height' ? 'height' : 'floor')}>
            <option value="floor">Yatay sürükle</option><option value="height">Yükseklik ayarla</option>
          </select>
        </div>
      </>}
      <details className="scene-walls">
        <summary><Layers3 size={16} /> Duvarlar</summary>
        <div className="scene-wall-options">
          <label><input type="checkbox" checked={autoWalls} onChange={event => setAutoWalls(event.target.checked)} /> Ön duvarları otomatik gizle</label>
          <fieldset className="scene-wall-list" disabled={autoWalls} aria-label="Tek tek duvar görünürlüğü">
            {project.walls.map((wall, index) => <label key={wall.id}>
              <input type="checkbox" checked={!wallsHidden.has(wall.id)} onChange={event => {
                const show = event.target.checked
                setWallsHidden(previous => {
                  const next = new Set(previous)
                  if (show) next.delete(wall.id)
                  else next.add(wall.id)
                  return next
                })
              }} /> {index + 1}. duvar · {wall.length / 10} cm
            </label>)}
          </fieldset>
          <button onClick={() => { setWallsHidden(new Set()); setAutoWalls(false) }}>Tüm duvarları göster</button>
        </div>
      </details>
      <button className="primary" disabled={busy || !captureReady} onClick={async () => {
        if (!capture.current) { setNotice('3B önizleme henüz hazır değil.'); return }
        setNotice('')
        setBusy(true)
        try {
          const png = await capture.current()
          download(png, `${projectFilename(project.title)}.png`)
          if (saveImage) {
            try { await saveImage(png, camera) }
            catch { setNotice('PNG indirildi. Projeye kaydedilemedi.'); return }
            setNotice('PNG proje renderlarına kaydedildi.')
          }
        }
        catch (error) { setNotice(error instanceof Error ? error.message : 'PNG oluşturulamadı.') }
        finally { setBusy(false) }
      }}><Camera size={16} /> {busy ? 'Hazırlanıyor…' : 'PNG indir'}</button>
      </>}
      {notice && <span className="notice" role="status">{notice}</span>}
    </div>
    {overview && currentHandle && <p className="scene-coordinate" aria-live="polite">{currentHandle.label} · X {Math.round(currentHandle.position[0] * 100)} · Y {Math.round(currentHandle.position[1] * 100)} · Z {Math.round(currentHandle.position[2] * 100)} cm · Render kadrajını görmek için Kameradan bak</p>}
    {!walkStart && activeItem && <p className="scene-coordinate" aria-live="polite">{activeItem.name}
      {activeItem.mount ? ` · Duvar ${edges.findIndex(edge => edge.wall.id === activeItem.mount?.wallId) + 1}` : ''}
      {` · ${itemAngle}° · X ${fmt(activeItem.x)} · Z ${fmt(activeItem.z)} cm`}
      {(itemDraft?.blocked || fit?.warning[0]) && ` · ${itemDraft?.blocked || fit?.warning[0]}`}</p>}
    {!walkStart && activeGroup.length > 0 && <p className="scene-coordinate" aria-live="polite">{activeGroup.length} eşya seçili</p>}
    {!walkStart && activeDoor && <p className="scene-coordinate" aria-live="polite">
      {activeDoor.index + 1}. kapak · {fmt(activeDoor.angle * 10)}°
      {activeCollision && ` · ${doorCollisionText(activeDoor.index, activeCollision, activeDoor.label)}`}
    </p>}
  </div>
}
