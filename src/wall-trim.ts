import type { Appearance, Project, Wall } from './model'

type Face = { start: number; end: number; bottom: number; top: number }
export type TrimPiece = Face & { depth: number; appearance: Appearance; kind: 'baseboard' | 'trim' }
export const defaultTrimAppearance = { preset: 'matte-lacquer', color: '#ede9df', roughness: .72 } satisfies Appearance
export const trimLabels = { trim: 'Pencere pervazı', baseboard: 'Süpürgelik' } as const

function clearFaces(face: Face, cuts: Face[]) {
  return cuts.reduce((pieces, cut) => pieces.flatMap(piece => {
    const start = Math.max(piece.start, cut.start), end = Math.min(piece.end, cut.end)
    const bottom = Math.max(piece.bottom, cut.bottom), top = Math.min(piece.top, cut.top)
    if (start >= end || bottom >= top) return [piece]
    return [
      { ...piece, end: start }, { ...piece, start: end },
      { start, end, bottom: piece.bottom, top: bottom },
      { start, end, bottom: top, top: piece.top },
    ].filter(part => part.end > part.start && part.top > part.bottom)
  }), [face])
}

export function wallTrimPieces(wall: Wall, roomHeight: number): TrimPiece[] {
  const pieces: TrimPiece[] = []
  if (!wall.baseboard && !wall.openings.some(opening => opening.trim)) return pieces
  const openings = wall.openings.map(opening => ({
    start: opening.offset, end: opening.offset + opening.width, bottom: opening.bottom, top: opening.bottom + opening.height,
  }))
  if (wall.baseboard) {
    const { height, depth, appearance = defaultTrimAppearance } = wall.baseboard
    const top = Math.min(height, roomHeight)
    const cuts = openings.filter(opening => opening.bottom < top && opening.top > 0)
      .map(opening => ({ ...opening, bottom: 0, top }))
    for (const gap of wall.baseboard.gaps ?? []) cuts.push({ start: gap.start, end: gap.start + gap.width, bottom: 0, top })
    for (const piece of clearFaces({ start: 0, end: wall.length, bottom: 0, top }, cuts)) {
      pieces.push({ ...piece, kind: 'baseboard', depth, appearance })
    }
  }
  for (const opening of wall.openings) {
    if (opening.kind !== 'window' || !opening.trim) continue
    const { width, depth, appearance = defaultTrimAppearance } = opening.trim
    const left = opening.offset, right = left + opening.width
    const start = Math.max(0, left - width), end = Math.min(wall.length, right + width)
    const top = opening.bottom + opening.height
    const bottom = opening.bottom + Math.min(opening.height, opening.sill?.thickness ?? 0)
    const bars = [
      { start, end: left, bottom, top }, { start: right, end, bottom, top },
      { start, end, bottom: top, top: Math.min(roomHeight, top + width) },
    ]
    if (!opening.sill) bars.push({ start, end, bottom: Math.max(0, bottom - width), top: bottom })
    for (const bar of bars.filter(piece => piece.end > piece.start && piece.top > piece.bottom)) {
      for (const piece of clearFaces(bar, openings)) pieces.push({ ...piece, kind: 'trim', depth, appearance })
    }
  }
  return pieces
}

export function copyBaseboard(project: Project, sourceId: string, wallIds: readonly string[]): Project {
  const source = project.walls.find(wall => wall.id === sourceId)
  if (!source?.baseboard || source.locked) return project
  const { height, depth, appearance } = source.baseboard
  const walls = project.walls.map(wall => wall.id === sourceId || wall.locked || !wallIds.includes(wall.id) ? wall :
    { ...wall, baseboard: { height, depth, appearance, gaps: wall.baseboard?.gaps } })
  return walls.some((wall, index) => wall !== project.walls[index]) ? { ...project, walls } : project
}

export type ArchitecturalSurface = { kind: 'baseboard'; wallId: string } |
  { kind: 'trim' | 'sill'; wallId: string; openingId: string }

export function paintArchitecturalSurface(project: Project, target: ArchitecturalSurface, appearance?: Appearance): Project {
  const wall = project.walls.find(wall => wall.id === target.wallId)
  if (!wall || wall.locked) return project
  let next: Wall
  if (target.kind === 'baseboard') {
    if (!wall.baseboard) return project
    next = { ...wall, baseboard: { ...wall.baseboard, appearance } }
  } else {
    const opening = wall.openings.find(opening => opening.id === target.openingId && opening.kind === 'window')
    if (!opening || !opening[target.kind]) return project
    const changed = target.kind === 'trim'
      ? { ...opening, trim: { ...opening.trim!, appearance } }
      : { ...opening, sill: { ...opening.sill!, appearance } }
    next = { ...wall, openings: wall.openings.map(row => row === opening ? changed : row) }
  }
  return { ...project, walls: project.walls.map(row => row === wall ? next : row) }
}
