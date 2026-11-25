import type { Project } from './model'

const surfaceFields = [
  'floor', 'wall', 'floorFinish', 'wallFinish', 'floorTexture', 'wallTexture', 'surfaceRelief', 'colorSaturation', 'wallCoverings',
] as const

export function sameRenderFrame(a: Project, b: Project) {
  return a.walls === b.walls && a.items === b.items && a.height === b.height && a.thickness === b.thickness
    && JSON.stringify(a.camera) === JSON.stringify(b.camera)
    && JSON.stringify(a.style.sun) === JSON.stringify(b.style.sun)
    && JSON.stringify(a.style.renderDetail) === JSON.stringify(b.style.renderDetail)
    && surfaceFields.every(field => a.style[field] === b.style[field])
}
