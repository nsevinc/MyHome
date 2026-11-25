import { useEffect, useState } from 'react'
import { ClipboardPaste, Pipette } from 'lucide-react'
import { modelMaterialSlots } from './catalog'
import { Measure, PercentField } from './fields'
import { materialSamples, textureLibrary } from './materials'
import { normalizeAngle } from './model'
import type { Appearance, Furniture } from './model'
import { appearanceFor, editableParts, legacyAppearance } from './object-appearance'
import { importTexture, readLibraryTexture } from './texture-upload'
import { MaterialLibrary } from './MaterialLibrary'
import { furnitureParts } from './furniture'
import { captureAppearance } from './material-pipette'
import type { MaterialPipette } from './material-pipette'

const all = { id: 'all', label: 'Tüm eşya' }
const channels = [
  ['texture', 'Doku yükle (JPG veya PNG)', 'Dokuyu kaldır'],
  ['roughnessMap', 'Pürüzlülük haritası (JPG veya PNG)', 'Pürüzlülük haritasını kaldır'],
  ['normalMap', 'Normal haritası (OpenGL +Y)', 'Normal haritasını kaldır'],
] as const

export function ItemMaterial({ item, apply, pipette }: {
  item: Furniture; apply: (slot: string, value: Appearance | null) => void; pipette: MaterialPipette;
}) {
  const [slot, setSlot] = useState('all')
  const [parts, setParts] = useState<typeof all[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    if (!item.model) return
    const controller = new AbortController()
    void modelMaterialSlots(item.model, controller.signal).then(setParts).catch(() => {
      if (!controller.signal.aborted) setError('Modelin malzeme grupları okunamadı.')
    })
    return () => controller.abort()
  }, [item.model])
  const slots = [all, ...(item.model ? parts : editableParts(item))]
  const active = slots.find(part => part.id === slot) ?? all
  const current = appearanceFor(item.appearances, active.id)
  const committed = current === undefined ? legacyAppearance(item, active.id) : current
  const part = item.model ? undefined : furnitureParts(item).find(part => part.slot === active.id)
  const sample = committed ?? part?.appearance ?? part?.material ?? (!item.model ? { preset: 'plain' as const } : undefined)
  return <fieldset className="render-fieldset item-material">
    <legend>Malzeme</legend>
    <label className="measure"><span>Yüzey</span>
      <select value={active.id} onChange={event => setSlot(event.target.value)}>
        {slots.map(part =>
          <option key={part.id} value={part.id}>{part.label}</option>)}
      </select>
    </label>
    {error && <p role="alert">{error}</p>}
    <MaterialFields key={active.id} current={committed} color={item.color} apply={value => apply(active.id, value)}
      transfer={{ pipette, label: `${item.name} · ${active.label}`,
        source: sample && (item.model && sample.preset === 'original' ? sample : captureAppearance(sample, part?.color ?? item.color)) }} />
  </fieldset>
}

export function MaterialFields({ current, color, apply, transfer }: {
  current?: Appearance | null; color: string; apply: (value: Appearance | null) => void;
  transfer?: { pipette: MaterialPipette; label: string; source?: Appearance };
}) {
  const [draft, setDraft] = useState<Appearance | null>(current ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setDraft(current ?? null), [current])
  const value: Appearance = draft ?? { preset: 'original' }
  const update = (fields: Partial<Appearance>) => setDraft(existing => ({ preset: 'original', ...existing, ...fields }))
  const previous = current ?? null
  const dirty = draft !== previous && (!draft || !previous ||
    (Object.keys({ ...draft, ...previous }) as (keyof Appearance)[]).some(field => draft[field] !== previous[field]))
  async function load(change: () => Promise<Partial<Appearance>>) {
    setBusy(true)
    setError('')
    try { update(await change()) }
    catch (error) { setError(error instanceof Error ? error.message : 'Doku yüklenemedi.') }
    finally { setBusy(false) }
  }
  return <>
    {transfer && <div className="material-pipette" role="group" aria-label="Malzeme pipeti">
      <div className="button-pair">
        <button type="button" disabled={!transfer.source || busy}
          title={transfer.source ? 'Seçili yüzeyin kayıtlı görünümünü al' : 'Önce modelin bu yüzeyine bir malzeme ayarı uygula'}
          onClick={() => transfer.source && transfer.pipette.pick({ label: transfer.label, appearance: transfer.source })}>
          <Pipette size={14} /> Malzemeyi al
        </button>
        <button type="button" disabled={!transfer.pipette.sample || busy} onClick={() => {
          const sample = transfer.pipette.sample
          if (sample) apply({ ...sample.appearance })
        }}><ClipboardPaste size={14} /> Malzemeyi aktar</button>
      </div>
      {transfer.pipette.sample && <p className="meta" role="status">Alınan malzeme · {transfer.pipette.sample.label}</p>}
    </div>}
    <MaterialLibrary value={value} color={color} busy={busy} choosePreset={preset => void load(async () => {
      const sample = materialSamples[preset]
      const texture = sample.textureId ? await readLibraryTexture(sample.textureId) : undefined
      return { preset, color: sample.color, roughness: sample.roughness, relief: sample.relief,
        scale: undefined, direction: undefined, texture, tileMm: undefined, normalMap: undefined, roughnessMap: undefined }
    })} chooseTexture={id => void load(async () => {
      const texture = await readLibraryTexture(id)
      return { texture, tileMm: undefined, color: textureLibrary[id].tint }
    })} />
    <label className="measure"><span>Malzeme rengi</span>
      <input type="color" value={value.color ?? color} onChange={event => update({ color: event.target.value })} />
    </label>
    {value.color && <button type="button" onClick={() => update({ color: undefined })}>Özgün rengi kullan</button>}
    {value.texture && <button type="button" disabled={busy} onClick={() => update({ texture: undefined, tileMm: undefined })}>Renk dokusunu kaldır</button>}
    <details className="material-library">
      <summary>Kendi dokunu veya haritanı yükle</summary>
      <div className="material-library-body">
    {channels.map(([channel, label, remove]) => <div key={channel}>
      <label className="measure"><span>{label}</span>
        <input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={async event => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          await load(async () => ({ [channel]: await importTexture(file, 400, channel !== 'texture') }))
        }} />
      </label>
      {channel !== 'texture' && value[channel] && <button type="button" disabled={busy}
        onClick={() => update({ [channel]: undefined })}>{value[channel].name} · {remove}</button>}
    </div>)}
      </div>
    </details>
    {busy && <p className="meta" role="status">Doku hazırlanıyor…</p>}
    {error && <p role="alert">{error}</p>}
    {(value.texture || value.roughnessMap || value.normalMap) && <Measure label="Doku tekrar genişliği"
      value={value.tileMm ?? value.texture?.tileMm ?? 400} min={1} max={1000} change={tileMm => update({ tileMm })} />}
    <PercentField label="Doku ölçeği" min={35} max={300} value={value.scale ?? 1} onChange={scale => update({ scale })} />
    <label className="measure"><span>Doku yönü (°)</span>
      <input key={value.direction ?? 0} type="number" step=".1" defaultValue={value.direction ?? 0}
        onBlur={event => {
          const input = event.currentTarget
          const direction = Number.isFinite(input.valueAsNumber) ? normalizeAngle(input.valueAsNumber) : value.direction ?? 0
          input.value = String(direction)
          if (direction !== (value.direction ?? 0)) update({ direction })
        }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
    </label>
    <PercentField label="Kabartı" min={0} max={200} value={value.relief ?? 1} onChange={relief => update({ relief })} />
    {!value.roughnessMap && <PercentField label="Matlık" min={0} max={100} value={value.roughness ?? .8}
      onChange={roughness => update({ roughness })} />}
    <div className="button-pair">
      <button type="button" disabled={!dirty || busy} onClick={() => apply(draft)}>Malzemeyi uygula</button>
      <button type="button" disabled={current === null || busy} onClick={() => apply(null)}>Varsayılana dön</button>
    </div>
  </>
}
