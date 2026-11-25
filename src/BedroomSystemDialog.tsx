import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { bedroomCatalog, bedroomHeadboards } from './bedroom-catalog'
import { bedroomDesignNames, buildBedroomDesign, defaultBedroomDesign, headboardDimensions, newBedroomModule,
  suggestBedroomWall } from './bedroom-design'
import type { BedroomDimensions, BedroomPreset, BedroomPreview } from './bedroom-design'
import { Measure } from './fields'
import { roomEdges } from './geometry'
import { fmt, maxLayouts } from './model'
import type { Furniture, Project } from './model'
import { sectionOffset, sectionProfile } from './room-section'

function DimensionFields({ sizes, change }: { sizes: BedroomDimensions; change: (fields: Partial<BedroomDimensions>) => void }) {
  return <div className="bedroom-dimensions">
    <Measure label="Genişlik" value={sizes.width} min={1} change={width => change({ width })} />
    <Measure label="Derinlik" value={sizes.depth} min={1} change={depth => change({ depth })} />
    <Measure label="Yükseklik" value={sizes.height} min={1} change={height => change({ height })} />
    <Measure label="Alt kot" value={sizes.bottom} change={bottom => change({ bottom })} />
  </div>
}

function BedroomDrawing({ preview, partId }: { preview: BedroomPreview; partId: string }) {
  const { project, edge, bed, offset } = preview
  const axis = edge.dx ? 'z' : 'x'
  const selected = preview.items.find(item => item.id === partId)
  const section = sectionProfile(project, { axis, offset: sectionOffset(axis, selected ?? bed) })
  const limit = Math.max(100, section.area.width)
  const y = (height: number) => project.height - height
  const room = (items: typeof section.rooms) => items.map(({ from, to }) => <rect key={from} x={from} y={0}
    width={to - from} height={project.height} fill="#f0eae0" stroke="#9b8974" strokeWidth="12" />)
  return <div className="bedroom-drawings">
    <figure>
      <svg role="img" aria-label="Yatak başı duvar görünüşü" viewBox={`-100 -110 ${edge.wall.length + 200} ${project.height + 220}`}>
        {room([{ from: 0, to: edge.wall.length }])}
        {edge.wall.openings.map(opening => <rect key={opening.id} x={opening.offset}
          y={y(opening.bottom + opening.height)} width={opening.width} height={opening.height} fill="#cee2e6" />)}
        <rect x={offset - bed.width / 2} y={y(bed.height)} width={bed.width} height={bed.height}
          fill={bed.color} fillOpacity=".46" stroke="#766654" strokeWidth="12" />
        {project.items.filter(item => item.mount?.wallId === edge.wall.id).map(item => {
          const { offset, bottom } = item.mount!
          return <rect key={item.id} x={offset - item.width / 2} y={y(bottom + item.height)} width={item.width} height={item.height}
            fill={item.wardrobe?.front === 'glass' ? '#a2c5c3' : item.color} stroke={item.id === partId ? '#195e62' : '#554235'}
            strokeWidth={item.id === partId ? 24 : 10}><title>{item.name}</title></rect>
        })}
        {edge.wall.obstacles.map(block => <rect key={block.id} x={block.offset} y={y(block.top)} width={block.width}
          height={block.top - block.bottom} fill="#c79a55" fillOpacity=".53"><title>{block.name}</title></rect>)}
      </svg>
      <figcaption>Duvar görünüşü</figcaption>
    </figure>
    <figure>
      <svg role="img" aria-label="Yatak başı yan kesiti" viewBox={`${section.area.x - 130} -110 ${limit + 260} ${project.height + 220}`}>
        {room(section.rooms)}
        {section.furniture.map(({ from, to, top, bottom, color, name, item }, index) =>
          <rect key={index} x={from} y={y(top)} width={to - from} height={top - bottom} fill={color}
            stroke={item.id === partId ? '#195e62' : '#655946'} strokeWidth={item.id === partId ? 22 : 10}><title>{name}</title></rect>)}
        {section.blocks.map(({ from, to, top, bottom, color, name }, index) =>
          <rect key={index} x={from} y={y(top)} width={to - from} height={top - bottom} fill={color}
            stroke="#987544" strokeWidth="10"><title>{name}</title></rect>)}
        {section.portals.map(({ from, top, bottom, color }, index) => <line key={index}
          x1={from} x2={from} y1={y(top)} y2={y(bottom)} stroke={color} strokeWidth="28" />)}
      </svg>
      <figcaption>Kesit · {selected?.name ?? 'Yatak merkezi'}</figcaption>
    </figure>
  </div>
}

export default function BedroomSystemDialog({ project, selectedId, close, apply }: {
  project: Project; selectedId?: string; close: () => void
  apply: (preview: BedroomPreview, preset: BedroomPreset, alternate: boolean) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const edges = useMemo(() => roomEdges(project.walls), [project.walls])
  const beds = project.items.filter(item => item.kind === 'bed')
  const [bedId, setBedId] = useState(() => beds.find(item => item.id === selectedId)?.id ?? beds[0].id)
  const bed = beds.find(item => item.id === bedId) ?? beds[0]
  const [edgeId, setEdgeId] = useState(() => (suggestBedroomWall(bed, edges) ?? edges[0]).wall.id)
  const edge = edges.find(entry => entry.wall.id === edgeId) ?? edges[0]
  const [preset, setPreset] = useState<BedroomPreset>('simple')
  const [design, setDesign] = useState(() => defaultBedroomDesign(project, bed, edge, 'simple'))
  const [sectionPart, setSectionPart] = useState('')
  const preview = useMemo(() => buildBedroomDesign(project, bed, edge, design), [project, bed, edge, design])
  const [headboard] = preview.readings
  const hasWarnings = preview.readings.some(reading => reading.warnings.length || reading.doorWarnings.length)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  function reset(nextBed: Furniture, nextEdge: typeof edge, nextPreset: BedroomPreset) {
    setBedId(nextBed.id)
    setEdgeId(nextEdge.wall.id)
    setPreset(nextPreset)
    setDesign(defaultBedroomDesign(project, nextBed, nextEdge, nextPreset))
    setSectionPart('')
  }
  function patchModule(id: string, transform: (item: Furniture) => Furniture) {
    setDesign(previous => ({ ...previous, modules: previous.modules.map(item => item.id === id ? transform(item) : item) }))
  }

  return <dialog ref={dialog} className="draw-dialog wardrobe-run-dialog bedroom-dialog" aria-labelledby="bedroom-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header"><div><h2 id="bedroom-title">Yatak başı sistemi</h2>
      <p>Yatağın başına panel, aydınlatma veya dolap modülleri yerleştir.</p></div>
      <button className="icon" aria-label="Yatak başı sistemini kapat" onClick={close}><X size={20} /></button>
    </header>
    <div className="bedroom-body">
      <div className="wardrobe-run-controls">
        <label className="measure">Yatak <select value={bed.id} onChange={event => {
          const next = beds.find(item => item.id === event.currentTarget.value)!
          reset(next, suggestBedroomWall(next, edges) ?? edges[0], preset)
        }}>{beds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="measure">Başlık duvarı <select value={edgeId} onChange={event =>
          reset(bed, edges.find(item => item.wall.id === event.currentTarget.value)!, preset)}>
          {edges.map(({ wall, index }) => <option key={wall.id} value={wall.id}>Duvar {index + 1} · {fmt(wall.length)} cm</option>)}
        </select></label>
        <label className="measure">Tasarım <select value={preset} onChange={event => reset(bed, edge, event.currentTarget.value as BedroomPreset)}>
          {Object.entries(bedroomDesignNames).map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select></label>
        <label className="measure">Yan kesit <select value={sectionPart} onChange={event => setSectionPart(event.currentTarget.value)}>
          <option value="">Yatak merkezi</option>
          {design.modules.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
      </div>
      <BedroomDrawing preview={preview} partId={sectionPart} />
      <fieldset className="render-fieldset">
        <legend>Yatak başlığı</legend>
        <label className="measure">Model <select value={design.headboard} onChange={event => {
          const headboard = bedroomHeadboards.find(model => model === event.currentTarget.value)!
          setDesign({ ...design, headboard, headboardSize: headboardDimensions(headboard, bed, edge) })
        }}>{bedroomHeadboards.map(model => <option key={model} value={model}>{bedroomCatalog[model].name}</option>)}</select></label>
        <DimensionFields sizes={design.headboardSize} change={fields =>
          setDesign(previous => ({ ...previous, headboardSize: { ...previous.headboardSize, ...fields } }))} />
        <div className="bedroom-toggles">
          <label className="measure check"><input type="checkbox" checked={design.lights}
            onChange={event => setDesign({ ...design, lights: event.currentTarget.checked })} /> İki aplik</label>
          <label className="measure check"><input type="checkbox" checked={design.nightstands}
            onChange={event => setDesign({ ...design, nightstands: event.currentTarget.checked })} /> Askılı komodinler</label>
        </div>
        {headboard.warnings.map(warning => <p className="error-message" key={warning}>{warning}</p>)}
      </fieldset>
      {design.modules.length > 0 && <div className="wardrobe-run-modules bedroom-modules">
        {design.modules.map((item, index) => {
          const { aboveBed, fit, warnings, doorWarnings } = preview.readings.find(reading => reading.item.id === item.id)!
          return <fieldset key={item.id} aria-label={`${item.name} · ${index + 1}. modül`}>
            <legend>{index + 1}. {item.name}</legend>
            <DimensionFields sizes={{ ...item, bottom: item.mount!.bottom }} change={({ bottom, ...size }) =>
              patchModule(item.id, module => ({ ...module, ...size, mount: { ...module.mount!, bottom: bottom ?? module.mount!.bottom } }))} />
            <div className="wardrobe-run-sizes">
              <label className="measure">Kapak sayısı <select value={item.wardrobe!.doors} onChange={event => {
                const doors = Number(event.currentTarget.value)
                patchModule(item.id, module => ({ ...module, wardrobe: { ...module.wardrobe!, doors, leaves: undefined,
                  interior: Array.from({ length: doors }, () => ({ shelves: [.5], drawers: 0 })) } }))
              }}>{[1, 2, 3, 4, 5].map(doors => <option key={doors}>{doors}</option>)}</select></label>
              <label className="measure">Kapak yüzeyi <select value={item.wardrobe!.front} onChange={event => {
                const front = event.currentTarget.value === 'glass' ? 'glass' : 'solid'
                patchModule(item.id, module => ({ ...module, wardrobe: { ...module.wardrobe!, front } }))
              }}><option value="solid">Opak</option><option value="glass">Cam</option></select></label>
            </div>
            <div className="wardrobe-run-checks">
              {aboveBed !== undefined && <span>Yatak üstü açıklık <strong>{fmt(aboveBed)} cm</strong></span>}
              <span>{fit.obstruction ? `${fit.obstruction} altı` : 'Tavana kadar'} <strong>{fmt(fit.clearance)} cm</strong></span>
              {doorWarnings.length === 0 && <span>Kapak açılımı için engel yok</span>}
              {[...warnings, ...doorWarnings].map(warning => <span className="error-message" key={warning}>{warning}</span>)}
            </div>
            <button type="button" aria-label={`${index + 1}. modülü kaldır`} onClick={() => {
              setDesign(previous => ({ ...previous, modules: previous.modules.filter(module => module.id !== item.id) }))
              if (sectionPart === item.id) setSectionPart('')
            }}><Trash2 size={15} /> Modülü kaldır</button>
          </fieldset>
        })}
      </div>}
      <div className="bedroom-actions">
        {(['upper-cabinet', 'side-cabinet'] as const).map(kind => <button type="button" key={kind} disabled={design.modules.length >= 6}
          onClick={() => setDesign(previous => ({ ...previous, modules: [...previous.modules, newBedroomModule(kind, edgeId)] }))}>
          <Plus size={16} /> {kind === 'upper-cabinet' ? 'Üst dolap ekle' : 'Yan modül ekle'}</button>)}
      </div>
      <div aria-live="polite">
        {preview.notes.map(note => <p className="meta" key={note}>{note}</p>)}
        {preview.errors.map(error => <p className="error-message" key={error}>{error}</p>)}
        {preview.readings.filter(({ item }) => !item.bedroomModel || item.bedroomModel === 'floating-nightstand')
          .flatMap(({ item, warnings }) => warnings.map(warning =>
            <p className="error-message" key={item.id + warning}>{item.name} · {warning}</p>))}
        {hasWarnings && <p className="meta">Önizlemede çakışma veya açılım uyarısı var. Ölçüleri değiştirerek tekrar kontrol edebilirsin.</p>}
      </div>
    </div>
    <footer className="dialog-footer">
      <button type="button" onClick={close}>Vazgeç</button>
      <button type="button" disabled={preview.errors.length > 0} onClick={() => apply(preview, preset, false)}>Açık yerleşime ekle</button>
      <button type="button" className="primary" disabled={preview.errors.length > 0 || (project.layouts?.entries.length ?? 1) >= maxLayouts}
        onClick={() => apply(preview, preset, true)}>Alternatif yerleşim olarak kaydet</button>
    </footer>
  </dialog>
}
