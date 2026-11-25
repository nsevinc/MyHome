import { Measure } from './fields'
import { fmt } from './model'
import type { Point, SketchReference } from './model'
import { sketchDeviation, sketchScale } from './sketch-reference'
import type { SketchOpening } from './sketch-suggestion'

export type SketchTool = 'calibration' | 'verification' | 'origin'
export type RulerTool = { kind: SketchTool; mm: number; points: Point[] }
export type OpeningReview = SketchOpening & { accepted: boolean }

export function SketchTools({ reference, tool, edit, draft, opacity, rotate, start, distance, confirm, cancel, suggest, busy,
  openings, review, accept, discard }: {
  reference: SketchReference; tool?: RulerTool; edit: boolean; draft: boolean; busy: boolean
  opacity: (value: number) => void; rotate: (value: number) => void; start: (kind: SketchTool) => void
  distance: (mm: number) => void; confirm: () => void; cancel: () => void; suggest: () => void
  openings?: OpeningReview[]; review: (index: number, patch: Partial<OpeningReview>) => void
  accept: () => void; discard: () => void
}) {
  const scale = sketchScale(reference)
  const check = sketchDeviation(reference)
  const percent = check?.percent.toLocaleString('tr-TR', { maximumFractionDigits: 2, signDisplay: 'exceptZero' })
  return <section className="sketch-tools" aria-label="Taslak ayarları">
    <div className="sketch-sliders">
      <label>Şeffaflık <input type="range" min="0" max="100" value={Math.round(reference.opacity * 100)}
        onChange={event => opacity(Number(event.target.value) / 100)} /></label>
      <label>Döndürme ({reference.rotation}°) <input aria-label="Döndürme" type="range" min="-180" max="180" step=".5"
        value={reference.rotation} disabled={busy || Boolean(tool) || Boolean(openings) || (!edit && draft)}
        onChange={event => rotate(Number(event.target.value))} /></label>
    </div>
    <div className="draw-actions">
      <button onClick={() => start('calibration')} disabled={busy || Boolean(openings) || (!edit && draft)}>Ölçeği ayarla</button>
      <button onClick={() => start('verification')} disabled={busy || !scale || Boolean(openings)}>İkinci ölçüyü kontrol et</button>
      {edit && <button onClick={() => start('origin')} disabled={busy || !scale}>İlk köşeyi eşleştir</button>}
      {!edit && <button onClick={suggest} disabled={!scale || Boolean(tool) || Boolean(openings) || busy || draft}>Plan önerisi oluştur</button>}
    </div>
    {tool && <div className="sketch-tool-instruction">
      <span>{tool.kind === 'origin' ? 'Taslakta oda planının ilk köşesine karşılık gelen noktayı işaretleyin.'
        : tool.points.length === 2 ? 'İşaretler arasındaki gerçek mesafeyi girin.'
          : `${tool.points.length ? 'İkinci' : 'İlk'} noktayı işaretleyin.`}</span>
      {tool.kind !== 'origin' && <>
        <Measure label="Gerçek mesafe" value={tool.mm} min={.1} max={5000} change={distance} />
        <button disabled={tool.points.length !== 2} onClick={confirm}>Ölçüyü uygula</button>
      </>}
      <button onClick={cancel}>İptal</button>
    </div>}
    {reference.calibration && <p>Referans ölçü <strong>{fmt(reference.calibration.mm)} cm</strong></p>}
    {check && <p role="status">İkinci ölçü {fmt(check.measured)} cm. Fark <strong>{check.delta > 0 ? '+' : ''}{fmt(check.delta)} cm (%{percent}).</strong></p>}
    {openings && <div className="sketch-review">
      <strong>Plan önerisini kontrol edin</strong>
      <p>{openings.length ? 'Eklenecek açıklıkları seçin. Kapı yüksekliği ve pencere kotu oda oluşturulduktan sonra değiştirilebilir.'
        : 'Önerilen duvarları kontrol edin.'}</p>
      {openings.map((opening, index) => <div className="sketch-opening" key={`${opening.wall}-${opening.offset}`}>
        <label><input type="checkbox" checked={opening.accepted} onChange={event => review(index, { accepted: event.target.checked })} />
          Duvar {opening.wall + 1} · {fmt(opening.offset)} cm’den başlayan {fmt(opening.width)} cm açıklık</label>
        <select aria-label={`Açıklık ${index + 1} türü`} value={opening.kind}
          onChange={event => review(index, { kind: event.target.value === 'door' ? 'door' : 'window' })}>
          <option value="door">Kapı</option><option value="window">Pencere</option>
        </select>
      </div>)}
      <div className="draw-actions"><button onClick={accept}>Öneriyi çizime al</button>
        <button onClick={discard}>Öneriyi kaldır</button></div>
    </div>}
  </section>
}
