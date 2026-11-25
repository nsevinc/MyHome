import { ArrowUpRight, FileDown, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { layoutName, layoutScene } from './layout-variants'
import type { Project } from './model'
import { mountingCodes } from './mounting-codes'
import { mountingReview, reviewLabels } from './mounting-review'
import type { ReviewStatus, ReviewTarget } from './mounting-review'

const statuses = ['warning', 'pending', 'passed'] as const
const filters = [['attention', 'Dikkat gerekenler'], ['all', 'Tüm kontroller']] as const
type Filter = typeof filters[number][0]

export function MountingReviewDialog({ project, open, close, locate, exportPlan }: {
  project: Project; open: boolean; close: () => void
  locate: (target: ReviewTarget, layoutId?: string) => void; exportPlan: (layoutId?: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [layoutId, setLayoutId] = useState<string>()
  const [filter, setFilter] = useState<Filter>('attention')
  const active = project.layouts?.entries.some(entry => entry.id === layoutId) ? layoutId : project.layouts?.active
  const scene = useMemo(() => open ? layoutScene(project, active) : undefined, [project, active, open])
  const rows = useMemo(() => scene ? mountingReview(scene) : [], [scene])
  const [identity, setIdentity] = useState<{ scene: Project; text: string }>()
  const visible = filter === 'all' ? rows : rows.filter(row => row.status !== 'passed')
  useEffect(() => {
    const element = dialog.current
    if (open && element && !element.open) element.showModal()
    return () => element?.close()
  }, [open])
  useEffect(() => {
    if (!scene) return
    let current = true
    void mountingCodes(scene).then(({ layout, revision }) => {
      if (current) setIdentity({ scene, text: `Yerleşim kodu ${layout} · Kontrol sürümü ${revision}` })
    }).catch(() => { if (current) setIdentity({ scene, text: 'Kontrol kodu oluşturulamadı.' }) })
    return () => { current = false }
  }, [scene])

  if (!open) return null
  return <dialog ref={dialog} className="render-dialog mounting-review-dialog" aria-labelledby="mounting-review-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header">
      <div><h2 id="mounting-review-title">Montaj Öncesi Kontrol</h2><p>{project.title}</p></div>
      <button className="icon" type="button" aria-label="Montaj kontrolünü kapat" onClick={close}><X size={18} /></button>
    </header>
    <div className="render-body mounting-review-body">
      {project.layouts ? <label className="measure"><span>Kontrol edilecek yerleşim</span>
        <select value={active} onChange={event => setLayoutId(event.currentTarget.value)}>
          {project.layouts.entries.map(entry => <option value={entry.id} key={entry.id}>
            {entry.name}{entry.id === project.layouts?.active ? ' · Etkin' : ''}</option>)}
        </select>
      </label> : <strong>{layoutName(project) ?? 'Mevcut yerleşim'}</strong>}
      <p className="meta" aria-live="polite">{identity?.scene === scene ? identity?.text : 'Kontrol kodu hazırlanıyor…'}</p>
      <div className="mounting-counts" role="status" aria-label="Kontrol sayıları">
        {statuses.map(status => <div className={`mounting-${status}`} key={status}>
          <strong>{rows.filter(row => row.status === status).length}</strong><span>{reviewLabels[status]}</span>
        </div>)}
      </div>
      <div className="view-tabs" role="group" aria-label="Kontrol filtresi">
        {filters.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}
      </div>
      {visible.length === 0 && <p className="meta">{rows.length ? 'Kayıtlı kontrollerde açık uyarı veya bekleyen bilgi yok.' : 'Kontrol edilecek eşya veya ölçü bulunamadı.'}</p>}
      {visible.length > 0 && <ul className="mounting-findings" aria-label="Kontrol bulguları">
        {visible.map(row => <li key={row.key} className={`mounting-finding mounting-${row.status}`}>
          <div><small>{reviewLabels[row.status]} · {row.check}</small>
            <strong>{row.subject}</strong><p>{row.detail}</p></div>
          <button type="button" aria-label={destination(row.target) + ' · ' + row.subject + ' · ' + row.check}
            onClick={() => locate(row.target, active)}>{destination(row.target)} <ArrowUpRight size={15} /></button>
        </li>)}
      </ul>}
    </div>
    <footer className="dialog-footer">
      <button type="button" className="primary" onClick={() => exportPlan(active)}><FileDown size={16} /> Montaj planı PDF</button>
    </footer>
  </dialog>
}

function destination(target: ReviewTarget) {
  switch (target.kind) {
    case 'section': return 'Kesiti aç'
    case 'route': return 'Rotayı aç'
    case 'motion': return 'Provayı aç'
    case 'measurement': return 'Ölçümü aç'
    case 'assembly': return 'Montajı aç'
    case 'door': return 'Kapağı göster'
    case 'survey': return 'Saha ölçülerini aç'
    case 'electrical': return 'Duvar noktasını aç'
    default: return 'Eşyayı göster'
  }
}
