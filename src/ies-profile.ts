export const maxIesBytes = 128 * 1024

export function validIesProfile(text: string) {
  const tilt = /\nTILT=NONE[ \t]*\n/.exec(text)
  if (text.length > maxIesBytes || !tilt || !/^IES(?:NA)?(?=[:LM0-9\s])/i.test(text) || text.includes('\0')) return false
  const tokens = text.slice(tilt.index + tilt[0].length).trim().split(/[\s,]+/)
  if (tokens.some(token => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(token))) return false
  const values = tokens.map(Number)
  const [lamps, , multiplier, verticalCount, horizontalCount, type, units] = values
  if (!values.every(value => Number.isFinite(value) && Math.abs(value) <= 1e9)
    || !Number.isInteger(lamps) || lamps < 1 || multiplier <= 0
    || !Number.isInteger(verticalCount) || verticalCount < 2 || !Number.isInteger(horizontalCount) || horizontalCount < 1
    || type !== 1 || (units !== 1 && units !== 2)
    || values.length !== 13 + verticalCount + horizontalCount + verticalCount * horizontalCount) return false

  const vertical = values.slice(13, 13 + verticalCount)
  const horizontal = values.slice(13 + verticalCount, 13 + verticalCount + horizontalCount)
  const intensities = values.slice(13 + verticalCount + horizontalCount)
  const increasing = (axis: number[], max: number) =>
    axis.every((angle, index) => angle >= 0 && angle <= max && (!index || angle > axis[index - 1]))
  return increasing(vertical, 180) && increasing(horizontal, 360)
    && intensities.every(value => value >= 0) && intensities.some(value => value > 0)
}
