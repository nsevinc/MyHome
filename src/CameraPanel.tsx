import { X } from 'lucide-react'
import { useState } from 'react'
import { aimCamera, architecturalCamera, cameraAngles, horizontalFov, raiseCamera, sameCamera } from './camera-pose'
import { cycles4k } from './cycles-settings'
import { NumberField } from './fields'
import { uid } from './model'
import type { CameraView, Project } from './model'

type Camera = NonNullable<Project['camera']>
const decimal = (value: number) => Math.round(value * 10) / 10

const lenses = [['Detay', 32], ['Dengeli', 45], ['Geniş', 60]] as const

export function CameraLensPresets({ fov, change }: { fov: number; change: (fov: number) => void }) {
  return <div className="camera-lens">
    <div className="draw-actions" role="group" aria-label="Kamera görüş açısı seçenekleri">
      {lenses.map(([label, angle]) => <button type="button" key={angle} aria-pressed={fov === angle} onClick={() => change(angle)}>
        {label} {angle}°</button>)}
    </div>
    <small className="meta">16:9 kadrajda yatay görüş {Math.round(horizontalFov(fov, cycles4k.width / cycles4k.height))}°</small>
  </div>
}

export function ArchitecturalCameraFields({ camera, change }: { camera: Camera; change: (camera: Camera) => void }) {
  const active = camera.verticalShift !== undefined
  return <fieldset className="render-fieldset">
    <legend>Mimari perspektif</legend>
    <label className="measure check">
      <input type="checkbox" checked={active} onChange={event => change(architecturalCamera(camera, event.currentTarget.checked))} />
      <span>Dikeyleri düz tut</span>
    </label>
    {active && <NumberField label="Kadrajın düşey kaydırması (%)" value={Math.round((camera.verticalShift ?? 0) * 100)}
      min={-40} max={40} onChange={value => change({ ...camera, verticalShift: value / 100 })} />}
  </fieldset>
}

export function CameraPanel({ camera, views, change, saveView, close, personal }: {
  camera: Camera; views: CameraView[]; change: (camera: Camera) => void;
  saveView: (view: CameraView) => void; close: () => void; personal: boolean;
}) {
  const [name, setName] = useState('')
  const selected = views.find(view => sameCamera(view.camera, camera))
  const { yaw, pitch } = cameraAngles(camera)
  return <section className="camera-panel" aria-label="Kamera ayarları">
    <header><h3>Kamera ayarları</h3><button type="button" className="icon" aria-label="Kamera ayarlarını kapat" onClick={close}>
      <X size={16} /></button></header>
    <div className="field-grid">
      <NumberField label="Kamera yüksekliği (cm)" value={decimal(camera.position[1] * 100)} min={-20000} max={20000} step={.1}
        onChange={value => change(raiseCamera(camera, value / 100))} />
      <NumberField label="Dikey görüş açısı (°)" value={decimal(camera.fov)} min={20} max={95} step={.1}
        onChange={fov => change({ ...camera, fov })} />
      <NumberField label="Yatay bakış (°)" value={decimal(yaw)} min={-180} max={180} step={.1}
        onChange={value => change(aimCamera(camera, value, pitch))} />
      {camera.verticalShift === undefined && <NumberField label="Dikey eğim (°)" value={decimal(pitch)} min={-89.9} max={89.9} step={.1}
        onChange={value => change(aimCamera(camera, yaw, value))} />}
    </div>
    {personal && <ArchitecturalCameraFields camera={camera} change={change} />}
    <CameraLensPresets fov={camera.fov} change={fov => change({ ...camera, fov })} />
    <label className="measure"><span>Kayıtlı açılar</span>
      <select value={selected?.id ?? ''} onChange={event => {
        const view = views.find(view => view.id === event.currentTarget.value)
        if (view) change(view.camera)
      }}>
        <option value="" disabled>Geçerli açı</option>
        {views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
      </select>
    </label>
    <label className="measure"><span>Yeni açı adı</span>
      <input maxLength={100} value={name} onChange={event => setName(event.currentTarget.value)} />
    </label>
    <button type="button" disabled={views.length >= 12 || !name.trim()} onClick={() => {
      saveView({ id: uid(), name: name.trim(), camera })
      setName('')
    }}>Açıyı kaydet</button>
  </section>
}
