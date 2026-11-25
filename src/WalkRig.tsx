import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { PerspectiveCamera } from 'three'
import { aimCamera } from './camera-pose'
import type { Project } from './model'
import type { WalkPose, WalkSpace } from './room-walk'

type Camera = NonNullable<Project['camera']>
const keyDirections: Record<string, 'forward' | 'back' | 'left' | 'right'> = {
  KeyW: 'forward', ArrowUp: 'forward', KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
}

function walkCamera(pose: WalkPose): Camera {
  const [x, y, z] = [pose.position.x / 1000, pose.eyeHeight / 1000, pose.position.z / 1000]
  return aimCamera({ position: [x, y, z], target: [x, y, z - 1], fov: pose.fov }, pose.yaw, pose.pitch)
}

export function WalkRig({ initial, space, capture, exit }: {
  initial: WalkPose; space: WalkSpace; capture: RefObject<(() => Camera) | null>; exit: () => void
}) {
  const { camera, gl, invalidate } = useThree()
  const pose = useRef(initial)
  const keys = useRef(new Set<string>())
  const activeSpace = useRef(space)
  activeSpace.current = space

  const sync = useCallback(() => {
    const view = walkCamera(pose.current)
    camera.position.set(...view.position)
    camera.lookAt(...view.target)
    camera.updateMatrixWorld()
    return view
  }, [camera])

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.fov = initial.fov
    camera.clearViewOffset()
    sync()
    capture.current = () => walkCamera(pose.current)
    invalidate()
    return () => { capture.current = null }
  }, [camera, initial, invalidate, capture, sync])

  useEffect(() => {
    if (space.canStand(pose.current.position)) return
    const replacement = space.startingPose()
    if (replacement) pose.current = replacement
    sync()
    invalidate()
  }, [space, invalidate, sync])

  useEffect(() => {
    const canvas = gl.domElement
    let pointer: { id: number; x: number; y: number } | undefined
    const oldTabIndex = canvas.getAttribute('tabindex')
    canvas.tabIndex = 0
    canvas.setAttribute('aria-label', 'Oda turu görünümü')
    canvas.focus({ preventScroll: true })
    function down(event: PointerEvent) {
      if (event.button !== 0) return
      canvas.focus({ preventScroll: true })
      canvas.setPointerCapture(event.pointerId)
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
    }
    function move(event: PointerEvent) {
      if (pointer?.id !== event.pointerId) return
      const current = pose.current
      current.yaw = (current.yaw - (event.clientX - pointer.x) * .24) % 360
      current.pitch = Math.max(-82, Math.min(82, current.pitch + (event.clientY - pointer.y) * .24))
      pointer = { id: pointer.id, x: event.clientX, y: event.clientY }
      sync()
      invalidate()
    }
    const end = () => { pointer = undefined }
    const stop = () => { keys.current.clear() }
    function press(event: KeyboardEvent) {
      if (event.code === 'Escape') { event.preventDefault(); exit(); return }
      if (!keyDirections[event.code]) return
      event.preventDefault()
      keys.current.add(event.code)
      invalidate()
    }
    function release(event: KeyboardEvent) { keys.current.delete(event.code) }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('lostpointercapture', end)
    canvas.addEventListener('keydown', press)
    canvas.addEventListener('keyup', release)
    canvas.addEventListener('blur', stop)
    window.addEventListener('blur', stop)
    return () => {
      if (oldTabIndex === null) canvas.removeAttribute('tabindex')
      else canvas.setAttribute('tabindex', oldTabIndex)
      canvas.removeAttribute('aria-label')
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('lostpointercapture', end)
      canvas.removeEventListener('keydown', press)
      canvas.removeEventListener('keyup', release)
      canvas.removeEventListener('blur', stop)
      window.removeEventListener('blur', stop)
      stop()
    }
  }, [gl, invalidate, exit, sync])

  useFrame((_, delta) => {
    if (!keys.current.size) return
    const active = new Set([...keys.current].map(key => keyDirections[key]))
    const forward = Number(active.has('forward')) - Number(active.has('back'))
    const right = Number(active.has('right')) - Number(active.has('left'))
    if (!forward && !right) return
    const heading = pose.current.yaw * Math.PI / 180
    const speed = 1450 * Math.min(delta, .06) / Math.hypot(forward, right)
    pose.current.position = activeSpace.current.step(pose.current.position, {
      x: (Math.sin(heading) * forward + Math.cos(heading) * right) * speed,
      z: (-Math.cos(heading) * forward + Math.sin(heading) * right) * speed,
    })
    sync()
    invalidate()
  })
  return null
}
