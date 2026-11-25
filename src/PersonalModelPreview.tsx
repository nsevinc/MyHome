import { useEffect, useRef, useState } from 'react'
import { Box } from 'lucide-react'
import type { PersonalModel } from './personal-library'

const thumbnails = new WeakMap<PersonalModel, Promise<string>>()
let pending = Promise.resolve()

function thumbnail(entry: PersonalModel) {
  let result = thumbnails.get(entry)
  if (!result) {
    result = pending.then(async () => (await import('./personal-thumbnail')).renderThumbnail(entry))
    thumbnails.set(entry, result)
    pending = result.then(() => {}, () => { thumbnails.delete(entry) })
  }
  return result
}

export function PersonalModelPreview({ entry }: { entry: PersonalModel }) {
  const placeholder = useRef<HTMLSpanElement>(null)
  const [source, setSource] = useState('')
  useEffect(() => {
    if (!placeholder.current || entry.model.source === 'catalog') return
    let active = true
    const observer = new IntersectionObserver(([row]) => {
      if (!row.isIntersecting) return
      observer.disconnect()
      void thumbnail(entry).then(url => { if (active) setSource(url) }, () => {})
    })
    observer.observe(placeholder.current)
    return () => { active = false; observer.disconnect() }
  }, [entry])
  const image = entry.model.source === 'catalog' ? `${import.meta.env.BASE_URL}library/${entry.model.id}.webp` : source
  return image ? <img src={image} width="72" height="58" loading="lazy" alt="" /> :
    <span className="model-placeholder" ref={placeholder}><Box size={20} /></span>
}
