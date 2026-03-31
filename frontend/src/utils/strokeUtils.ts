import { getStroke } from 'perfect-freehand'

const VIEWBOX_WIDTH = 1000

/** Convert pointer coordinates to normalized ViewBox space (0-1000 width). */
export function toNormalized(
  clientX: number,
  clientY: number,
  pressure: number,
  svgRect: DOMRect,
  viewBoxHeight: number,
): number[] {
  const x = ((clientX - svgRect.left) / svgRect.width) * VIEWBOX_WIDTH
  const y = ((clientY - svgRect.top) / svgRect.height) * viewBoxHeight
  return [x, y, pressure]
}

/** Generate an SVG path d-attribute from normalized points using perfect-freehand. */
export function getSvgPathFromStroke(
  points: number[][],
  width: number,
  tool: 'pen' | 'highlighter',
): string {
  const outlinePoints = getStroke(points, {
    size: width,
    thinning: tool === 'highlighter' ? 0 : 0.5,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: points[0]?.[2] === 0.5,
  })

  if (outlinePoints.length < 2) return ''

  const d = outlinePoints.reduce(
    (acc, [x, y], i, arr) => {
      if (i === 0) return `M ${x} ${y}`
      const [cx, cy] = [
        (x + arr[i - 1][0]) / 2,
        (y + arr[i - 1][1]) / 2,
      ]
      return `${acc} Q ${arr[i - 1][0]} ${arr[i - 1][1]} ${cx} ${cy}`
    },
    '',
  )

  return `${d} Z`
}

export function getViewBoxHeight(imgWidth: number, imgHeight: number): number {
  return (VIEWBOX_WIDTH * imgHeight) / imgWidth
}
