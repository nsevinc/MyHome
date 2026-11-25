import { readDataUrl } from './catalog'
import { sheetCenter, sheetHeight, sheetWidth } from './sketch-reference'

export async function openSketch(file: File) {
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!pdf && !['image/jpeg', 'image/png'].includes(file.type)) throw new Error('JPG, PNG veya tek sayfalı PDF seçin.')
  if (file.size > 10 * 1024 * 1024) throw new Error('En fazla 10 MB boyutunda bir taslak seçin.')
  if (pdf) return (await import('./sketch-pdf')).rasterizeSketchPdf(await file.arrayBuffer())
  const image = await createImageBitmap(file).catch(() => { throw new Error('Taslak fotoğrafı açılamadı.') })
  image.close()
  return readDataUrl(file)
}

export async function sketchPixels(source: string, rotation: number) {
  const image = new Image()
  image.src = source
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = sheetWidth
  canvas.height = sheetHeight
  const context = canvas.getContext('2d')!
  context.fillStyle = '#fff'
  context.fillRect(0, 0, sheetWidth, sheetHeight)
  context.translate(sheetCenter.x, sheetCenter.z)
  context.rotate(rotation * Math.PI / 180)
  const scale = Math.min(sheetWidth / image.width, sheetHeight / image.height)
  const width = image.width * scale, height = image.height * scale
  context.drawImage(image, -width / 2, -height / 2, width, height)
  return context.getImageData(0, 0, sheetWidth, sheetHeight)
}
