import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export async function rasterizeSketchPdf(data: ArrayBuffer) {
  const loading = getDocument({ data, useWasm: false })
  try {
    const document = await loading.promise.catch(() => { throw new Error('PDF açılamadı. Şifresiz ve geçerli bir PDF seçin.') })
    if (document.numPages !== 1) throw new Error('Tek sayfalı bir PDF seçin.')
    const page = await document.getPage(1)
    const original = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: 2200 / Math.max(original.width, original.height) })
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    await page.render({ canvas, viewport }).promise
    return canvas.toDataURL('image/png')
  } finally {
    await loading.destroy()
  }
}
