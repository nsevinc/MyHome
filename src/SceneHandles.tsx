import { useFrame, useThree } from '@react-three/fiber'
import { Aperture, Crosshair, DoorOpen, Lightbulb, Move, Plus, RotateCw } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { PointerEvent, RefObject } from 'react'
import { Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { Project } from './model'

export type Position = NonNullable<Project['camera']>['position']
export type HandleId = 'camera' | 'target' | 'item-move' | 'item-rotate' | 'item-motion' | 'copy-left' | 'copy-right' | `light:${string}` | `door:${number}`
export type Handle = { id: HandleId; label: string; position: Position; pivot?: [number, number]; angleStep?: number; angleDirection?: number;
  dragMode?: DragMode; keyAxis?: Position; activate?: () => void; hot?: boolean }
export type HandleMove = { id: HandleId; position: Position; free?: boolean }
type DragMode = 'floor' | 'height'
type Pointer = { clientX: number; clientY: number }
type HandleRefs = Map<HandleId, HTMLButtonElement>
type StartDrag = (position: Position, pointer: Pointer, mode: DragMode) => ((next: Pointer) => Position | undefined) | undefined

export function HandleProjection({ handles, elements, startDrag }: {
  handles: Handle[]; elements: RefObject<HandleRefs>;
  startDrag: RefObject<StartDrag | null>;
}) {
  const { camera, gl, invalidate, size } = useThree()
  const point = useRef(new Vector3())
  useFrame(() => {
    camera.updateMatrixWorld()
    for (const handle of handles) {
      const marker = elements.current.get(handle.id)
      if (!marker) continue
      const projected = point.current.set(...handle.position).project(camera)
      const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .96 && Math.abs(projected.y) < .94
      marker.style.visibility = visible ? 'visible' : 'hidden'
      if (visible) {
        marker.style.left = `${(projected.x + 1) / 2 * size.width}px`
        marker.style.top = `${(1 - projected.y) / 2 * size.height}px`
      }
    }
  })

  useLayoutEffect(() => {
    startDrag.current = (position, start, mode) => {
      const rect = gl.domElement.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      camera.updateMatrixWorld()
      if (mode === 'height') {
        const low = new Vector3(...position).project(camera)
        const high = new Vector3(position[0], position[1] + .25, position[2]).project(camera)
        const vertical = new Vector2((high.x - low.x) * rect.width / 2, (low.y - high.y) * rect.height / 2)
        if (vertical.lengthSq() < 9) vertical.set(0, -rect.height * .06)
        return next => {
          const motion = new Vector2(next.clientX - start.clientX, next.clientY - start.clientY)
          return [position[0], position[1] + .25 * motion.dot(vertical) / vertical.lengthSq(), position[2]]
        }
      }
      const ray = new Raycaster()
      const plane = new Plane(new Vector3(0, 1, 0), -position[1])
      const fromPointer = ({ clientX, clientY }: Pointer) => {
        ray.setFromCamera(new Vector2(
          (clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2,
        ), camera)
        return ray.ray.intersectPlane(plane, new Vector3())
      }
      const origin = fromPointer(start)
      if (!origin) return
      const limit = Math.max(5, camera.position.distanceTo(origin) * 2)
      return next => {
        const hit = fromPointer(next)
        if (!hit || hit.distanceTo(origin) > limit) return
        return [position[0] + hit.x - origin.x, position[1], position[2] + hit.z - origin.z]
      }
    }
    invalidate()
    return () => { startDrag.current = null }
  }, [camera, gl, invalidate, startDrag])
  useLayoutEffect(() => invalidate(), [handles, invalidate])
  return null
}

export function SceneHandles({ handles, elements, startDrag, mode, selected, select, preview, commit }: {
  handles: Handle[]; elements: RefObject<HandleRefs>; startDrag: RefObject<StartDrag | null>; mode: DragMode;
  selected: HandleId; select: (id: HandleId) => void; preview: (move?: HandleMove) => void; commit: (move: HandleMove) => void;
}) {
  const gesture = useRef<{ pointer: number; id: HandleId; sample: NonNullable<ReturnType<StartDrag>>; move?: HandleMove } | null>(null)
  function cancel() {
    if (!gesture.current) return
    gesture.current = null
    preview()
  }
  function move(event: PointerEvent) {
    const drag = gesture.current
    if (drag?.pointer !== event.pointerId) return
    const position = drag.sample(event)
    if (!position) return
    drag.move = { id: drag.id, position, free: event.altKey }
    preview(drag.move)
  }
  const furniture = handles.some(handle => handle.id.startsWith('item-') || handle.activate)
  return <div className="scene-handles" role="group" aria-label={furniture ? 'Seçili eşyanın araçları' : 'Sürüklenebilir render objeleri'}>
    {handles.map(handle => {
      const register = (element: HTMLButtonElement | null) => {
        if (element) elements.current.set(handle.id, element)
        else elements.current.delete(handle.id)
      }
      if (handle.activate) return <button key={handle.id} type="button" className="scene-handle scene-copy"
        aria-label={handle.label} title={handle.label} data-hot={handle.hot || undefined}
        ref={register} onClick={handle.activate}><Plus size={19} /></button>
      const isDoor = handle.id.startsWith('door:') || handle.id === 'item-motion'
      const Icon = isDoor ? DoorOpen : handle.id === 'item-rotate' ? RotateCw : handle.id === 'item-move' ? Move
        : handle.id === 'camera' ? Aperture : handle.id === 'target' ? Crosshair : Lightbulb
      return <button key={handle.id} type="button" className={isDoor ? 'scene-handle door-handle' : 'scene-handle'}
        aria-label={furniture ? handle.label : `${handle.label} taşı`}
        aria-pressed={selected === handle.id} title={`${handle.label} · Sürükleyin veya ok tuşlarını kullanın`}
        ref={register}
        onFocus={() => select(handle.id)}
        onPointerDown={event => {
          if (event.button !== 0 || gesture.current) return
          select(handle.id)
          const sample = startDrag.current?.(handle.position, event, handle.dragMode ?? mode)
          if (!sample) return
          event.currentTarget.setPointerCapture(event.pointerId)
          gesture.current = { pointer: event.pointerId, id: handle.id, sample }
        }}
        onPointerMove={move}
        onPointerUp={event => {
          const drag = gesture.current
          if (drag?.pointer !== event.pointerId) return
          cancel()
          if (drag.move) commit({ ...drag.move, free: event.altKey })
        }}
        onPointerCancel={cancel} onLostPointerCapture={cancel}
        onKeyDown={event => {
          if (event.key === 'Escape') { cancel(); return }
          const step = event.shiftKey ? .25 : .05
          const [x, y, z] = handle.position
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
          const sign = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1
          let position: Position
          if (handle.keyAxis) {
            const by = (event.key === 'ArrowUp' || event.key === 'ArrowRight' ? 1 : -1) * step
            position = handle.position.map((value, index) => value + handle.keyAxis![index] * by) as Position
          } else if (handle.pivot) {
            const [px, pz] = handle.pivot
            const delta = sign * (handle.angleDirection ?? 1) * (event.shiftKey ? 15 : handle.angleStep ?? 1) * Math.PI / 180
            const vx = x - px, vz = z - pz
            position = [px + vx * Math.cos(delta) - vz * Math.sin(delta), y, pz + vx * Math.sin(delta) + vz * Math.cos(delta)]
          } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') position = [x + sign * step, y, z]
          else {
            position = mode === 'height' ? [x, y - sign * step, z] : [x, y, z + sign * step]
          }
          event.preventDefault()
          commit({ id: handle.id, position, free: true })
        }}>
        <Icon size={18} />
      </button>
    })}
  </div>
}
