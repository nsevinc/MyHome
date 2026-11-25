import { makeCurtain, makeFurniture, makeMountedFurniture, makePendant, makeSlidingWardrobe, makeStackedWardrobe,
  makeWall, makeWardrobe, makeWideBed, wardrobeDoorCounts } from './model'
import type { Furniture, MountedKind, Point } from './model'

export type LibraryActions = {
  add: (item: Furniture) => void
  addMounted: (kind: MountedKind, bar?: boolean) => void
  addCurtain: (fabric: 'sheer' | 'opaque') => void
  position: () => Point
  roomHeight: number
}

type Build = (point: Point, roomHeight: number) => Furniture

function entry(id: string, group: string, build: Build, place?: (actions: LibraryActions) => void) {
  return { id, group, build, place: place ?? (actions => actions.add(build(actions.position(), actions.roomHeight))) }
}

function mounted(kind: MountedKind, group: string, bar = false) {
  return entry(bar ? 'sconce-bar' : kind, group, (_, height) => makeMountedFurniture(kind, 'preview', 1500, height, bar),
    actions => actions.addMounted(kind, bar))
}

export const nativeLibrary = {
  seating: [entry('sofa', 'Koltuklar', p => makeFurniture('sofa', p))],
  beds: [entry('bed', 'Yataklar', p => makeFurniture('bed', p)), entry('wide-bed', 'Yataklar', makeWideBed)],
  tables: [entry('table', 'Masalar', p => makeFurniture('table', p))],
  wardrobes: [
    ...wardrobeDoorCounts.map(n => entry(`wardrobe-${n}`, 'Menteşeli gardıroplar', p => makeWardrobe(n, p))),
    entry('sliding', 'Sürgülü gardıroplar', makeSlidingWardrobe),
    ...(['drawers', 'niche'] as const).map(type => entry(type, 'Bölmeli gardıroplar', p => makeStackedWardrobe(type, p))),
    entry('wardrobe', 'Temel dolap', p => makeFurniture('wardrobe', p)),
  ],
  cabinets: [mounted('wall-cabinet', 'Asma dolaplar')],
  lighting: [mounted('sconce', 'Aplikler'), mounted('sconce', 'Aplikler', true), entry('pendant', 'Sarkıtlar', makePendant)],
  heating: [mounted('radiator', 'Radyatörler')],
  decor: [entry('rug', 'Halılar', p => makeFurniture('rug', p)), mounted('mirror', 'Aynalar'),
    ...(['sheer', 'opaque'] as const).map(fabric => entry(`curtain-${fabric}`, 'Perdeler', (_, h) =>
      makeCurtain(makeWall(0, 3600), { id: 'preview', kind: 'window', offset: 800, width: 1400, height: 1200, bottom: 900 }, fabric, h),
    actions => actions.addCurtain(fabric)))],
  custom: [entry('box', 'Özel ölçü', p => makeFurniture('box', p))],
}
export type NativeGroup = keyof typeof nativeLibrary
