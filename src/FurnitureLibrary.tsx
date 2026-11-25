import { Armchair, BedDouble, BoxSelect, ChevronDown, Columns3, LampWallUp, Plus, Table2, ThermometerSun, PanelsTopLeft,
  GalleryVertical, LampCeiling, RectangleHorizontal, ScanLine } from 'lucide-react'
import { bedroomCatalog, bedroomFamilies, bedroomModels } from './bedroom-models'
import type { BedroomFamily } from './bedroom-models'
import { nativeLibrary } from './library-models'
import type { LibraryActions, NativeGroup } from './library-models'
import { useState } from 'react'
import type { BedroomModel } from './model'
import type { ReactNode } from 'react'

export const furnitureIcons = {
  sofa: Armchair, bed: BedDouble, table: Table2, wardrobe: Columns3, box: BoxSelect,
  'wall-cabinet': PanelsTopLeft, sconce: LampWallUp, radiator: ThermometerSun,
  rug: RectangleHorizontal, curtain: GalleryVertical, mirror: ScanLine, pendant: LampCeiling,
}

export function LibraryCategory({ name, icon: Icon, children }: {
  name: string; icon: typeof Armchair; children: ReactNode;
}) {
  return <details className="library-category">
    <summary><Icon size={16} /><span>{name}</span><ChevronDown size={15} /></summary>
    <div className="model-list">{children}</div>
  </details>
}

type Card = { id: string; name: string; group: string; source: string; dimensions: string; select: () => void }

export function ModelCard({ name, source, dimensions, select, preview }: Omit<Card, 'id' | 'group' | 'source'> & { source?: string; preview?: ReactNode }) {
  return <button type="button" className="library-model-card" aria-label={name} onClick={select}>
    {source ? <img loading="lazy" decoding="async" width="72" height="58" alt="" src={source} /> : preview}
    <span>{name}<small>{dimensions}</small></span><Plus size={14} />
  </button>
}

const centimeters = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })
export const libraryDimensions = (width: number, depth: number, height: number) =>
  [width, depth, height].map(mm => centimeters.format(mm / 10)).join(' × ') + ' cm'
const familyIds = new Map<string, string>(Object.entries(bedroomFamilies).map(([id, label]) => [label, id]))
const groupValue = (group: string) => familyIds.get(group) ?? group

function ModelGallery({ cards }: { cards: Card[] }) {
  const [filter, setFilter] = useState('all')
  const groups = [...new Set(cards.map(card => card.group))]
  return <div className="bedroom-gallery">
    {groups.length > 1 && <label>Eşya türü<select value={filter} onChange={event => setFilter(event.target.value)}>
      <option value="all">Tüm türler</option>
      {groups.map(group => <option key={group} value={groupValue(group)}>{group}</option>)}
    </select></label>}
    {groups.filter(group => filter === 'all' || filter === groupValue(group)).map(group => <section key={group} aria-label={group}>
      {groups.length > 1 && <h4>{group}</h4>}
      {cards.filter(card => card.group === group).map(card => <ModelCard key={card.id} {...card} />)}
    </section>)}
  </div>
}

const previews = new Map(Object.values(nativeLibrary).flat().map(entry => {
  const item = entry.build({ x: 0, z: 0 }, 2650)
  return [entry.id, { name: item.name, dimensions: item.curtain ? 'Pencere ölçüsüne göre' : libraryDimensions(item.width, item.depth, item.height),
    width: item.width, depth: item.depth, height: item.height }]
}))

export function FurnitureLibrary({ wardrobeRun, addBedroom, bedroomSystem, ...actions }: LibraryActions & {
  wardrobeRun: () => void; addBedroom: (model: BedroomModel) => void; bedroomSystem: () => void
}) {
  const gallery = (category?: NativeGroup, families: BedroomFamily[] = []) => {
    const native = category ? nativeLibrary[category].map(entry => {
      const p = previews.get(entry.id)!
      return { id: entry.id, name: p.name, group: entry.group, source: `${import.meta.env.BASE_URL}library/${entry.id}.webp`,
        dimensions: entry.id === 'pendant' && actions.roomHeight < p.height ? libraryDimensions(p.width, p.depth, actions.roomHeight) : p.dimensions,
        select: () => entry.place(actions) }
    }) : []
    const bedroom = families.flatMap(family => bedroomModels.filter(id => bedroomCatalog[id].family === family).map(id => {
      const model = bedroomCatalog[id]
      return { id, group: bedroomFamilies[family], name: model.name, source: `${import.meta.env.BASE_URL}bedroom/${id}.webp`,
        dimensions: libraryDimensions(...model.size), select: () => addBedroom(id) }
    }))
    return <ModelGallery cards={[...native, ...bedroom]} />
  }
  return <div className="library-categories">
    <LibraryCategory name="Oturma" icon={Armchair}>{gallery('seating', ['poufs', 'benches'])}</LibraryCategory>
    <LibraryCategory name="Yatak odası" icon={BedDouble}>
      {gallery('beds')}
      <LibraryCategory name="Yatak ve gardırop tasarımları" icon={BedDouble}>{gallery(undefined, ['beds', 'wardrobes'])}</LibraryCategory>
      <LibraryCategory name="Yatak başı ve üst dolaplar" icon={PanelsTopLeft}>
        <button type="button" onClick={bedroomSystem}><PanelsTopLeft size={15} /><span>Yatak başı sistemi</span><Plus size={15} /></button>
        {gallery(undefined, ['headboards', 'overhead', 'side'])}
      </LibraryCategory>
      <LibraryCategory name="Tamamlayıcı eşyalar" icon={Table2}>
        {gallery(undefined, ['vanities', 'nightstands', 'poufs', 'dressers', 'benches', 'mirrors', 'shelves', 'art', 'rugs'])}
      </LibraryCategory>
    </LibraryCategory>
    <LibraryCategory name="Masa ve sehpalar" icon={Table2}>{gallery('tables', ['vanities', 'nightstands'])}</LibraryCategory>
    <LibraryCategory name="Gardıroplar" icon={Columns3}>
      <button type="button" onClick={wardrobeRun}><Columns3 size={15} /><span>Modüler gardırop</span><Plus size={15} /></button>
      {gallery('wardrobes', ['wardrobes'])}
    </LibraryCategory>
    <LibraryCategory name="Duvar dolapları" icon={PanelsTopLeft}>{gallery('cabinets', ['overhead', 'side'])}</LibraryCategory>
    <LibraryCategory name="Aydınlatma" icon={LampWallUp}>{gallery('lighting')}</LibraryCategory>
    <LibraryCategory name="Isıtma" icon={ThermometerSun}>{gallery('heating')}</LibraryCategory>
    <LibraryCategory name="Dekorasyon" icon={GalleryVertical}>{gallery('decor', ['mirrors', 'shelves', 'art', 'rugs'])}</LibraryCategory>
    <div className="model-list">{gallery('custom')}</div>
  </div>
}
