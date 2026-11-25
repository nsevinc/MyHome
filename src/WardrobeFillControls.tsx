import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Measure } from './fields'
import { bounds, footprintCorners, obstructionVolume, pointInRoom, roomEdges, wallMountPose, wallPoint } from './geometry'
import { fmt, meters } from './model'
import type { Furniture, Point, Project, WardrobeFillArea } from './model'
import { fillOptions } from './wardrobe-fill'
import type { checkWardrobeFill, proposeWardrobeFill } from './wardrobe-fill'
import { wardrobeFillEntrances } from './wardrobe-fill-route'
import type { buildWardrobeRun, DoorSuggestion } from './wardrobe-run'
import { designScene } from './design-variants'
import { placementSearchScene } from './placement-search'
import { defaultCamera } from './scene-data'

const ScenePreview = lazy(() => import('./Scene').then(module => ({ default: module.ScenePreview })))
type Output = ReturnType<typeof proposeWardrobeFill>
type Run = NonNullable<ReturnType<typeof buildWardrobeRun>>

function PassageResults({ result }: { result: ReturnType<typeof checkWardrobeFill> }) {
  const { route, front } = result
  return <>
    <p className={route.status === 'blocked' ? 'error-message' : undefined}>
      Giriş rotası · {route.status === 'missing' ? 'Kapı bulunamadı.'
        : `${fmt(route.entranceWidth)} cm açıklık · ${route.reached}/${route.total} modüle ulaşılabiliyor.`}
    </p>
    <p className={front.blocked.length ? 'error-message' : undefined}>
      Dolap önü · {fmt(front.target)} cm hedefi {front.blocked.length
        ? `${front.total - front.blocked.length}/${front.total} modülde sağlandı.` : 'tüm modüllerde sağlandı.'}
    </p>
    {front.blocked.length > 0 && <p className="error-message">Önünde yeterli alan olmayan modüller · {front.blocked.join(', ')}</p>}
  </>
}

export function DoorAdvice({ suggestion, accept }: { suggestion: DoorSuggestion; accept?: (suggestion: DoorSuggestion) => void }) {
  const action = suggestion.kind === 'hinge' ? 'Menteşe yönü önerisini uygula' : 'Sürgülü kapak önerisini uygula'
  return <div>
    <p><strong>{suggestion.name}</strong> · {suggestion.leaf}, {suggestion.angle.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}° açıldığında {suggestion.obstacle} ile çakışıyor.
      {' '}{suggestion.kind === 'hinge'
        ? suggestion.changes.map(change => `${change.leaf} menteşesi ${change.hinge === 'left' ? 'sola' : 'sağa'} alındığında kapak ${change.limit}° açılabiliyor.`).join(' ')
        : `Ters menteşe yönünde de çakışma var. Sürgülü kapak ${fmt(suggestion.travel)} cm serbestçe kayabiliyor.`}</p>
    {accept && <button type="button" aria-label={`${suggestion.name} için ${action.toLocaleLowerCase('tr-TR')}`}
      onClick={() => accept(suggestion)}>{action}</button>}
  </div>
}

export function WardrobeFillControls({ project, wallId, id, existing, fixed, run, check, blocked, open, onOpenChange, choose, pending, selectModule, acceptDoor }: {
  project: Project; wallId: string; id: string; existing?: WardrobeFillArea; fixed: Furniture[];
  run?: Run; check?: ReturnType<typeof checkWardrobeFill>; blocked: boolean;
  open: boolean; onOpenChange: (open: boolean) => void;
  choose: (modules: Furniture[], area: WardrobeFillArea) => void;
  pending: (changed: boolean) => void;
  selectModule: (id: string) => void;
  acceptDoor: (suggestion: DoorSuggestion) => void;
}) {
  const edges = useMemo(() => roomEdges(project.walls), [project.walls])
  const edge = edges.find(edge => edge.wall.id === wallId)!
  const [area, setArea] = useState<WardrobeFillArea>(() => existing ?? { start: 0, end: edge.wall.length,
    depth: 650, profile: 'ready', margin: 50, passage: 800 })
  const [pick, setPick] = useState<number>()
  const [picking, setPicking] = useState(false)
  const [options, setOptions] = useState<Output>()
  const [waiting, setWaiting] = useState(false)
  const [showScene, setShowScene] = useState(false)
  const worker = useRef<Worker>(null)
  const svg = useRef<SVGSVGElement>(null)
  const areaChanged = Boolean(existing && existing !== area)
  const doorList = wardrobeFillEntrances(edges)
  const entrance = doorList.find(door => door.opening.id === area.entrance) ?? doorList[0]
  const extent = bounds(edges.map(edge => edge.a))
  const selected = [wallPoint(edge, area.start), wallPoint(edge, area.end), wallPoint(edge, area.end, area.depth), wallPoint(edge, area.start, area.depth)]
  const points = (rows: Point[]) => rows.map(({ x, z }) => `${x},${z}`).join(' ')
  useEffect(() => () => worker.current?.terminate(), [])
  useEffect(() => { pending(areaChanged) }, [pending, areaChanged])
  useEffect(() => {
    worker.current?.terminate()
    worker.current = null
    setWaiting(false)
    setOptions(undefined)
  }, [wallId, fixed, area])

  function generate() {
    worker.current?.terminate()
    const active = new Worker(new URL('./wardrobe-fill.worker.ts', import.meta.url), { type: 'module' })
    setWaiting(true)
    setOptions(undefined)
    worker.current = active
    function finish(result: Output) {
      if (worker.current !== active) return
      worker.current = null
      active.terminate()
      setOptions(result)
      setWaiting(false)
    }
    active.onmessage = (event: MessageEvent<Output>) => finish(event.data)
    active.onerror = () => finish({ options: [], error: 'Otomatik yerleşim başlatılamadı.' })
    active.postMessage({ project: placementSearchScene(project), id, wallId, area, fixed })
  }

  const preview = useMemo(() => {
    if (!run || !showScene) return
    const currentArea = run.fill ?? area
    const center = (currentArea.start + currentArea.end) / 2
    const target = wallPoint(edge, center, 240)
    const height = Math.max(...run.parts.map(({ item }) => item.height)) / 2000
    const distance = Math.max(1600, (currentArea.end - currentArea.start) * .85)
    let camera = defaultCamera(run.project, true)
    for (let inward = currentArea.depth + distance; inward > currentArea.depth + 450; inward -= 150) {
      const eye = wallPoint(edge, center, inward)
      if (!pointInRoom(eye, edges)) continue
      camera = { position: [meters(eye.x), Math.min(1.48, meters(project.height) * .75), meters(eye.z)], target: [meters(target.x), height, meters(target.z)], fov: 57 }
      break
    }
    return { ...designScene(run.project), camera }
  }, [run, edge, edges, area, showScene, project.height])

  return <details className="material-library" open={open} onToggle={event => onOpenChange(event.currentTarget.open)}>
    <summary>Alanı doldur</summary>
    <div className="material-library-body">
      <div className="wardrobe-run-controls wardrobe-fill-inputs">
        <Measure label="Alan başlangıcı" value={area.start} max={(edge.wall.length - 1) / 10} change={start => setArea(value => ({ ...value, start }))} />
        <Measure label="Alan bitişi" value={area.end} min={(area.start + 1) / 10} max={edge.wall.length / 10} change={end => setArea(value => ({ ...value, end }))} />
        <Measure label="Azami gövde önü" value={area.depth} min={30} change={depth => setArea(value => ({ ...value, depth }))} />
        <label className="measure"><span>Ölçü profili</span><select value={area.profile} onChange={event => {
          const profile = event.currentTarget.value === 'ready' ? 'ready' : 'custom'
          setArea(value => ({ ...value, profile }))
        }}>
          <option value="custom">Ölçüye göre</option><option value="ready">Hazır gövde ölçüleri</option>
        </select></label>
        <Measure label="Dolap üstü montaj payı" value={area.margin} max={50} change={margin => setArea(value => ({ ...value, margin }))} />
        <Measure label="Dolap önü geçiş hedefi" value={area.passage} min={1} change={passage => setArea(value => ({ ...value, passage }))} />
        {entrance && <label className="measure"><span>Giriş kapısı</span><select value={entrance.opening.id}
          onChange={event => {
            const entrance = event.currentTarget.value
            setArea(value => ({ ...value, entrance }))
          }}>
          {doorList.map(door => <option key={door.opening.id} value={door.opening.id}>{door.label} · {fmt(door.opening.width)} cm</option>)}
        </select></label>}
      </div>
      <div className="draw-actions">
        <button type="button" aria-pressed={picking} onClick={() => { setPick(undefined); setPicking(!picking) }}>
          {picking ? 'Alan seçimini bitir' : 'Planda iki nokta seç'}
        </button>
        {picking && <span className="meta" role="status">{pick === undefined ? 'Seçili duvarda başlangıcı tıkla.' : 'Seçili duvarda bitişi tıkla.'}</span>}
      </div>
      <svg ref={svg} role="group" aria-label="Gardırop alanı 2B önizlemesi" className="wardrobe-run-elevation"
        data-wardrobe-area-pick={picking || undefined} viewBox={`${extent.x - 140} ${extent.z - 140} ${extent.width + 280} ${extent.depth + 280}`}>
        <polygon points={points(edges.map(edge => edge.a))} fill="#f1ece0" stroke="#74786e" strokeWidth="20" />
        <polygon points={points(selected)} fill="#99cfc2" fillOpacity=".65" />
        {edges.flatMap(edge => edge.wall.obstacles.map(obstacle => {
          const { x, z, width, depth } = obstructionVolume(edge, obstacle)
          return <rect key={obstacle.id} x={x} y={z} width={width} height={depth} fill={obstacle.bottom ? '#d39447' : '#696158'}
            fillOpacity={obstacle.bottom ? '.38' : '.72'}><title>{obstacle.name}</title></rect>
        }))}
        {project.items.filter(item => item.wardrobeRun?.id !== id).map(item => <polygon key={item.id} points={points(footprintCorners(wallMountPose(item, edges)))}
          fill="#a48e7b" fillOpacity=".36" />)}
        {run?.parts.map(({ item }) => <polygon key={item.id} points={points(footprintCorners(item))} fill={item.color}
          stroke={item.wardrobeRun?.anchor?.fixed ? '#166e60' : '#564236'} strokeWidth="14"
          role={picking ? undefined : 'button'} tabIndex={picking ? undefined : 0} aria-label={`${item.name} ayarlarını aç`}
          onClick={() => { if (!picking) selectModule(item.id) }} onKeyDown={event => {
            if (!picking && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectModule(item.id) }
          }}><title>{item.name}</title></polygon>)}
        {check?.route.path && <polyline points={points(check.route.path)} fill="none" stroke="#1b795f" strokeWidth="23" strokeDasharray="40 24" />}
        <line x1={edge.a.x} y1={edge.a.z} x2={edge.b.x} y2={edge.b.z} stroke="#14776a" strokeWidth="32" pointerEvents="none" />
        <line x1={edge.a.x} y1={edge.a.z} x2={edge.b.x} y2={edge.b.z} stroke="transparent" strokeWidth={Math.max(160, extent.width / 24)}
          pointerEvents={picking ? 'stroke' : 'none'} onPointerDown={event => {
            const matrix = svg.current?.getScreenCTM()?.inverse()
            if (!matrix || event.button !== 0) return
            const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix)
            const distance = (point.x - edge.a.x) * edge.dx + (point.y - edge.a.z) * edge.dz
            const along = Math.max(0, Math.min(edge.wall.length, Math.round(distance / 10) * 10))
            if (pick === undefined) { setPick(along); return }
            if (along === pick) return
            setArea(value => ({ ...value, start: Math.min(pick, along), end: Math.max(pick, along) }))
            setPick(undefined)
            setPicking(false)
          }} />
        {pick !== undefined && (() => { const point = wallPoint(edge, pick); return <circle cx={point.x} cy={point.z} r="48" fill="#176257" /> })()}
      </svg>
      <div className="draw-actions">
        <button type="button" disabled={waiting || blocked} onClick={generate}>{waiting ? 'Alan hesaplanıyor…' : fixed.length ? 'Kalan alanı yeniden doldur' : 'Yerleşim önerilerini hazırla'}</button>
        {run && <button type="button" aria-pressed={showScene} onClick={() => setShowScene(!showScene)}>3B önizleme</button>}
      </div>
      {areaChanged && <p className="meta" role="status">Alan ayarları değişti. Uygulamak için yeni bir taslak açın.</p>}
      {options?.error && <p role="alert" className="error-message">{options.error}</p>}
      {options?.options.map(option => <section className="wardrobe-run-checks" key={option.priority} aria-label={fillOptions[option.priority]}>
        <strong>{fillOptions[option.priority]} · {option.modules.length} modül · {fmt(area.end - area.start - option.unused)} cm dolap · {fmt(option.unused)} cm boşluk</strong>
        {option.modules.length > 0 && <p>Gövde derinlikleri · {[...new Set(option.modules.map(item => item.depth))].sort((a, b) => a - b).map(fmt).join(' / ')} cm</p>}
        {option.check ? <PassageResults result={option.check} /> : <p>Bu ölçülere uygun modül bulunamadı.</p>}
        {option.notes.map(note => <p key={note}>{note}</p>)}
        {option.check?.issues.map(issue => <p className="error-message" key={issue}>{issue}</p>)}
        {option.check?.doorSuggestions.map(suggestion => <DoorAdvice key={suggestion.itemId} suggestion={suggestion} />)}
        <button type="button" disabled={!option.modules.length} onClick={() => choose(option.modules, area)}>
          {fillOptions[option.priority]} taslağını aç
        </button>
      </section>)}
      {check && <section className="wardrobe-run-checks" aria-label="Seçili taslak kontrolü" role="status">
        <PassageResults result={check} />
        {check.issues.map(issue => <p className="error-message" key={issue}>{issue}</p>)}
        {check.doorSuggestions.map(suggestion => <DoorAdvice key={suggestion.itemId} suggestion={suggestion}
          accept={areaChanged || blocked ? undefined : acceptDoor} />)}
        {check.route.path && <p className="meta">Kesik çizgi kapıdan doğrulanan bir modüle giden yolu gösterir.</p>}
      </section>}
      {preview && <div aria-label="Gardırop alanı 3B önizlemesi" role="region"><Suspense fallback={<p>3B görünüm yükleniyor…</p>}>
        <ScenePreview project={preview} />
      </Suspense></div>}
    </div>
  </details>
}
