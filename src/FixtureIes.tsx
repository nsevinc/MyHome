import { useEffect, useRef, useState } from 'react'
import { PercentField } from './fields'
import { maxIesBytes, validIesProfile } from './ies-profile'
import type { Fixture } from './model'

type Profile = NonNullable<Fixture['ies']>

export function FixtureIes({ fixture, change }: { fixture: Fixture; change: (profile?: Profile) => void }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const ies = fixture.ies
  const latest = useRef(change)
  const mounted = useRef(false)
  latest.current = change
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function upload(file: File) {
    setBusy(true)
    setError('')
    try {
      if (file.size > maxIesBytes) throw new Error('IES dosyası en fazla 128 KB olabilir.')
      const text = (await file.text()).replace(/\r\n?/g, '\n').trim()
      if (!validIesProfile(text)) throw new Error('Geçerli bir LM-63 Tip C, TILT=NONE IES dosyası seçin.')
      if (mounted.current) latest.current({ name: file.name.trim().slice(0, 100) || 'Armatür.ies',
        text, gain: ies?.gain ?? 1, aim: ies?.aim ?? 'down' })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'IES dosyası açılamadı.') }
    finally { setBusy(false) }
  }
  return <div className="survey-fields">
    <label className="measure"><span>Üretici IES profili</span>
      <input type="file" accept=".ies" disabled={busy} onChange={event => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void upload(file)
      }} />
    </label>
    {ies && <>
      <p className="meta">{ies.name} · Işık dağılımı Cycles çıktısına uygulanır.</p>
      <PercentField label="IES yoğunluğu" value={ies.gain} min={1} max={500}
        onChange={gain => change({ ...ies, gain })} />
      {fixture.variant !== 'pendant' && <label className="measure"><span>IES ekseni</span>
        <select value={ies.aim} onChange={event => change({ ...ies, aim: event.currentTarget.value === 'out' ? 'out' : 'down' })}>
          <option value="down">Zemine doğru</option><option value="out">Odaya doğru</option>
        </select>
      </label>}
      <button type="button" onClick={() => { setError(''); change(undefined) }}>IES profilini kaldır</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>
}
