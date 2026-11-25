import { cabinetLedPlaces, defaultCabinetLed, fitCabinetLed } from './cabinet-led'
import { temperatureColor } from './lighting'
import { furnitureParts } from './furniture'
import type { CabinetLed, Furniture } from './model'

export function CabinetLedSettings({ item, change, visibleDoors, toggleDoors }: {
  item: Furniture; change: (patch: Partial<Furniture>) => void; visibleDoors: boolean; toggleDoors: () => void
}) {
  const led = item.cabinetLed ?? defaultCabinetLed
  const update = (value: Partial<CabinetLed>) => change(fitCabinetLed(item, { ...led, ...value }))
  const enabled = Boolean(item.cabinetLed?.on)
  const colors = [2700, 3000, 4000, 6500]
  return <fieldset className="render-fieldset"><legend>Dolap LED aydınlatması</legend>
    <label className="measure check"><input type="checkbox" checked={enabled} onChange={e => update({ on: e.target.checked })} />
      <span>Dolap LED ışığını aç</span></label>
    {!enabled && !item.wardrobe && item.kind === 'wardrobe' &&
      <p className="meta">LED eklediğinde bu temel dolaba raflı, düzenlenebilir bir iç gövde eklenir.</p>}
    {enabled && <>
      <label className="measure"><span>LED konumu</span><select value={led.placement} onChange={e => update({ placement: e.target.value as CabinetLed['placement'] })}>
        {Object.entries(cabinetLedPlaces).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      {led.placement === 'shelves' && !furnitureParts(item).some(part => part.ledMount === 'shelf') &&
        <p className="meta" role="status">Bu dolapta raf bulunmuyor. İç düzenine raf ekleyebilir veya başka bir LED konumu seçebilirsin.</p>}
      <label className="measure"><span>Işık tonu</span><select value={colors.find(k => temperatureColor(k) === led.color) ?? 'custom'}
        onChange={e => { if (e.target.value !== 'custom') update({ color: temperatureColor(Number(e.target.value)) }) }}>
        {colors.map((k, i) => <option key={k} value={k}>{k} K · {['Sıcak', 'Sıcak beyaz', 'Nötr', 'Soğuk'][i]}</option>)}
        {!colors.some(k => temperatureColor(k) === led.color) && <option value="custom">Özel renk</option>}
      </select></label>
      <label className="measure"><span>LED rengi</span><input type="color" value={led.color} onChange={e => update({ color: e.target.value })} /></label>
      <label className="measure"><span>Parlaklık · %{led.brightness}</span><input aria-label="LED parlaklığı" type="range" min="1" max="100"
        value={led.brightness} onChange={e => update({ brightness: e.target.valueAsNumber })} /></label>
      {item.wardrobe?.pose === 'closed' && item.wardrobe.front === 'solid' && led.placement !== 'top' &&
        <button type="button" onClick={toggleDoors}>{visibleDoors ? '3B’de dolabın içini göster' : '3B’de kapakları göster'}</button>}
    </>}
    {!item.wardrobe && (enabled || !visibleDoors) && <label className="measure check">
      <input type="checkbox" checked={visibleDoors} onChange={toggleDoors} /><span>Kapakları 3B düzenleyicide göster</span></label>}
  </fieldset>
}
