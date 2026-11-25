import { useEffect, useId, useRef, useState } from 'react'
import { CornerDownLeft, ImagePlus, RotateCcw, Square, X } from 'lucide-react'
import { roomEdges, validateOutline, validateProject, vertices } from './geometry'
import { fmt, makeWall, uid } from './model'
import type { Point, Project, SketchReference, Wall } from './model'
import { Measure } from './fields'
import { dropUnusedWallCoverings } from './design-variants'
import { svgPoint } from './PlanCanvas'
import { SketchOverlay } from './SketchOverlay'
import { SketchTools } from './SketchTools'
import type { OpeningReview, RulerTool, SketchTool } from './SketchTools'
import { openSketch, sketchPixels } from './sketch-file'
import { defaultSketchReference, rotateSketchReference, sheetDistance, sheetHeight, sheetWidth, sketchScale,
  traceSketchWalls } from './sketch-reference'

type Props = { project: Project; edit: boolean; close: () => void; apply: (project: Project) => void }

export function DrawDialog({ project, edit, close, apply }: Props) {
  const photoInput = useRef<HTMLInputElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const grid = useId()
  const [sketch, setSketch] = useState(project.sketch)
  const [reference, setReference] = useState<SketchReference>(project.sketchReference ?? defaultSketchReference)
  const [tool, setTool] = useState<RulerTool>()
  const [suggestion, setSuggestion] = useState<{ points: Point[]; walls: Wall[]; openings: OpeningReview[] }>()
  const [busy, setBusy] = useState(false)
  const [points, setPoints] = useState<Point[]>([])
  const [wallDraft, setWallDraft] = useState<Wall[] | undefined>(edit ? project.walls : undefined)
  const [pointer, setPointer] = useState<Point>()
  const [height, setHeight] = useState(project.height)
  const [thickness, setThickness] = useState(project.thickness)
  const [notice, setNotice] = useState('')
  const extent = { width: sheetWidth, height: sheetHeight }
  const mmPerUnit = sketch && sketchScale(reference) || undefined

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { element?.close() }
  }, [])

  const snap = (point: Point) => {
    const step = mmPerUnit ? .5 : 5
    const pixel = { x: Math.max(0, Math.min(sheetWidth, Math.round(point.x / step) * step)),
      z: Math.max(0, Math.min(sheetHeight, Math.round(point.z / step) * step)) }
    if (points.length === 0) return pixel
    const last = points.at(-1)!
    const previous = points.at(-2)
    const horizontal = previous ? previous.x === last.x : Math.abs(pixel.x - last.x) >= Math.abs(pixel.z - last.z)
    return horizontal ? { x: pixel.x, z: last.z } : { x: last.x, z: pixel.z }
  }

  function finish() {
    if (points.length < 4) {
      setNotice('Odayı kapatmak için önce en az dört köşe işaretleyin.')
      return
    }
    const first = points[0], last = points.at(-1)!
    if (first.x !== last.x && first.z !== last.z) {
      setNotice('Son köşeyi ilk köşeyle aynı yatay veya dikey çizgiye getirin.')
      return
    }
    const walls = traceSketchWalls(points, mmPerUnit ?? 10)
    const reason = validateOutline(walls)
    if (reason) { setNotice(reason); return }
    setNotice('')
    setWallDraft(walls)
    if (mmPerUnit) setReference({ ...reference, origin: first })
  }

  function choosePreset(lShape = false) {
    const walls = lShape ? [
      makeWall(0, 4200), makeWall(1, 2100), makeWall(2, 1500),
      makeWall(1, 1300), makeWall(2, 2700), makeWall(3, 3400),
    ] : [makeWall(0, 4200), makeWall(1, 3400), makeWall(2, 4200), makeWall(3, 3400)]
    setPoints([])
    setReference({ ...reference, origin: undefined })
    setWallDraft(walls)
    setNotice('')
  }

  async function upload(file?: File) {
    if (!file || busy) return
    setBusy(true)
    try {
      setSketch(await openSketch(file))
      setReference(defaultSketchReference)
      setTool(undefined)
      setSuggestion(undefined)
      setNotice('')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Taslak dosyası açılamadı.') }
    finally { setBusy(false) }
  }

  function startTool(kind: SketchTool) {
    const ruler = kind === 'origin' ? undefined : reference[kind]
    setTool({ kind, mm: ruler?.mm ?? 1000, points: [] })
    setNotice('')
  }

  function handleTool(point: Point, current: RulerTool) {
    if (current.kind === 'origin') {
      setReference({ ...reference, origin: point })
      setTool(undefined)
      setNotice('')
      return
    }
    const first = current.points.length === 1 ? current.points[0] : undefined
    if (first && sheetDistance(first, point) < 4) { setNotice('Ölçü için birbirinden uzak iki nokta seçin.'); return }
    setTool({ ...current, points: first ? [first, point] : [point] })
    setNotice('')
  }

  function confirmTool() {
    if (!tool || tool.kind === 'origin' || tool.points.length !== 2) return
    const [from, to] = tool.points
    setReference({ ...reference, [tool.kind]: { from, to, mm: tool.mm },
      origin: reference.origin ?? (edit ? drawn[0] : undefined) })
    setTool(undefined)
    setNotice('')
  }

  async function suggestRoom() {
    if (!sketch || !mmPerUnit || busy) return
    setBusy(true)
    setNotice('')
    try {
      const { suggestSketchRoom } = await import('./sketch-suggestion')
      const candidate = suggestSketchRoom(await sketchPixels(sketch, reference.rotation), mmPerUnit)
      if (candidate) setSuggestion({ ...candidate, openings: candidate.openings.map(opening => ({ ...opening, accepted: false })) })
      else setNotice('Kapalı bir dik açılı oda bulunamadı. Görseli hizalayın veya köşeleri elle işaretleyin.')
    } catch { setNotice('Plan önerisi oluşturulamadı. Köşeleri elle işaretleyebilirsiniz.') }
    finally { setBusy(false) }
  }

  function acceptSuggestion() {
    if (!suggestion) return
    const walls = suggestion.walls.map((wall, i) => ({ ...wall,
      openings: suggestion.openings.filter(opening => opening.accepted && opening.wall === i).map(opening => {
        const bottom = opening.kind === 'door' ? 0 : Math.min(900, Math.round(height / 2))
        return { id: uid(), kind: opening.kind, offset: opening.offset, width: opening.width, bottom,
          height: Math.min(opening.kind === 'door' ? 2100 : 1100, Math.max(1, height - bottom)),
          swing: opening.kind === 'door' ? { hinge: 'start' as const, angle: 90 } : undefined }
      }) }))
    setReference({ ...reference, origin: suggestion.points[0] })
    setPoints([])
    setSuggestion(undefined)
    setWallDraft(walls)
  }

  const exact = wallDraft ? vertices(wallDraft) : []
  const xs = exact.map(p => p.x), zs = exact.map(p => p.z)
  const minX = Math.min(0, ...xs), minZ = Math.min(0, ...zs)
  const rangeX = Math.max(1, ...xs) - minX, rangeZ = Math.max(1, ...zs) - minZ
  const scale = Math.min(650 / rangeX, 350 / rangeZ)
  const origin = reference.origin
  const drawn = wallDraft ? exact.map(p => mmPerUnit && origin ? { x: origin.x + p.x / mmPerUnit, z: origin.z + p.z / mmPerUnit }
    : { x: 390 + (p.x - minX - rangeX / 2) * scale, z: 240 + (p.z - minZ - rangeZ / 2) * scale }) : points
  const error = wallDraft && validateOutline(wallDraft)
  const pointList = drawn.map(p => `${p.x},${p.z}`).join(' ')

  function submit() {
    if (!wallDraft || error) return
    if (edit) {
      const revised = roomEdges(wallDraft)
      const moved = roomEdges(project.walls).find(({ wall, index, a, b }) => wall.locked
        && (a.x !== revised[index].a.x || a.z !== revised[index].a.z || b.x !== revised[index].b.x || b.z !== revised[index].b.z))
      if (moved) { setNotice(`Duvar ${moved.index + 1} kilitli. Ölçüyü değiştirmek için kilidini aç.`); return }
    }
    const unchangedOutline = edit && height === project.height && thickness === project.thickness
      && wallDraft.every((wall, index) => wall === project.walls[index])
    const next = dropUnusedWallCoverings({ ...project, walls: wallDraft, height, thickness, sketch,
      sketchReference: sketch ? { ...reference, origin: reference.origin ?? (mmPerUnit ? drawn[0] : undefined) } : undefined,
      camera: unchangedOutline ? project.camera : undefined,
      passage: edit ? project.passage : undefined, measurements: edit ? project.measurements : undefined })
    const reason = validateProject(next)
    if (reason) { setNotice(reason); return }
    apply(next)
  }

  return <dialog ref={dialog} className="draw-dialog" onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header"><div><h2>{edit ? 'Oda ölçüleri' : 'Oda çiz'}</h2>
      <p>{edit ? 'İçten içe duvar uzunluklarını birlikte düzenleyin.' : 'Köşeleri sırayla işaretleyin, ardından gerçek ölçüleri girin.'}</p></div>
      <button className="icon" onClick={close} aria-label="Kapat"><X size={20} /></button></header>
    <div className="draw-body">
      <div className="draw-main">
        <div className="draw-actions">
          <button disabled={busy} onClick={() => photoInput.current?.click()}><ImagePlus size={16} /> Taslak yükle (JPG, PNG, PDF)</button>
          {!edit && <>
            <button disabled={busy || Boolean(tool) || Boolean(suggestion)} onClick={() => choosePreset()}><Square size={16} /> Dikdörtgen</button>
            <button disabled={busy || Boolean(tool) || Boolean(suggestion)} onClick={() => choosePreset(true)}><CornerDownLeft size={16} /> L oda</button>
            <button disabled={busy} onClick={() => { setWallDraft(undefined); setSuggestion(undefined); setTool(undefined); setPoints([]); setNotice('') }}><RotateCcw size={16} /> Temizle</button>
          </>}
          <input ref={photoInput} type="file" aria-label="Oda taslağı" accept="image/jpeg,image/png,application/pdf,.pdf" hidden onChange={event => {
            void upload(event.target.files?.[0])
            event.target.value = ''
          }} />
        </div>
        <svg className={!wallDraft || tool ? 'draw-svg can-draw' : 'draw-svg'} aria-label="Köşe çizim alanı" viewBox={`0 0 ${sheetWidth} ${sheetHeight}`}
          onPointerMove={event => setPointer(snap(svgPoint(event.currentTarget, event)))}
          onPointerLeave={() => setPointer(undefined)}
          onPointerDown={event => {
            if (event.button !== 0 || busy || suggestion) return
            const raw = svgPoint(event.currentTarget, event)
            if (tool) { handleTool({ x: Math.max(0, Math.min(sheetWidth, raw.x)), z: Math.max(0, Math.min(sheetHeight, raw.z)) }, tool); return }
            if (wallDraft) return
            const first = points[0]
            if (first && points.length >= 4 && Math.hypot(raw.x - first.x, raw.z - first.z) < 14) { finish(); return }
            const point = snap(raw)
            if (!points.length || point.x !== points.at(-1)!.x || point.z !== points.at(-1)!.z) {
              if (points.length >= 60) { setNotice('En fazla 60 köşe eklenebilir.'); return }
              setPoints([...points, point])
              setNotice('')
            }
          }}>
          <defs><pattern id={grid} width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 H 0 V 20" stroke="#a8b7a9" strokeOpacity=".52" strokeWidth="1" fill="none" />
          </pattern></defs>
          {sketch && <SketchOverlay source={sketch} reference={reference} />}
          <rect width={extent.width} height={extent.height} fill={`url(#${grid})`} />
          <polyline points={pointList} stroke={error ? '#a94838' : '#26594d'} strokeWidth="4" strokeLinejoin="round"
            fill={wallDraft && !error ? '#98bbb248' : 'none'} />
          {!wallDraft && !tool && !suggestion && pointer && points.length > 0 && <line x1={points.at(-1)?.x} y1={points.at(-1)?.z}
            x2={pointer.x} y2={pointer.z} stroke="#4d786a" strokeWidth="2" strokeDasharray="6 5" />}
          {drawn.map((p, i) => <circle key={i} cx={p.x} cy={p.z} r={i === 0 ? 7 : 4} fill={i === 0 ? '#fff' : '#26594d'} stroke="#26594d" strokeWidth="2" />)}
          {wallDraft?.map((w, i) => <text key={w.id} x={(drawn[i].x + drawn[i + 1].x) / 2}
            y={(drawn[i].z + drawn[i + 1].z) / 2 - 9} className="draft-label" textAnchor="middle">{fmt(w.length)} cm</text>)}
          {suggestion && <>
            <polygon points={suggestion.points.map(p => `${p.x},${p.z}`).join(' ')} stroke="#23645b" strokeWidth="4"
              strokeDasharray="9 5" fill="#68b4a128" />
            {suggestion.openings.map(opening => {
              const a = suggestion.points[opening.wall], b = suggestion.points[(opening.wall + 1) % suggestion.points.length]
              const length = suggestion.walls[opening.wall].length
              const point = (distance: number) => ({ x: a.x + (b.x - a.x) * distance / length,
                z: a.z + (b.z - a.z) * distance / length })
              const start = point(opening.offset), end = point(opening.offset + opening.width)
              return <line key={`${opening.wall}-${opening.offset}`} x1={start.x} y1={start.z} x2={end.x} y2={end.z}
                stroke={opening.accepted ? '#16766b' : '#b25921'} strokeWidth="6" />
            })}
          </>}
          {([reference.calibration, reference.verification] as const).map((ruler, index) => ruler && <g key={index} className="sketch-ruler" stroke={index ? '#a04d25' : '#1f4f8b'}>
            <line x1={ruler.from.x} y1={ruler.from.z} x2={ruler.to.x} y2={ruler.to.z} />
            {[ruler.from, ruler.to].map((p, i) => <circle key={i} cx={p.x} cy={p.z} r="5" />)}
          </g>)}
          {tool && <g className="sketch-ruler" stroke="#1f4f8b">
            {tool.points.length === 2 && <line x1={tool.points[0].x} y1={tool.points[0].z} x2={tool.points[1].x} y2={tool.points[1].z} />}
            {tool.points.map((p, index) => <circle key={index} cx={p.x} cy={p.z} r="6" />)}
          </g>}
        </svg>
        {sketch && <SketchTools reference={reference} tool={tool} edit={edit} draft={Boolean(wallDraft)} busy={busy}
          opacity={opacity => setReference({ ...reference, opacity })} rotate={angle => setReference(rotateSketchReference(reference, angle))}
          start={startTool} distance={mm => setTool(current => current && { ...current, mm })} confirm={confirmTool}
          cancel={() => setTool(undefined)} suggest={() => void suggestRoom()}
          openings={suggestion?.openings} review={(index, patch) => suggestion && setSuggestion({ ...suggestion,
            openings: suggestion.openings.map((opening, i) => i === index ? { ...opening, ...patch } : opening) })}
          accept={acceptSuggestion} discard={() => setSuggestion(undefined)} />}
        {!wallDraft && !suggestion && !tool && <div className="draw-actions">
          <button disabled={!points.length} onClick={() => { setPoints(points.slice(0, -1)); setNotice('') }}>Son köşeyi geri al</button>
          <button disabled={points.length < 4} onClick={finish}>Planı kapat</button>
        </div>}
      </div>
      <div className="draw-fields">
        <h3>İç ölçüler</h3>
        <Measure label="Tavan yüksekliği" value={height} min={1} change={setHeight} />
        <Measure label="Duvar kalınlığı" value={thickness} min={1} change={setThickness} />
        {wallDraft?.map((wall, i) => <Measure key={wall.id} label={`Duvar ${i + 1}`} value={wall.length} min={.1} disabled={wall.locked}
          change={length => { setWallDraft(wallDraft.map(w => w.id === wall.id ? { ...w, length } : w)); setNotice('') }} />)}
      </div>
    </div>
    <footer className="dialog-footer">
      <span role="status">{notice || error || (wallDraft ? 'Ölçüler geçerli.' : '')}</span>
      <button onClick={close}>Vazgeç</button>
      <button className="primary" onClick={submit} disabled={!wallDraft || Boolean(error) || Boolean(tool) || busy}>{edit ? 'Ölçüleri kaydet' : 'Odayı oluştur'}</button>
    </footer>
  </dialog>
}
