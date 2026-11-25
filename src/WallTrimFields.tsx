import { useState } from 'react'
import { Measure } from './fields'
import { MaterialFields } from './ItemMaterial'
import { fmt, maxBaseboardGaps, uid } from './model'
import type { Appearance, Baseboard, Wall, WindowTrim } from './model'
import { defaultTrimAppearance, wallTrimPieces } from './wall-trim'
import { captureAppearance } from './material-pipette'
import type { MaterialPipette } from './material-pipette'

export type TrimMaterialControls = { pipette: MaterialPipette; label: string; apply: (appearance?: Appearance) => void }

export function TrimMaterial({ controls, appearance, fallback = defaultTrimAppearance }: {
  controls: TrimMaterialControls; appearance?: Appearance; fallback?: Appearance;
}) {
  const color = fallback.color ?? '#ede9df'
  return <details className="material-library">
    <summary>{controls.label.split(' · ').at(-1)} malzemesi</summary>
    <div className="material-library-body">
      <MaterialFields current={appearance ?? fallback} color={color} apply={value => controls.apply(value ?? undefined)}
        transfer={{ pipette: controls.pipette, label: controls.label, source: captureAppearance(appearance ?? fallback, color) }} />
    </div>
  </details>
}

export function WindowTrimFields({ trim, change, material }: {
  trim?: WindowTrim; change: (trim?: WindowTrim) => void | boolean; material?: TrimMaterialControls;
}) {
  return <fieldset className="render-fieldset window-sill-fields">
    <legend>Pencere pervazı</legend>
    <label className="measure check">
      <input type="checkbox" checked={Boolean(trim)} onChange={event =>
        change(event.currentTarget.checked ? { width: 65, depth: 16 } : undefined)} />
      Pencere pervazı ekle
    </label>
    {trim && <>
      <div className="field-grid">
        <Measure label="Pervaz genişliği" value={trim.width} min={.1} max={30} change={width => change({ ...trim, width })} />
        <Measure label="Pervaz taşması" value={trim.depth} min={.1} max={20} change={depth => change({ ...trim, depth })} />
      </div>
      {material && <TrimMaterial controls={material} appearance={trim.appearance} />}
    </>}
  </fieldset>
}

export function BaseboardFields({ wall, walls, roomHeight, change, material, copy }: {
  wall: Wall; walls: Wall[]; roomHeight: number; change: (baseboard?: Baseboard) => void | boolean;
  material?: TrimMaterialControls; copy: (ids: string[]) => void;
}) {
  const { baseboard } = wall
  const [targets, setTargets] = useState<string[]>([])
  const available = walls.filter(target => target.id !== wall.id && !target.locked)
  const selected = targets.filter(id => available.some(target => target.id === id))
  const gaps = baseboard?.gaps ?? []
  const segment = baseboard && wallTrimPieces(wall, roomHeight).filter(piece => piece.kind === 'baseboard')
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))[0]
  return <fieldset className="render-fieldset window-sill-fields">
    <legend>Süpürgelik</legend>
    <label className="measure check">
      <input type="checkbox" checked={Boolean(baseboard)} onChange={event =>
        change(event.currentTarget.checked ? { height: Math.min(80, roomHeight), depth: 14 } : undefined)} />
      Bu duvara süpürgelik ekle
    </label>
    {baseboard && <>
      <div className="field-grid">
        <Measure label="Süpürgelik yüksekliği" value={Math.min(baseboard.height, roomHeight)} min={.1} max={Math.min(40, roomHeight / 10)}
          change={height => change({ ...baseboard, height })} />
        <Measure label="Süpürgelik taşması" value={baseboard.depth} min={.1} max={20} change={depth => change({ ...baseboard, depth })} />
      </div>
      {material && <TrimMaterial controls={material} appearance={baseboard.appearance} />}
      <details className="material-library">
        <summary>Süpürgelik boşlukları{gaps.length ? ` · ${gaps.length}` : ''}</summary>
        <div className="material-library-body">
          <p className="meta">Başlangıcı duvarın başlangıcından ölç. Bu aralıkta süpürgelik kesilir.</p>
          {gaps.map((gap, index) => <fieldset className="render-fieldset" key={gap.id}>
            <legend>Boşluk {index + 1}</legend>
            <div className="field-grid">
              <Measure label="Başlangıç" value={gap.start} max={(wall.length - gap.width) / 10}
                change={start => change({ ...baseboard, gaps: gaps.map(row => row === gap ? { ...row, start } : row) })} />
              <Measure label="Uzunluk" value={gap.width} min={.1} max={(wall.length - gap.start) / 10}
                change={width => change({ ...baseboard, gaps: gaps.map(row => row === gap ? { ...row, width } : row) })} />
            </div>
            <button type="button" onClick={() => change({ ...baseboard, gaps: gaps.filter(row => row !== gap) })}>Boşluğu kaldır</button>
          </fieldset>)}
          <button type="button" disabled={!segment || gaps.length >= maxBaseboardGaps} onClick={() => {
            if (segment) change({ ...baseboard, gaps: [...gaps, { id: uid(), start: segment.start, width: Math.min(100, segment.end - segment.start) }] })
          }}>Boşluk ekle</button>
        </div>
      </details>
      {available.length > 0 && <details className="material-library">
        <summary>Diğer duvarlara uygula</summary>
        <div className="material-library-body">
          <p className="meta">Bu duvardaki ölçü ve malzemeyi seçilen duvarlara uygular. Her duvar kendi boşluklarını korur.</p>
          {walls.map((target, index) => target.id !== wall.id && <label className="measure check" key={target.id}>
            <input type="checkbox" disabled={target.locked} checked={selected.includes(target.id)}
              onChange={event => setTargets(event.currentTarget.checked ? [...selected, target.id] : selected.filter(id => id !== target.id))} />
            Duvar {index + 1} · {fmt(target.length)} cm{target.locked ? ' · Kilitli' : target.baseboard ? ' · Mevcut süpürgelik' : ''}
          </label>)}
          <button type="button" className="primary" disabled={!selected.length} onClick={() => copy(selected)}>
            Seçili duvarlara uygula{selected.length ? ` (${selected.length})` : ''}
          </button>
        </div>
      </details>}
    </>}
  </fieldset>
}
