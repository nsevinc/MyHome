import { proposeWardrobeFill } from './wardrobe-fill'

self.onmessage = (event: MessageEvent<Parameters<typeof proposeWardrobeFill>[0]>) => {
  try { self.postMessage(proposeWardrobeFill(event.data)) }
  catch { self.postMessage({ options: [], error: 'Otomatik yerleşim hesaplanamadı. Alan ve oda ölçülerini kontrol edin.' }) }
}
