import { FileDown, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { layoutName, layoutScene } from './layout-variants'
import { fmt } from './model'
import type { Project } from './model'
import { download, projectFilename } from './storage'

export function InstallationDialog({ project, close, initialVariant, personal }: {
  project: Project; close: () => void; initialVariant?: string; personal: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const [variant, setVariant] = useState(initialVariant ?? project.layouts?.active)
  const [includeReview, setIncludeReview] = useState(personal)
  const [walls, setWalls] = useState<string[]>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const scene = layoutScene(project, variant)
  const name = layoutName(project, variant) ?? 'Mevcut yerleşim'
  const selected = walls ?? scene.walls.filter(wall => wall.openings.length || wall.obstacles.length || wall.survey || wall.electricalPoints?.length
    || scene.items.some(item => item.mount?.wallId === wall.id)).map(wall => wall.id)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  async function exportPdf() {
    setBusy(true)
    setError('')
    setReady(false)
    try {
      const { installationPdf } = await import('./installation-pdf')
      const pdf = await installationPdf(scene, name, new Set(selected), includeReview)
      const base = projectFilename(project.title)
      download(pdf, `${base}${variant ? `-${projectFilename(name)}` : ''}-Montaj-Plani.pdf`)
      setReady(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Montaj PDF’si oluşturulamadı.')
    } finally { setBusy(false) }
  }

  return <dialog ref={dialog} className="render-dialog installation-dialog" aria-labelledby={heading}
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header">
      <div><h2 id={heading}>Montaj planı PDF</h2>
        <p>A4 yatay · Ölçülü plan, duvar görünüşleri, elektrik noktaları ve montaj ölçüleri</p></div>
      <button type="button" className="icon" aria-label="PDF penceresini kapat" onClick={close}><X size={19} /></button>
    </header>
    <div className="render-body render-stack">
      {project.layouts && <label className="measure"><span>PDF yerleşimi</span>
        <select value={variant} disabled={busy} onChange={event => {
          setVariant(event.currentTarget.value)
          setWalls(undefined)
          setReady(false)
        }}>
          {project.layouts.entries.map(entry => <option value={entry.id} key={entry.id}>{entry.name}</option>)}
        </select>
      </label>}
      <fieldset className="render-fieldset installation-walls" disabled={busy}>
        <legend>PDF’ye eklenecek duvar görünüşleri</legend>
        {scene.walls.map((wall, index) => <label className="measure check" key={wall.id}>
          <input type="checkbox" checked={selected.includes(wall.id)} onChange={event => {
            setWalls(event.currentTarget.checked ? [...selected, wall.id] : selected.filter(id => id !== wall.id))
            setReady(false)
          }} />
          <span>Duvar {index + 1} · {fmt(wall.length)} cm</span>
        </label>)}
      </fieldset>
      {personal && <label className="measure check">
        <input type="checkbox" disabled={busy} checked={includeReview} onChange={event => {
          setIncludeReview(event.currentTarget.checked)
          setReady(false)
        }} /><span>Montaj kontrol özetini ekle</span>
      </label>}
    </div>
    <footer className="dialog-footer">
      {error && <p className="error-message" role="alert">{error}</p>}
      {ready && <p className="meta" role="status">PDF hazır.</p>}
      <button type="button" className="primary" disabled={busy} onClick={() => void exportPdf()}>
        <FileDown size={16} /> {busy ? 'PDF hazırlanıyor…' : 'PDF indir'}
      </button>
    </footer>
  </dialog>
}
