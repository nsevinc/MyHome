export const landscapeA4 = { width: 297, height: 210 }

type Page = { jpeg: Uint8Array<ArrayBuffer>; width: number; height: number }

export function imagePdf(pages: Page[]) {
  const encoder = new TextEncoder()
  const chunks: BlobPart[] = []
  const offsets: number[] = [0]
  let size = 0
  function write(content: string | Uint8Array<ArrayBuffer>) {
    const bytes = typeof content === 'string' ? encoder.encode(content) : content
    chunks.push(bytes)
    size += bytes.byteLength
  }
  function object(id: number, content: string, stream?: Uint8Array<ArrayBuffer>) {
    offsets[id] = size
    write(`${id} 0 obj\n${content}\n`)
    if (stream) {
      write('stream\n')
      write(stream)
      write('\nendstream\n')
    }
    write('endobj\n')
  }

  const width = (landscapeA4.width * 72 / 25.4).toFixed(5)
  const height = (landscapeA4.height * 72 / 25.4).toFixed(5)
  write('%PDF-1.4\n')
  write(new Uint8Array([37, 226, 227, 207, 211, 10]))
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`)
  pages.forEach((page, index) => {
    const id = 3 + index * 3
    const commands = encoder.encode(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`)
    object(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${id + 1} 0 R /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> >>`)
    object(id + 1, `<< /Length ${commands.byteLength} >>`, commands)
    object(id + 2, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.byteLength} >>`, page.jpeg)
  })
  const xref = size
  write(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`)
  for (const offset of offsets.slice(1)) write(`${String(offset).padStart(10, '0')} 00000 n \n`)
  write(`trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(chunks, { type: 'application/pdf' })
}
