import { useEffect, useId, useRef, useState } from 'react'
import { Download, FileUp, GitCompareArrows, Plus, X } from 'lucide-react'
import { archiveProject, exportArchive, importArchive, listArchive, listRevisions,
  newArchiveProject, revisionCopy, saveRevision } from './project-archive'
import type { ArchiveProject, OpenProject, Revision } from './project-archive'
import { download } from './storage'
import { RevisionComparisonPanel } from './RevisionComparisonPanel'

const time = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' })

export default function ProjectArchiveDialog({ current, canSaveCurrent, close, open, imported }: {
  current: OpenProject; canSaveCurrent: boolean
  close: () => void; open: (next: OpenProject, baseline?: Revision) => Promise<void>; imported: (next: OpenProject) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const source = useRef<HTMLInputElement>(null)
  const heading = useId()
  const [projects, setProjects] = useState<ArchiveProject[]>([])
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [comparing, setComparing] = useState(false)

  useEffect(() => {
    const modal = dialog.current
    modal?.showModal()
    let active = true
    void Promise.all([listArchive(), listRevisions(current.id)]).then(([projects, revisions]) => {
      if (active) { setProjects(projects); setRevisions(revisions) }
    }).catch(() => { if (active) setError('Yerel proje arşivi açılamadı.') })
    return () => { active = false; modal?.close() }
  }, [current.id])

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError(''); setMessage('')
    try { await action() }
    catch (error) { setError(error instanceof Error && error.name !== 'ZodError' ? error.message : 'Geçerli bir MyHome çalışma alanı yedeği seçin.') }
    finally { setBusy(false) }
  }

  return <dialog className={`render-dialog${comparing ? ' revision-dialog' : ''}`} ref={dialog} aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); if (!busy) close() }}>
    <header className="dialog-header"><h2 id={heading}>{comparing ? 'Sürüm karşılaştırması' : 'Yerel projeler'}</h2>
      <button className="icon" aria-label="Proje arşivini kapat" disabled={busy} onClick={close}><X size={19} /></button></header>
    <div className="render-body render-stack">
      {comparing ? <RevisionComparisonPanel current={current} revisions={revisions} close={() => setComparing(false)} /> : <>
      <section className="render-stack" aria-label="Oda projeleri">
        <button className="primary" disabled={busy} onClick={() => void run(() => open(newArchiveProject('Yeni oda')))}>
          <Plus size={16} /> Yeni boş oda</button>
        {projects.map(row => <div key={row.id} className="render-scene-entry" role="group"
          aria-label={row.id === current.id ? current.project.title : row.title}>
          <span>{row.id === current.id ? current.project.title : row.title}<small>{row.itemCount} eşya · {time.format(row.updated)}</small></span>
          {row.id === current.id ? <strong>Etkin</strong> : <button disabled={busy} onClick={() => void run(async () => open(await archiveProject(row.id)))}>Aç</button>}
          <button disabled={busy} onClick={() => void run(async () => {
            const from = row.id === current.id ? current.project : (await archiveProject(row.id)).project
            await open(newArchiveProject(`${from.title.slice(0, 88)} · Kopya`, from))
          })}>Kopyala</button>
        </div>)}
      </section>
      <section className="render-stack" aria-label="Proje sürümleri">
        <h3>{current.project.title} · Sürümler</h3>
        {revisions.length > 0 && <div className="draw-actions">
          <button type="button" disabled={busy} onClick={() => setComparing(true)}><GitCompareArrows size={16} /> Sürümleri karşılaştır</button>
        </div>}
        <form className="draw-actions" onSubmit={event => {
          event.preventDefault()
          if (busy || !canSaveCurrent || !name.trim()) return
          void run(async () => {
            await saveRevision(current, name)
            setRevisions(await listRevisions(current.id))
            setName('')
            setMessage('Sürüm kaydedildi.')
          })
        }}>
          <label className="measure">Sürüm adı <input value={name} maxLength={100} onChange={event => setName(event.target.value)} /></label>
          <button type="submit" className="render-align" disabled={busy || !canSaveCurrent || !name.trim()}>Sürüm kaydet</button>
        </form>
        {revisions.map(row => <div key={row.id} className="render-scene-entry" role="group" aria-label={row.name}>
          <span>{row.name}<small>{time.format(row.updated)}</small></span>
          <button disabled={busy} onClick={() => void run(async () => {
            const { next, baseline } = await revisionCopy(row)
            await open(next, baseline)
          })}>Sürümü çalışma kopyası olarak aç</button>
        </div>)}
      </section>
      <section className="render-stack" aria-label="Çalışma alanı yedeği">
        <h3>Çalışma alanı yedeği</h3><p className="meta">Projeleri, sürümleri, tamamlanan PNG’leri ve kişisel GLB kataloğunu tek dosyada taşır. Yedekteki projeler arşive yeni kopyalar olarak eklenir.</p>
        <div className="draw-actions">
          <button disabled={busy || !canSaveCurrent} onClick={() => void run(async () => {
            download(await exportArchive(current), `MyHome-${new Date().toISOString().slice(0, 10)}.workspace.json`)
            setMessage('Çalışma alanı yedeği hazır.')
          })}><Download size={16} /> Yedeği indir</button>
          <button disabled={busy} onClick={() => source.current?.click()}><FileUp size={16} /> Yedekten içe aktar</button>
          <input ref={source} hidden type="file" aria-label="Çalışma alanı yedek dosyası" accept=".json,application/json"
            onChange={event => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void run(async () => imported(await importArchive(file, canSaveCurrent ? current : undefined)))
            }} />
        </div>
      </section>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      </>}
    </div>
  </dialog>
}
