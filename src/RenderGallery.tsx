import { localCyclesAvailable } from './distribution'
import { Download, ImagePlus, RotateCcw, Trash2 } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { sameCamera } from './camera-pose'
import { lightNames } from './lighting'
import { renderOutputLabels } from './render-jobs'
import type { SceneJob } from './render-jobs'
import { announceSceneJobs, listSceneJobs, onSceneJobsChange, removeSceneJob, retrySceneJob, sceneJobImage, sceneJobSnapshot } from './scene-queue'
import type { Project } from './model'
import { saveProjectPng } from './project-images'
import { download, projectFilename } from './storage'

const status: Record<SceneJob['state'], string> = {
  queued: 'Sırada', rendering: 'Render alınıyor', succeeded: 'Hazır', failed: 'Başarısız',
}
type View = { job: SceneJob; url: string }
const PanoramaViewer = lazy(() => import('./PanoramaViewer'))

export function RenderGallery({ projectId, openSnapshot }: {
  projectId: string; openSnapshot: (project: Project, job: SceneJob) => Promise<void>
}) {
  const [jobs, setJobs] = useState<SceneJob[]>([])
  const [loaded, setLoaded] = useState(false)
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<SceneJob[]>([])
  const [images, setImages] = useState<View[]>([])
  const mounted = useRef(false)
  const pngInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    mounted.current = true
    let active = true, pending = false
    async function refresh() {
      if (pending) return
      pending = true
      try {
        const jobs = await listSceneJobs()
        if (active) { setJobs(jobs); setError(''); setLoaded(true) }
      } catch {
        if (active) setError(localCyclesAvailable ? 'Yerel render kuyruğu açılamadı. MyHome’un yerel sunucusunu kontrol edin.' : 'Tarayıcıdaki proje görselleri açılamadı.')
      } finally { pending = false }
    }
    void refresh()
    const stop = onSceneJobsChange(() => void refresh())
    const timer = localCyclesAvailable ? setInterval(() => void refresh(), 1800) : undefined
    return () => { mounted.current = false; active = false; stop(); clearInterval(timer) }
  }, [])

  useEffect(() => () => { images.forEach(image => URL.revokeObjectURL(image.url)) }, [images])

  async function action(run: () => Promise<void>) {
    setBusy(true); setNotice('')
    try { await run() }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Render işlemi tamamlanamadı.') }
    finally { setBusy(false) }
  }

  async function view(rows: SceneJob[]) {
    const blobs = await Promise.all(rows.map(sceneJobImage))
    if (!mounted.current) return
    setImages(rows.map((job, i) => ({ job, url: URL.createObjectURL(blobs[i]) })))
  }
  const visible = jobs.filter(job => {
    const key = job.projectId ?? job.metadata?.projectId
    return all || !key || key === projectId
  })
  const canCompare = selected.length === 2 && sameCamera(selected[0].metadata?.camera, selected[1].metadata?.camera)

  return <section className="render-stack" aria-label="Yerel sahne kuyruğu">
    <div className="draw-actions"><h3>Render galerisi</h3>
      <label className="render-checkbox"><input type="checkbox" checked={all} onChange={event => {
        setAll(event.target.checked); setSelected([]); setImages([])
      }} />Tüm projeler</label>
      <button type="button" disabled={busy} onClick={() => pngInput.current?.click()}><ImagePlus size={16} /> Bu projeye PNG ekle</button>
      <input ref={pngInput} type="file" accept="image/png,.png" hidden aria-label="Projeye eklenecek PNG"
        onChange={event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void action(async () => {
            await saveProjectPng(projectId, file.name.replace(/\.png$/i, ''), file)
            announceSceneJobs()
          })
        }} />
    </div>
    <p className="meta">Kuyruk yerel işleyicide çalışır. Aynı kadrajdan iki sonucu seçerek yan yana açabilirsiniz.</p>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="alert">{notice}</p>}
    {loaded && visible.length === 0 && <p className="meta">Bu görünümde kayıtlı render yok.</p>}
    {visible.map(job => {
      const metadata = job.metadata
      const active = selected.some(row => row.id === job.id)
      return <div className="render-scene-entry" role="group" aria-label={job.name} key={job.id}>
        <span><strong>{job.name}</strong><small>{renderOutputLabels[job.preset]} · {status[job.state]}
          {job.browser ? ' · Tarayıcı arşivi' : ''}</small>
          {metadata && <small>{[metadata.projectName, metadata.cameraLabel, metadata.layout, metadata.design, lightNames[metadata.light]]
            .filter(Boolean).join(' · ')}</small>}
          {metadata?.sun && <small>Güneş {metadata.sun.azimuth}° azimut · {metadata.sun.elevation}° yükseklik</small>}
          {metadata?.layoutCode && <small>Yerleşim kodu {metadata.layoutCode}</small>}
          {metadata && metadata.fixtures.length > 0 && <small>{metadata.fixtures.map(fixture => `${fixture.name} ${fixture.on ? 'açık' : 'kapalı'}`).join(' · ')}</small>}
          {job.state === 'succeeded' && !job.hasSnapshot && <small>Yalnızca görüntü kaydı</small>}
        </span>
        {job.state === 'succeeded' && <div className="draw-actions">
          {metadata && job.preset !== 'panorama' && <label className="render-checkbox"><input type="checkbox" checked={active}
            disabled={busy || (!active && selected.length >= 2)} onChange={event => setSelected(rows =>
              event.target.checked ? [...rows, job] : rows.filter(row => row.id !== job.id))} />Karşılaştır</label>}
          <button disabled={busy} onClick={() => void action(() => view([job]))}>
            {job.preset === 'panorama' ? '360° görüntüle' : 'Görüntüle'}
          </button>
          {job.hasSnapshot && <button disabled={busy} onClick={() => void action(async () =>
            openSnapshot(await sceneJobSnapshot(job), job))}>Çalışma kopyası aç</button>}
          <button disabled={busy} onClick={() => void action(async () => {
            download(await sceneJobImage(job), `${projectFilename(job.name)}${job.preset === 'png' ? '' : `-${job.preset}`}.png`)
          })}><Download size={16} /> {job.preset === 'panorama' ? '360° kaynak PNG indir' : 'PNG indir'}</button>
        </div>}
        {localCyclesAvailable && job.state === 'failed' && <button disabled={busy} onClick={() => void action(() => retrySceneJob(job))}>
          <RotateCcw size={15} /> {job.browser ? 'Yerel kuyruğa aktar' : 'Tekrar dene'}</button>}
        {(job.state === 'failed' || job.state === 'succeeded') && <button className="icon" disabled={busy}
          aria-label={`${job.name} işini kaldır`} onClick={() => void action(async () => {
            await removeSceneJob(job)
            setSelected(rows => rows.filter(row => row.id !== job.id))
            if (images.some(image => image.job.id === job.id)) setImages([])
          })}><Trash2 size={15} /></button>}
        {job.error && <small>{job.error}</small>}
      </div>
    })}
    {selected.length > 0 && <div className="draw-actions">
      <button disabled={busy || !canCompare} onClick={() => void action(() => view(selected))}>Aynı kadrajı karşılaştır</button>
      {selected.length === 2 && !canCompare && <p className="meta">Karşılaştırma için konumu, hedefi ve açısı aynı iki kamera seçin.</p>}
    </div>}
    {images.length > 0 && <div className={images.length === 2 ? 'render-grid' : undefined}>
      {images.map(({ job, url }) => <figure className="render-preview" key={job.id}>
        {job.preset === 'panorama' ? <Suspense fallback={<p className="meta" role="status">Panorama yükleniyor…</p>}>
          <PanoramaViewer source={url} />
        </Suspense> : <img alt={`${job.name} ${job.preset === 'png' ? 'PNG görüntüsü' : 'Cycles sonucu'}`} src={url} />}
        <figcaption>{job.name} · {renderOutputLabels[job.preset]}{job.metadata && ` · ${lightNames[job.metadata.light]}`}</figcaption>
      </figure>)}
    </div>}
  </section>
}
