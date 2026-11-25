import { FileDown, RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createDeliveryPackage, deliveryRenderStatus, deliveryVersion, recordedLayoutCode } from './delivery-package'
import type { DeliveryVersion } from './delivery-package'
import { switchLayout } from './layout-variants'
import { listRevisions, revisionProject, saveRevision } from './project-archive'
import type { OpenProject, Revision } from './project-archive'
import { renderOutputLabels } from './render-jobs'
import type { SceneJob } from './render-jobs'
import { listSceneJobs } from './scene-queue'
import { download } from './storage'

const date = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' })

async function completedRenders(projectId: string) {
  return (await listSceneJobs()).filter(job => job.state === 'succeeded' && (job.projectId ?? job.metadata?.projectId) === projectId)
}

export function DeliveryPackageDialog({ source, close }: { source: OpenProject; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [jobs, setJobs] = useState<SceneJob[]>([])
  const [version, setVersion] = useState<DeliveryVersion>()
  const [previousId, setPreviousId] = useState('')
  const [name, setName] = useState('')
  const [layoutId, setLayoutId] = useState(source.project.layouts?.active)
  const [selected, setSelected] = useState<string[]>([])
  const [verified, setVerified] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [renderError, setRenderError] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let current = true
    const element = dialog.current
    element?.showModal()
    void Promise.allSettled([listRevisions(source.id), completedRenders(source.id)]).then(([versions, images]) => {
      if (!current) return
      if (versions.status === 'fulfilled') setRevisions(versions.value)
      else setError('Kayıtlı sürümler okunamadı.')
      if (images.status === 'fulfilled') setJobs(images.value)
      else setRenderError('Render listesi açılamadı. Tekrar deneyebilir veya PDF ve proje yedeğiyle paket oluşturabilirsiniz.')
      setLoading(false)
    })
    return () => { current = false; element?.close() }
  }, [source.id])

  async function act(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setSuccess('')
    try { await action() }
    catch (error) { setError(error instanceof Error && error.name !== 'ZodError' ? error.message : 'Teslim işlemi tamamlanamadı.') }
    finally { setBusy(false) }
  }

  function selectVersion(next?: DeliveryVersion) {
    setVersion(next)
    setPreviousId('')
    setSelected([])
    setSuccess('')
  }

  const previousRevisions = version ? revisions.filter(row =>
    row.id !== version.revision.id && row.updated <= version.revision.updated) : []

  return <dialog className="render-dialog delivery-dialog" ref={dialog} aria-labelledby="delivery-title"
    onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <header className="dialog-header">
      <div><h2 id="delivery-title">Teslim paketi oluştur</h2><p>{source.project.title}</p></div>
      <button type="button" className="icon" aria-label="Teslim penceresini kapat" disabled={busy} onClick={close}><X size={19} /></button>
    </header>
    <div className="render-body render-stack">
      <label className="measure"><span>Teslim sürümü</span><select disabled={busy || loading} value={version?.revision.id ?? ''}
        onChange={event => {
          const revision = revisions.find(row => row.id === event.currentTarget.value)
          if (!revision) { selectVersion(); setError(''); return }
          void act(async () => selectVersion(await deliveryVersion(revision, await revisionProject(revision))))
        }}>
        <option value="">Yeni sürüm kaydet</option>
        {revisions.map(revision => <option key={revision.id} value={revision.id}>{revision.name} · {date.format(revision.updated)}</option>)}
      </select></label>
      {!version && <form className="delivery-version" onSubmit={event => {
        event.preventDefault()
        if (!name.trim() || busy || loading) return
        void act(async () => {
          const snapshot = layoutId ? switchLayout(source.project, layoutId) : source.project
          const revision = await saveRevision(source, name, snapshot)
          if (!revision) return
          setRevisions(rows => [revision, ...rows])
          setName('')
          selectVersion(await deliveryVersion(revision, snapshot))
        })
      }}>
        {source.project.layouts && <label className="measure"><span>Sürümün yerleşimi</span>
          <select disabled={busy} value={layoutId} onChange={event => setLayoutId(event.currentTarget.value)}>
            {source.project.layouts.entries.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select></label>}
        <label className="measure"><span>Sürüm adı</span><input value={name} disabled={busy} maxLength={100}
          onChange={event => setName(event.currentTarget.value)} /></label>
        <button type="submit" className="render-align" disabled={loading || busy || !name.trim()}>Teslim sürümünü kaydet</button>
      </form>}
      {version && <>
        <div className="delivery-summary">
          <strong>{version.revision.name} · {version.layout}</strong>
          <small>Yerleşim kodu {version.codes.layout} · Kontrol sürümü {version.codes.revision}</small>
        </div>
        {previousRevisions.length > 0 && <label className="measure"><span>PDF değişiklik özeti için önceki sürüm</span>
          <select disabled={busy} value={previousId} onChange={event => {
            setPreviousId(event.currentTarget.value)
            setSuccess('')
          }}>
            <option value="">Değişiklik özeti ekleme</option>
            {previousRevisions.map(row => <option value={row.id} key={row.id}>{row.name} · {date.format(row.updated)}</option>)}
          </select>
        </label>}
        <section className="render-stack" aria-label="Pakete eklenecek renderlar">
          <div className="draw-actions"><h3>Renderlar</h3>
            <button type="button" disabled={busy} onClick={() => void act(async () => {
              try {
                const next = await completedRenders(source.id)
                setJobs(next)
                setSelected(ids => ids.filter(id => next.some(job => job.id === id)))
                setRenderError('')
              } catch { setRenderError('Render listesi açılamadı.') }
            })}><RefreshCw size={15} /> Listeyi yenile</button>
          </div>
          {renderError && <p role="status" className="meta">{renderError}</p>}
          {!jobs.length && !renderError && <p className="meta">Bu oda için tamamlanmış render bulunamadı.</p>}
          {jobs.map(job => {
            const status = deliveryRenderStatus(job, version.codes.layout, verified[job.id])
            return <div className="delivery-render" role="group" aria-label={job.name} key={job.id}>
              <label>
                <input type="checkbox" checked={selected.includes(job.id)} disabled={busy || status !== 'match'}
                  onChange={event => {
                    const checked = event.currentTarget.checked
                    setSelected(ids => checked ? [...ids, job.id] : ids.filter(id => id !== job.id))
                  }} />
                <span>{job.name}<small>{[renderOutputLabels[job.preset], job.metadata?.cameraLabel, job.metadata?.design]
                  .filter(Boolean).join(' · ')}</small></span>
              </label>
              <div>
                <small className={status === 'different' ? 'error-message' : 'meta'}>
                  {status === 'match' ? 'Yerleşim eşleşiyor' : status === 'different' ? 'Yerleşim uyuşmuyor' : 'Yerleşim doğrulanmadı'}
                </small>
                {status === 'unknown' && job.hasSnapshot && <button type="button" disabled={busy}
                  onClick={() => void act(async () => {
                    const code = await recordedLayoutCode(job)
                    setVerified(codes => ({ ...codes, [job.id]: code }))
                  })}>Sahneyi doğrula</button>}
              </div>
            </div>
          })}
        </section>
      </>}
    </div>
    <footer className="dialog-footer delivery-footer">
      <div>
        {error && <p className="error-message" role="alert">{error}</p>}
        {success ? <p role="status">{success}</p> : version && <p className="meta">Montaj PDF’si, proje yedeği ve {selected.length} render</p>}
      </div>
      <button type="button" className="primary" disabled={!version || busy} onClick={() => {
        if (!version) return
        void act(async () => {
          const baseline = previousRevisions.find(row => row.id === previousId)
          const previous = baseline ? await deliveryVersion(baseline, await revisionProject(baseline)) : undefined
          const { zip, filename } = await createDeliveryPackage(version, jobs.filter(job => selected.includes(job.id)), previous)
          download(zip, filename)
          setSuccess('Teslim ZIP’i hazır.')
        })
      }}><FileDown size={17} /> {busy ? 'Hazırlanıyor…' : 'Teslim ZIP’ini indir'}</button>
    </footer>
  </dialog>
}
