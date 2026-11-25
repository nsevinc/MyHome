import { Canvas, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, MathUtils, PerspectiveCamera, SphereGeometry, SRGBColorSpace, TextureLoader } from 'three'
import type { Texture } from 'three'

function Panorama({ source, onLoad }: { source: string; onLoad: (loaded: boolean) => void }) {
  const { camera, gl, invalidate, size } = useThree()
  const geometry = useMemo(() => new SphereGeometry(30, 48, 28).rotateY(Math.PI / 2), [])
  const [texture, setTexture] = useState<Texture>()
  const pose = useRef({ yaw: 0, pitch: 0, field: 75 })

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    let active = true
    const image = new TextureLoader().load(source, image => {
      if (active) { image.colorSpace = SRGBColorSpace; setTexture(image); onLoad(true); invalidate() }
    }, undefined, () => { if (active) onLoad(false) })
    return () => { active = false; image.dispose() }
  }, [source, invalidate, onLoad])

  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const view = gl.domElement
    let start: { x: number; y: number; id: number } | undefined
    view.tabIndex = 0
    view.setAttribute('aria-label', 'Etkileşimli 360° panorama')
    camera.position.set(0, 0, 0)
    const update = () => {
      const { yaw, pitch, field } = pose.current
      const horizontal = MathUtils.degToRad(yaw), vertical = MathUtils.degToRad(pitch)
      camera.lookAt(Math.sin(horizontal) * Math.cos(vertical), Math.sin(vertical), -Math.cos(horizontal) * Math.cos(vertical))
      // Cap the field along the longest side so wide panels cannot turn the initial view into an ultra-wide lens.
      const aspect = Math.max(1, size.width / Math.max(1, size.height))
      camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(field / 2)) / aspect))
      camera.updateProjectionMatrix()
      invalidate()
    }
    function down(event: PointerEvent) {
      if (event.button !== 0) return
      view.focus({ preventScroll: true })
      view.setPointerCapture(event.pointerId)
      start = { x: event.clientX, y: event.clientY, id: event.pointerId }
    }
    function turn(dx: number, dy: number) {
      pose.current.yaw = (pose.current.yaw + dx) % 360
      pose.current.pitch = Math.max(-87, Math.min(87, pose.current.pitch + dy))
      update()
    }
    function move(event: PointerEvent) {
      if (start?.id !== event.pointerId) return
      turn((start.x - event.clientX) * .23, (event.clientY - start.y) * .23)
      start = { x: event.clientX, y: event.clientY, id: event.pointerId }
    }
    const stop = () => { start = undefined }
    const keys: Record<string, [number, number]> = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, 8], ArrowDown: [0, -8] }
    function key(event: KeyboardEvent) {
      if (event.key === 'Home') {
        event.preventDefault()
        pose.current = { yaw: 0, pitch: 0, field: 75 }
        update()
        return
      }
      const vector = keys[event.key]
      if (!vector) return
      event.preventDefault()
      turn(...vector)
    }
    function wheel(event: WheelEvent) {
      event.preventDefault()
      pose.current.field = Math.max(30, Math.min(90, pose.current.field + Math.sign(event.deltaY) * 5))
      update()
    }
    view.addEventListener('pointerdown', down)
    view.addEventListener('pointermove', move)
    view.addEventListener('lostpointercapture', stop)
    view.addEventListener('keydown', key)
    view.addEventListener('wheel', wheel, { passive: false })
    update()
    return () => {
      view.removeEventListener('pointerdown', down)
      view.removeEventListener('pointermove', move)
      view.removeEventListener('lostpointercapture', stop)
      view.removeEventListener('keydown', key)
      view.removeEventListener('wheel', wheel)
    }
  }, [camera, gl, invalidate, size.width, size.height])

  return texture ? <mesh geometry={geometry} scale={[-1, 1, 1]}>
    <meshBasicMaterial map={texture} side={BackSide} toneMapped={false} />
  </mesh> : null
}

export default function PanoramaViewer({ source }: { source: string }) {
  const [status, setStatus] = useState<{ source: string; loaded: boolean }>()
  const onLoad = useCallback((loaded: boolean) => setStatus({ source, loaded }), [source])
  if (status?.source === source && !status.loaded) return <p role="alert">Panorama görüntüsü yüklenemedi.</p>
  return <>
    <div className="panorama-viewer" aria-busy={status?.source !== source}>
      <Canvas frameloop="demand" dpr={1} camera={{ near: .05, far: 60, fov: 45 }}
        gl={{ powerPreference: 'low-power' }} fallback={<p>Panoramayı çevirmek için WebGL 2 gerekiyor.</p>}>
        <Panorama key={source} source={source} onLoad={onLoad} />
      </Canvas>
    </div>
    <p className="meta">Sürükleyerek veya ok tuşlarıyla etrafa bakın. Fare tekerleğiyle yakınlaşın. Home tuşuyla başlangıca dönün.</p>
  </>
}
