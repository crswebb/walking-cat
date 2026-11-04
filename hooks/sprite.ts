// The pixel cat: a 24x20 sprite drawn as one animated SVG, its walk, legs and
// blink run by SMIL so the picture moves without being drawn again.

const W = 24
const H = 20

// Parts, by letter: K outline, T tail, B body, S stripe, M muzzle and chest,
// H head, I inner ear, E eye, P pupil, N nose, L leg.
const TAIL = ['.KK.', 'KTTK', 'KTK.', 'KTK.', 'KTK.', 'KTK.', '.KTK', '..KT']
const BODY = [
  '.KKKKKKKKKKKKK.',
  'KBSBBSBBSBBSBBK',
  'KBBSBBSBBSBBSBK',
  'KBBBBBBBBBBBBMK',
  'KBBBBBBBBBBBMMK',
  'KBBBBBBBBBBBMMK',
  '.KBBBBBBBBBBBK.',
  '..KKKKKKKKKKK..',
]
const HEAD = [
  '.K.....K.',
  'KIK...KIK',
  'KHHKKKHHK',
  'KHHHHHHHK',
  'KHEPHEPHK',
  'KHHHNHHHK',
  'KHMMKMMHK',
  '.KMMMMMK.',
  '..KKKKK..',
]
// Rows of the head swapped in: eyes shut for the blink, and wide open (one
// row taller) while the cat waits on the person.
const BLINK_ROW = 'KHKKHKKHK'
const WIDE_ROW = 'KHEEHEEHK'
const HEAD_X = 15
const HEAD_Y = 1
const LEG_TOPS = [5, 8, 13, 16]
// Each leg's foot offset per pose: a stride, standing, the other stride,
// standing again.
const STRIDES = [
  [-2, 1, 2, -1],
  [0, 0, 0, 0],
  [2, -1, -2, 1],
  [0, 0, 0, 0],
]

type Grid = string[][]

const empty = (): Grid => Array.from({ length: H }, () => Array<string>(W).fill('.'))

const stamp = (g: Grid, rows: string[], x: number, y: number) =>
  rows.forEach((row, j) =>
    Array.from(row).forEach((c, i) => {
      const line = g[y + j]
      if (c !== '.' && line !== undefined) {
        line[x + i] = c
      }
    }),
  )

// Everything but the legs: tail, body and head.
const still = (isAlert: boolean): Grid => {
  const g = empty()
  stamp(g, TAIL, 0, 0)
  stamp(g, BODY, 2, 7)
  const head = HEAD.slice()
  if (isAlert) {
    head[3] = WIDE_ROW
  }
  stamp(g, head, HEAD_X, HEAD_Y)
  return g
}

const legs = (pose: number): Grid => {
  const g = empty()
  const offsets = STRIDES[pose] ?? STRIDES[1] ?? []
  offsets.forEach((dx, n) => {
    const top = LEG_TOPS[n] ?? 0
    for (let r = 15; r < H; r++) {
      const x = top + Math.round((dx * (r - 15)) / 4)
      const line = g[r]
      if (line !== undefined) {
        line[x - 1] = 'K'
        line[x + 1] = 'K'
        line[x] = r === H - 1 ? 'K' : 'L'
      }
    }
  })
  return g
}

const blink = (): Grid => {
  const g = empty()
  stamp(g, [BLINK_ROW], HEAD_X, HEAD_Y + 4)
  return g
}

// A coat: each part's color, the body's where a part has none of its own.
export type PixelCoat = {
  name: string
  B: string
  S?: string
  M?: string
  H?: string
  T?: string
  L?: string
  K?: string
  eyes: [string, string]
}

const WHITE = '#F2F2F2'
const BLACK = '#3A3A3A'
const GREEN = '#7CC242'
const AMBER = '#E3B341'
const BLUE = '#5BA4E6'
const COPPER = '#D9822B'

export const COATS: PixelCoat[] = [
  { name: 'orange tabby', B: '#E8892B', S: '#A85418', M: '#F6D3A8', eyes: [GREEN, GREEN] },
  { name: 'brown tabby', B: '#A47A52', S: '#5E4028', M: '#D9C2A5', eyes: [GREEN, GREEN] },
  { name: 'silver tabby', B: '#B4BAC1', S: '#626A74', M: '#E4E7EA', eyes: [AMBER, AMBER] },
  { name: 'russian blue', B: '#7F8EA0', M: '#9AA8B8', eyes: [GREEN, GREEN] },
  { name: 'black', B: BLACK, K: '#111111', eyes: [AMBER, AMBER] },
  { name: 'tuxedo', B: BLACK, M: WHITE, L: WHITE, K: '#111111', eyes: [GREEN, GREEN] },
  { name: 'siamese', B: '#EADBC8', H: '#6B4A36', T: '#6B4A36', L: '#6B4A36', M: '#6B4A36', eyes: [BLUE, BLUE] },
  { name: 'calico', B: WHITE, S: '#E8892B', H: '#E8892B', T: '#2E2E2E', eyes: [AMBER, AMBER] },
  { name: 'cream tabby', B: '#F0C987', S: '#C9964F', M: '#FBEBCB', eyes: [COPPER, COPPER] },
  { name: 'odd-eyed white', B: WHITE, eyes: [BLUE, AMBER] },
]

const colorOf = (coat: PixelCoat, c: string, x: number) => {
  switch (c) {
    case 'K':
      return coat.K ?? '#2A2320'
    case 'P':
      return '#111111'
    case 'N':
      return '#FF8FAB'
    case 'I':
      return '#F4A3B5'
    case 'E':
      return x < HEAD_X + 4 ? coat.eyes[0] : coat.eyes[1]
    case 'S':
    case 'M':
    case 'H':
    case 'T':
    case 'L':
      return coat[c] ?? coat.B
    default:
      return coat.B
  }
}

// A grid as rects, one per run of a color along a row.
const rects = (g: Grid, coat: PixelCoat) => {
  let out = ''
  g.forEach((row, y) => {
    let x = 0
    while (x < W) {
      const c = row[x] ?? '.'
      if (c === '.') {
        x++
        continue
      }
      const color = colorOf(coat, c, x)
      let end = x + 1
      while (end < W && row[end] !== '.' && colorOf(coat, row[end] ?? '.', end) === color) {
        end++
      }
      out += `<rect x="${x}" y="${y}" width="${end - x + 0.02}" height="1.02" fill="${color}"/>`
      x = end
    }
  })
  return out
}

// The sprite spans this many text columns; the drawing's units are columns.
export const SPRITE_COLUMNS = 14
export const KITTEN_COLUMNS = 8
// The drawing's height in columns' units for a sprite this wide, with a
// little room above and below.
export const rowsFor = (spriteColumns: number) => Math.ceil((spriteColumns * H) / W) + 1
// Cells kept free at the right edge, as the text rows keep them.
export const MARGIN = 2
const WALK_POSE_S = 0.18
const SPRINT_POSE_S = 0.09
export const SPRINT_COLUMNS_PER_S = 44
export const STROLL_COLUMNS_PER_S = 11

// The share of the way across after `elapsedMs`: 80% at the expected time,
// then ever slower, never reaching the end until the work is done.
export const progress = (elapsedMs: number, expectedMs: number) =>
  0.95 * (1 - Math.exp((-1.85 * elapsedMs) / Math.max(1000, expectedMs)))

// Where the progress walk ends: the sprite's right edge at the margin.
export const walkEnd = (columns: number, spriteColumns = SPRITE_COLUMNS) =>
  Math.max(0, columns - MARGIN - spriteColumns)

const n = (v: number) => (Math.round(v * 1000) / 1000).toString()

export type Motion =
  // The progress walk, `elapsedMs` into the turn.
  | { kind: 'walk'; elapsedMs: number; expectedMs: number }
  // The sprint off the edge from `fromX`, `elapsedMs` after the turn ended.
  | { kind: 'sprint'; fromX: number; elapsedMs: number }
  // A /cat stroll across, `elapsedMs` after it began.
  | { kind: 'stroll'; elapsedMs: number }

// The legs' four poses, cycling every `poseS`; with `stopS` they stop after
// that long, standing.
const legLayers = (coat: PixelCoat, poseS: number, beginS: number, stopS: number | null) => {
  const cycle = poseS * 4
  const repeat =
    stopS === null
      ? 'repeatCount="indefinite"'
      : // Ends mid-way through pose 1, a standing pose, which `freeze` keeps.
        `repeatDur="${n((Math.floor(Math.max(0, stopS) / cycle) + 0.375) * cycle)}s" fill="freeze"`
  return [0, 1, 2, 3]
    .map(pose => {
      const values = [0, 1, 2, 3].map(at => (at === pose ? 1 : 0)).join(';')
      return (
        `<g opacity="${pose === 1 ? 1 : 0}">` +
        `<animate attributeName="opacity" calcMode="discrete" values="${values}" keyTimes="0;0.25;0.5;0.75" ` +
        `dur="${n(cycle)}s" begin="${n(beginS)}s" ${repeat}/>` +
        rects(legs(pose), coat) +
        '</g>'
      )
    })
    .join('')
}

// The SVG for one state of the cat across `columns`: drawn once per state,
// its animations started `elapsedMs` in so it carries on where it was.
export const spriteSvg = (opts: {
  columns: number
  coat: PixelCoat
  motion: Motion
  isAlert: boolean
  // How many columns the sprite spans: the cat's, or a kitten's.
  spriteColumns?: number
}) => {
  const { columns, coat, motion, isAlert } = opts
  const spriteColumns = opts.spriteColumns ?? SPRITE_COLUMNS
  const scale = spriteColumns / W
  const rows = rowsFor(spriteColumns)
  const beginS = -motion.elapsedMs / 1000
  let move: string
  let legsSvg: string
  if (motion.kind === 'walk') {
    // The walk's curve, sampled, then held at its last point.
    const end = walkEnd(columns, spriteColumns)
    const expected = Math.max(1000, motion.expectedMs)
    const totalS = (4 * expected) / 1000
    const samples = 48
    const xs = Array.from({ length: samples + 1 }, (_, i) =>
      n(progress((i / samples) * totalS * 1000, expected) * end),
    )
    const keyTimes = Array.from({ length: samples + 1 }, (_, i) => n(i / samples))
    move =
      `<animateTransform attributeName="transform" type="translate" values="${xs.map(x => `${x} 0`).join(';')}" ` +
      `keyTimes="${keyTimes.join(';')}" dur="${n(totalS)}s" begin="${n(beginS)}s" fill="freeze"/>`
    // The legs stop once the walk slows below a shuffle.
    const speed0 = (0.95 * 1.85 * end) / (expected / 1000)
    const stopS = speed0 > 0.6 ? ((expected / 1000) / 1.85) * Math.log(speed0 / 0.6) : 0
    legsSvg = legLayers(coat, WALK_POSE_S, beginS, stopS)
  } else {
    const fromX = motion.kind === 'sprint' ? motion.fromX : -spriteColumns
    const speed = motion.kind === 'sprint' ? SPRINT_COLUMNS_PER_S : STROLL_COLUMNS_PER_S
    const durS = Math.max(0.1, (columns + 1 - fromX) / speed)
    move =
      `<animateTransform attributeName="transform" type="translate" values="${n(fromX)} 0;${n(columns + 1)} 0" ` +
      `dur="${n(durS)}s" begin="${n(beginS)}s" fill="freeze"/>`
    legsSvg = legLayers(coat, motion.kind === 'sprint' ? SPRINT_POSE_S : WALK_POSE_S, beginS, null)
  }
  // A blink every four seconds, never while the eyes are wide.
  const blinkSvg = isAlert
    ? ''
    : '<g opacity="0"><animate attributeName="opacity" calcMode="discrete" values="0;1;0" keyTimes="0;0.93;0.98" ' +
      `dur="4s" begin="${n(beginS)}s" repeatCount="indefinite"/>${rects(blink(), coat)}</g>`
  const startX = motion.kind === 'walk' ? 0 : motion.kind === 'sprint' ? motion.fromX : -spriteColumns

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${columns} ${rows}" ` +
    `width="${columns * 12}" height="${rows * 12}" shape-rendering="crispEdges">` +
    `<g transform="translate(${n(startX)} 0)">${move}` +
    `<g transform="translate(0 ${n((rows - H * scale) / 2)}) scale(${n(scale)})">` +
    rects(still(isAlert), coat) +
    legsSvg +
    blinkSvg +
    '</g></g></svg>'
  )
}

// The coat for a turn: random, never the one before.
export const pickCoatName = (last: string | null) => {
  const names = COATS.map(coat => coat.name).filter(name => name !== last)
  return names[Math.floor(Math.random() * names.length)] ?? 'orange tabby'
}

// The sprite in `pose` as rows of colors, null where it is see-through: for
// drawing it outside an SVG, as the listing icon is.
export const spritePixels = (coat: PixelCoat, pose = 1) => {
  const feet = legs(pose)
  return still(false).map((row, y) =>
    row.map((c, x) => {
      const foot = feet[y]?.[x] ?? '.'
      const part = foot === '.' ? c : foot
      return part === '.' ? null : colorOf(coat, part, x)
    }),
  )
}

export const coatNamed = (name: string | null) =>
  COATS.find(coat => coat.name === name) ?? (COATS[0] as PixelCoat)
