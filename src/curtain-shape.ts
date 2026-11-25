export function curtainPanels(width: number, opening: number) {
  const span = width / 2 * (1 - .78 * opening)
  return [{ center: (span - width) / 2, width: span }, { center: (width - span) / 2, width: span }]
}
