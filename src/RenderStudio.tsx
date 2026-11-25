import { Aperture, Columns2, Download, Film, Globe, ImagePlus, Lightbulb, ScanLine, X, Zap } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { localCyclesAvailable, windowsReleaseUrl } from './distribution'
import { cycles4k, cyclesPanorama, cyclesPreview } from './cycles-settings'
import type { StudioRenderPreset } from './cycles-settings'
import { Measure, PercentField, TextField } from './fields'
import { validateProject } from './geometry'
import { activeAmbience, activeLighting, changeAmbience, changeLighting, lightNames, lightProfiles, selectLightProfile } from './lighting'
import { finishNames, finishes, textureLibrary } from './materials'
import { importTexture, readLibraryTexture } from './texture-upload'
import { TextureLibrary } from './MaterialLibrary'
import type { Finish } from './materials'
import { uid } from './model'
import type { Presentation, Project, RenderScene, RoomLight, SurfaceTexture } from './model'
import { sameRenderFrame } from './render-preview'
import { defaultCamera, isInteriorCamera, makePointLight, projectCamera, sceneData } from './scene-data'
import { download, projectFilename } from './storage'
import { layoutName, layoutScene, resolveLayoutPair } from './layout-variants'
import type { LayoutPair } from './layout-variants'
import { LayoutPairFields } from './LayoutDialog'
import { activeDesign, designName, designScene, saveDesignPresentation } from './design-variants'
import type { DesignRenderSelection } from './DesignDialog'
import { levelCamera, sameCamera } from './camera-pose'
import { ArchitecturalCameraFields, CameraLensPresets } from './CameraPanel'
import { RenderScenePanel } from './RenderScenePanel'
import { RenderGallery } from './RenderGallery'
import { SunSettings } from './SunSettings'
import { AmbienceFields, AmbienceFixture } from './AmbienceFields'
import { RenderDetailFields } from './RenderDetailFields'
import { submitSceneJob, waitForSceneJob } from './scene-queue'

const ScenePreview = lazy(() => import('./Scene').then(module => ({ default: module.ScenePreview })))
const PanoramaViewer = lazy(() => import('./PanoramaViewer'))
type Camera = NonNullable<Project['camera']>
type Vector = Camera['position']
type Light = Project['style']['light']
type PreviewResult = { url: string; elapsed: number }
type PreviewRun = { frame: Project; cameraLabel: string; byLight: Partial<Record<Light, PreviewResult & { style: Project['style'] }>> }
type LayoutShot = { id: string; name: string; frame: Project }
type LayoutRun = { shots: LayoutShot[]; images: Partial<Record<string, PreviewResult>> }
type Tab = 'textures' | 'lights' | 'surroundings' | 'cameras' | 'layouts' | 'scenes' | 'gallery' | 'result'
const tabLabels: Record<Tab, string> = { textures: 'Doku', lights: 'Işık', surroundings: 'Sahne çevresi', cameras: 'Kamera', layouts: 'Yerleşimler',
  scenes: 'Sahneler', gallery: 'Galeri', result: 'Sonuç' }
const tabIcons = { textures: ImagePlus, lights: Lightbulb, surroundings: Globe, cameras: Aperture, layouts: Columns2, scenes: ScanLine, gallery: ImagePlus, result: Film }
const axes = ['X', 'Y', 'Z'] as const

function presentation(project: Project): Presentation {
  return { style: project.style, camera: project.camera, cameraViews: project.cameraViews }
}

function Coordinates({ label, value, onChange, lockY }: {
  label: string; value: Vector; onChange: (value: Vector) => void; lockY?: boolean
}) {
  return <fieldset className="render-fieldset"><legend>{label}</legend>
    <div className="render-coordinates">{axes.map((axis, index) => <Measure key={axis}
      label={`${label} ${axis}`} value={Math.round(value[index] * 1000)} min={-20000} max={20000} disabled={lockY && axis === 'Y'}
      change={mm => {
        const next: Vector = [...value]
        next[index] = mm / 1000
        onChange(next)
      }} />)}</div>
  </fieldset>
}

function NumberField({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void
}) {
  return <label className="measure"><span>{label}</span>
    <input key={value} type="number" min={min} max={max} defaultValue={value} onBlur={event => {
      const number = event.currentTarget.valueAsNumber
      if (Number.isFinite(number) && number >= min && number <= max) onChange(number)
      else event.currentTarget.value = String(value)
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
}

async function fitRoom(project: Project, camera: Camera): Promise<Camera> {
  const { PerspectiveCamera, Vector3, MathUtils } = await import('three')
  const data = sceneData({ ...project, camera })
  if (data.enclosed) throw new Error('Tüm odayı sığdırmak için önce dışarıdan bir kamera açısı seçin.')
  const view = new PerspectiveCamera(camera.fov, cycles4k.width / cycles4k.height, .035, 180)
  view.position.set(...camera.position)
  view.lookAt(new Vector3(...camera.target))
  view.updateMatrixWorld()
  let limit = 0
  for (const box of data.boxes) {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const point = new Vector3(
        box.position[0] + x * box.size[0] / 2,
        box.position[1] + y * box.size[1] / 2,
        box.position[2] + z * box.size[2] / 2,
      )
      if (point.clone().applyMatrix4(view.matrixWorldInverse).z >= -.035) {
        throw new Error('Odayı sığdırmak için kamerayı biraz uzaklaştırın.')
      }
      point.project(view)
      limit = Math.max(limit, Math.abs(point.x), Math.abs(point.y))
    }
  }
  const fov = Math.ceil(MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(camera.fov) / 2) * limit / .88)))
  if (fov > 95) throw new Error('Odayı sığdırmak için kamerayı biraz uzaklaştırın.')
  return { ...camera, fov: Math.max(20, fov), verticalShift: camera.verticalShift === undefined ? undefined : 0 }
}

function TextureControl({ label, finish, color, texture, onFinish, onTexture, onError }: {
  label: string; finish: Finish; color: string; texture?: SurfaceTexture; onFinish: (finish: Finish) => void;
  onTexture: (texture?: SurfaceTexture, color?: string) => void; onError: (message: string) => void
}) {
  const [loading, setLoading] = useState(false)
  async function load(source: () => Promise<SurfaceTexture>, tint?: string) {
    setLoading(true)
    try { onTexture(await source(), tint); onError('') }
    catch (error) { onError(error instanceof Error ? error.message : 'Doku okunamadı.') }
    finally { setLoading(false) }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    await load(() => importTexture(file, Math.max(100, texture?.tileMm ?? 1000)))
  }
  return <fieldset className="render-fieldset"><legend>{label}</legend>
    <label className="measure"><span>{label} malzemesi</span>
      <select value={texture ? 'custom' : finish} disabled={loading} onChange={event => {
        if (event.target.value === 'custom') return
        onFinish(event.target.value as Finish)
      }}>
        {finishes.map(option => <option key={option} value={option}>{finishNames[option]}</option>)}
        {texture && <option value="custom">{texture.name}</option>}
      </select>
    </label>
    <TextureLibrary texture={texture} color={color} busy={loading}
      choose={id => void load(() => readLibraryTexture(id), textureLibrary[id].tint)} />
    <details className="material-library"><summary>Kendi dokunu yükle</summary><div className="material-library-body">
      <label className="render-upload"><ImagePlus size={16} />{label} dokusu yükle
        <input type="file" accept="image/png,image/jpeg" aria-label={`${label} dokusu yükle`} disabled={loading} onChange={event => void upload(event)} />
      </label>
    </div></details>
    {loading && <p className="meta" role="status">Doku hazırlanıyor…</p>}
    {texture && <><div className="render-swatch">
      <img src={texture.data} alt={`${label} dokusunun önizlemesi`} />
      <div><p title={texture.name}>{texture.name}</p>
        <Measure label="Doku tekrar aralığı" value={texture.tileMm} min={texture.libraryId ? 1 : 10} max={1000}
          change={tileMm => onTexture({ ...texture, tileMm })} /></div>
      <button type="button" className="icon" aria-label={`${label} dokusunu kaldır`} onClick={() => onTexture()}><X size={16} /></button>
    </div>
    <label className="render-checkbox">
      <input type="checkbox" checked={texture.originalColors ?? false}
        onChange={event => onTexture({ ...texture, originalColors: event.target.checked })} />
      Doku renklerini koru
    </label></>}
  </fieldset>
}

type Props = {
  open: boolean; close: () => void; project: Project; projectId: string; openGallery?: boolean;
  preferredPair?: LayoutPair; preferredDesign?: DesignRenderSelection;
  onSave: (settings: Presentation, designId: string) => boolean; saveScenes: (scenes: RenderScene[]) => boolean
  openSnapshot: Parameters<typeof RenderGallery>[0]['openSnapshot']
}

export default function RenderStudio({ open, close, project, projectId, preferredPair, preferredDesign, openGallery,
  onSave, saveScenes, openSnapshot }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const designId = preferredDesign?.id ?? activeDesign(project)
  const design = project.designs ? designName(project, designId) : undefined
  const visual = useMemo(() => designScene(project, designId), [project, designId])
  const layoutItems = useMemo(() => new Map(project.layouts?.entries.map(entry =>
    [entry.id, designScene(layoutScene(project, entry.id), designId).items])), [project, designId])
  const [tab, setTab] = useState<Tab>(preferredPair ? 'layouts' : 'textures')
  const [settings, setSettings] = useState(() => presentation(visual))
  const [name, setName] = useState('')
  const [showCameraPreview, setShowCameraPreview] = useState(false)
  const [busy, setBusy] = useState<StudioRenderPreset | 'comparison' | 'ambience' | 'panorama'>()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; filename: string; light: Light; cameraLabel: string; layout?: string; design?: string }>()
  const [previews, setPreviews] = useState<PreviewRun>()
  const [comparison, setComparison] = useState<LayoutRun>()
  const [panorama, setPanorama] = useState<{ url: string; filename: string; cameraLabel: string }>()
  const [pairChoice, setPairChoice] = useState<LayoutPair>()
  const [targetChoice, setTargetChoice] = useState<string>()
  const [resultMode, setResultMode] = useState<StudioRenderPreset>('preview')
  const resultUrls = useRef(new Set<string>())
  const inProgress = useRef(false)
  const queuedPoll = useRef<AbortController>(null)

  useEffect(() => {
    const element = dialog.current
    if (open && element && !element.open) {
      setSettings(preferredDesign ? { ...presentation(visual), camera: preferredDesign.camera,
        style: selectLightProfile(visual.style, preferredDesign.light) } : presentation(visual))
      setPairChoice(preferredPair)
      setShowCameraPreview(false)
      setTargetChoice(project.layouts?.active)
      if (openGallery) setTab('gallery')
      else if (preferredPair) setTab('layouts')
      else if (preferredDesign) setTab('lights')
      else if (!project.layouts) setTab(current => current === 'layouts' ? 'textures' : current)
      element.showModal()
    } else if (!open) element?.close()
  }, [open, project, visual, preferredPair, preferredDesign, openGallery])
  useEffect(() => {
    const visible = new Set([result?.url, panorama?.url, ...Object.values(previews?.byLight ?? {}).map(image => image.url),
      ...Object.values(comparison?.images ?? {}).map(image => image?.url)])
    for (const url of resultUrls.current) {
      if (!visible.has(url)) {
        URL.revokeObjectURL(url)
        resultUrls.current.delete(url)
      }
    }
  }, [result, previews, comparison, panorama])
  useEffect(() => {
    const urls = resultUrls.current
    return () => {
      queuedPoll.current?.abort()
      urls.forEach(url => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const { style, cameraViews = [] } = settings
  const editorCamera = useMemo(() => projectCamera(project), [project])
  const camera = settings.camera ?? editorCamera
  const { lights, lightStrength } = activeLighting(style)
  const ambience = activeAmbience(style)
  const pair = resolveLayoutPair(project, pairChoice)
  const target = targetChoice && layoutName(project, targetChoice) ? targetChoice : project.layouts?.active
  const commonFrame = { ...layoutScene(visual), ...settings, camera }
  const frameFor = (id?: string) => ({ ...commonFrame, items: (id ? layoutItems.get(id) : undefined) ?? visual.items })
  const targetFrame = frameFor(target)
  const shots = pair?.map(id => ({ id, name: layoutName(project, id)!, frame: frameFor(id) })) ?? []
  const matchesComparison = Boolean(comparison && shots.length === comparison.shots.length
    && shots.every(shot => comparison.shots.some(previous => previous.id === shot.id
      && sameRenderFrame(previous.frame, shot.frame) && previous.frame.style === shot.frame.style)))
  const comparisonImages = matchesComparison ? comparison?.images ?? {} : {}
  const missingShots = shots.filter(shot => !comparisonImages[shot.id])
  const savedCamera = cameraViews.find(view => sameCamera(view.camera, camera))
  const matchesEditor = sameCamera(editorCamera, camera)
  const cameraLabel = savedCamera?.name ?? (matchesEditor ? 'Etkin 3B kadrajı' : 'Render panelindeki kadraj')
  const resultCameraLabel = (resultMode === 'preview' ? previews : result)?.cameraLabel
  function updateStyle(patch: Partial<Project['style']>) {
    setSettings(current => ({ ...current, style: { ...current.style, ...patch } }))
  }
  const updateCamera = (camera: Camera) => setSettings(current => ({ ...current, camera: levelCamera(camera) }))
  function updateLighting(patch: Parameters<typeof changeLighting>[1]) {
    setSettings(current => ({ ...current, style: changeLighting(current.style, patch) }))
  }
  const setLights = (lights: RoomLight[]) => updateLighting({ lights })
  const changeLight = (id: string, patch: Partial<RoomLight>) => setLights(lights.map(light => light.id === id ? { ...light, ...patch } : light))
  function addLight() {
    setLights([...lights, makePointLight(project, lights.length)])
  }
  function saveCameraView() {
    setSettings(current => ({ ...current, cameraViews: [...cameraViews, {
      id: uid(), name: name.trim() || `Kamera ${cameraViews.length + 1}`, camera,
    }] }))
    setName('')
  }
  async function submit(payload: Project, preset: StudioRenderPreset | 'panorama',
    layout = layoutName(project, target)): Promise<PreviewResult> {
    const issue = validateProject(payload)
    if (issue) throw new Error(issue)
    const started = performance.now()
    try {
      const background = new AbortController()
      queuedPoll.current = background
      const png = await waitForSceneJob(await submitSceneJob({ project: payload, context: { projectId, projectName: project.title,
          cameraLabel, layout, design } }, preset), background.signal)
      background.signal.throwIfAborted()
      const url = URL.createObjectURL(png)
      resultUrls.current.add(url)
      return { url, elapsed: (performance.now() - started) / 1000 }
    } finally { queuedPoll.current = null }
  }
  async function renderAction(state: NonNullable<typeof busy>, action: () => Promise<void>) {
    if (inProgress.current) return
    setError('')
    setNotice('')
    inProgress.current = true
    setBusy(state)
    try {
      await action()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Cycles render tamamlanamadı.')
    } finally {
      inProgress.current = false
      setBusy(undefined)
    }
  }
  function startRender(preset: StudioRenderPreset) {
    const layout = layoutName(project, target)
    return renderAction(preset, async () => {
      const image = await submit(targetFrame, preset)
      const light = targetFrame.style.light
      if (preset === 'preview') {
        setPreviews(current => ({
          frame: targetFrame, cameraLabel,
          byLight: { ...(current && sameRenderFrame(current.frame, targetFrame) ? current.byLight : {}),
            [light]: { ...image, style: targetFrame.style } },
        }))
      } else {
        const suffix = light === 'evening' ? '-Aksam' : ''
        const title = [targetFrame.title, layout, design].flatMap(value => value ? [projectFilename(value)] : []).join('-')
        setResult({ url: image.url, filename: `${title}-Cycles-4K${suffix}.png`, light, cameraLabel, layout, design })
      }
      setResultMode(preset)
      setTab(current => current === 'gallery' ? current : 'result')
    })
  }
  function startComparison() {
    return renderAction('comparison', async () => {
      let images = comparisonImages
      setComparison({ shots, images })
      for (const shot of missingShots) {
        const preview = await submit(shot.frame, 'preview', shot.name)
        images = { ...images, [shot.id]: preview }
        setComparison({ shots, images })
      }
    })
  }
  function compareAmbiences() {
    return renderAction('ambience', async () => {
      const byLight: PreviewRun['byLight'] = {}
      for (const light of ['day', 'evening'] as const) {
        const frame = { ...targetFrame, style: selectLightProfile(style, light) }
        byLight[light] = { ...await submit(frame, 'preview'), style: frame.style }
        setPreviews({ frame: targetFrame, cameraLabel, byLight: { ...byLight } })
        setResultMode('preview')
      }
      setTab('result')
    })
  }

  return <dialog ref={dialog} className="render-dialog" aria-labelledby="render-studio-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header">
      <div><h2 id="render-studio-title">4K Cycles render</h2>
        <p>{cycles4k.width} × {cycles4k.height} PNG{design && ` · ${design}`}</p></div>
      <button type="button" className="icon" aria-label="Render penceresini kapat" onClick={close}><X size={19} /></button>
    </header>
    <div className="render-body">
      {!localCyclesAvailable && <section className="render-fieldset" aria-label="Windows ile 4K render">
        <h3>Windows ile 4K render</h3>
        <p>3B görünümde PNG indir ile 1920 × 1080 görüntü alabilirsin. Fotogerçekçi 4K için projeyi indir ve Blender 4.5 LTS kurulu bilgisayarında MyHome ile aç.</p>
        <div className="draw-actions"><button onClick={() => {
          const snapshot = saveDesignPresentation(project, designId, settings)
          download(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }), projectFilename(project.title) + '.myhome.json')
        }}>Projeyi indir</button><a href={windowsReleaseUrl} target="_blank" rel="noreferrer">Windows sürümünü al</a></div>
      </section>}
      {localCyclesAvailable && <details><summary>Blender kurulumu</summary><p>4K için <a href="https://www.blender.org/download/lts/4-5/" target="_blank" rel="noreferrer">Blender 4.5 LTS</a> kur. Özel konum kullanıyorsan Windows paketindeki ayarlar.json dosyasında blender alanına blender.exe yolunu yaz ve MyHome’u yeniden başlat.</p></details>}
      <div className="view-tabs render-tabs" role="group" aria-label="Render ayarları">
        {(Object.keys(tabLabels) as Tab[]).filter(option => (option !== 'result' || result || previews)
          && (option !== 'layouts' || pair)).map(option => {
          const Icon = tabIcons[option]
          return <button key={option} aria-pressed={tab === option} onClick={() => setTab(option)}><Icon size={16} />{tabLabels[option]}</button>
        })}
      </div>
      {open && tab === 'scenes' && <RenderScenePanel project={project} projectId={projectId} save={saveScenes}
        canRender={localCyclesAvailable} openSnapshot={openSnapshot} />}
      {open && tab === 'gallery' && <RenderGallery projectId={projectId} openSnapshot={openSnapshot} />}
      {tab !== 'scenes' && tab !== 'gallery' && <p className="meta render-camera-label" aria-live="polite">Render kamerası · {tab === 'result' ? resultCameraLabel ?? cameraLabel : cameraLabel}</p>}
      {tab !== 'scenes' && tab !== 'gallery' && target && <label className="measure render-layout-target"><span>Render yerleşimi</span>
        <select value={target} disabled={Boolean(busy)} onChange={event => setTargetChoice(event.currentTarget.value)}>
          {project.layouts?.entries.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>}
      {tab === 'layouts' && pair && <div className="render-stack">
        <LayoutPairFields project={project} pair={pair} onChange={setPairChoice} disabled={Boolean(busy)} />
        <p className="meta">{lightNames[style.light]} · {cyclesPreview.width} × {cyclesPreview.height}</p>
        <div className="layout-grid">
          {shots.map(shot => <section className="layout-card" key={shot.id} aria-label={shot.name}>
            <header><h3>{shot.name}</h3></header>
            {comparisonImages[shot.id] ? <figure className="render-preview">
              <img src={comparisonImages[shot.id]?.url} alt={`${shot.name} Cycles önizlemesi`} />
            </figure> : <div className="layout-preview-empty">Cycles önizlemesi</div>}
            <button type="button" aria-pressed={target === shot.id} disabled={Boolean(busy)}
              onClick={() => setTargetChoice(shot.id)}>{target === shot.id ? '4K için seçili' : '4K için seç'}</button>
          </section>)}
        </div>
        <div className="layout-actions">
          <button type="button" disabled={Boolean(busy) || !localCyclesAvailable || !missingShots.length}
            onClick={() => void startComparison()}><Zap size={16} />
            {missingShots.length === 0 ? 'Önizlemeler hazır' : missingShots.length === 1 ? 'Önizlemeyi tamamla' : 'İki düzeni önizle'}
          </button>
        </div>
      </div>}
      {tab === 'textures' && <div className="render-stack">
        <div className="render-grid">
          <TextureControl label="Zemin" finish={style.floorFinish ?? 'plain'} color={style.floor} texture={style.floorTexture}
            onFinish={floorFinish => updateStyle({ floorFinish, floorTexture: undefined })}
            onTexture={(floorTexture, floor) => updateStyle(floor ? { floorTexture, floor } : { floorTexture })} onError={setError} />
          <TextureControl label="Duvar" finish={style.wallFinish ?? 'plain'} color={style.wall} texture={style.wallTexture}
            onFinish={wallFinish => updateStyle({ wallFinish, wallTexture: undefined })}
            onTexture={(wallTexture, wall) => updateStyle(wall ? { wallTexture, wall } : { wallTexture })} onError={setError} />
        </div>
        <fieldset className="render-fieldset">
          <legend>Yüzey ayrıntısı</legend>
          <div className="render-grid">
            <PercentField label="Yüzey kabartısı" min={0} max={200} value={style.surfaceRelief ?? 1}
              onChange={surfaceRelief => updateStyle({ surfaceRelief })} />
            <PercentField label="Renk doygunluğu" min={70} max={160} value={style.colorSaturation ?? 1}
              onChange={colorSaturation => updateStyle({ colorSaturation })} />
          </div>
          <button onClick={() => updateStyle({ surfaceRelief: 1.65, colorSaturation: 1.25 })}>Doğal doku</button>
        </fieldset>
      </div>}
      {tab === 'lights' && <div className="render-stack">
        <div className="render-grid">
          <label className="measure"><span>Işık ortamı</span>
            <select value={style.light} onChange={event => {
              const light = event.target.value as Project['style']['light']
              setSettings(current => ({ ...current, style: selectLightProfile(current.style, light) }))
            }}>
              {lightProfiles.map(light => <option key={light} value={light}>{lightNames[light]}</option>)}
            </select>
          </label>
          <PercentField label="Ortam yoğunluğu" min={0} max={300} value={lightStrength}
            onChange={lightStrength => updateLighting({ lightStrength })} />
        </div>
        <SunSettings project={project} sun={style.sun} change={sun => updateStyle({ sun })} />
        <AmbienceFields value={ambience} evening={style.light === 'evening'} strength={lightStrength}
          change={patch => setSettings(current => ({ ...current, style: changeAmbience(current.style, patch) }))} />
        {targetFrame.items.flatMap(item => item.fixture ? [<AmbienceFixture key={item.id} item={{ ...item, fixture: item.fixture }}
          value={ambience.fixtures?.[item.id]} change={value => setSettings(current => {
            const fixtures = { ...activeAmbience(current.style).fixtures }
            if (value) fixtures[item.id] = value
            else delete fixtures[item.id]
            return { ...current, style: changeAmbience(current.style, { fixtures }) }
          })} />] : [])}
        {localCyclesAvailable && <button type="button" disabled={!!busy || !localCyclesAvailable} onClick={() => void compareAmbiences()}>
          <Columns2 size={16} /> Gündüz ve akşamı karşılaştır
        </button>}
        <button onClick={addLight} disabled={lights.length >= 8}><Lightbulb size={16} /> Nokta ışığı ekle</button>
        {lights.map(light => <fieldset key={light.id} className="render-fieldset">
          <legend>{light.name}</legend>
          <div className="render-grid">
            <TextField label="Işık adı" value={light.name} change={name => changeLight(light.id, { name })} />
            <NumberField label="Işık gücü (W)" value={light.power} min={1} max={2000} onChange={power => changeLight(light.id, { power })} />
            <label className="measure"><span>Işık rengi</span>
              <input type="color" value={light.color} onChange={event => changeLight(light.id, { color: event.target.value })} /></label>
          </div>
          <Coordinates label="Işık konumu" value={light.position} onChange={position => changeLight(light.id, { position })} />
          <button onClick={() => setLights(lights.filter(other => other.id !== light.id))}>Işığı kaldır</button>
        </fieldset>)}
      </div>}
      {tab === 'surroundings' && <RenderDetailFields project={targetFrame} value={style.renderDetail ?? {}}
        change={patch => updateStyle({ renderDetail: { ...style.renderDetail, ...patch } })} />}
      {tab === 'cameras' && <div className="render-stack">
        <div className="render-actions">
          <button type="button" aria-pressed={showCameraPreview} onClick={() => setShowCameraPreview(!showCameraPreview)}>
            <Aperture size={16} /> Kadrajı göster</button>
          {!matchesEditor && <button type="button" onClick={() => updateCamera(editorCamera)}>3B kadrajına dön</button>}
          <button onClick={() => updateCamera(defaultCamera(project, true))}>İç mekân</button>
          <button onClick={() => updateCamera(defaultCamera(project))}>Üstten</button>
          <button onClick={() => void fitRoom(project, camera).then(next => { updateCamera(next); setError('') })
            .catch(reason => setError(reason.message))}><ScanLine size={16} /> Odayı kadraja sığdır</button>
        </div>
        {open && showCameraPreview && <div role="region" aria-label="Render kadrajı">
          <Suspense fallback={<p className="meta">Kadraj yükleniyor…</p>}><ScenePreview project={targetFrame} /></Suspense>
        </div>}
        <Coordinates label="Kamera konumu" value={camera.position} onChange={position => updateCamera({ ...camera, position })} />
        <Coordinates label="Bakış hedefi" value={camera.target} lockY={camera.verticalShift !== undefined}
          onChange={target => updateCamera({ ...camera, target })} />
        <NumberField label="Dikey görüş açısı (°)" value={camera.fov} min={20} max={95} onChange={fov => updateCamera({ ...camera, fov })} />
        <ArchitecturalCameraFields camera={camera} change={updateCamera} />
        <CameraLensPresets fov={camera.fov} change={fov => updateCamera({ ...camera, fov })} />
        <div className="render-grid">
          <label className="measure"><span>Kamera adı</span><input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
          <button className="render-align" disabled={cameraViews.length >= 12} onClick={saveCameraView}>Kamerayı kaydet</button>
        </div>
        {cameraViews.map(view => <div className="render-saved" key={view.id}>
          <button className="full" aria-pressed={view.id === savedCamera?.id} onClick={() => updateCamera(view.camera)}>
            <Aperture size={15} />{view.name} · {view.camera.fov}°</button>
          <button className="icon" aria-label={`${view.name} kamerasını kaldır`} onClick={() => setSettings(current => ({
            ...current, cameraViews: cameraViews.filter(other => other.id !== view.id),
          }))}><X size={16} /></button>
        </div>)}
        <details className="material-library">
          <summary>360° panorama (isteğe bağlı)</summary>
          <div className="material-library-body" aria-label="360° panorama ayarları">
            <p className="meta">Seçili iç mekân kamerasının konumundan etrafa bakabileceğiniz bir görüntü oluşturur.</p>
            {!isInteriorCamera(targetFrame, camera.position) && <p>Panorama için oda içindeki bir kamerayı seçin.</p>}
            <button type="button" disabled={!!busy || !localCyclesAvailable || !isInteriorCamera(targetFrame, camera.position)}
              onClick={() => void renderAction('panorama', async () => {
                const shot = await submit(targetFrame, 'panorama')
                setPanorama({ url: shot.url, filename: `${projectFilename(project.title)}-360.png`, cameraLabel })
              })}><Globe size={16} />{busy === 'panorama' ? '360° render alınıyor…' : '360° Cycles render al'}</button>
            {open && panorama && <>
              <p className="meta">{panorama.cameraLabel} · {cyclesPanorama.width} × {cyclesPanorama.height}</p>
              <Suspense fallback={<p className="meta">Panorama yükleniyor…</p>}><PanoramaViewer source={panorama.url} /></Suspense>
              <a className="render-download" href={panorama.url} download={panorama.filename}><Download size={16} />360° kaynak PNG indir</a>
            </>}
          </div>
        </details>
      </div>}
      {tab === 'result' && <div className="render-stack">
        {previews && result && <div className="view-tabs" role="group" aria-label="Çıktı türü">
          <button aria-pressed={resultMode === 'preview'} onClick={() => setResultMode('preview')}>Önizlemeler</button>
          <button aria-pressed={resultMode === '4k'} onClick={() => setResultMode('4k')}>4K sonuç</button>
        </div>}
        {previews && resultMode === 'preview' && <>
          <p className="render-preview-size">{cyclesPreview.width} × {cyclesPreview.height} · Cycles önizleme</p>
          <div className={Object.keys(previews.byLight).length > 1 ? 'render-grid' : undefined}>
            {lightProfiles.map(light => {
              const view = previews.byLight[light]
              if (!view) return null
              return <figure className="render-preview" key={light}>
                <img src={view.url} alt={`${lightNames[light]} Cycles önizlemesi`} />
                <figcaption><strong>{lightNames[light]}</strong>
                  <span>{view.elapsed.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} sn</span></figcaption>
                <div className="render-actions">
                  <button type="button" disabled={!!busy || !sameRenderFrame(previews.frame, targetFrame)}
                    aria-pressed={style.light === light} onClick={() => setSettings(current => ({ ...current,
                      style: { ...changeLighting(selectLightProfile(current.style, light), activeLighting(view.style)),
                        ambiences: { ...current.style.ambiences, [light]: activeAmbience(view.style) } },
                    }))}>
                    {lightNames[light]} ışığını seç
                  </button>
                  <a className="render-download" href={view.url} download={`MyHome-${light}-onizleme.png`}
                    aria-label={`${lightNames[light]} PNG indir`}>
                    <Download size={15} />PNG indir
                  </a>
                </div>
              </figure>
            })}
          </div>
        </>}
        {result && resultMode === '4k' && <figure className="render-preview"><img src={result.url} alt="4K Cycles render önizlemesi" />
          {(result.layout || result.design) && <figcaption><strong>{[result.layout, result.design].filter(Boolean).join(' · ')}</strong></figcaption>}</figure>}
      </div>}
    </div>
    {tab !== 'scenes' && tab !== 'gallery' && <footer className="dialog-footer render-footer">
      <div aria-live="polite">{busy ? (busy === 'comparison' ? 'Yerleşim önizlemeleri hazırlanıyor…'
        : busy === 'ambience' ? 'Gündüz ve akşam önizlemeleri hazırlanıyor…'
        : busy === 'preview' ? 'Cycles önizleme hazırlanıyor…' : busy === 'panorama' ? '360° panorama hazırlanıyor…' : 'Cycles render alınıyor…') : error || notice ||
        (resultMode === '4k' && result ? `4K PNG hazır · ${[result.layout, result.design, lightNames[result.light]].filter(Boolean).join(' · ')}` :
          '')}</div>
      {result && <a className="render-download" href={result.url} download={result.filename}><Download size={16} />4K PNG indir</a>}
      <button onClick={() => {
        const saved = onSave(settings, designId)
        setError(saved ? '' : 'Ayarlar doğrulanamadı. Ölçüleri ve kamera hedefini kontrol edin.')
        setNotice(saved ? 'Render ayarları projeye kaydedildi.' : '')
      }}>Ayarları projeye kaydet</button>
      {tab !== 'layouts' && <button type="button" disabled={Boolean(busy) || !localCyclesAvailable} onClick={() => void startRender('preview')}>
        <Zap size={16} />{busy === 'preview' ? 'Önizleme hazırlanıyor…' : 'Hızlı önizleme'}
      </button>}
      <button className="primary" disabled={Boolean(busy) || !localCyclesAvailable}
        onClick={() => void startRender('4k')}><Film size={16} />{busy === '4k' ? 'Render alınıyor…' : '4K render al'}</button>
    </footer>}
  </dialog>
}
