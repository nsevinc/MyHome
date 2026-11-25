import { itemBottom, overlapsShape, wallMountPose } from './geometry'
import type { Furniture, Point } from './model'
import { cabinetDoorClearance, cabinetDoorEnvironment, cabinetDoors, cabinetFurnitureObstacles, leafVolumes, localToRoom, rotateAround } from './wardrobe'
import { alongRow } from './upper-cabinet-row'
import type { UpperRowPlan } from './upper-cabinet-row'

const rad = Math.PI / 180
type Leaf = ReturnType<typeof cabinetDoors>[number]

function movingLeaf(item: Furniture, door: Leaf, height: number) {
  const pivot = localToRoom(item, door.hinge)
  const solids = leafVolumes(door, itemBottom(item, height)).map(s => ({ ...s, points: s.points.map(p => localToRoom(item, p)) }))
  const radius = Math.max(...solids.flatMap(s => s.points.map(p => Math.hypot(p.x - pivot.x, p.z - pivot.z))))
  function at(degrees: number) {
    const yaw = Math.min(door.limit, degrees) * rad * door.side
    return solids.map(s => ({ ...s, points: s.points.map(p => rotateAround(p, pivot, yaw)) }))
  }
  return { item, door, pivot, radius, at }
}

// A separating axis at the midpoint remains valid throughout an interval
// if its gap exceeds both vertices' maximum travel to either endpoint.
function separation(a: Point[], b: Point[]) {
  let maximum = -Infinity
  for (const shape of [a, b]) for (let i = 0; i < 2; i++) {
    const dx = shape[i + 1].x - shape[i].x, dz = shape[i + 1].z - shape[i].z
    const length = Math.hypot(dx, dz)
    const project = (p: Point) => ((p.x - shape[0].x) * dz - (p.z - shape[0].z) * dx) / length
    const x = a.map(project), y = b.map(project)
    maximum = Math.max(maximum, Math.min(...x) - Math.max(...y), Math.min(...y) - Math.max(...x))
  }
  return maximum
}

function firstJointContact(a: ReturnType<typeof movingLeaf>, b: ReturnType<typeof movingLeaf>, cap: number) {
  function scan(lo: number, hi: number): number | undefined {
    const mid = (lo + hi) / 2
    const reach = ((lo < a.door.limit ? a.radius : 0) + (lo < b.door.limit ? b.radius : 0)) * (hi - lo) * rad / 2
    const left = a.at(mid), right = b.at(mid)
    let possible = false
    for (const x of left) for (const y of right) {
      if (x.top <= y.bottom || y.top <= x.bottom) continue
      if (separation(x.points, y.points) <= reach) possible = true
    }
    if (!possible) return
    if (hi - lo < .005) {
      for (const angle of [lo, mid, hi]) {
        const right = b.at(angle)
        if (a.at(angle).some(x => right.some(y => x.top > y.bottom && y.top > x.bottom && overlapsShape(x.points, y.points)))) return angle
      }
      return
    }
    return scan(lo, mid) ?? scan(mid, hi)
  }
  return scan(0, cap)
}

export function jointDoorTrial(plan: UpperRowPlan, seam: number) {
  const sources = plan.items.slice(seam, seam + 2).map(i => wallMountPose(i, plan.edges))
  if (sources.length !== 2 || sources.some(i => !i.wardrobe || i.wardrobe.pose === 'none' || i.wardrobe.motion === 'sliding')) return
  const leaves = sources.map((item, i) => {
    const ordered = cabinetDoors(item).sort((a, b) => {
      const center = (door: Leaf) => alongRow(localToRoom(item, door.center), plan.edge)
      return center(a) - center(b)
    })
    return movingLeaf(item, i ? ordered[0] : ordered[ordered.length - 1], plan.project.height)
  })
  const [a, b] = leaves
  const limit = Math.max(a.door.limit, b.door.limit)
  const others = plan.project.items.filter(i => !sources.some(source => source.id === i.id))
  const environment = [...cabinetDoorEnvironment({ ...plan.project, items: others }, plan.edges),
    ...leaves.flatMap(l => cabinetFurnitureObstacles(l.item, plan.project.height, true, l.door.index))]
  const named = (i: number) => `${seam + i + 1}. modül · ${leaves[i].door.label}`
  const staticHits = leaves.flatMap((l, i) => {
    const hit = cabinetDoorClearance(plan.project, l.item, plan.edges, environment)[l.door.index]?.hit
    return hit ? [{ angle: hit.angle, labels: [named(i), hit.label] }] : []
  }).sort((x, y) => x.angle - y.angle)
  const joint = firstJointContact(a, b, staticHits[0]?.angle ?? limit)
  const hit = joint === undefined ? staticHits[0] : { angle: joint, labels: [named(0), named(1)] }
  return { leaves, limit, hit }
}
