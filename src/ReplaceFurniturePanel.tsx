import { useEffect, useMemo, useState } from 'react'
import { CircleHelp, Replace, X } from 'lucide-react'
import { makeCatalogFurniture, modelCatalog } from './catalog'
import { sizeInCm } from './elevation-data'
import { canUseFreeModel, nativeReplacementModels, previewFurnitureReplacement } from './furniture-replacement'
import type { ReplacementPreview, ReplacementSize } from './furniture-replacement'
import { fmt, maxLayouts } from './model'
import type { Furniture, Project } from './model'
import { makePersonalFurniture } from './personal-library'
import type { PersonalModel } from './personal-library'

export default function ReplaceFurniturePanel({ project, source, catalog, personal, upload, preview, apply, close, help }: {
  project: Project; source: Furniture; catalog: boolean; personal: PersonalModel[]
  upload?: (file: File) => Promise<Furniture>
  preview: (value?: ReplacementPreview) => void
  apply: (value: ReplacementPreview, alternate: boolean) => void
  close: () => void; help: () => void
}) {
  const [key, selectModel] = useState('')
  const [uploaded, setUploaded] = useState<Furniture>()
  const [size, setSize] = useState<ReplacementSize>('model')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const canReadPersonal = Boolean(upload)
  const groups = useMemo(() => {
    const point = { x: source.x, z: source.z }
    return [
      { name: 'Hazır eşyalar', items: nativeReplacementModels(project, source).map(model => ({ ...model, id: `native/${model.name}` })) },
      ...(canUseFreeModel(source) && catalog ? [{
        name: '3B katalog', items: modelCatalog.map(model => ({ ...makeCatalogFurniture(model.id, point), id: `catalog/${model.id}` })),
      }] : []),
      ...(canUseFreeModel(source) && canReadPersonal && personal.length ? [{
        name: 'Kişisel katalog', items: personal.map(model => ({ ...makePersonalFurniture(model, point), id: `personal/${model.id}` })),
      }] : []),
      ...(uploaded ? [{ name: 'Yüklenen model', items: [uploaded] }] : []),
    ]
  }, [project, source, catalog, personal, canReadPersonal, uploaded])
  const model = groups.flatMap(group => group.items).find(item => item.id === key)
  const candidate = useMemo(() => model && previewFurnitureReplacement(project, source, model, size), [project, source, model, size])
  useEffect(() => { preview(candidate) }, [preview, candidate])
  const canAlternate = (project.layouts?.entries.length ?? 1) < maxLayouts
  return <section className="smart-placement replacement-panel" aria-label="Eşyayı değiştir">
    <header><div><Replace size={17} /><h3>Eşyayı değiştir</h3></div>
      <div><button type="button" className="icon" aria-label="Eşya değiştirme rehberi" onClick={help}><CircleHelp size={16} /></button>
        <button type="button" className="icon" aria-label="Eşya değiştirmeyi kapat" onClick={close}><X size={17} /></button></div>
    </header>
    <p className="meta">{source.name}</p>
    <label className="measure">Yeni model<select disabled={busy} value={key} onChange={event => {
      selectModel(event.currentTarget.value)
      setError('')
    }}><option value="">Bir model seç</option>
      {groups.filter(group => group.items.length).map(group => <optgroup key={group.name} label={group.name}>
        {group.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </optgroup>)}
    </select></label>
    {upload && canUseFreeModel(source) && <label className="measure">Yeni model için GLB yükle
      <input type="file" accept=".glb,model/gltf-binary" disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (!file) return
        setError('')
        setBusy(true)
        void upload(file).then(item => { setUploaded(item); selectModel(item.id) }).catch(error => {
          setError(error instanceof Error ? error.message : 'Model yüklenemedi.')
        }).finally(() => setBusy(false))
      }} /></label>}
    {busy && <p role="status">Model okunuyor…</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {candidate && <>
      <label className="measure">Ölçüler<select value={size} disabled={busy}
        onChange={event => setSize(event.currentTarget.value === 'existing' ? 'existing' : 'model')}>
        <option value="model">Modelin ölçülerini kullan</option><option value="existing">Mevcut ölçüleri koru</option>
      </select></label>
      <dl className="replacement-dimensions" aria-label="Genişlik, derinlik ve yükseklik">
        <div><dt>Mevcut</dt><dd>{sizeInCm(source)} cm</dd></div>
        <div><dt>Yeni</dt><dd>{sizeInCm(candidate.item)} cm</dd></div>
      </dl>
      {candidate.items.length > 1 && <details open><summary>Bağlı eşyalar</summary><ul>
        {candidate.items.filter(item => item.id !== source.id).map(item => <li key={item.id}>
          {item.name} · X {fmt(item.x)} · Z {fmt(item.z)} cm
        </li>)}
      </ul></details>}
      {candidate.measurements.length > 0 && <details><summary>Geçiş ve kenar boşlukları</summary><ul>
        {candidate.measurements.map(reading => <li key={reading.id} className={reading.warning ? 'error-message' : undefined}>
          {reading.name} · {reading.before && reading.before !== reading.value ? `${reading.before} → ` : ''}{reading.value}
        </li>)}
      </ul></details>}
      {candidate.error && <p className="error-message" role="alert">{candidate.error}</p>}
      {candidate.warnings.length > 0 && <details open><summary>Yerleşim uyarıları ({candidate.warnings.length})</summary><ul>
        {candidate.warnings.map(warning => <li className="error-message" key={warning.key}>
          {warning.subject} · {warning.check} · {warning.detail}
        </li>)}
      </ul></details>}
      <p className="meta">Kesikli çizgi yeni modelin plandaki izini gösterir.</p>
      <div className="replacement-actions">
        <button type="button" className="primary" disabled={busy || !!candidate.error} onClick={() => apply(candidate, false)}>Uygula</button>
        <button type="button" disabled={busy || !canAlternate || !!candidate.error}
          onClick={() => apply(candidate, true)}>Alternatif yerleşim olarak kaydet</button>
      </div>
      {!canAlternate && <p className="meta">Yerleşim sınırına ulaşıldı.</p>}
    </>}
  </section>
}
