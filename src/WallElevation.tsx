import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { Copy, FlipHorizontal2, Move, Plug } from 'lucide-react'
import { elevationData, sizeInCm } from './elevation-data'
import { mountOffset, roomEdges, sillAppearance, sillColor, trimContactText, windowSill } from './geometry'
import type { TrimContact } from './geometry'
import { trimLabels, wallTrimPieces } from './wall-trim'
import { fmt, uid } from './model'
import type { ElectricalPoint, Furniture, Point, Project, WallRegion } from './model'
import { Measure } from './fields'
import { wallMountFit } from './furniture-gestures'
import { canCopyWallMount, canMoveWallMount, newMountSymmetry, wallCopyPreview, wallMovePreview, wallSymmetryOptions, wallSymmetryPreview } from './wall-mount-edit'
import type { MountAxis, MountCopy, MountSymmetry } from './wall-mount-edit'
import { WallSymmetryControls, WallSymmetryGuide } from './WallSymmetry'
import { svgPoint } from './PlanCanvas'
import { wallCoveringCells } from './wall-coverings'
import { assemblyObstacles, wardrobeAssembly } from './wardrobe-assembly'
import { AssemblyReadings } from './WardrobeAssembly'
import { WallSurveyReading } from './WallSurvey'
import { ElectricalMarker, ElectricalPointEditor } from './ElectricalPoints'
import { electricalReadings } from './electrical-points'

import { AdjacentCopyHandle } from './AdjacentCopyHandle'
import type { CopyControls } from './adjacent-copy'

type MovePreview = NonNullable<ReturnType<typeof wallMovePreview>>

export function WallElevation({ project, wallId, itemId, selectWall, selectItem, previewMount, commitMove, copyMount, commitSymmetry,
  snap, setSnap, drawCovering, cancelCovering, electricalFocus, saveElectrical, removeSymmetry, trimContacts = [], copyControls }: {
  copyControls?: CopyControls;
  project: Project; wallId?: string; drawCovering?: (area: Omit<WallRegion, 'id' | 'appearance'>) => void;
  itemId?: string; selectWall: (id: string) => void; selectItem: (id: string) => void;
  previewMount: (item?: Furniture) => void; commitMove: (id: string, axis: MountAxis, value: number) => boolean;
  copyMount: (options: MountCopy) => boolean; commitSymmetry: (setup: MountSymmetry, save: boolean, ruleId?: string) => boolean;
  removeSymmetry: (id: string) => boolean;
  electricalFocus?: { wallId: string; id: string }; saveElectrical: (wallId: string, points: ElectricalPoint[]) => boolean;
  snap: boolean; setSnap: (snap: boolean) => void; cancelCovering: () => void; trimContacts?: TrimContact[];
}) {
  const edges = useMemo(() => roomEdges(project.walls), [project.walls])
  const edge = edges.find(e => e.wall.id === wallId) ?? edges[0]
  const wall = edge.wall
  const w = wall.length, h = project.height
  const size = Math.max(w, h) * .024
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ project: Project; item: Furniture; origin: Record<MountAxis, number>; scale: number; clientX: number; clientY: number;
    pointerId: number; axis?: MountAxis; preview?: MovePreview } | null>(null)
  const [moveDraft, setMoveDraft] = useState<MovePreview>()
  const [copy, setCopy] = useState<MountCopy>()
  const [symmetry, setSymmetry] = useState<MountSymmetry>()
  const [symmetryRuleId, setSymmetryRuleId] = useState<string>()
  const [electricalOpen, setElectricalOpen] = useState(false)
  const [pointId, setPointId] = useState<string>()
  const [notice, setNotice] = useState('')
  const [hoverOffset, setHoverOffset] = useState<number>()
  const [corner, setCorner] = useState<Point>()
  const [pointer, setPointer] = useState<Point>()
  const drawing = Boolean(drawCovering)
  useEffect(() => {
    setCorner(undefined); setPointer(undefined); setCopy(undefined); setSymmetry(undefined); setSymmetryRuleId(undefined); setNotice('')
    setElectricalOpen(false); setPointId(undefined)
    const current = drag.current
    drag.current = null
    if (current && svg.current?.hasPointerCapture(current.pointerId)) svg.current.releasePointerCapture(current.pointerId)
    setMoveDraft(undefined)
    return () => previewMount(undefined)
  }, [drawing, wall.id, previewMount])
  useEffect(() => {
    if (!drawing && electricalFocus?.wallId === wall.id) {
      setPointId(electricalFocus.id)
      setElectricalOpen(true)
    }
  }, [electricalFocus, wall.id, drawing])
  useEffect(() => setNotice(''), [project.items])
  const selected = project.items.find(item => item.id === itemId && item.mount?.wallId === wall.id)
  const moving = moveDraft && moveDraft.item.id === itemId ? moveDraft : undefined
  const shown = moving?.item ?? selected
  const fit = moving ?? (selected && wallMountFit(project, selected, edges))
  const copying = !drawing && selected && copy?.sourceId === selected.id ? copy : undefined
  const proposedCopy = copying && selected ? wallCopyPreview(project, selected, copying, edges) : undefined
  const symmetryOptions = useMemo(() => wallSymmetryOptions(project, edge, edges), [project, edge, edges])
  const wallRules = (project.mountSymmetries ?? []).filter(rule => rule.wallId === wall.id)
  const symmetryPreview = useMemo(() => !drawing && symmetry?.wallId === wall.id ? wallSymmetryPreview(project, symmetry, edges) : undefined,
    [project, symmetry, edges, drawing, wall.id])
  const elevation = moving ? { ...project, items: project.items.map(item => item.id === moving.item.id ? moving.item : item) } : project
  const { objects, mounted } = elevationData(elevation, edge, edges)
  const points = useMemo(() => electricalReadings(elevation, edges, wall.id), [elevation, edges, wall.id])
  const bounded = (position: Point) => ({
    x: Math.round(Math.max(0, Math.min(w, position.x))),
    z: Math.round(Math.max(0, Math.min(h, position.z))),
  })
  function areaBetween(a: Point, b: Point) {
    return { start: Math.min(a.x, b.x), bottom: h - Math.max(a.z, b.z),
      width: Math.abs(a.x - b.x), height: Math.abs(a.z - b.z) }
  }
  const draft = corner && pointer && areaBetween(corner, pointer)
  const tiles = wallCoveringCells(project.style, wall, h)
  const wardrobes = objects.filter(row => row.item.kind === 'wardrobe')
  const obstacles = wardrobes.length ? assemblyObstacles(project) : []

  function chooseItem(item: Furniture) {
    setNotice('')
    setSymmetry(undefined)
    if (item.id !== copy?.sourceId) setCopy(undefined)
    selectItem(item.id)
  }
  function openPoint(id: string) {
    setSymmetry(undefined)
    setCopy(undefined)
    setElectricalOpen(true)
    setPointId(id)
  }
  function chooseSymmetryRule(id: string) {
    const saved = wallRules.find(rule => rule.id === id)
    setSymmetryRuleId(saved?.id)
    if (saved) {
      const { id: _, ...setup } = saved
      setSymmetry(setup)
    } else setSymmetry(newMountSymmetry(symmetryOptions, wall.id, selected?.id))
  }

  function startMove(event: PointerEvent<SVGRectElement>, item: Furniture) {
    if (drawing || !svg.current || event.button !== 0 || drag.current) return
    event.stopPropagation()
    chooseItem(item)
    if (!canMoveWallMount(item)) return
    drag.current = { project, item, scale: svg.current.getScreenCTM()?.d || 1, clientX: event.clientX,
      clientY: event.clientY, pointerId: event.pointerId,
      origin: { bottom: item.mount!.bottom, offset: mountOffset(edge, item.width, item.mount!.offset) } }
    event.currentTarget.focus({ preventScroll: true })
    svg.current.setPointerCapture(event.pointerId)
  }

  function finishMove(cancel = false) {
    const current = drag.current
    if (!current) return
    drag.current = null
    if (svg.current?.hasPointerCapture(current.pointerId)) svg.current.releasePointerCapture(current.pointerId)
    setMoveDraft(undefined)
    previewMount(undefined)
    if (cancel || current.project !== project || !current.preview || !current.axis) return
    const value = current.preview.item.mount![current.axis]
    if (value === current.origin[current.axis]) return
    if (current.preview.blocked) setNotice(current.preview.blocked)
    else commitMove(current.item.id, current.axis, value)
  }

  function changeWithKeys(event: KeyboardEvent<SVGRectElement>, item: Furniture) {
    if (drawing || drag.current) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      chooseItem(item)
      return
    }
    const axis: MountAxis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'offset' : 'bottom'
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !canMoveWallMount(item)) return
    event.preventDefault()
    chooseItem(item)
    const step = event.altKey ? 1 : snap ? 50 : 10
    const initial = axis === 'offset' ? mountOffset(edge, item.width, item.mount!.offset) : item.mount!.bottom
    const positive = event.key === 'ArrowUp' || event.key === 'ArrowRight'
    const next = wallMovePreview(project, item, axis, initial + (positive ? step : -step), edges)
    if (!next || next.item.mount![axis] === initial) return
    if (next.blocked) setNotice(next.blocked)
    else commitMove(item.id, axis, next.item.mount![axis])
  }

  return <div className="wall-elevation-view">
    <div className="wall-edit-tools">
      <label className="measure">Görünüş duvarı <select value={wall.id} onChange={event => selectWall(event.currentTarget.value)}>
        {edges.map(({ wall, index }) => <option key={wall.id} value={wall.id}>Duvar {index + 1} · {fmt(wall.length)} cm</option>)}
      </select></label>
      {!drawing && <>
        <button type="button" aria-pressed={snap} onClick={() => setSnap(!snap)}><Move size={15} /> 5 cm’ye hizala</button>
        {selected && canCopyWallMount(selected) && <button type="button" aria-expanded={Boolean(copying)} onClick={() => {
          setElectricalOpen(false)
          setSymmetry(undefined)
          setCopy(copying ? undefined : { id: uid(), sourceId: selected.id, distance: Math.max(600, selected.width + 100), direction: 1 })
        }}>
          <Copy size={15} /> Aynı kotta çoğalt
        </button>}
        <button type="button" aria-expanded={Boolean(symmetryPreview)} disabled={symmetryOptions.mounts.length < 2 && !wallRules.length} onClick={() => {
          setElectricalOpen(false)
          setCopy(undefined)
          if (symmetry) setSymmetry(undefined)
          else chooseSymmetryRule(wallRules.find(rule => rule.leftId === selected?.id || rule.rightId === selected?.id)?.id ??
            wallRules[0]?.id ?? '')
        }}><FlipHorizontal2 size={15} /> Simetrik yerleştir</button>
        <button type="button" aria-expanded={electricalOpen} onClick={() => {
          setCopy(undefined); setSymmetry(undefined); setElectricalOpen(!electricalOpen)
        }}><Plug size={15} /> Elektrik noktaları</button>
      </>}
    </div>
    <WallSurveyReading project={project} edge={edge} />
    {drawing && <div className="wall-draw-actions">
      <span role="status">{corner ? 'Karşı köşeyi işaretle.' : 'Kaplamanın ilk köşesini işaretle.'}</span>
      <button type="button" onClick={cancelCovering}>Vazgeç</button>
    </div>}
    {copying && <form className="wall-copy-controls" aria-label="Aynı kotta çoğaltma" onSubmit={event => {
      event.preventDefault()
      if (proposedCopy?.item && !proposedCopy.blocked && copyMount(copying)) setCopy(undefined)
    }}>
      <label className="measure">Çoğaltma yönü <select value={copying.direction} onChange={event =>
        setCopy({ ...copying, direction: event.currentTarget.value === '1' ? 1 : -1 })}>
        <option value={1}>Sağa · duvar bitişine</option><option value={-1}>Sola · duvar başlangıcına</option>
      </select></label>
      <Measure label="Merkezler arası" value={copying.distance} min={.1} change={distance => setCopy({ ...copying, distance })} />
      <button type="submit" className="primary" disabled={Boolean(proposedCopy?.blocked)}>Kopyayı ekle</button>
      <button type="button" onClick={() => setCopy(undefined)}>Vazgeç</button>
      {proposedCopy?.blocked && <p className="error-message" role="status">{proposedCopy.blocked}</p>}
    </form>}
    {symmetry && symmetryPreview && <WallSymmetryControls project={project} setup={symmetry} options={symmetryOptions} preview={symmetryPreview}
      update={setSymmetry} close={() => setSymmetry(undefined)}
      rules={wallRules} ruleId={symmetryRuleId} pickRule={chooseSymmetryRule}
      removeRule={id => { if (removeSymmetry(id)) setSymmetry(undefined) }}
      apply={save => { if (commitSymmetry(symmetry, save, symmetryRuleId)) setSymmetry(undefined) }} />}
    {!drawing && electricalOpen && <ElectricalPointEditor key={wall.id} wall={wall} height={h} readings={points}
      selectedId={pointId} select={setPointId} save={next => saveElectrical(wall.id, next)} />}
    {!drawing && <div className="wall-height-reading" role="status">
      {shown?.mount && fit ? <>
        <strong>{shown.name}</strong>
        <span>Alt kot {fmt(shown.mount.bottom)} cm · Üst kot {fmt(shown.mount.bottom + shown.height)} cm</span>
        <span>Merkez {fmt(mountOffset(edge, shown.width, shown.mount.offset))} cm</span>
        <span className={fit.blocked || notice ? 'error-message' : undefined}>
          {notice || fit.blocked || `${fit.obstruction ? fit.obstruction + ' altında' : 'Tavana kadar'} ${fmt(fit.clearance)} cm boşluk`}
        </span>
      </> : <span>Yeri için sağa veya sola, kotu için yukarı veya aşağı sürükle.</span>}
    </div>}
    <svg ref={svg} aria-label="Duvar görünüşü" role={drawing ? 'img' : 'group'} viewBox={`-410 -370 ${w + 820} ${h + 930}`}
      data-drawing-covering={drawing || undefined} onPointerMove={event => {
        if (drawing) { setPointer(bounded(svgPoint(event.currentTarget, event))); return }
        const current = drag.current
        if (!current || current.pointerId !== event.pointerId) {
          if (selected?.mount && copyControls?.options.length) {
            const p = svgPoint(event.currentTarget, event)
            const bottom = selected.mount.bottom
            const near = p.z >= h - bottom - selected.height - size && p.z <= h - bottom + size &&
              Math.abs(p.x - selected.mount.offset) <= selected.width + size
            setHoverOffset(near ? Math.sign(p.x - selected.mount.offset) : undefined)
          }
          return
        }
        if (current.project !== project) { finishMove(true); return }
        const dx = event.clientX - current.clientX
        const dy = current.clientY - event.clientY
        if (!current.axis) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return
          current.axis = Math.abs(dx) > Math.abs(dy) ? 'offset' : 'bottom'
        }
        const change = (current.axis === 'offset' ? dx : dy) / current.scale
        current.preview = wallMovePreview(project, current.item, current.axis, current.origin[current.axis] + change, edges,
          snap && !event.altKey ? 50 : 1)
        setMoveDraft(current.preview)
        previewMount(current.preview?.item)
      }} onPointerLeave={() => setHoverOffset(undefined)} onPointerDown={event => {
        if (event.button !== 0) return
        if (!drawCovering) {
          setCopy(undefined); setSymmetry(undefined); setNotice(''); selectWall(wall.id)
          return
        }
        const point = bounded(svgPoint(event.currentTarget, event))
        if (!corner) { setCorner(point); setPointer(point); return }
        const area = areaBetween(corner, point)
        if (area.width && area.height) drawCovering(area)
      }} onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) finishMove() }}
      onPointerCancel={event => { if (drag.current?.pointerId === event.pointerId) finishMove(true) }}
      onLostPointerCapture={event => { if (drag.current?.pointerId === event.pointerId) finishMove(true) }}
      onKeyDown={event => {
        if (event.key !== 'Escape') return
        if (drag.current) finishMove(true)
        else if (copying) setCopy(undefined)
        else if (symmetry) setSymmetry(undefined)
      }}>
      <rect width={w} height={h} fill="#f1f0e7" stroke="#596b60" strokeWidth="12" />
      {tiles.map(({ start, bottom, width, height, color }) => <rect key={`${start}:${bottom}`}
        x={start} y={h - bottom - height} width={width} height={height} fill={color} />)}
      {wall.openings.map(opening => <rect key={opening.id} x={opening.offset} y={h - opening.bottom - opening.height}
        width={opening.width} height={opening.height} fill={opening.kind === 'door' ? '#fcfaf4' : '#d7e9ea'}
        stroke="#789394" strokeWidth="12"><title>{opening.kind === 'door' ? 'Kapı' : 'Pencere'}</title></rect>)}
      {wall.openings.flatMap(opening => {
        const sill = windowSill(wall, opening)
        return sill ? [<rect key={opening.id} x={sill.start} y={h - opening.bottom - sill.thickness}
          width={sill.width} height={sill.thickness} fill={sillAppearance(sill).color ?? sillColor(sill.finish)} stroke="#6f7971" strokeWidth="7">
          <title>Mermer denizlik · {fmt(sill.width)} × {fmt(sill.depth)} × {fmt(sill.thickness)} cm</title>
        </rect>] : []
      })}
      {wallTrimPieces(wall, h).map((piece, i) => <rect key={i} x={piece.start} y={h - piece.top}
        width={piece.end - piece.start} height={piece.top - piece.bottom} fill={piece.appearance.color ?? '#ede9df'} stroke="#7d887c" strokeWidth="5">
        <title>{trimLabels[piece.kind]} · {fmt(piece.depth)} cm taşma</title>
      </rect>)}
      {objects.map(({ item, left, width, top, bottom, mounted }) => <rect key={item.id}
        x={left} y={h - top} width={width} height={top - bottom} rx="18" fill={item.color}
        fillOpacity={mounted ? '.82' : '.4'} stroke={mounted ? '#126a62' : '#52685d'} strokeWidth={mounted ? '18' : '11'}
        className={mounted && !drawing ? 'wall-editable-item' : undefined}
        data-wall-movable={mounted && !drawing && canMoveWallMount(item) || undefined}
        data-blocked={item.id === moving?.item.id && Boolean(moving.blocked) || undefined}
        role={mounted && !drawing ? 'button' : undefined} aria-label={mounted && !drawing ? item.name : undefined}
        aria-pressed={mounted && !drawing ? item.id === itemId : undefined} tabIndex={mounted && !drawing ? 0 : undefined}
        onPointerDown={mounted && !drawing ? event => startMove(event, item) : undefined}
        onKeyDown={mounted && !drawing ? event => changeWithKeys(event, item) : undefined}>
        <title>{item.name} · {fmt(bottom)}–{fmt(top)} cm</title></rect>)}
      {wall.obstacles.map(obstacle => <g key={obstacle.id} pointerEvents="none">
        <rect x={obstacle.offset} y={h - obstacle.top} width={obstacle.width} height={obstacle.top - obstacle.bottom}
          fill="#efd39a" fillOpacity=".73" stroke="#8c663e" strokeWidth="15" />
        <title>{obstacle.name} · {fmt(obstacle.bottom)}–{fmt(obstacle.top)} cm</title>
      </g>)}
      {!!trimContacts.length && !moving && <g role="img" aria-label="Duvar detayı çakışma bölgeleri" pointerEvents="none" className="trim-contact-mark">
        {trimContacts.map((contact, index) => <rect key={index} x={contact.start} y={h - contact.top} vectorEffect="non-scaling-stroke"
          width={contact.end - contact.start} height={contact.top - contact.bottom}><title>{trimContactText(contact)}</title></rect>)}
      </g>}
      {mounted.map(({ item, center, bottom, top, number }) => <g key={item.id} className="wall-mount-marker" pointerEvents="none">
        <line x1={center} y1={h - bottom} x2={center} y2={h + 34} />
        <circle cx={center} cy={h - (bottom + top) / 2} r={size * .47} />
        <text x={center} y={h - (bottom + top) / 2} fontSize={size * .53} textAnchor="middle" dominantBaseline="central">{number}</text>
      </g>)}
      {proposedCopy?.item && (() => {
        const item = proposedCopy.item
        const source = mounted.find(row => row.item.id === copying!.sourceId)!
        const target = item.mount!.offset
        const guideY = Math.min(h + 32, h - item.mount!.bottom + size * .56)
        return <g className={proposedCopy.blocked ? 'wall-copy-guide blocked' : 'wall-copy-guide'} pointerEvents="none">
          <rect className="wall-copy-ghost" x={target - item.width / 2} y={h - item.mount!.bottom - item.height}
            width={item.width} height={item.height} rx="18" vectorEffect="non-scaling-stroke" />
          <path d={`M ${source.center} ${guideY - size * .19} v ${size * .38} M ${source.center} ${guideY} H ${target}
            M ${target} ${guideY - size * .19} v ${size * .38}`} vectorEffect="non-scaling-stroke" />
          <text x={(source.center + target) / 2} y={guideY - size * .20} textAnchor="middle" fontSize={size * .75}
            className="wall-label">{fmt(copying!.distance)} cm</text>
          <title>{item.name} · {fmt(copying!.distance)} cm merkez aralığı</title>
        </g>
      })()}
      {symmetryPreview && <WallSymmetryGuide preview={symmetryPreview} height={h} size={size} />}
      {points.map(reading => <ElectricalMarker key={reading.point.id} reading={reading}
        x={reading.point.offset} y={h - reading.point.height} radius={size * .86}
        selected={electricalOpen && reading.point.id === (pointId ?? points[0]?.point.id)}
        choose={drawing ? undefined : () => openPoint(reading.point.id)} />)}
      {drawing && draft && <rect x={draft.start} y={h - draft.bottom - draft.height} width={draft.width} height={draft.height}
        fill="#237b9930" stroke="#237b99" strokeWidth="12" strokeDasharray="33 18" pointerEvents="none" />}
      <path d={`M 0 ${h + 25} V ${h + 132} M 0 ${h + 80} H ${w} M ${w} ${h + 25} V ${h + 132}`}
        fill="none" stroke="#596b60" strokeWidth="10" />
      <text x={w / 2} y={-115} textAnchor="middle" fontSize={size} className="wall-label">Duvar {edge.index + 1} · {fmt(w)} cm</text>
      <text x={-128} y={h / 2} textAnchor="middle" fontSize={size * .9} className="wall-label"
        transform={`rotate(-90 -128 ${h / 2})`}>{fmt(h)} cm</text>
      <text x={0} y={h + 250} fontSize={size * .81} className="wall-label">Duvar başlangıcı</text>
      <text x={w} y={h + 250} fontSize={size * .81} textAnchor="end" className="wall-label">Bitmiş zemin · 0 cm</text>
      {selected?.mount && copyControls?.sourceId === selected.id && !drawing && !moving && !copying && !symmetry && !electricalOpen &&
        copyControls.options.map(({ side, item }) => {
          const mount = selected.mount!, sign = Math.sign(item.mount!.offset - mount.offset)
          return <AdjacentCopyHandle key={selected.id + side} side={side} radius={size} hot={hoverOffset === sign} add={copyControls.add}
            x={mount.offset + sign * (selected.width / 2 + size)} y={h - mount.bottom - selected.height / 2} />
        })}
    </svg>
    {wardrobes.length > 0 && <section className="mount-table-panel" aria-label="Gardırop montaj boşluğu">
      <h3>Gardırop montaj boşluğu</h3>
      {wardrobes.map(({ item }) => <div key={item.id}><h4>{item.name}</h4>
        <AssemblyReadings result={wardrobeAssembly(project, item, obstacles)} /></div>)}
    </section>}
    {mounted.length > 0 && <section className="mount-table-panel" aria-label="Montaj ölçüleri">
      <h3>Montaj ölçüleri <small>cm</small></h3>
      <table className="mount-table">
        <thead><tr><th scope="col">Eşya</th><th scope="col">Sol kenar</th><th scope="col">Merkez</th>
          <th scope="col">Alt kot</th><th scope="col">Üst kot</th><th scope="col">G × D × Y</th></tr></thead>
        <tbody>{mounted.map(({ item, number, left, center, bottom, top }) => <tr key={item.id}>
          <th scope="row">{number}. {item.name}</th><td>{fmt(left)}</td><td>{fmt(center)}</td>
          <td>{fmt(bottom)}</td><td>{fmt(top)}</td><td>{sizeInCm(item)}</td>
        </tr>)}</tbody>
      </table>
    </section>}
  </div>
}
