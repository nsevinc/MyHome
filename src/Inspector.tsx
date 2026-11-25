import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, CircleAlert, Copy, Crosshair, DoorOpen, Layers3, Link2, PenLine, Replace, RotateCw, Trash2 } from 'lucide-react'
import type { CopyControls } from './adjacent-copy'
import { attachToWall, itemBottom, mountedCenter, mountOffset, placement, roomEdges, twiceArea, vertices } from './geometry'
import { defaultWardrobe, fmt, furnitureAngle, normalizeAngle, supportsCabinetLed, uid } from './model'
import { CabinetLedSettings } from './CabinetLedSettings'
import type { Appearance, Furniture, Obstacle, Opening, Project, RoomSurface, View, Wall, WallCovering } from './model'
import type { Selection } from './selection'
import { movementAxes, selectedFurniture } from './group-placement'
import { GroupInspector } from './GroupInspector'
import { WallMaterial } from './WallMaterial'
import { WindowSillFields } from './WindowSillFields'
import { Measure, NumberField, TextField } from './fields'
import { finishNames, finishes } from './materials'
import type { Finish } from './materials'
import { fixtureColor, lightNames, lightProfiles, selectLightProfile } from './lighting'
import { ItemMaterial } from './ItemMaterial'
import type { MaterialSample } from './material-pipette'
import type { ArchitecturalSurface } from './wall-trim'
import { BaseboardFields, WindowTrimFields } from './WallTrimFields'
import { WardrobeSettings } from './WardrobeSettings'
import { WardrobeAssembly } from './WardrobeAssembly'
import { CurtainSettings } from './CurtainSettings'
import { GapSettings } from './GapSettings'
import { KeepClearControls } from './KeepClearControls'
import type { WidthEdit } from './wardrobe-rebalance'
import { roomDoorLimit } from './opening-door'
import { WallSurvey, WallSurveyReading } from './WallSurvey'
import { FixtureIes } from './FixtureIes'
import { SunSettings } from './SunSettings'
import { MotionSettings } from './MotionSettings'
import type { MotionTrial, TrialSelection } from './furniture-motion'
import { canLink } from './furniture-links'
import { rowSelection } from './upper-cabinet-row'
import type { RowEdit } from './UpperRowDialog'

type Props = {
  copyControls?: CopyControls
  project: Project; visual: Project; selection: Selection; setSelection: (selection: Selection) => void;
  apply: (project: Project) => void; editRoom: () => void; view: View; setView: (view: View) => void
  chooseFinish?: (finish: Finish) => void
  changeSurface: (patch: Partial<RoomSurface>) => void
  changeItemColor: (id: string, color: string) => void
  chooseFurnitureMaterial?: (id: string, slot: string, appearance: Appearance | null) => void
  editWallCovering?: (id: string, update: (covering: WallCovering) => WallCovering) => void
  chooseArchitecturalMaterial?: (target: ArchitecturalSurface, appearance?: Appearance) => void
  drawCovering: (wallId: string) => void
  savePersonalModel?: (item: Furniture) => void;
  wardrobeRun: (wallId: string, id?: string, widthEdit?: WidthEdit) => void;
  openUpperRow: (edit: RowEdit) => void;
  hiddenDoors: ReadonlySet<string>; toggleDoors: (id: string) => void;
  preview?: Furniture; personal: boolean;
  trial?: MotionTrial; setTrial: (trial?: TrialSelection) => void;
  reviewFocus?: InspectorReviewFocus; openRoute?: (id: string) => void;
  startSmartPlacement: () => void; smartPlacement?: ReactNode;
  startLinkedPlacement: () => void; linkedPlacement?: ReactNode; linkedPreview?: ReactNode;
  startReplacement: (id: string) => void; replacement?: ReactNode;
  trimClearance?: ReactNode; copyBaseboard: (sourceId: string, wallIds: string[]) => void;
  removeSelection: () => void;
}

export type InspectorReviewFocus = { area: 'placement' | 'assembly' | 'survey' | 'motion' } | { area: 'door'; index: number }

export function Inspector({ project, visual, selection, setSelection, apply, editRoom, view, setView, chooseFinish,
  changeSurface, changeItemColor, chooseFurnitureMaterial, editWallCovering, chooseArchitecturalMaterial, drawCovering, savePersonalModel,
  hiddenDoors, toggleDoors, wardrobeRun, openUpperRow, preview, personal, trial, setTrial, reviewFocus, openRoute,
  startSmartPlacement, smartPlacement, startLinkedPlacement, linkedPlacement, linkedPreview, startReplacement, replacement,
  trimClearance, copyBaseboard, removeSelection, copyControls }: Props) {
  const inspector = useRef<HTMLElement>(null)
  const [materialSample, setMaterialSample] = useState<MaterialSample>()
  const pipette = { sample: materialSample, pick: setMaterialSample }
  useEffect(() => {
    if (!reviewFocus) return
    const anchor = inspector.current?.querySelector<HTMLElement>(`[data-review-anchor="${reviewFocus.area}"]`)
    if (!anchor) return
    if (anchor instanceof HTMLDetailsElement) anchor.open = true
    anchor.scrollIntoView({ block: 'nearest' })
  }, [reviewFocus])
  const item = selection.kind === 'item' ?
    preview?.id === selection.id ? preview : project.items.find(item => item.id === selection.id) : undefined
  const group = selection.kind === 'items' ? selectedFurniture(project.items, selection.ids) : []
  const selectedCabinets = item ? [item] : group
  const upper = rowSelection(project, selectedCabinets)
  const wall = selection.kind === 'wall' ? project.walls.find(wall => wall.id === selection.id) : undefined
  const wallIndex = wall ? project.walls.indexOf(wall) : -1
  const trimMaterial = (target: ArchitecturalSurface, name: string) => chooseArchitecturalMaterial ? {
    pipette, label: `Duvar ${wallIndex + 1} · ${name}`, apply: (appearance?: Appearance) => chooseArchitecturalMaterial(target, appearance),
  } : undefined
  const area = (Math.abs(twiceArea(vertices(project.walls))) / 2e6).toLocaleString('tr-TR', { maximumFractionDigits: 2 })
  const edges = useMemo(() => roomEdges(project.walls), [project.walls])
  const changeItem = (id: string, fields: Partial<Furniture>) =>
    apply({ ...project, items: project.items.map(item => item.id === id ? { ...item, ...fields } : item) })
  const changeWall = (id: string, fields: Partial<Wall>) =>
    apply({ ...project, walls: project.walls.map(wall => wall.id === id ? { ...wall, ...fields } : wall) })

  function newOpening(wall: Wall, kind: Opening['kind']) {
    const width = Math.min(wall.length, kind === 'door' ? 850 : 1100)
    const bottom = kind === 'door' ? 0 : Math.min(900, Math.floor(project.height * .35))
    const height = Math.min(project.height - bottom, kind === 'door' ? 2100 : 1200)
    const options = [Math.min(200, wall.length - width), 0, ...wall.openings.map(o => o.offset + o.width)]
    const offset = options.find(offset => offset + width <= wall.length && wall.openings.every(o =>
      offset >= o.offset + o.width || offset + width <= o.offset || bottom >= o.bottom + o.height || bottom + height <= o.bottom
    ))
    if (offset === undefined) return
    changeWall(wall.id, { openings: [...wall.openings, { id: uid(), kind, offset, width, height, bottom }] })
  }

  function newObstacle(wall: Wall, beam: boolean) {
    const width = Math.min(wall.length, beam ? 1200 : 330)
    const obstacle: Obstacle = {
      id: uid(), name: beam ? 'Tavan kirişi' : 'Kolon', width, depth: beam ? 500 : 300,
      offset: Math.min(150, wall.length - width), bottom: beam ? Math.max(0, project.height - 400) : 0, top: project.height,
    }
    changeWall(wall.id, { obstacles: [...wall.obstacles, obstacle] })
  }

  return <aside className="inspector" ref={inspector}>
    <div className="sidebar-heading"><span className="section-icon">{item ? <Box size={17} /> : <Layers3 size={17} />}</span>
      <div><h2>{item ? 'Eşya özellikleri' : group.length ? 'Seçili eşyalar' : wall ? `Duvar ${wallIndex + 1}` : 'Oda özellikleri'}</h2>
        <p>{item?.name ?? (group.length ? `${group.length} eşya` : wall ? `${fmt(wall.length)} cm · İç ölçü` : 'İç ölçüler ve yüzeyler')}</p></div></div>
    <div className="inspector-body">
      {linkedPreview}
      {item && copyControls && <button type="button" className="smart-launch" disabled={!copyControls.options.length}
        title={copyControls.options.length ? 'Uygun tarafa bitişik, bağımsız bir kopya ekle' :
          item.curtain ? 'Bu perde bağlı olduğu pencereye göre konumlanır.' : 'Bitişik kopya için uygun boşluk yok.'}
        onClick={() => { const first = copyControls.options[0]; if (first) copyControls.add(first.side) }}>
        <Copy size={17} /> Eşyayı kopyala</button>}
      {upper && <button type="button" className="smart-launch" onClick={() => openUpperRow({ ids: upper.existing?.members ?? group.map(i => i.id) })}>
        {upper.existing ? 'Üst dolap sırasını düzenle' : 'Üst dolap sırası oluştur'}</button>}
      {replacement ?? (item && <button type="button" className="smart-launch" disabled={item.locked}
        title={item.locked ? 'Önce konum kilidini aç' : undefined}
        onClick={() => startReplacement(item.id)}><Replace size={17} /> Eşyayı değiştir</button>)}
      {smartPlacement ?? (movementAxes(item ? [item] : group, edges).length > 0 && <button type="button"
        className="smart-launch" onClick={startSmartPlacement}><Crosshair size={17} /> Uygun konum bul</button>)}
      {linkedPlacement ?? ((project.furnitureLinks?.length || ((item && canLink(item) || group.some(canLink))
        && project.items.filter(canLink).length >= 2)) ? <button type="button" className="smart-launch linked-launch"
        onClick={startLinkedPlacement}><Link2 size={17} /> Bağlı yerleşim</button> : null)}
      {group.length > 1 ? <GroupInspector key={group.map(item => item.id).join(':')}
        items={group} project={project} edges={edges} apply={apply} remove={removeSelection} /> : item ? (() => {
        const fit = placement(project, item, edges)
        const wardrobe = item.wardrobe
        const mount = item.mount
        const mountEdge = edges.find(edge => edge.wall.id === mount?.wallId)
        const fixture = item.fixture
        const visualItem = visual.items.find(other => other.id === item.id) ?? item
        return <div className="control-section" key={item.id}>
          <TextField label="Ad" value={item.name} change={name => changeItem(item.id, { name })} />
          <label className="measure check"><input type="checkbox" checked={Boolean(item.locked)}
            onChange={event => changeItem(item.id, { locked: event.currentTarget.checked || undefined })} />
            <span>Konumu kilitle</span></label>
          <fieldset disabled={item.locked} className="placement-fields">
          <div className="field-grid">
            <Measure label="Genişlik" value={item.width} min={item.wardrobeRun?.fill?.profile === 'ready' ? 20 : .1} change={width => {
              if (upper?.existing) {
                openUpperRow({ ids: upper.existing.members, widthEdit: { id: item.id, width } })
                return false
              }
              const run = item.wardrobeRun
              if (run?.fill?.profile === 'ready') {
                wardrobeRun(run.wallId, run.id, { itemId: item.id, width })
                return false
              }
              changeItem(item.id, { width })
            }} />
            <Measure label={item.kind === 'rug' ? 'Uzunluk' : item.curtain ? 'Kıvrım derinliği' : 'Derinlik'}
              value={item.depth} min={.1} change={depth => changeItem(item.id, { depth })} />
            <Measure label={item.kind === 'rug' ? 'Kalınlık' : item.kind === 'pendant' ? 'Tavandan sarkma' : 'Yükseklik'}
              value={item.height} min={.1} max={item.kind === 'rug' ? 3 : item.kind === 'pendant' ? project.height / 10 : undefined}
              change={height => changeItem(item.id, { height })} />
            {!item.model && <label className="measure"><span>Eşya ana rengi</span><input type="color" aria-label="Eşya rengi" value={visualItem.color}
              onChange={event => changeItemColor(item.id, event.target.value)} /></label>}
          </div>
          {item.curtain ? <CurtainSettings project={project} item={item} edges={edges} change={patch => changeItem(item.id, patch)} />
            : mount ? <fieldset className="render-fieldset">
            <legend>Duvar montajı</legend>
            <label className="measure"><span>Montaj duvarı</span>
              <select value={mountEdge?.wall.id ?? ''} onChange={event => {
                const edge = edges.find(edge => edge.wall.id === event.target.value)
                if (!edge) return
                changeItem(item.id, attachToWall(item, { ...mount, wallId: edge.wall.id,
                  offset: mountOffset(edge, item.width, edge.wall.length / 2) }, edges))
              }}>
                {!mountEdge && <option value="" disabled>Duvar seçin</option>}
                {edges.map(edge => <option key={edge.wall.id} value={edge.wall.id}>
                  Duvar {edge.index + 1} · {fmt(edge.wall.length)} cm
                </option>)}
              </select>
            </label>
            <div className="field-grid">
              {mountEdge && <Measure label="Merkezin duvar başına uzaklığı" value={mountedCenter(item, mountEdge)} halfMillimeter
                min={Math.min(item.width, mountEdge.wall.length) / 20} max={(mountEdge.wall.length - Math.min(item.width, mountEdge.wall.length) / 2) / 10}
                change={offset => changeItem(item.id, attachToWall(item, { ...mount, offset }, edges))} />}
              <Measure label="Alt kot" value={mount.bottom} change={bottom => changeItem(item.id, { mount: { ...mount, bottom } })} />
            </div>
            {view !== 'elevation' && <button type="button" onClick={() => setView('elevation')}>
              <Layers3 size={16} /> Duvar görünüşünde düzenle
            </button>}
          </fieldset> : null}
          </fieldset>
          {item.kind === 'bed' && <label className="measure check">
            <input type="checkbox" checked={Boolean(item.separateHeadboard)}
              onChange={event => changeItem(item.id, { separateHeadboard: event.currentTarget.checked || undefined })} />
            <span>Ayrı yatak başlığı kullan</span>
          </label>}
          {item.kind === 'mirror' && <p className="meta">Aynadaki yansıma Cycles render’ında görünür.</p>}
          {fixture && <fieldset className="render-fieldset">
            <legend>{fixture.variant === 'pendant' ? 'Sarkıt ışığı' : 'Aplik ışığı'}</legend>
            <label className="measure check">
              <input type="checkbox" checked={fixture.on}
                onChange={event => changeItem(item.id, { fixture: { ...fixture, on: event.target.checked } })} />
              <span>Işığı yak</span>
            </label>
            <div className="field-grid">
              {!fixture.ies && <NumberField label="Işık gücü (W)" min={1} max={250} value={fixture.power}
                onChange={power => changeItem(item.id, { fixture: { ...fixture, power } })} />}
              {fixture.variant === 'pendant'
                ? <NumberField label="Renk sıcaklığı (K)" value={fixture.temperature} min={1800} max={6500} step={100}
                  onChange={temperature => changeItem(item.id, { fixture: { ...fixture, temperature: Math.round(temperature) } })} />
                : <label className="measure"><span>Işık rengi</span><input type="color" value={fixture.color}
                  onChange={event => changeItem(item.id, { fixture: { ...fixture, color: event.target.value } })} /></label>}
            </div>
            {personal && <FixtureIes key={item.id} fixture={fixture} change={ies => {
              const current = project.items.find(entry => entry.id === item.id)?.fixture
              if (current) changeItem(item.id, { fixture: { ...current, ies } })
            }} />}
            {fixture.variant === 'pendant' && <p className="meta">
              <span className="fixture-color" aria-hidden="true" style={{ backgroundColor: fixtureColor(fixture) }} />
              Tavana montaj · Alt kot {fmt(itemBottom(item, project.height))} cm
            </p>}
          </fieldset>}
          {!mount && <fieldset disabled={item.locked} className="placement-fields">
          <div className="field-grid">
            <Measure label="Konum X" value={item.x} min={-20000} max={20000} change={x => changeItem(item.id, { x })} />
            <Measure label="Konum Z" value={item.z} min={-20000} max={20000} change={z => changeItem(item.id, { z })} />
          </div>
          <div className="field-grid">
            <label className="measure"><span>Dönüş açısı (°)</span>
              <input key={furnitureAngle(item)} type="number" step=".1" defaultValue={furnitureAngle(item)}
                onBlur={event => {
                  const value = event.currentTarget.valueAsNumber
                  const angle = Number.isFinite(value) ? normalizeAngle(value) : furnitureAngle(item)
                  event.currentTarget.value = String(angle)
                  if (angle !== furnitureAngle(item)) changeItem(item.id, { angle })
                }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
            </label>
            <button className="render-align" onClick={() => changeItem(item.id, { angle: normalizeAngle(furnitureAngle(item) + 90) })}>
              <RotateCw size={16} /> 90° döndür</button>
          </div>
          </fieldset>}
          <div className={fit.warning.length ? 'fit-card warning' : 'fit-card'} role="status" data-review-anchor="placement">
            {fit.warning.length > 0 && <CircleAlert size={17} />}
            <div>{fit.warning.length ? fit.warning.map(w => <p key={w}>{w}</p>) :
              item.kind === 'pendant' ? <p>Tavandan <strong>{fmt(item.height)} cm</strong> sarkıyor</p> :
                <p>{fit.obstruction ? `${fit.obstruction} altında` : 'Tavana kadar'} <strong>{fmt(fit.clearance)} cm boşluk</strong></p>}</div>
          </div>
          {(view === 'plan' || view === 'split') && item.kind !== 'rug' && item.kind !== 'pendant' &&
            <KeepClearControls project={project} item={item} apply={apply} />}
          {trimClearance}
          {(view === 'plan' || view === 'split') && !item.curtain && <GapSettings project={project} item={item} edges={edges} previewing={item.locked || preview?.id === item.id}
            update={next => changeItem(item.id, next)} />}
          {item.wardrobeRun && <button onClick={() => wardrobeRun(item.wardrobeRun!.wallId, item.wardrobeRun!.id)}>Gardırop dizisini düzenle</button>}
          {item.kind === 'wardrobe' && <WardrobeAssembly project={project} item={item}
            openRoute={openRoute && (() => openRoute(item.id))} change={assembly => changeItem(item.id, { assembly })} />}
          {wardrobe ? <WardrobeSettings project={project} item={item} wardrobe={wardrobe} edges={edges}
            doorFocus={reviewFocus?.area === 'door' ? reviewFocus : undefined}
            update={wardrobe => changeItem(item.id, { wardrobe })} visible={!hiddenDoors.has(item.id)} toggle={() => toggleDoors(item.id)} />
            : item.kind === 'wardrobe' && <button type="button"
            onClick={() => changeItem(item.id, { wardrobe: { ...defaultWardrobe } })}>Gardırop kapaklarını düzenle</button>}
          {supportsCabinetLed(item) && <CabinetLedSettings item={item} change={patch => changeItem(item.id, patch)}
            visibleDoors={!hiddenDoors.has(item.id)} toggleDoors={() => toggleDoors(item.id)} />}
          {personal && <MotionSettings item={item} trial={trial} choose={setTrial}
            change={fields => changeItem(item.id, fields)} />}
          {chooseFurnitureMaterial && <ItemMaterial key={item.id} item={visualItem} pipette={pipette}
            apply={(slot, appearance) => chooseFurnitureMaterial(item.id, slot, appearance)} />}
          {item.model && savePersonalModel && <button type="button" onClick={() => savePersonalModel(visualItem)}>
            Kişisel kataloğa kaydet</button>}
          <button type="button" className="full danger" disabled={item.locked} onClick={removeSelection}
            aria-keyshortcuts="Delete"><Trash2 size={16} /> Eşyayı kaldır</button>
        </div>
      })() : wall ? <div className="control-section" key={wall.id}>
        <label className="measure"><span>Duvar</span><select value={wall.id} onChange={event => setSelection({ kind: 'wall', id: event.target.value })}>
          {project.walls.map((w, index) => <option key={w.id} value={w.id}>Duvar {index + 1} · {fmt(w.length)} cm</option>)}</select></label>
        <button onClick={() => view === 'elevation' ? setView('plan') : setView('elevation')}><Layers3 size={16} /> {view === 'elevation' ? 'Plana dön' : 'Duvar görünüşü'}</button>
        <label className="measure check"><input type="checkbox" checked={Boolean(wall.locked)}
          onChange={event => changeWall(wall.id, { locked: event.currentTarget.checked || undefined })} />
          <span>Duvarı kilitle</span></label>
        {personal && <><WallSurvey wall={wall} change={survey => changeWall(wall.id, { survey })} />
          <WallSurveyReading project={project} edge={edges[wallIndex]} /></>}
        {editWallCovering && <WallMaterial wall={wall} height={project.height} style={visual.style} pipette={pipette}
          change={change => editWallCovering(wall.id, change)} startDrawing={() => drawCovering(wall.id)} />}
        <fieldset disabled={wall.locked} className="placement-fields">
        <BaseboardFields wall={wall} walls={project.walls} roomHeight={project.height} change={baseboard => changeWall(wall.id, { baseboard })}
          material={trimMaterial({ kind: 'baseboard', wallId: wall.id }, 'Süpürgelik')} copy={ids => copyBaseboard(wall.id, ids)} />
        <h3>Açıklıklar</h3>
        <button onClick={() => wardrobeRun(wall.id)}>Bu duvara modüler gardırop</button>
        <div className="button-pair"><button onClick={() => newOpening(wall, 'door')}><DoorOpen size={15} /> Kapı</button>
          <button onClick={() => newOpening(wall, 'window')}>+ Pencere</button></div>
        {wall.openings.map((opening, index) => {
          const update = (fields: Partial<Opening>) => changeWall(wall.id, { openings: wall.openings.map(o => o.id === opening.id ? { ...o, ...fields } : o) })
          return <details key={opening.id} className="element-card">
            <summary>{opening.kind === 'door' ? 'Kapı' : 'Pencere'} {index + 1}<span>{fmt(opening.width)} cm</span></summary>
            <div className="field-grid">
              <Measure label="Başlangıç" value={opening.offset} change={offset => update({ offset })} />
              <Measure label="Genişlik" value={opening.width} min={.1} change={width => update({ width })} />
              <Measure label="Yükseklik" value={opening.height} min={.1} change={height => update({ height })} />
              {opening.kind === 'window' && <Measure label="Alt kot" value={opening.bottom} change={bottom => update({ bottom })} />}
            </div>
            {opening.kind === 'door' && <label className="measure check">
              <input type="checkbox" checked={Boolean(opening.swing)}
                onChange={event => update({ swing: event.target.checked ? { hinge: 'start', angle: roomDoorLimit } : undefined })} />
              <span>Kapı kanadını modelle</span>
            </label>}
            {opening.swing && <div className="field-grid">
              <label className="measure"><span>Menteşe konumu</span>
                <select value={opening.swing.hinge} onChange={event => update({ swing: {
                  angle: opening.swing!.angle, hinge: event.target.value === 'end' ? 'end' : 'start',
                } })}><option value="start">Başlangıç</option><option value="end">Bitiş</option></select>
              </label>
              <NumberField label="Oda kapısı açısı (°)" value={opening.swing.angle} min={0} max={110} step={.1}
                onChange={angle => update({ swing: { hinge: opening.swing!.hinge, angle: Math.round(angle * 10) / 10 } })} />
            </div>}
            {opening.kind === 'window' && <>
              <WindowSillFields wall={wall} opening={opening} project={project} change={sill => update({ sill })}
                material={trimMaterial({ kind: 'sill', wallId: wall.id, openingId: opening.id }, 'Denizlik')} />
              <WindowTrimFields trim={opening.trim} change={trim => update({ trim })}
                material={trimMaterial({ kind: 'trim', wallId: wall.id, openingId: opening.id }, 'Pervaz')} />
            </>}
            <button className="danger" onClick={() => changeWall(wall.id, { openings: wall.openings.filter(o => o.id !== opening.id) })}>Açıklığı kaldır</button>
          </details>
        })}
        <h3>Çıkıntı ekle</h3>
        <div className="button-pair"><button onClick={() => newObstacle(wall, false)}>+ Kolon</button>
          <button onClick={() => newObstacle(wall, true)}>+ Kiriş</button></div>
        {wall.obstacles.map(obstacle => {
          const update = (fields: Partial<Obstacle>) => changeWall(wall.id, { obstacles: wall.obstacles.map(o => o.id === obstacle.id ? { ...o, ...fields } : o) })
          return <details key={obstacle.id} className="element-card">
            <summary>{obstacle.name}<span>{fmt(obstacle.bottom)}–{fmt(obstacle.top)} cm</span></summary>
            <TextField label="Ad" value={obstacle.name} change={name => update({ name })} />
            <div className="field-grid">
              <Measure label="Başlangıç" value={obstacle.offset} change={offset => update({ offset })} />
              <Measure label="Uzunluk" value={obstacle.width} min={.1} change={width => update({ width })} />
              <Measure label="Taşma" value={obstacle.depth} min={.1} change={depth => update({ depth })} />
              <Measure label="Alt kot" value={obstacle.bottom} change={bottom => update({ bottom })} />
              <Measure label="Üst kot" value={obstacle.top} min={.1} change={top => update({ top })} />
            </div>
            <button className="danger" onClick={() => changeWall(wall.id, { obstacles: wall.obstacles.filter(o => o.id !== obstacle.id) })}>Çıkıntıyı kaldır</button>
          </details>
        })}
        </fieldset>
      </div> : <div className="control-section">
        <TextField label="Oda adı" value={project.title} change={title => apply({ ...project, title })} />
        <div className="room-stats"><div><span>Zemin alanı</span><strong>{area} m²</strong></div>
          <div><span>Tavan</span><strong>{fmt(project.height)} cm</strong></div></div>
        <button className="full" onClick={editRoom}><PenLine size={16} /> Oda ölçülerini düzenle</button>
        <label className="measure"><span>Duvar seç</span><select value="" onChange={event => setSelection({ kind: 'wall', id: event.target.value })}>
          <option value="" disabled>Bir duvar seçin</option>
          {project.walls.map((w, index) => <option key={w.id} value={w.id}>Duvar {index + 1} · {fmt(w.length)} cm</option>)}</select></label>
        <h3>Görünüm</h3>
        <div className="field-grid">
          <label className="measure"><span>Zemin</span><input type="color" aria-label="Zemin rengi" value={visual.style.floor}
            onChange={event => changeSurface({ floor: event.target.value })} /></label>
          <label className="measure"><span>Duvar</span><input type="color" aria-label="Duvar rengi" value={visual.style.wall}
            onChange={event => changeSurface({ wall: event.target.value })} /></label>
        </div>
        {chooseFinish && <label className="measure"><span>Zemin malzemesi</span>
          <select value={visual.style.floorTexture ? 'custom' : visual.style.floorFinish ?? 'plain'} onChange={event => {
            if (event.target.value !== 'custom') chooseFinish(event.target.value as Finish)
          }}>
            {finishes.map(finish => <option key={finish} value={finish}>{finishNames[finish]}</option>)}
            {visual.style.floorTexture && <option value="custom">Yüklenen doku</option>}
          </select></label>}
        <label className="measure"><span>Işık</span><select value={project.style.light} onChange={event =>
          apply({ ...project, style: selectLightProfile(project.style, event.target.value as Project['style']['light']) })}>
          {lightProfiles.map(light => <option key={light} value={light}>{lightNames[light]}</option>)}
        </select></label>
        {personal && <SunSettings project={project} sun={project.style.sun}
          change={sun => apply({ ...project, style: { ...project.style, sun } })} />}
      </div>}
    </div>
  </aside>
}
