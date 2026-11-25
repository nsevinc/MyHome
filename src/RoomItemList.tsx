import { useMemo, useState } from 'react'
import { Box, Crosshair, Eye, EyeOff, Search, X } from 'lucide-react'
import { furnitureIcons } from './FurnitureLibrary'
import { filterRoomItems, itemCategory } from './room-item-view'
import type { Furniture } from './model'

export function RoomItemList({ items, selected, choose, focus, reset, focused, isolated, toggleIsolation }: {
  items: Furniture[]; selected: readonly string[]; choose: (id: string, extend: boolean) => void
  focus: () => void; reset: () => void; focused: boolean; isolated: boolean; toggleIsolation: () => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const categories = useMemo(() => [...new Set(items.map(itemCategory))].sort((a, b) => a.localeCompare(b, 'tr')), [items])
  const found = useMemo(() => filterRoomItems(items, query, category), [items, query, category])
  const selection = new Set(selected)
  const filtered = Boolean(query.trim() || category)
  return <section className="room-items" aria-label="Odadaki eşyalar">
    <h3>Odadaki eşyalar <span aria-live="polite">{filtered ? `${found.length} / ${items.length}` : items.length}</span></h3>
    {items.length > 0 && <div className="room-items-tools">
      <div className="room-item-search"><Search size={15} aria-hidden />
        <input type="search" aria-label="Eşya ara" placeholder="Eşya ara" value={query}
          onChange={event => setQuery(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && found.length === 1) {
              event.preventDefault()
              choose(found[0].id, false)
            }
          }} />
        {query && <button type="button" className="icon" aria-label="Aramayı temizle" onClick={() => setQuery('')}><X size={15} /></button>}
      </div>
      <select aria-label="Eşya kategorisi" value={category} onChange={event => setCategory(event.currentTarget.value)}>
        <option value="">Tüm kategoriler</option>
        {category && !categories.includes(category) && <option value={category}>{category}</option>}
        {categories.map(value => <option key={value} value={value}>{value}</option>)}
      </select>
      {(selected.length > 0 || focused || isolated) && <div className="room-items-actions">
        {selected.length > 0 && <button type="button" onClick={focus}><Crosshair size={15} /> Seçilene odaklan</button>}
        {focused && !isolated && <button type="button" onClick={reset}><Box size={15} /> Oda görünümüne dön</button>}
        {(selected.length > 0 || isolated) && <button type="button" className={isolated ? 'selected' : undefined}
          onClick={toggleIsolation}>{isolated ? <Eye size={15} /> : <EyeOff size={15} />}
          {isolated ? 'Tümünü göster' : 'Yalnızca seçileni göster'}</button>}
      </div>}
    </div>}
    {items.length === 0 && <p className="meta">Henüz eşya eklenmedi.</p>}
    {filtered && found.length === 0 && <div className="room-items-empty">
      <p className="meta" role="status">Eşleşen eşya bulunamadı.</p>
      <button type="button" onClick={() => { setQuery(''); setCategory('') }}>Filtreleri temizle</button>
    </div>}
    {found.map(item => {
      const Icon = item.kind === 'model' ? Box : furnitureIcons[item.kind]
      const active = selection.has(item.id)
      return <button key={item.id} type="button" className={active ? 'selected' : ''} aria-pressed={active}
        onClick={event => choose(item.id, event.shiftKey)}>
        <Icon size={16} /><span>{item.name}</span>
        {item.model?.source === 'catalog' && <small>GLB</small>}
      </button>
    })}
  </section>
}
