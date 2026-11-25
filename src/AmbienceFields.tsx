import { NumberField, PercentField } from './fields'
import type { Ambience, Furniture } from './model'

type FixtureSettings = NonNullable<Ambience['fixtures']>[string]

export function AmbienceFields({ value, evening, strength, change }: {
  value: Ambience; evening: boolean; strength: number; change: (patch: Partial<Ambience>) => void;
}) {
  return <fieldset className="render-fieldset">
    <legend>Pencere ışığı ve pozlama</legend>
    <div className="render-grid">
      <PercentField label="Pencere ışığı" min={0} max={300} value={value.windowStrength ?? strength}
        onChange={windowStrength => change({ windowStrength })} />
      <PercentField label="Pencere ışığı kaynak boyutu" min={25} max={200} value={value.windowSize ?? 1}
        onChange={windowSize => change({ windowSize })} />
      <NumberField label="Pencere ışığı sıcaklığı (K)" min={1800} max={9000} step={1}
        value={value.windowTemperature ?? (evening ? 8000 : 6200)} onChange={temperature => change({ windowTemperature: Math.round(temperature) })} />
      <NumberField label="Pozlama (EV)" min={-4} max={4} step={.1}
        value={value.exposure ?? 0} onChange={exposure => change({ exposure })} />
      <NumberField label="Beyaz dengesi (K)" min={2500} max={10000} step={1}
        value={value.whiteBalance ?? 6500} onChange={temperature => change({ whiteBalance: Math.round(temperature) })} />
    </div>
    <button type="button" onClick={() => change({ windowStrength: undefined, windowSize: undefined, windowTemperature: undefined,
      exposure: undefined, whiteBalance: undefined })}>Pencere ve pozlamayı sıfırla</button>
  </fieldset>
}

export function AmbienceFixture({ item, value, change }: {
  item: Furniture & { fixture: NonNullable<Furniture['fixture']> };
  value?: FixtureSettings; change: (patch?: FixtureSettings) => void;
}) {
  const fixture = item.fixture
  const defaultDiameter = fixture.ies ? 24 : fixture.variant === 'pendant' ? Math.min(item.width, item.depth) * .58 : 130
  return <details className="render-fieldset">
    <summary>{item.name} · {(value?.on ?? fixture.on) ? 'Açık' : 'Kapalı'}</summary>
    <label className="render-checkbox">
      <input type="checkbox" checked={value?.on ?? fixture.on} onChange={event => change({ ...value, on: event.target.checked })} />
      Işığı yak
    </label>
    <div className="render-grid">
      <NumberField label="Armatür gücü (W)" min={1} max={250} value={value?.power ?? fixture.power}
        onChange={power => change({ ...value, power })} />
      <NumberField label="Armatür sıcaklığı (K)" min={1800} max={6500}
        value={value?.temperature ?? (fixture.variant === 'pendant' ? fixture.temperature : 3000)}
        onChange={temperature => change({ ...value, temperature: Math.round(temperature) })} />
      <NumberField label="Işık kaynağı çapı (cm)" min={1} max={200} step={.1}
        value={(value?.diameter ?? Math.round(defaultDiameter)) / 10}
        onChange={diameter => change({ ...value, diameter: Math.round(diameter * 10) })} />
    </div>
    <button type="button" disabled={!value} onClick={() => change()}>Armatürün özgün ayarını kullan</button>
  </details>
}
