import { fmt } from './model'
import type { TrimContact, WallEdge } from './geometry'
import type { Furniture } from './model'
import type { TrimClearancePreview } from './trim-placement'

export function TrimClearanceControls({ item, contacts, edges, preview, showWall, propose, cancel, apply }: {
  item: Furniture; contacts: TrimContact[]; edges: WallEdge[]; preview?: TrimClearancePreview;
  showWall: (id: string) => void; propose: (id: string) => void; cancel: () => void; apply: () => void;
}) {
  if (!contacts.length) return null
  const canMove = !item.locked && !item.mount && item.kind !== 'pendant' && !item.wardrobeRun
  const gapText = (gap: TrimClearancePreview['gap']['before']) => gap
    ? gap.overlap ? 'Engelle örtüşüyor' : `${fmt(Math.round(gap.distance))} cm · ${gap.name}`
    : 'Ölçü bulunamadı'

  return <section className="trim-clearance-controls" aria-label="Duvar detayı çakışmaları">
    {edges.filter(({ wall }) => contacts.some(contact => contact.wallId === wall.id)).map(({ wall, index }) => {
      const distance = Math.max(...contacts.filter(contact => contact.wallId === wall.id).map(contact => contact.distance))
      return <div className="button-pair" key={wall.id}>
        <button type="button" onClick={() => showWall(wall.id)}>Duvar {index + 1} görünüşünde göster</button>
        {canMove && <button type="button" aria-label={`Duvar ${index + 1} için ${fmt(distance)} cm öne almayı önizle`}
          onClick={() => propose(wall.id)}>{fmt(distance)} cm öne almayı önizle</button>}
      </div>
    })}
    {!canMove && <p className="meta">{item.locked ? 'Önizleme için eşyanın konum kilidini aç.' : 'Bu eşyanın konumunu montaj ayarlarından düzenle.'}</p>}
    {preview && <section className="linked-preview-card" aria-label="Duvar detayı düzeltme önizlemesi">
      <h3>Duvar detayı düzeltme önizlemesi</h3>
      {preview.error && <p className="error-message" role="alert">{preview.error}</p>}
      <ul>
        <li><strong>Hareket yönündeki boşluk</strong><small>{gapText(preview.gap.before)} → {gapText(preview.gap.after)}</small></li>
        {preview.passages.map(row => <li key={row.id}><strong>{row.name}</strong><small>{row.before} → {row.after}</small></li>)}
        {preview.items.filter(row => row.id !== item.id).map(row => <li key={row.id}><strong>{row.name}</strong><small>Bağlı eşya da taşınır.</small></li>)}
      </ul>
      <div className="button-pair">
        <button type="button" onClick={cancel}>İptal</button>
        <button type="button" className="primary" onClick={apply} disabled={Boolean(preview.error)}>Hareketi uygula</button>
      </div>
    </section>}
  </section>
}
