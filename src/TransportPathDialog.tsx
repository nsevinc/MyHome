import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Measure } from './fields'
import { bounds, footprintCorners, pointInRoom, roomEdges, wallMountPose, wallPoint } from './geometry'
import { fmt, maxTransportPoints } from './model'
import type { Furniture, Point, Project, TransportPath } from './model'
import { svgPoint } from './PlanCanvas'
import { defaultEntryDepth, inspectTransportPath, routeDoors, snapRoutePoint } from './transport-path'
import { assemblyObstacles, transportOrientations } from './wardrobe-assembly'
import type { TransportOrientation } from './wardrobe-assembly'

const polygon = (points: Point[]) => points.map(p => `${p.x},${p.z}`).join(' ')
const detail = ({ x, z }: Point) => `X ${fmt(Math.round(x))} · Z ${fmt(Math.round(z))} cm`

export function TransportPathDialog({ project, item, save, close, initialOrientation = 'upright' }: {
  project: Project; item: Furniture; save: (path?: TransportPath) => void; close: () => void;
  initialOrientation?: TransportOrientation
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const doors = useMemo(() => routeDoors(project), [project])
  const [path, setPath] = useState<TransportPath>(() => item.assembly?.routePath ?? {
    entrance: doors[0]?.opening.id ?? '', points: [], finish: 'x',
  })
  const [orientation, setOrientation] = useState<TransportOrientation>(initialOrientation)
  const [error, setError] = useState('')
  const [stepAxis, setStepAxis] = useState<TransportPath['finish']>('x')
  const edges = useMemo(() => roomEdges(project.walls), [project.walls])
  const measured = useMemo(() => {
    const blocks = assemblyObstacles(project)
    return transportOrientations.map(([id, name]) =>
      ({ id, name, ...inspectTransportPath(project, item, path, id, blocks) }))
  }, [project, item, path])
  const result = measured.find(row => row.id === orientation)!
  const entrance = doors.find(door => door.opening.id === path.entrance)
  const entranceEnds = entrance && [wallPoint(entrance.edge, entrance.opening.offset),
    wallPoint(entrance.edge, entrance.opening.offset + entrance.opening.width)] as [Point, Point] | undefined
  const route = result.points
  const floor = edges.map(edge => edge.a)
  const map = bounds([...floor, ...route])
  const lastPoint = path.points.at(-1) ?? route[1]
  const valid = Boolean(entrance && route[1] && pointInRoom(route[1], edges)
    && path.points.every((point, index, points) => {
      const previous = points[index - 1] ?? route[1]
      return pointInRoom(point, edges) && ((point.x === previous.x) !== (point.z === previous.z))
    }))
  const stepLabel = (step: number) => step === route.length ? 'Montaj konumu' : `${step}. rota parçası`

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  function add(position: Point, axis?: TransportPath['finish']) {
    if (!lastPoint || path.points.length >= maxTransportPoints) return
    const point = snapRoutePoint(lastPoint, position, axis)
    if (!pointInRoom(point, edges) || (point.x === lastPoint.x && point.z === lastPoint.z)) {
      setError('Rota için oda içinde farklı bir nokta seçin.')
      return
    }
    setPath(current => ({ ...current, points: [...current.points, point] }))
    setError('')
  }

  return <dialog ref={dialog} className="render-dialog transport-dialog" aria-labelledby="transport-path-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header">
      <div><h2 id="transport-path-title">Ölçülü taşıma rotası</h2><p>{item.name} · Oda kapısından montaj konumuna</p></div>
      <button type="button" className="icon" aria-label="Taşıma rotasını kapat" onClick={close}><X size={18} /></button>
    </header>
    <div className="render-body transport-body">
      <div className="render-stack">
        <svg role="img" aria-label="Taşıma rota planı" viewBox={`${map.x - 170} ${map.z - 170} ${map.width + 340} ${map.depth + 340}`}
          onPointerDown={event => { if (event.button === 0) add(svgPoint(event.currentTarget, event)) }}>
          <polygon points={polygon(floor)} fill="#f5f1e4" stroke="#5a6e62" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {entranceEnds && <line x1={entranceEnds[0].x} y1={entranceEnds[0].z} x2={entranceEnds[1].x} y2={entranceEnds[1].z}
            stroke="#78aeb0" strokeWidth="4" vectorEffect="non-scaling-stroke"><title>Giriş · {fmt(entrance!.opening.width)} cm</title></line>}
          {project.items.map(source => {
            const object = wallMountPose(source, edges)
            return <polygon key={source.id} points={polygon(footprintCorners(object))}
              fill={object.color} fillOpacity={object.id === item.id ? '.36' : '.55'}
              stroke={object.id === item.id ? '#166f67' : '#64655e'} vectorEffect="non-scaling-stroke"><title>{object.name}</title></polygon>
          })}
          {route.length > 1 && <polyline points={polygon(route)} fill="none" stroke={result.contact ? '#9b5e50' : '#0d786e'}
            strokeWidth="3" strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />}
          {route.map((point, index) => <circle key={index} cx={point.x} cy={point.z} r={map.width / 105} fill={index === 0 ? '#a77645' : '#0d786e'}>
            <title>{index === 0 ? 'Başlangıç' : `${index}. nokta`} · {detail(point)}</title></circle>)}
          {result.contact && <circle cx={result.contact.point.x} cy={result.contact.point.z} r={map.width / 53}
            stroke="#9d3428" strokeWidth="2" fill="#ffc7ae" vectorEffect="non-scaling-stroke"><title>{result.contact.name}</title></circle>}
        </svg>
        <p className="meta">Plana tıklayarak yatay veya dikey rota noktaları ekleyin. Son nokta gardırobun mevcut merkezidir.</p>
        {error && <p role="alert">{error}</p>}
        <div className="draw-actions">
          <button disabled={!path.points.length} onClick={() => { setPath({ ...path, points: path.points.slice(0, -1) }); setError('') }}>Son noktayı sil</button>
          <button disabled={!path.points.length} onClick={() => { setPath({ ...path, points: [] }); setError('') }}>Ara noktaları temizle</button>
        </div>
      </div>
      <div className="render-stack">
        <label className="measure"><span>Giriş kapısı</span><select value={path.entrance} onChange={event => {
          setPath({ ...path, entrance: event.currentTarget.value, points: [] }); setError('')
        }}>
          {!doors.some(door => door.opening.id === path.entrance) && <option value={path.entrance}>Kapı seçin</option>}
          {doors.map(({ opening, label }) => <option key={opening.id} value={opening.id}>{label}</option>)}
        </select></label>
        {!doors.length && <p className="meta">Rota çizmek için önce plana bir kapı ekleyin.</p>}
        <Measure label="Kapıdan içeri ilk düz mesafe" value={path.entryDepth ?? defaultEntryDepth(item)} min={.1}
          change={entryDepth => { setPath({ ...path, entryDepth, points: [] }); setError('') }} />
        <fieldset className="render-fieldset">
          <legend>Ölçüyle ara nokta ekle</legend>
          <label className="measure"><span>Sonraki noktanın ekseni</span>
            <select value={stepAxis} onChange={event => setStepAxis(event.currentTarget.value === 'z' ? 'z' : 'x')}>
              <option value="x">X</option><option value="z">Z</option>
            </select></label>
          <form className="transport-coordinate" onSubmit={event => {
            event.preventDefault()
            if (!lastPoint) return
            const input = new FormData(event.currentTarget).get('coordinate')
            if (typeof input === 'string' && input.trim() && Number.isFinite(Number(input))) {
              add({ ...lastPoint, [stepAxis]: Math.round(Number(input) * 10) }, stepAxis)
              event.currentTarget.reset()
            }
          }}>
            <label className="measure"><span>Hedef {stepAxis.toUpperCase()} (cm)</span><input type="number" step=".1" name="coordinate" required /></label>
            <button type="submit" disabled={!lastPoint || path.points.length >= maxTransportPoints}>Rota noktası ekle</button>
          </form>
        </fieldset>
        <label className="measure"><span>Montaj noktasına son bağlantı</span><select value={path.finish}
          onChange={event => setPath({ ...path, finish: event.currentTarget.value === 'z' ? 'z' : 'x' })}>
          <option value="x">Önce yatay (X)</option><option value="z">Önce dikey (Z)</option>
        </select></label>
        <label className="measure"><span>Planda gösterilen gövde yönü</span>
          <select value={orientation} onChange={event => {
            const option = transportOrientations.find(([id]) => id === event.currentTarget.value)
            if (option) setOrientation(option[0])
          }}>{transportOrientations.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <div className="transport-results" aria-label="Yönlere göre taşıma kontrolü">
          {measured.map(row => <p key={row.id}><strong>{row.name}</strong> · {row.problem ??
            (row.contact ? `${row.contact.type === 'turn' ? 'Dönüş' : 'Geçiş'} · ${row.contact.name}` : 'Çizilen rota açık')}</p>)}
        </div>
        {result.contact && <p className="error-message" role="status">{stepLabel(result.contact.step)} · {detail(result.contact.point)} · {result.contact.name}</p>}
        {!result.contact && !result.problem && result.turns.length > 0 && <ul className="transport-turns">{result.turns.map(turn =>
          <li key={turn.step}>{stepLabel(turn.step)} · {turn.direction === 'clockwise' ? 'Saat yönünde' : 'Saat yönünün tersine'} dönüş</li>)}</ul>}
        <p className="meta">Dönüşler işaretli noktaların merkezinde yapılır. Kapı öncesindeki koridoru ve dik kurulum boşluğunu montaj panelinde kontrol edin.</p>
      </div>
    </div>
    <footer className="dialog-footer">
      {item.assembly?.routePath && <button onClick={() => save()}>Kayıtlı rotayı sil</button>}
      <button className="primary" disabled={!valid} onClick={() => save(path)}>Rotayı kaydet</button>
    </footer>
  </dialog>
}
