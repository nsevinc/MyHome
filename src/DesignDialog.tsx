import { Copy, Film, Palette, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { activeDesign, designName, designScene, originalDesign, originalDesignName } from './design-variants'
import { sameCamera } from './camera-pose'
import { TextField } from './fields'
import { lightNames, lightProfiles, selectLightProfile } from './lighting'
import { maxDesigns } from './model'
import type { Project } from './model'
import { projectCamera } from './scene-data'

const ScenePreview = lazy(() => import('./Scene').then(module => ({ default: module.ScenePreview })))

export type DesignRenderSelection = {
  id: string; camera: NonNullable<Project['camera']>; light: Project['style']['light']
}

export function DesignDialog({ project, close, select, duplicate, rename, remove, render, error }: {
  project: Project; close: () => void; select: (id: string) => void; duplicate: () => void;
  rename: (id: string, name: string) => void; remove: (id: string) => void;
  render: (selection: DesignRenderSelection) => void; error: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const active = activeDesign(project)
  const entries = project.designs?.entries ?? []
  const options = [{ id: originalDesign, name: originalDesignName }, ...entries]
  const cameras = project.cameraViews ?? []
  const currentCamera = useMemo(() => projectCamera(project), [project])
  const [cameraId, setCamera] = useState(() => cameras.find(view => sameCamera(view.camera, currentCamera))?.id ?? '')
  const [light, setLight] = useState(project.style.light)
  const [choices, setChoices] = useState<[string, string]>()
  const [side, setSide] = useState<0 | 1>(1)
  const right = active || entries[0]?.id || originalDesign
  const left = entries.find(entry => entry.id !== right)?.id ?? originalDesign
  const pair = choices?.every(id => options.some(option => option.id === id)) ? choices : [left, right]
  const target = pair[side]
  const savedCamera = cameras.find(view => view.id === cameraId)?.camera
  const camera = savedCamera ?? currentCamera
  const preview = useMemo(() => {
    const scene = designScene(project, target)
    return { ...scene, camera, style: selectLightProfile(scene.style, light) }
  }, [project, target, camera, light])

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return <dialog ref={dialog} className="render-dialog design-dialog" aria-labelledby="design-dialog-title"
    onCancel={event => { event.preventDefault(); close() }}>
    <header className="dialog-header">
      <h2 id="design-dialog-title">Tasarım alternatifleri</h2>
      <button type="button" className="icon" aria-label="Tasarımları kapat" onClick={close}><X size={19} /></button>
    </header>
    <div className="render-body design-body">
      <div className="layout-actions">
        <label className="measure"><span>Düzenlenen tasarım</span>
          <select value={active} onChange={event => select(event.currentTarget.value)}>
            {options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
          </select>
        </label>
        {active && <TextField key={active} label="Tasarım adı" value={designName(project)}
          change={name => rename(active, name)} />}
        <button type="button" disabled={entries.length >= maxDesigns} onClick={() => {
          setChoices(undefined); setSide(1); duplicate()
        }}><Copy size={16} /> Tasarımı çoğalt</button>
        {active && <button type="button" className="danger" onClick={() => remove(active)}>Tasarımı kaldır</button>}
      </div>
      {error && <p className="error-message" role="alert">{error}</p>}
      {!entries.length ? <p className="meta">Bir alternatif oluşturmak için mevcut görünümü çoğalt. Ardından oda yüzeylerini ve eşyaların malzemelerini düzenle.</p> : <>
        <div className="design-comparison-fields">
          {(['A tasarımı', 'B tasarımı'] as const).map((label, index) => <label className="measure" key={label}>
            <span>{label}</span><select value={pair[index]} onChange={event => {
              const id = event.currentTarget.value
              const next: [string, string] = index === 0 ? [id, pair[1]] : [pair[0], id]
              setChoices(next[0] === next[1] ? [pair[1], pair[0]] : next)
              setSide(index === 0 ? 0 : 1)
            }}>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
          </label>)}
          <label className="measure"><span>Ortak kamera</span><select value={cameraId} onChange={event => setCamera(event.currentTarget.value)}>
            <option value="">Mevcut kamera açısı</option>
            {cameras.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
          </select></label>
          <label className="measure"><span>Ortak ışık</span><select value={light} onChange={event => setLight(event.currentTarget.value as typeof light)}>
            {lightProfiles.map(profile => <option key={profile} value={profile}>{lightNames[profile]}</option>)}
          </select></label>
        </div>
        <div className="view-tabs design-toggle" role="group" aria-label="3B karşılaştırma">
          {([0, 1] as const).map(index => <button type="button" key={index} aria-pressed={index === side}
            onClick={() => setSide(index)}>{index === 0 ? 'A' : 'B'} · {designName(project, pair[index])}</button>)}
        </div>
        <Suspense fallback={<p className="design-preview canvas-message">3B görünüm yükleniyor…</p>}>
          <ScenePreview project={preview} />
        </Suspense>
      </>}
    </div>
    <footer className="dialog-footer">
      {entries.length > 0 && <button type="button" onClick={() => render({ id: target, camera, light })}>
        <Film size={16} /> 4K render’a geç</button>}
      <button className="primary" type="button" onClick={() => {
        if (entries.length) select(target)
        close()
      }}><Palette size={16} />{entries.length ? 'Gösterilen tasarımı düzenle' : 'Düzenleyiciye dön'}</button>
    </footer>
  </dialog>
}
