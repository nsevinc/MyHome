import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { bounds, footprintCorners, itemBottom, moveAlongWall, obstructionVolume, placement, pointInRoom, roomEdges, sillAppearance, sillColor,
  sillVolume, trimContactText, trimVolume, wallMountPose, wallPoint } from './geometry'
import { trimLabels, wallTrimPieces } from './wall-trim'
import type { Rect, TrimContact, WallEdge } from './geometry'
import { fmt, furnitureAngle, maxMeasurements, normalizeAngle, uid } from './model'
import type { Furniture, Measurement, Point, Project } from './model'
import { cabinetDoorClearance, cabinetDoors, movedDoorPoint } from './wardrobe'
import { DoorSweeps } from './DoorSweeps'
import { cabinetInDoorState, measureGaps, snapFurniture } from './layout'
import type { SnapGuide } from './layout'
import { openingLeaf } from './opening-door'
import type { DoorState } from './opening-door'
import { MeasurementTools } from './MeasurementTools'
import type { PassagePick } from './MeasurementTools'
import { passageText, readMeasurements, savedMeasurements } from './measurements'
import { curtainPanels } from './curtain-shape'
import { fixtureColor } from './lighting'
import { SketchOverlay } from './SketchOverlay'
import { sketchScale } from './sketch-reference'
import { selectedItemIds } from './selection'
import type { Selection } from './selection'
import { movementAxes, replaceFurniture, selectedFurniture, translateFurniture } from './group-placement'
import { sectionMark, sectionPoint, sectionSpans } from './room-section'
import type { MotionTrial } from './furniture-motion'
import { resolveLinkedPlacement } from './linked-placement'
import type { LinkedPreview } from './linked-placement'
import type { RouteReading } from './usage-route'
import { ElectricalMarker } from './ElectricalPoints'
import { electricalReadings } from './electrical-points'
import { resolveMountSymmetries } from './mount-symmetry-rules'
import { angleFromDrag, dragWallTarget, movedPose, pointerAngle, wallDropWarning } from './furniture-gestures'
import { clearanceArchitecture, clearanceCorrection, readClearances } from './keep-clear'
import type { FurniturePose } from './furniture-gestures'
import { furnitureParts } from './furniture'
import { AdjacentCopyHandle } from './AdjacentCopyHandle'
import type { CopyControls, CopySide } from './adjacent-copy'

export function svgPoint(svg: SVGSVGElement, event: { clientX: number; clientY: number }) {
  const matrix = svg.getScreenCTM()?.inverse()
  if (!matrix) return { x: 0, z: 0 }
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
  return { x: point.x, z: point.y }
}

function BedroomPlanIcon({ item }: { item: Furniture }) {
  const parts = useMemo(() => furnitureParts(item).sort((a, b) => (a.position[1] + a.size[1] / 2)
    - (b.position[1] + b.size[1] / 2)), [item])
  return <g>
    <rect x={-item.width / 2} y={-item.depth / 2} width={item.width} height={item.depth} fill="transparent" />
    {parts.map((part, i) => {
      const [x,,z] = part.position, [width,,depth] = part.size
      const style = { fill: part.mirror ? '#c6d7d9' : part.appearance?.color ?? part.color, stroke: '#584e41',
        strokeOpacity: .45, strokeWidth: Math.min(8, width * 120, depth * 120),
        transform: `translate(${x * 1000} ${z * 1000}) rotate(${(part.angle ?? 0) * 180 / Math.PI})` }
      return part.round || part.cylinder === 'upright' ? <ellipse key={i} {...style} rx={width * 500} ry={depth * 500} /> :
        <rect key={i} {...style} x={-width * 500} y={-depth * 500} width={width * 1000} height={depth * 1000} />
    })}
  </g>
}

export function FurnitureIcon({ item }: { item: Furniture }) {
  if (item.bedroomModel && !item.wardrobe) return <BedroomPlanIcon item={item} />
  const { width: w, depth: d, color, wardrobe } = item
  const stroke = '#514943'
  const detail = (x: number, y: number, width: number, height: number, radius = 44, fill = 'none') =>
    <rect x={x} y={y} width={width} height={height} rx={radius} fill={fill} stroke={stroke} strokeOpacity=".42" strokeWidth="9" />
  if (item.curtain) return <g>
    <rect x={-w / 2} y={-d / 2 - 20} width={w} height={d + 40} fill="transparent" />
    <path d={`M ${-w / 2} 0 H ${w / 2}`} stroke={stroke} strokeWidth="14" />
    {curtainPanels(w, item.curtain.open).map(({ center, width }) =>
      <rect key={center} x={center - width / 2} y={-d / 2} width={width} height={d}
        fill={color} stroke={stroke} strokeWidth="8" />)}
  </g>
  return (
    <g>
      <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={item.kind === 'sofa' ? 75 : 30} fill={color} stroke={stroke} strokeWidth="13" />
      {item.kind === 'sofa' && <>
        {detail(-w * .47, -d * .43, w * .94, d * .17, 42, '#ffffff22')}
        {detail(-w * .33, -d * .24, w * .327, d * .64, 38, '#ffffff22')}
        {detail(w * .006, -d * .24, w * .327, d * .64, 38, '#ffffff22')}
        {detail(-w * .46, -d * .24, w * .105, d * .68, 38, '#ffffff19')}
        {detail(w * .355, -d * .24, w * .105, d * .68, 38, '#ffffff19')}
      </>}
      {item.kind === 'bed' && <>
        {detail(-w * .45, -d * .36, w * .9, d * .82, 30, '#f4efdf')}
        {detail(-w * .415, -d * .32, w * .395, d * .16, 45, '#fffaf4')}
        {detail(w * .02, -d * .32, w * .395, d * .16, 45, '#fffaf4')}
        {detail(-w * .43, -d * .08, w * .86, d * .50, 33, color)}
      </>}
      {wardrobe && <>
        {Array.from({ length: wardrobe.doors - 1 }, (_, index) => {
          const x = w * ((index + 1) / wardrobe.doors - .5)
          return <line key={index} x1={x} x2={x} y1={-d / 2} y2={d / 2}
            stroke={stroke} strokeOpacity=".5" strokeWidth="9" />
        })}
        {wardrobe.pose !== 'none' && cabinetDoors(item).map(door => {
          const center = movedDoorPoint(door, door.center)
          return <g key={door.index} transform={`translate(${center.x} ${center.z}) rotate(${door.yaw * 180 / Math.PI})`}>
            {detail(-door.width / 2, -door.depth / 2, door.width, Math.max(10, door.depth), 3,
              wardrobe.front === 'glass' ? '#c8e2dc' : color)}
          </g>
        })}
      </>}
      {item.kind === 'wardrobe' && !item.wardrobe && <>
        <line x1="0" x2="0" y1={-d / 2} y2={d / 2} stroke={stroke} strokeOpacity=".64" strokeWidth="12" />
        <line x1={-w * .36} x2={w * .36} y1={d * .35} y2={d * .35} stroke={stroke} strokeOpacity=".55" strokeWidth="14" />
      </>}
      {item.kind === 'table' && detail(-w * .42, -d * .36, w * .84, d * .72, 32, '#ffffff10')}
      {item.kind === 'rug' && detail(-w * .46, -d * .46, w * .92, d * .92, 24, '#ffffff12')}
      {item.mount && <path d={`M ${-w / 2} ${-d / 2} H ${w / 2}`} stroke={stroke} strokeWidth="19" />}
      {item.kind === 'radiator' && <path d={`M ${-w * .46} 0 H ${w * .46}`} stroke={stroke}
        strokeOpacity=".5" strokeWidth="18" strokeDasharray="22 12" />}
      {(item.kind === 'sconce' || item.kind === 'pendant') && <ellipse rx={w * .40} ry={d * .35} cy={d * .06}
        fill={item.fixture?.on ? fixtureColor(item.fixture) : '#f1eddf'} stroke={stroke} strokeWidth="8" />}
      {item.kind === 'mirror' && <path d={`M ${-w * .44} ${d * .34} H ${w * .44}`} stroke="#c5d6db" strokeWidth="13" />}
      {item.kind === 'wall-cabinet' && <path d={`M 0 ${-d * .40} V ${d * .42} M ${-w * .38} ${d * .36} H ${w * .38}`}
        stroke={stroke} strokeOpacity=".64" strokeWidth="10" fill="none" />}
      {item.kind === 'model' && <path d={`M ${-w*.34} ${-d*.34} L ${w*.34} ${d*.34} M ${w*.34} ${-d*.34} L ${-w*.34} ${d*.34}`}
        stroke={stroke} strokeWidth="10" opacity=".5" />}
    </g>
  )
}

type Props = {
  copyControls?: CopyControls;
  project: Project; selection: Selection; zoom: number; showSketch: boolean;
  select: (selection: Selection, extend?: boolean) => void; commit: (poses: FurniturePose[]) => void;
  snap: boolean; showDistances: boolean; setMeasurements: (measurements: Measurement[]) => void;
  preview: (items?: Furniture[]) => void;
}

function planDirection(direction: Point) {
  const names = ['sağa', 'sağ alta', 'aşağı', 'sol alta', 'sola', 'sol üste', 'yukarı', 'sağ üste']
  return names[(Math.round(Math.atan2(direction.z, direction.x) * 4 / Math.PI) + 8) % 8]
}

function DistanceLine({ start, end, label, labelSize, warning }: {
  start: Point; end: Point; label: string; labelSize: number; warning: boolean;
}) {
  const horizontal = Math.abs(start.x - end.x) >= Math.abs(start.z - end.z)
  const size = labelSize * .26
  return <g className={warning ? 'plan-distance warning' : 'plan-distance'}>
    <line x1={start.x} y1={start.z} x2={end.x} y2={end.z} />
    {[start, end].map((point, index) => <line key={index}
      x1={point.x - (horizontal ? 0 : size)} y1={point.z - (horizontal ? size : 0)}
      x2={point.x + (horizontal ? 0 : size)} y2={point.z + (horizontal ? size : 0)} />)}
    <text x={(start.x + end.x) / 2} y={(start.z + end.z) / 2 - size * 1.35}
      fontSize={labelSize} textAnchor="middle">{label}</text>
  </g>
}

type DragTool = { source: Furniture[]; result: Furniture[]; pointer: number; blocked?: string } & (
  | { kind: 'move'; id: string; ids: readonly string[]; offset: Point }
  | { kind: 'rotate'; id: string; offset: number }
)

export function PlanCanvas({ project, selection, zoom, showSketch, select, commit, snap, showDistances, setMeasurements, preview,
  pickSection, showSections, trial, measureFocus, placementPreview, linkedPreview, showLinks, replacementPreview, symmetryPreview, focus,
  visibleItems, usage, openElectrical, trimContacts = [], trimPreview, copyControls }: Props & {
    pickSection?: (point: Point) => void; showSections: boolean; placementPreview?: Furniture[];
    linkedPreview?: LinkedPreview; showLinks?: boolean; replacementPreview?: { blocked: boolean }; symmetryPreview?: { blocked: boolean };
    trimContacts?: TrimContact[]; trimPreview?: { blocked: boolean };
    trial?: MotionTrial; measureFocus?: { id?: string; pick?: boolean }; focus?: Rect; visibleItems?: ReadonlySet<string>;
    usage?: { points: Point[]; pick?: (point: Point) => void; reading?: RouteReading; minimum: number; trials: MotionTrial[] };
    openElectrical?: (wallId: string, id: string) => void }) {
  const reference = project.sketchReference
  const mmPerUnit = reference && sketchScale(reference)
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<DragTool | null>(null)
  const [dragging, setDragging] = useState<{ items: Furniture[]; guides: SnapGuide[]; linked?: LinkedPreview;
    wall?: WallEdge; blocked?: string; rotating?: boolean; symmetry?: string }>()
  const [gestureNotice, setGestureNotice] = useState('')
  const [hoverSide, setHoverSide] = useState<CopySide>()
  const [measurementsOpen, showMeasurements] = useState(false)
  const [selectedMeasure, selectMeasure] = useState<string>()
  const [choosing, choosePoint] = useState<PassagePick>()
  const [passageNotice, setPassageNotice] = useState('')
  const [mode, setMode] = useState<DoorState>('saved')
  useEffect(() => {
    if (!measureFocus) return
    showMeasurements(true)
    selectMeasure(measureFocus.id)
    choosePoint(measureFocus.pick ? {} : undefined)
    setMode('saved')
    setPassageNotice('')
  }, [measureFocus])
  const grid = useId()
  const grain = useId()
  const clip = useId()
  const edges = useMemo(() => roomEdges(project.walls), [project.walls])
  const hasElectrical = Boolean(openElectrical)
  const electrical = useMemo(() => hasElectrical ? electricalReadings(project, edges) : [], [project, edges, hasElectrical])
  const points = edges.map(edge => edge.a)
  const extent = bounds(points)
  const area = focus ?? extent
  const frame = Math.max(area.width, area.depth)
  const padding = focus ? Math.max(230, frame * .32) : Math.max(440, frame * .20)
  const view: Rect = { width: (area.width + 2 * padding) / zoom, depth: (area.depth + 2 * padding) / zoom, x: 0, z: 0 }
  view.x = area.x + (area.width - view.width) / 2
  view.z = area.z + (area.depth - view.depth) / 2
  const polygon = points.map(p => `${p.x},${p.z}`).join(' ')
  const labelSize = focus ? Math.max(12, Math.max(view.width, view.depth) * .027) : Math.max(105, frame * .03)
  const wallOffset = project.thickness + 145
  const selectionIds = selectedItemIds(selection)
  const shown = useMemo(() => (dragging ? replaceFurniture(project.items, dragging.items) : project.items)
    .map(item => wallMountPose(item, edges))
    .sort((a, b) => Number(b.kind === 'rug') - Number(a.kind === 'rug')
      || itemBottom(a, project.height) - itemBottom(b, project.height)), [project.items, project.height, dragging, edges])
  const showItem = (id: string) => !visibleItems || visibleItems.has(id)
  const links = (dragging?.linked?.checked ?? linkedPreview?.checked ?? (showLinks ? project.furnitureLinks : undefined))
    ?.filter(link => showItem(link.referenceId) && showItem(link.itemId))
  const linkedPositions = links?.length ? new Map(replaceFurniture(shown, linkedPreview?.items ?? []).map(item => [item.id, item])) : undefined
  const activeItem = shown.find(item => selection.kind === 'item' && selection.id === item.id)
  const canRotate = activeItem && !activeItem.locked && !activeItem.mount && !usage && !choosing && !pickSection
  const copies = activeItem && activeItem.id === copyControls?.sourceId && !dragging && !usage && !choosing &&
    !pickSection && !trial && !linkedPreview && !placementPreview ? copyControls : undefined
  function hoverCopySide(event: ReactPointerEvent<SVGSVGElement>) {
    if (!activeItem || !copies?.options.length || event.buttons) return
    const p = svgPoint(event.currentTarget, event)
    const angle = furnitureAngle(activeItem) * Math.PI / 180
    const dx = p.x - activeItem.x, dz = p.z - activeItem.z
    const across = dx * Math.cos(angle) + dz * Math.sin(angle)
    const front = dz * Math.cos(angle) - dx * Math.sin(angle)
    setHoverSide(Math.abs(across) <= activeItem.width / 2 + Math.max(activeItem.width / 2, labelSize * 2) &&
      Math.abs(front) <= activeItem.depth / 2 + labelSize ? (across >= 0 ? 1 : -1) : undefined)
  }
  const rotateRadius = activeItem ? activeItem.width / 2 + labelSize * 1.45 : 0
  const sweeps = useMemo(() => activeItem?.wardrobe && cabinetDoorClearance(project, activeItem, edges), [project, activeItem, edges])
  const measurements = savedMeasurements(project)
  const previewingReplacement = Boolean(replacementPreview)
  const usageMode = Boolean(usage)
  const readings = useMemo(() => usageMode ? [] : readMeasurements(project, edges,
    previewingReplacement && placementPreview ? replaceFurniture(shown, placementPreview) : shown),
  [project, edges, shown, previewingReplacement, placementPreview, usageMode])
  const selectedReading = readings.find(reading => reading.measurement.id === selectedMeasure) ?? readings[0]
  const displayDoors = measurementsOpen && selectedReading?.measurement.kind === 'passage' ? mode : 'saved'
  const gaps = useMemo(() => activeItem && showDistances ? measureGaps(project, activeItem, edges) : [], [project, activeItem, edges, showDistances])
  const rules = !usage ? project.keepClear : undefined
  const architecture = useMemo(() => rules?.length ? clearanceArchitecture(project, edges) : [], [rules, project, edges])
  const clearances = useMemo(() => rules ? readClearances(rules, shown, project.height, architecture) : [],
    [rules, shown, project.height, architecture])
  const movingId = dragging ? drag.current?.id : undefined
  const focusedIds = movingId ? [movingId] : selectionIds
  const visibleClearances = clearances.filter(row => showItem(row.owner.id) || (row.nearest?.id && showItem(row.nearest.id)))
  const relevant = visibleClearances.filter(row => focusedIds.includes(row.owner.id) || (row.nearest?.id && focusedIds.includes(row.nearest.id)))
  const focusClearance = (relevant.length ? relevant : visibleClearances).reduce<typeof clearances[number] | undefined>((best, row) =>
    !best || row.shortage > best.shortage || (row.shortage === best.shortage && (row.gap ?? Infinity) < (best.gap ?? Infinity)) ? row : best, undefined)
  const correction = focusClearance && !(dragging && dragging.items.length > 1) && clearanceCorrection(focusClearance, clearances, { ...project, items: shown }, edges, architecture, movingId,
    dragging && drag.current?.kind === 'move' && drag.current.ids.length === 1 ? drag.current.source.find(item => item.id === movingId) : undefined)

  function startDrag(event: ReactPointerEvent<SVGGElement>, item: Furniture) {
    if (!svg.current || event.button !== 0 || drag.current) return
    event.stopPropagation()
    if (event.shiftKey) { select({ kind: 'item', id: item.id }, true); return }
    const activeGroup = selection.kind === 'items' && selection.ids.includes(item.id)
    const ids = activeGroup ? selection.ids : [item.id]
    const point = svgPoint(svg.current, event)
    if (!activeGroup) {
      select({ kind: 'item', id: item.id })
      const angle = furnitureAngle(item) * Math.PI / 180
      setHoverSide((point.x - item.x) * Math.cos(angle) + (point.z - item.z) * Math.sin(angle) >= 0 ? 1 : -1)
    }
    if (!movementAxes(selectedFurniture(project.items, ids), edges).length) return
    drag.current = { kind: 'move', id: item.id, ids, source: project.items, offset: { x: point.x - item.x, z: point.z - item.z },
      result: [], pointer: event.pointerId }
    setGestureNotice('')
    svg.current.focus({ preventScroll: true })
    svg.current.setPointerCapture(event.pointerId)
  }

  function startRotate(event: ReactPointerEvent<SVGGElement>, item: Furniture) {
    if (!svg.current || event.button !== 0 || drag.current) return
    event.stopPropagation()
    const pointer = svgPoint(svg.current, event)
    drag.current = { kind: 'rotate', id: item.id, source: project.items, result: [], pointer: event.pointerId,
      offset: pointerAngle(item, pointer) - furnitureAngle(item) }
    setGestureNotice('')
    event.currentTarget.focus({ preventScroll: true })
    svg.current.setPointerCapture(event.pointerId)
  }

  function dragItem(event: ReactPointerEvent<SVGSVGElement>) {
    const current = drag.current
    if (!current || !svg.current || event.pointerId !== current.pointer) return
    if (current.source !== project.items) { finishDrag(true); return }
    const point = svgPoint(svg.current, event)
    const item = project.items.find(item => item.id === current.id)
    if (!item) return
    const scale = Math.abs(svg.current.getScreenCTM()?.a ?? 1)
    const assist = snap && !event.altKey
    if (current.kind === 'rotate') {
      if (Math.hypot(point.x - item.x, point.z - item.z) < rotateRadius * .22) return
      showDrag(current, [{ ...item, angle: angleFromDrag(item, point, current.offset, assist) }], [])
      return
    }
    const target = { x: Math.round(point.x - current.offset.x), z: Math.round(point.z - current.offset.z) }
    const aimed = current.ids.length === 1
      ? dragWallTarget(item, target, edges, Math.min(250, 26 / (scale || 1)))
      : { item: moveAlongWall(item, target, edges) }
    const posed = wallMountPose(aimed.item, edges)
    const snapProject = current.ids.length === 1 ? project : { ...project, items: project.items.filter(other => !current.ids.includes(other.id)) }
    const result = assist ? snapFurniture(snapProject, posed, edges, Math.min(80, 8 / (scale || 1))) : { position: posed, guides: [] }
    const moved = aimed.destination ? [moveAlongWall(posed, result.position, edges)]
      : translateFurniture(project, current.ids, item.id, result.position, edges)
    const leader = moved.find(row => row.id === item.id)
    if (leader) showDrag(current, moved, result.guides, aimed.destination,
      aimed.destination && wallDropWarning(project, leader, edges))
  }

  function showDrag(current: DragTool, moved: Furniture[], guides: SnapGuide[], wall?: WallEdge, blocked?: string) {
    current.result = moved
    current.blocked = blocked
    const draft = { ...project, items: replaceFurniture(project.items, moved) }
    const linked = project.furnitureLinks?.length ? resolveLinkedPlacement(project, draft) : undefined
    const symmetry = !linked?.error && project.mountSymmetries?.length ? resolveMountSymmetries(project, linked?.project ?? draft) : undefined
    const items = linked || symmetry ? (symmetry?.project ?? linked!.project).items.filter(item =>
      moved.some(row => row.id === item.id) || linked?.items.some(row => row.id === item.id) || symmetry?.items.some(row => row.id === item.id)) : moved
    const leader = moved.find(item => item.id === current.id)!
    const resolvedLeader = items.find(item => item.id === current.id)!
    setDragging({ items, linked, wall, blocked, rotating: current.kind === 'rotate',
      symmetry: symmetry && (symmetry.error ?? 'Simetriye bağlı eşyalar birlikte taşınacak.'),
      guides: guides.filter(guide => Math.abs(resolvedLeader[guide.axis] - leader[guide.axis]) <= .5) })
    preview(items)
  }

  function finishDrag(cancel = false) {
    const current = drag.current
    if (!current) return
    drag.current = null
    if (svg.current?.hasPointerCapture(current.pointer)) svg.current.releasePointerCapture(current.pointer)
    setDragging(undefined)
    preview(undefined)
    if (cancel || current.source !== project.items) return
    if (current.blocked) { setGestureNotice(current.blocked); return }
    const changed = current.result.filter(item =>
      movedPose(wallMountPose(current.source.find(row => row.id === item.id)!, edges), wallMountPose(item, edges)))
    if (changed.length) commit(changed)
  }

  function updateMeasurement(measurement: Measurement) {
    const exists = measurements.some(entry => entry.id === measurement.id)
    if (!exists && measurements.length >= maxMeasurements) return
    setMeasurements(exists ? measurements.map(entry => entry.id === measurement.id ? measurement : entry) : [...measurements, measurement])
    if (selectedReading?.measurement.id !== measurement.id) setMode('saved')
    selectMeasure(measurement.id)
  }

  return <>
    <svg ref={svg} className="plan-svg" aria-label="Ölçülü oda planı" role="group" tabIndex={usage ? undefined : -1}
      data-pick-passage={Boolean(choosing || pickSection || usage?.pick) || undefined}
      viewBox={`${view.x} ${view.z} ${view.width} ${view.depth}`}
      onPointerDownCapture={event => {
        if ((!choosing && !pickSection && !usage) || !svg.current || event.button !== 0) return
        event.stopPropagation()
        const point = svgPoint(svg.current, event)
        const origin = { x: Math.round(point.x), z: Math.round(point.z) }
        if (usage) { usage.pick?.(origin); return }
        if (pickSection) { pickSection(origin); return }
        if (!pointInRoom(origin, edges)) { setPassageNotice('Oda sınırları içinde bir nokta seç.'); return }
        const existing = measurements.find(entry => entry.id === choosing?.id)
        if (existing?.kind === 'passage') updateMeasurement({ ...existing, origin })
        else {
          const names = new Set(measurements.map(entry => entry.name))
          const number = Array.from({ length: maxMeasurements + 1 }, (_, index) => index + 1)
            .find(index => !names.has(`Geçiş ${index}`))
          updateMeasurement({ kind: 'passage', id: uid(), name: `Geçiş ${number}`, origin,
            axis: 'x', minimum: 900, headroom: Math.min(2000, project.height) })
        }
        setPassageNotice('')
        choosePoint(undefined)
      }}
      onPointerDown={() => { setGestureNotice(''); select({ kind: 'room' }) }}
      onPointerMove={event => { if (drag.current) dragItem(event); else hoverCopySide(event) }} onPointerLeave={() => setHoverSide(undefined)}
      onPointerUp={event => { if (drag.current?.pointer === event.pointerId) finishDrag() }}
      onPointerCancel={event => { if (drag.current?.pointer === event.pointerId) finishDrag(true) }}
      onLostPointerCapture={event => { if (drag.current?.pointer === event.pointerId) finishDrag(true) }}
      onKeyDown={event => { if (event.key === 'Escape' && drag.current) { event.stopPropagation(); finishDrag(true) } }}>
      <defs>
        <pattern id={grid} width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M 200 0 H 0 V 200" fill="none" stroke="#54746a" strokeOpacity=".16" strokeWidth="5" />
          <path d="M 100 0 V 200 M 0 100 H 200" fill="none" stroke="#54746a" strokeOpacity=".07" strokeWidth="4" />
        </pattern>
        <pattern id={grain} width="390" height="550" patternUnits="userSpaceOnUse">
          <path d="M 0 0 V 550 M 195 0 V 550 M 0 175 H 195 M 195 415 H 390" stroke="#755d42" strokeOpacity=".13" strokeWidth="5" />
        </pattern>
        <clipPath id={clip}><polygon points={polygon} /></clipPath>
      </defs>
      <rect {...{ x: view.x, y: view.z, width: view.width, height: view.depth }} fill={`url(#${grid})`} />
      <polygon points={polygon} fill={project.style.floor} fillOpacity=".48" />
      <polygon points={polygon} fill={`url(#${grain})`} />
      {showSketch && project.sketch && <g clipPath={`url(#${clip})`}>
        {reference?.origin && mmPerUnit ? <SketchOverlay source={project.sketch} reference={reference}
          placement={{ origin: reference.origin, mmPerUnit }} /> : <image href={project.sketch} x={extent.x} y={extent.z}
          width={extent.width} height={extent.depth} opacity={reference?.opacity ?? .46} preserveAspectRatio="xMidYMid meet"
          transform={reference && `rotate(${reference.rotation} ${extent.x + extent.width / 2} ${extent.z + extent.depth / 2})`} />}
      </g>}
      {visibleClearances.length > 0 && <g aria-label="Boş tutulacak alanlar" role="img" pointerEvents="none" clipPath={`url(#${clip})`}>
        {visibleClearances.map(row => <polygon key={row.rule.owner + row.owner.id + row.rule.side} points={row.polygon.map(p => `${p.x},${p.z}`).join(' ')}
          className={row.shortage ? 'clearance-band blocked' : 'clearance-band'}>
          <title>{row.owner.name} · {fmt(row.rule.distance)} cm boş tutulacak</title>
        </polygon>)}
      </g>}
      {edges.map(edge => {
        const { a, b, wall, index } = edge
        const active = selection.kind === 'wall' && selection.id === wall.id
        const p0 = wallPoint(edge, 0, -wallOffset)
        const p1 = wallPoint(edge, wall.length, -wallOffset)
        const center = wallPoint(edge, wall.length / 2, -wallOffset - 65)
        const midLine0 = wallPoint(edge, 0, -project.thickness / 2)
        const midLine1 = wallPoint(edge, wall.length, -project.thickness / 2)
        const angle = edge.dx === 0 ? -90 : 0
        return <g key={wall.id} role={usage ? undefined : 'button'} tabIndex={usage ? undefined : 0} aria-label={`Duvar ${index + 1}, ${fmt(wall.length)} cm`}
          className="plan-wall" onPointerDown={event => { event.stopPropagation(); select({ kind: 'wall', id: wall.id }) }}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') select({ kind: 'wall', id: wall.id }) }}>
          <line x1={midLine0.x} y1={midLine0.z} x2={midLine1.x} y2={midLine1.z}
            stroke={dragging?.wall?.wall.id === wall.id ? dragging.blocked ? '#ad402c' : '#187e68' : active ? '#327e68' : '#33423b'}
            strokeWidth={project.thickness} />
          <line x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke="transparent" strokeWidth={Math.max(project.thickness, 150)} />
          <path d={`M ${p0.x} ${p0.z} L ${p1.x} ${p1.z}`} stroke="#64756b" strokeOpacity=".62" strokeWidth="8" />
          {[p0, p1].map((p, i) => <line key={i} x1={p.x - edge.nx * 50} y1={p.z - edge.nz * 50}
            x2={p.x + edge.nx * 50} y2={p.z + edge.nz * 50} stroke="#64756b" strokeWidth="8" />)}
          <text x={center.x} y={center.z} fontSize={labelSize} transform={`rotate(${angle} ${center.x} ${center.z})`}
            textAnchor="middle" dominantBaseline="central" className="wall-label">{fmt(wall.length)} cm</text>
          {wall.openings.map(opening => {
            const c = wallPoint(edge, opening.offset, -project.thickness / 2)
            const d = wallPoint(edge, opening.offset + opening.width, -project.thickness / 2)
            const panel = openingLeaf(edge, opening, displayDoors)
            const hinge = wallPoint(edge, opening.offset)
            const leaf = wallPoint(edge, opening.offset, opening.width)
            const closed = wallPoint(edge, opening.offset + opening.width)
            const sweep = edge.dx * edge.nz - edge.dz * edge.nx > 0 ? 0 : 1
            const sill = sillVolume(edge, opening, project.thickness, true)
            return <g key={opening.id}>
              <line x1={c.x} y1={c.z} x2={d.x} y2={d.z} stroke={opening.kind === 'window' ? '#d5e7e4' : '#ebe3d4'}
                strokeWidth={project.thickness + 5} />
              {opening.kind === 'window'
                ? <line x1={c.x} y1={c.z} x2={d.x} y2={d.z} stroke="#588f92" strokeWidth="23" />
                : panel ? <polygon points={footprintCorners({ ...panel, rotation: 0 }).map(p => `${p.x},${p.z}`).join(' ')}
                  fill="#af8a67" stroke="#694c33" strokeWidth="10" />
                : <path d={`M ${hinge.x} ${hinge.z} L ${leaf.x} ${leaf.z} A ${opening.width} ${opening.width} 0 0 ${sweep} ${closed.x} ${closed.z}`}
                  stroke="#6f7565" strokeOpacity=".7" strokeWidth="14" fill="none" />}
              {sill && <rect x={sill.x} y={sill.z} width={sill.width} height={sill.depth} stroke="#596e67"
                strokeWidth="8" strokeDasharray="25 14" fill={sillAppearance(opening.sill!).color ?? sillColor(opening.sill!.finish)} fillOpacity=".78">
                <title>Mermer denizlik · {fmt(sill.bottom)}–{fmt(sill.top)} cm kot</title>
              </rect>}
            </g>
          })}
          {wallTrimPieces(wall, project.height).map((piece, i) => {
            const box = trimVolume(edge, piece)
            return <rect key={i} x={box.x} y={box.z} width={box.width} height={box.depth} fill={piece.appearance.color ?? '#ede9df'}
              stroke="#68796d" strokeWidth="5" strokeDasharray={piece.kind === 'trim' ? '22 14' : undefined}>
              <title>{trimLabels[piece.kind]} · {fmt(piece.depth)} cm taşma</title>
            </rect>
          })}
        </g>
      })}
      {edges.flatMap(e => e.wall.obstacles.map(obstacle => {
        const box = obstructionVolume(e, obstacle)
        const high = obstacle.bottom > 0
        return <g key={obstacle.id} className="plan-wall" onPointerDown={event => { event.stopPropagation(); select({ kind: 'wall', id: e.wall.id }) }}>
          <rect x={box.x} y={box.z} width={box.width} height={box.depth} fill={high ? '#edc270' : '#68756c'}
            fillOpacity={high ? '.23' : '.75'} stroke={high ? '#967441' : '#42554b'} strokeWidth="17" strokeDasharray={high ? '42 28' : undefined} />
          <title>{obstacle.name} · {fmt(obstacle.bottom)}–{fmt(obstacle.top)} cm</title>
        </g>
      }))}
      {shown.filter(item => showItem(item.id)).map(item => {
        const active = selectionIds.includes(item.id)
        const warning = !usage && placement(dragging?.linked?.project ?? project, item, edges).warning.length > 0
        return <g key={item.id} role={usage ? undefined : 'button'} tabIndex={usage ? undefined : 0} aria-label={item.name}
          aria-pressed={usage ? undefined : active} data-locked={item.locked || undefined}
          transform={`translate(${item.x} ${item.z}) rotate(${furnitureAngle(item)})`}
          className="plan-item" onPointerDown={event => startDrag(event, item)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') select({ kind: 'item', id: item.id }, event.shiftKey) }}>
          <FurnitureIcon item={cabinetInDoorState(item, displayDoors)} />
          {(active || warning) && <rect x={-item.width / 2 - 22} y={-item.depth / 2 - 22}
            width={item.width + 44} height={item.depth + 44} rx="45" fill="none"
            stroke={warning ? '#ad533f' : '#216d58'} strokeWidth="22" pointerEvents="none" />}
          <title>{item.name}</title>
        </g>
      })}
      {!!trimContacts.length && !dragging && <g role="img" aria-label="Duvar detayı çakışma bölgeleri" pointerEvents="none" className="trim-contact-mark">
        {trimContacts.map((contact, index) => <polygon key={index} vectorEffect="non-scaling-stroke"
          points={contact.shape.map(({ x, z }) => `${x},${z}`).join(' ')}><title>{trimContactText(contact)}</title></polygon>)}
      </g>}
      {placementPreview && <g role="img" aria-label={symmetryPreview ? 'Simetri kuralı önizlemesi' :
        replacementPreview ? 'Yeni modelin yerleşim önizlemesi' : trimPreview ? 'Duvar detayı hareketi' : 'Yerleşim önerisi önizlemesi'}
        className={replacementPreview?.blocked || symmetryPreview?.blocked || trimPreview?.blocked ? 'smart-plan-preview blocked' : 'smart-plan-preview'} pointerEvents="none">
        {placementPreview.filter(item => showItem(item.id)).map(item => {
          const from = shown.find(source => source.id === item.id)
          const candidate = wallMountPose(item, edges)
          return <g key={item.id}>
            {from && <line x1={from.x} y1={from.z} x2={candidate.x} y2={candidate.z} vectorEffect="non-scaling-stroke" />}
            <polygon points={footprintCorners(candidate).map(point => `${point.x},${point.z}`).join(' ')}
              vectorEffect="non-scaling-stroke"><title>{candidate.name} · Önerilen konum</title></polygon>
          </g>
        })}
      </g>}
      {links?.length ? <g role="img" aria-label="Bağlı yerleşim çizgileri" pointerEvents="none"
        className={dragging?.linked?.error || linkedPreview?.error ? 'linked-plan blocked' : 'linked-plan'}>
        {links.map(link => {
          const from = linkedPositions?.get(link.referenceId), to = linkedPositions?.get(link.itemId)
          return from && to && <g key={link.id}>
            <line x1={from.x} y1={from.z} x2={to.x} y2={to.z} vectorEffect="non-scaling-stroke" />
            <circle cx={to.x} cy={to.z} r={labelSize * .17} vectorEffect="non-scaling-stroke" />
            <title>{from.name} → {to.name}</title>
          </g>
        })}
        {(dragging?.linked?.items ?? linkedPreview?.items ?? []).filter(item => showItem(item.id)).map(item => <polygon key={item.id}
          points={footprintCorners(item).map(p => `${p.x},${p.z}`).join(' ')} vectorEffect="non-scaling-stroke">
          <title>{item.name} · Bağlı değişiklik</title></polygon>)}
      </g> : null}
      {!placementPreview && displayDoors === 'saved' && sweeps && sweeps.length > 0 && <g role="img" aria-label="Kapak açılım alanı" pointerEvents="none">
        <DoorSweeps doors={sweeps} />
      </g>}
      {!trial && !placementPreview && !linkedPreview && !dragging?.linked && gaps.length > 0 && <g role="img" aria-label="Anlık eşya mesafeleri" pointerEvents="none">
        {gaps.filter(gap => gap.distance > 0.5).map(gap => <DistanceLine key={gap.label} start={gap.start} end={gap.end}
          label={`${fmt(Math.round(gap.distance))} cm`} labelSize={labelSize * .78} warning={false} />)}
      </g>}
      {focusClearance && <g role="img" aria-label="Geçiş ölçüsü" pointerEvents="none">
        <DistanceLine start={focusClearance.start} end={focusClearance.end} warning={Boolean(focusClearance.shortage)} labelSize={labelSize * .67}
          label={focusClearance.shortage ? `${fmt(focusClearance.gap!)} cm` : `${fmt(focusClearance.rule.distance)} cm hedef`} />
      </g>}
      {dragging && dragging.guides.length > 0 && <g className="plan-snap-guides" role="img" aria-label="Hizalama kılavuzları" pointerEvents="none">
        {dragging.guides.map(guide => <line key={guide.axis}
          x1={guide.axis === 'x' ? guide.at : guide.low - 60} x2={guide.axis === 'x' ? guide.at : guide.high + 60}
          y1={guide.axis === 'z' ? guide.at : guide.low - 60} y2={guide.axis === 'z' ? guide.at : guide.high + 60}><title>{guide.name}</title></line>)}
      </g>}
      {showSections && <g aria-label="Kesit çizgileri" pointerEvents="none">
        {project.sections?.flatMap((section, index) => sectionSpans(project, section).map(({ from, to }) => {
          const a = sectionPoint(section, from), b = sectionPoint(section, to)
          return <g key={`${section.id}-${from}`}>
            <line x1={a.x} y1={a.z} x2={b.x} y2={b.z} stroke="#6b4974" strokeWidth="2"
              strokeDasharray="8 5" vectorEffect="non-scaling-stroke" />
            <text x={a.x + 28} y={a.z - 26} fontSize={labelSize * .72} className="measurement-note">{sectionMark(index)}</text>
          </g>
        }))}
      </g>}
      {(usage?.trials ?? (trial ? [trial] : [])).map(trial => <g key={trial.item.id + trial.part.id} role="img"
        aria-label={`${trial.part.name} kullanım alanı`} pointerEvents="none" className="motion-overlay">
        <polygon points={trial.outline.map(p => `${p.x},${p.z}`).join(' ')} fill="#0b7b7526" stroke="#08786f"
          strokeDasharray="6 4" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polygon points={trial.actual.map(p => `${p.x},${p.z}`).join(' ')} fill="#00a79932" stroke="#08786f"
          strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {trial.beyond && <polygon points={trial.beyond.map(p => `${p.x},${p.z}`).join(' ')} fill="#c451412e"
          stroke="#a2372c" strokeDasharray="4 4" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
        {trial.reached && <circle aria-label="İlk temas noktası" cx={trial.contact?.point?.x ?? trial.handle.x}
          cy={trial.contact?.point?.z ?? trial.handle.z} r={labelSize * .21} stroke="white" strokeWidth="1.5"
          vectorEffect="non-scaling-stroke" fill="#a2372c" />}
      </g>)}
      {usage && usage.points.length > 0 && <g role="img" aria-label="Kullanım rotası" pointerEvents="none">
        <polyline points={usage.points.map(point => `${point.x},${point.z}`).join(' ')} fill="none" stroke="white"
          strokeWidth="5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <polyline points={usage.points.map(point => `${point.x},${point.z}`).join(' ')} fill="none" stroke="#1b5278"
          strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {usage.points.map(({ x, z }, index) => <g key={index}>
          <circle cx={x} cy={z} r={labelSize * .24} fill="#1b5278" stroke="white" strokeWidth="14" />
          <text x={x} y={z} dominantBaseline="central" textAnchor="middle" fontSize={labelSize * .32} fill="white">{index + 1}</text>
        </g>)}
        {usage.reading && <>
          {usage.reading.width > 0 && <DistanceLine start={usage.reading.start} end={usage.reading.end}
            label={`${fmt(Math.round(usage.reading.width))} cm`} labelSize={labelSize * .72}
            warning={usage.reading.width < usage.minimum - .001} />}
          <circle cx={usage.reading.at.x} cy={usage.reading.at.z} r={labelSize * .35} fill="none"
            aria-label="En dar nokta" stroke={usage.reading.width < usage.minimum - .001 ? '#ad402c' : '#126a62'}
            strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </>}
      </g>}
      {readings.length > 0 && <g className="plan-measurements" role="img" aria-label="Kayıtlı ölçü işaretleri" pointerEvents="none">
        {readings.map(reading => {
          const { measurement, number } = reading
          const passage = 'modes' in reading ? reading.modes.find(entry => entry.mode === displayDoors) : undefined
          const mark = passage ?? ('mark' in reading ? reading.mark : undefined)
          if (!mark) return null
          const origin = measurement.kind === 'passage' ? measurement.origin : mark.start
          const warning = passage && measurement.kind === 'passage' ? passage.width < measurement.minimum : reading.warning
          const selected = measurementsOpen && measurement.id === selectedReading?.measurement.id
          const text = passage ? passageText(passage) : reading.text
          const length = Math.hypot(mark.end.x - mark.start.x, mark.end.z - mark.start.z)
          return <g key={measurement.id} className={selected ? 'plan-passage' : undefined}>
            {length > 1 && <DistanceLine start={mark.start} end={mark.end} label={`${number} · ${text}`}
              labelSize={labelSize * (selected ? .92 : .73)} warning={warning} />}
            {length <= 1 && <text x={origin.x + labelSize * .33} y={origin.z - labelSize * .18}
              fontSize={labelSize * .69} className="measurement-note">{text}</text>}
            <circle cx={origin.x} cy={origin.z} r={labelSize * .19} fill={warning ? '#ad533f' : '#126a62'} stroke="white" strokeWidth="10" />
            <text x={origin.x} y={origin.z} className="measurement-badge" fontSize={labelSize * .22}
              dominantBaseline="central" textAnchor="middle">{number}</text>
            <title>{measurement.name} · {text}</title>
          </g>
        })}
      </g>}
      {canRotate && (() => {
        const angle = furnitureAngle(activeItem)
        const r = labelSize * .76
        const turn = angle * Math.PI / 180
        const x = activeItem.x + rotateRadius * Math.cos(turn), z = activeItem.z + rotateRadius * Math.sin(turn)
        return <g className="plan-rotation" data-active={dragging?.rotating || undefined} role="button" tabIndex={0}
          aria-label="2B’de eşyayı döndür" onPointerDown={event => startRotate(event, activeItem)}
          onKeyDown={event => {
            if (drag.current) return
            const step = snap && !event.altKey ? 15 : 1
            const change = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step
              : event.key === 'Enter' || event.key === ' ' ? 90 : 0
            if (!change) return
            event.preventDefault()
            commit([{ ...activeItem, angle: normalizeAngle(angle + change) }])
          }}>
          <title>Döndürmek için sürükle. Alt ile serbest döndür.</title>
          <line x1={activeItem.x} y1={activeItem.z} x2={x} y2={z} stroke="#275f73" strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke" pointerEvents="none" />
          <circle cx={x} cy={z} r={r * 1.4} fill="transparent" />
          <circle cx={x} cy={z} r={r} className="plan-rotation-disc" vectorEffect="non-scaling-stroke" />
          <g transform={`translate(${x - r * .63} ${z - r * .63}) scale(${r * 1.26 / 24})`} fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
            <path d="M21 4v5h-5M19.4 15a8 8 0 1 1-.8-7.6L21 9" />
          </g>
        </g>
      })()}
      {activeItem && copies?.options.map(({ side, item }) => {
        const r = labelSize * .87, angle = furnitureAngle(activeItem) * Math.PI / 180
        const across = side * (activeItem.width / 2 + r)
        const front = canRotate && side === 1 ? labelSize * 1.8 : 0
        return <g key={activeItem.id + side}>
          {hoverSide === side && <polygon className="copy-outline" pointerEvents="none" vectorEffect="non-scaling-stroke"
            points={footprintCorners(wallMountPose(item, edges)).map(p => `${p.x},${p.z}`).join(' ')} />}
          <AdjacentCopyHandle side={side} radius={r} hot={hoverSide === side} add={copies.add}
            x={activeItem.x + across * Math.cos(angle) - front * Math.sin(angle)}
            y={activeItem.z + across * Math.sin(angle) + front * Math.cos(angle)} />
        </g>
      })}
      {electrical.map(reading => {
        const { edge, point } = reading
        const position = wallPoint(edge, point.offset, 95)
        return <ElectricalMarker key={point.id} reading={reading} x={position.x} y={position.z} radius={labelSize * .44}
          choose={openElectrical && (() => openElectrical(edge.wall.id, point.id))} />
      })}
    </svg>
    {focusClearance && <div role="status" aria-label="Canlı geçiş ölçüsü" className={'clearance-status' + (focusClearance.shortage ? ' blocked' : '')}>
      <strong>Kalan geçiş {focusClearance.gap === undefined ? 'en az ' + fmt(focusClearance.rule.distance) : fmt(focusClearance.gap)} cm · Hedef {fmt(focusClearance.rule.distance)} cm</strong>
      <span>{focusClearance.owner.name}{focusClearance.nearest && ` ↔ ${focusClearance.nearest.label}`}</span>
      {focusClearance.shortage > 0 && <span>{fmt(focusClearance.shortage)} cm eksik. {correction && (correction.obstruction
        ? correction.available === undefined ? correction.obstruction : `Gereken hareket ${fmt(correction.distance)} cm ${planDirection(correction.direction)}. Bu yönde yalnızca ${fmt(correction.available)} cm yer var.`
        : correction.retrace ? `Son hareketi ${fmt(correction.distance)} cm geri al.`
          : `${movingId === focusClearance.owner.id ? focusClearance.owner.name : focusClearance.nearest?.label} · ${fmt(correction.distance)} cm ${planDirection(correction.direction)} kaydır.`)}</span>}
    </div>}
    {!usage && (dragging?.wall || dragging?.rotating || dragging?.symmetry || gestureNotice) &&
      <p className={dragging?.blocked || gestureNotice ? 'plan-gesture-status blocked' : 'plan-gesture-status'} role="status">
        {gestureNotice || dragging?.symmetry || (dragging?.wall
          ? `Duvar ${dragging.wall.index + 1} · ${dragging.blocked ?? 'Bırakınca bu duvara taşınır'}`
          : `${fmt(Math.round(furnitureAngle(activeItem!) * 10))}°`)}
      </p>}
    {dragging?.linked && <p className={dragging.linked.error ? 'linked-drag-status blocked' : 'linked-drag-status'} role="status">
      {dragging.linked.error ?? `${dragging.linked.items.length} eşya · Bağlı yerleşim önizlemesi`}</p>}
    {!usage && <MeasurementTools open={measurementsOpen} toggle={() => {
      showMeasurements(!measurementsOpen)
      choosePoint(undefined)
      setPassageNotice('')
    }} choosing={choosing} startPick={pick => { choosePoint(pick); setPassageNotice('') }} notice={passageNotice}
      readings={readings} selected={selectedReading} select={id => { selectMeasure(id); setMode('saved') }}
      replace={updateMeasurement} remove={id => {
        setMeasurements(measurements.filter(entry => entry.id !== id))
        selectMeasure(undefined)
        setMode('saved')
      }} mode={mode} setMode={setMode} projectHeight={project.height} items={shown} edges={edges} itemId={activeItem?.id} />}
  </>
}

