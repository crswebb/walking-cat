// The surface module: what each Client in the band draws, on the drawing
// thread, with its own clock. On the desktop it is the text beside the pixel
// cat (the bubble, the stats, a kitten's tag) and a stroll's timer; on the
// terminal it is the whole ASCII cat or kitten.
//
// It imports nothing but types: a surface module is read off its own source
// and carried to the surface as it is. The few values it shares with
// sprite.ts and format.ts are copied here, gathered in MIRRORED, and
// tests/mirror.test.ts checks they still agree.

import type { ClientModule, ClientSurface } from 'claude-code'

import type { Kitten, Run } from './model'

// What a Client is asked to draw. On the terminal: `progress`, the turn's cat,
// walking toward the end and sprinting off once done; `stroll`, a /cat stroll;
// `kitten`, a subagent's. On the desktop, beside the pixel cat's SVG:
// `bubble` above it and `stats` below, a kitten's `tag`, and the `timer` that
// ends a stroll. `elapsedMs` is how far in the hook drew them, so they keep
// time with the SVG.
type Ascii = ({ kind: 'progress' } & Run) | ({ kind: 'kitten' } & Kitten) | { kind: 'stroll'; id: number }
type Beside =
  | ({ kind: 'bubble'; elapsedMs: number } & Run)
  | ({ kind: 'stats'; elapsedMs: number } & Run)
  | ({ kind: 'tag'; elapsedMs: number } & Kitten)
  | { kind: 'timer'; id: number; durationMs: number }
type Props = Ascii | Beside

// Copies of sprite.ts and format.ts, checked by tests/mirror.test.ts.
const SPRITE_COLUMNS = 14
const KITTEN_COLUMNS = 8
const SPRINT_COLUMNS_PER_S = 44
const MARGIN = 2 // cells kept free at the right edge, so nothing wraps

// The share of the way across after `elapsedMs`: 80% at the expected time,
// then ever slower, never reaching the end until the work is done.
const progress = (elapsedMs: number, expectedMs: number) =>
  0.95 * (1 - Math.exp((-1.85 * elapsedMs) / Math.max(1000, expectedMs)))

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

const clock = (ms: number) => {
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const compactCount = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`)

const shortModel = (model: string) => model.replace(/^claude-/, '').replace(/\[.*\]$/, '').replace(/-\d{8}$/, '')

// The clock every instance ticks on, and how fast the ASCII cat moves.
const STEP_MS = 90
const STEPS_PER_POSE = 2
const WALK = 1
const SPRINT = 4
const SPRINT_PER_STEP = SPRINT_COLUMNS_PER_S * (STEP_MS / 1000)

// The bubble's tail sits over the ears: this far in from the cat's left edge.
const PIXEL_HEAD = 10
const ASCII_HEAD = 18

// --- Text ---------------------------------------------------------------

// A stretch of one row in one color.
type Span = { text: string; color?: string | undefined; dim?: boolean }
type Piece = { at: number; spans: Span[] }

// Pieces of one row, each at its own column, left to right, cut at `edge`.
const compose = (pieces: Piece[], edge: number): Span[] => {
  const out: Span[] = []
  let column = 0
  for (const piece of pieces) {
    if (piece.at > column) {
      out.push({ text: ' '.repeat(piece.at - column) })
      column = piece.at
    }
    for (const span of piece.spans) {
      const text = span.text.slice(0, Math.max(0, edge - column))
      if (text !== '') {
        out.push({ ...span, text })
        column += text.length
      }
    }
  }
  return out
}

// What the bubble says, and in what color: done, waiting on the person, or
// the step under way.
const speech = (run: Run) => {
  if (run.isDone) {
    return { text: 'Done!', color: 'success' }
  }
  if (run.isWaiting) {
    const text = run.activity === 'Waiting for your answer' ? run.activity : 'Waiting for your permission'
    return { text: `! ${text}`, color: 'warning' }
  }
  return { text: run.activity ?? 'Thinking…', color: undefined }
}

// The bubble's two rows: its words up and right of the head, sliding left
// near the edge to stay whole, then its tail just above the ears.
const bubbleRows = (run: Run, head: number, edge: number): Span[][] => {
  const said = speech(run)
  const text = said.text.slice(0, Math.max(1, edge - 4))
  const left = Math.max(0, Math.min(head, edge - text.length - 4))
  const words = [{ text: '( ', dim: true }, { text, color: said.color }, { text: ' )', dim: true }]
  return [
    compose([{ at: left, spans: words }], edge),
    head < edge ? compose([{ at: head, spans: [{ text: '/', dim: true }] }], edge) : [],
  ]
}

// The cat's stats: time, steps, then what the model run costs.
const statsOf = (run: Run, elapsedMs: number) => {
  const time = run.isDone ? `Done in ${clock(elapsedMs)}` : `${clock(elapsedMs)} / ~${clock(run.expectedMs)}`
  const model = run.model === null ? [] : [shortModel(run.model) + (run.effort === null ? '' : ` ${run.effort}`)]
  const usage =
    run.contextTokens > 0 ? [`${compactCount(run.contextTokens)} ctx`, `${compactCount(run.outputTokens)} out`] : []
  return [time, plural(run.steps, 'step'), ...model, ...usage].join(' · ')
}

// A kitten's tag: its task, then its time and steps, or "done".
const tagText = (kitten: Kitten, elapsedMs: number, room: number) => {
  const stats = kitten.isDone ? 'done' : `${clock(elapsedMs)} · ${plural(kitten.steps, 'step')}`
  return `${kitten.label.slice(0, Math.max(0, room - stats.length - 3))} · ${stats}`
}

const tagSpan = (kitten: Kitten, text: string): Span => ({
  text,
  color: kitten.isDone ? 'success' : undefined,
  dim: !kitten.isDone,
})

// The rows as Text, one each; `mono` only where the surface takes it, as
// the desktop does and the terminal (monospace already) refuses, even unset.
const drawRows = (elements: ClientSurface['elements'], rows: Span[][], height: number, isMono: boolean) => {
  const { Box, Text } = elements
  const font = isMono ? { mono: true } : {}
  return (
    <Box flexDirection="column" overflow="hidden" height={height}>
      {rows.map(spans => (
        <Text {...font} wrap="truncate">
          {spans.length === 0
            ? ' '
            : spans.map(span => (
                <Text color={span.color} dimColor={span.dim}>
                  {span.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  )
}

// --- Beside the pixel cat (desktop) --------------------------------------

type BesideState = { x: number; elapsedMs: number; isPosted: boolean; live: { props: Beside } }

// Text that follows a pixel cat or kitten across, on its own clock, so the
// time ticks and the bubble moves with no new SVG; the timer only counts.
const PixelCatText = (props: Beside, s: ClientSurface<BesideState>) => {
  const spriteOf = (p: Beside) => (p.kind === 'tag' ? KITTEN_COLUMNS : SPRITE_COLUMNS)

  if (s.state === undefined) {
    const live = { props }
    s.every(STEP_MS, () => {
      const st = s.state
      const columns = s.columns
      if (st === undefined || columns === 0 || st.isPosted) {
        return
      }
      const p = live.props
      const elapsedMs = st.elapsedMs + STEP_MS
      if (p.kind === 'timer') {
        const isOver = elapsedMs >= p.durationMs
        if (isOver) {
          s.post({ done: p.id })
        }
        s.setState({ ...st, elapsedMs, isPosted: isOver })
        return
      }
      const edge = columns - MARGIN
      if (p.kind !== 'stats' && p.isDone && st.x > edge) {
        s.post(p.kind === 'tag' ? { kitten: p.id } : { done: p.id })
        s.setState({ ...st, isPosted: true })
        return
      }
      const x = p.isDone ? st.x + SPRINT_PER_STEP : progress(elapsedMs, p.expectedMs) * Math.max(0, edge - spriteOf(p))
      s.setState({ ...st, x, elapsedMs })
    })
    const columns = s.columns || 80
    s.setState({
      x: props.kind === 'timer' ? 0 : progress(props.elapsedMs, props.expectedMs) * Math.max(0, columns - MARGIN - spriteOf(props)),
      elapsedMs: props.kind === 'timer' ? 0 : props.elapsedMs,
      isPosted: false,
      live,
    })
  } else {
    s.state.live.props = props
  }

  const st = s.state
  const height = props.kind === 'bubble' ? 2 : 1
  if (st === undefined || props.kind === 'timer') {
    const { Box } = s.elements
    return <Box height={height} />
  }
  const edge = (s.columns || 80) - MARGIN
  // Once done, the time is the turn's own, not the sprint's.
  const elapsedMs = props.isDone && props.doneAt !== null ? props.doneAt - props.startedAt : st.elapsedMs

  if (props.kind === 'bubble') {
    return drawRows(s.elements, bubbleRows(props, Math.round(st.x) + PIXEL_HEAD, edge), height, true)
  }
  if (props.kind === 'tag') {
    const text = tagText(props, elapsedMs, edge)
    const left = Math.max(0, Math.min(Math.round(st.x), edge - text.length))
    return drawRows(s.elements, [compose([{ at: left, spans: [tagSpan(props, text)] }], edge)], height, true)
  }
  return drawRows(s.elements, [compose([{ at: 0, spans: [{ text: statsOf(props, elapsedMs), dim: true }] }], edge)], height, true)
}

// --- The ASCII cat (terminal) --------------------------------------------

// A cat facing right, every row the same width.
const EARS = String.raw`  _              /\_/\  `
const FACE = String.raw` ( )____________/ o o \ `
const BLINK = String.raw` ( )____________/ - - \ `
const ALERT = String.raw` ( )____________/ O O \ `
const BODY = String.raw`  \  ~  ~  ~  ~ \ =^= / `
const BELLY = String.raw`   \____________/'---'  `
// One stride: each pair of legs stays centered on its hip (columns 6 and 13).
const LEGS = [
  String.raw`     | |    | |         `,
  String.raw`     / \    / \         `,
  String.raw`    /   \  /   \        `,
  String.raw`     / \    / \         `,
]
const CAT_WIDTH = BODY.length

// A kitten, three rows: its tail wags and its paws shuffle as it walks.
const KIT_EARS = String.raw`   /\_/\  `
const KIT_FACES = [String.raw` ~( o.o ) `, String.raw` _( o.o ) `]
const KIT_BLINKS = [String.raw` ~( -.- ) `, String.raw` _( -.- ) `]
const KIT_PAWS = [String.raw`   (")(") `, String.raw`  (") (") `]
const KIT_WIDTH = KIT_EARS.length
// The kitten pulls a banner: its label, then time and steps in a fixed width
// so the kitten does not jump as they change.
const BANNER_STATS_WIDTH = 16

// A coat: the body's color, and any part that differs from it (a Siamese's
// points, a tuxedo's white paws and muzzle). `stripe` cycles when a list.
// The names are sprite.ts's, so a turn's ASCII cat wears the coat its hook
// picked.
type Coat = {
  name: string
  body: string
  head?: string
  tail?: string
  legs?: string
  muzzle?: string
  stripe: string | string[]
  eyes: [string, string]
  nose: string
}

const WHITE = '#E4E4E4'
const BLACK = '#5C5C5C'
const PINK = '#FF8FAB'
const GREEN = '#7CC242'
const AMBER = '#E3B341'
const BLUE = '#5BA4E6'
const COPPER = '#D9822B'
const POINTS = '#6B4A36'

const COATS: Coat[] = [
  { name: 'orange tabby', body: '#E8892B', stripe: '#A85418', eyes: [GREEN, GREEN], nose: PINK },
  { name: 'brown tabby', body: '#A47A52', stripe: '#5E4028', eyes: [GREEN, GREEN], nose: '#C97B6A' },
  { name: 'silver tabby', body: '#B4BAC1', stripe: '#626A74', eyes: [AMBER, AMBER], nose: PINK },
  { name: 'russian blue', body: '#7F8EA0', stripe: '#7F8EA0', eyes: [GREEN, GREEN], nose: '#8C7C88' },
  { name: 'black', body: BLACK, stripe: BLACK, eyes: [AMBER, AMBER], nose: '#3E3E3E' },
  { name: 'tuxedo', body: BLACK, legs: WHITE, muzzle: WHITE, stripe: BLACK, eyes: [GREEN, GREEN], nose: PINK },
  {
    name: 'siamese',
    body: '#EADBC8',
    head: POINTS,
    tail: POINTS,
    legs: POINTS,
    stripe: '#EADBC8',
    eyes: [BLUE, BLUE],
    nose: POINTS,
  },
  { name: 'calico', body: WHITE, head: '#E8892B', tail: BLACK, stripe: ['#E8892B', BLACK], eyes: [AMBER, AMBER], nose: PINK },
  { name: 'cream tabby', body: '#F0C987', stripe: '#C9964F', eyes: [COPPER, COPPER], nose: PINK },
  { name: 'odd-eyed white', body: WHITE, stripe: WHITE, eyes: [BLUE, AMBER], nose: PINK },
]

// The color of one character of the cat, by where it sits on the cat.
const catColor = (coat: Coat, row: number, column: number, ch: string) => {
  if (row === 1 && (ch === 'o' || ch === 'O' || ch === '-')) {
    return column < 19 ? coat.eyes[0] : coat.eyes[1]
  }
  if (ch === '^') {
    return coat.nose
  }
  if (ch === '=') {
    return '#9AA0A6'
  }
  if (ch === '~') {
    const stripes = typeof coat.stripe === 'string' ? [coat.stripe] : coat.stripe
    return stripes[Math.floor(column / 3) % stripes.length] ?? coat.body
  }
  if (row === 4) {
    return coat.legs ?? coat.body
  }
  if (row <= 1 && column <= 3) {
    return coat.tail ?? coat.body
  }
  if (row === 3 && column >= 16) {
    return coat.muzzle ?? coat.head ?? coat.body
  }
  return column >= 16 ? coat.head ?? coat.body : coat.body
}

// The same for a kitten: its face is the head, its tail and paws their own.
const kittenColor = (coat: Coat, row: number, column: number, ch: string) => {
  if (row === 1 && (ch === 'o' || ch === '-')) {
    return column < 5 ? coat.eyes[0] : coat.eyes[1]
  }
  if (ch === '.') {
    return coat.nose
  }
  if (row === 2) {
    return coat.legs ?? coat.body
  }
  if (row === 1 && column <= 2) {
    return coat.tail ?? coat.body
  }
  return coat.head ?? coat.body
}

let lastCoat = -1

// A random coat, never the one the last cat or kitten wore.
const pickCoat = (): Coat => {
  let index = Math.floor(Math.random() * COATS.length)
  if (index === lastCoat) {
    index = (index + 1) % COATS.length
  }
  lastCoat = index
  return COATS[index] ?? (COATS[0] as Coat)
}

// One art row with its left edge at x, cut to the left edge and to `edge`.
const paint = (
  line: string,
  row: number,
  x: number,
  edge: number,
  colorOf: (row: number, column: number, ch: string) => string,
): Piece => {
  const left = Math.round(x)
  const from = Math.max(0, -left)
  const visible = line.trimEnd().slice(from, Math.max(from, edge - left))
  const spans: Span[] = []
  Array.from(visible).forEach((ch, i) => {
    const color = ch === ' ' ? undefined : colorOf(row, from + i, ch)
    const last = spans[spans.length - 1]
    if (last !== undefined && last.color === color) {
      last.text += ch
    } else {
      spans.push({ text: ch, color })
    }
  })
  return { at: Math.max(0, left), spans }
}

// Where the kitten walks from: right of its banner, which takes the label
// and a fixed width of stats, at most 45% of the room.
const bannerWidth = (kitten: Kitten, columns: number) =>
  Math.min(Math.floor(columns * 0.45), kitten.label.length + 3 + BANNER_STATS_WIDTH)

// `live` is this instance's own box: the timer reads the newest props from it.
type AsciiState = { x: number; elapsedMs: number; step: number; isPosted: boolean; coat: Coat; live: { props: Ascii } }

// The ASCII cat or kitten, walking on its own clock: toward the end while its
// turn runs, sprinting out past the edge once done.
const AsciiCat = (props: Ascii, s: ClientSurface<AsciiState>) => {
  const width = props.kind === 'kitten' ? KIT_WIDTH : CAT_WIDTH
  const height = props.kind === 'progress' ? 8 : props.kind === 'kitten' ? 3 : 5

  if (s.state === undefined) {
    const live = { props }
    // A turn's cat wears the coat the hook picked for it.
    const coat = (props.kind === 'progress' ? COATS.find(one => one.name === props.coat) : undefined) ?? pickCoat()
    s.every(STEP_MS, () => {
      const st = s.state
      const columns = s.columns
      if (st === undefined || columns === 0 || st.isPosted) {
        return
      }
      const p = live.props
      // A kitten's x counts from the right of its banner; the visible edge
      // sits MARGIN cells in, and the cat walks out past it.
      const offset = p.kind === 'kitten' ? bannerWidth(p, columns) + 1 : 0
      const edge = columns - MARGIN - offset
      if (st.x > edge) {
        s.post(p.kind === 'kitten' ? { kitten: p.id } : { done: p.id, coat: st.coat.name })
        s.setState({ ...st, isPosted: true })
        return
      }
      const elapsedMs = st.elapsedMs + STEP_MS
      const isRunning = p.kind !== 'stroll' && !p.isDone
      const target = isRunning ? progress(elapsedMs, p.expectedMs) * Math.max(0, edge - width) : edge + 1
      const speed = p.kind !== 'stroll' && p.isDone ? SPRINT : WALK
      const x = st.x < target ? Math.min(target, st.x + speed) : st.x
      // Standing still, the cat stands; walking, it steps through the stride.
      s.setState({ ...st, x, elapsedMs, step: x > st.x + 0.05 ? st.step + 1 : 0 })
    })
    s.setState({ x: props.kind === 'stroll' ? -CAT_WIDTH : 0, elapsedMs: 0, step: 0, isPosted: false, coat, live })
  } else {
    s.state.live.props = props
  }

  const st = s.state
  if (st === undefined || st.isPosted) {
    const { Box } = s.elements
    return <Box height={height} />
  }
  const columns = s.columns || 80
  const edge = columns - MARGIN
  const isBlinking = Math.floor(st.elapsedMs / STEP_MS) % 40 > 36
  const pose = Math.floor(st.step / STEPS_PER_POSE)

  if (props.kind === 'kitten') {
    const offset = bannerWidth(props, columns) + 1
    const x = offset + st.x
    const color = (row: number, column: number, ch: string) => kittenColor(st.coat, row, column, ch)
    const wag = pose % 2
    const face = (isBlinking ? KIT_BLINKS : KIT_FACES)[wag] ?? ''
    const banner = tagText(props, st.elapsedMs, offset - 1)
    const rows = [
      compose([paint(KIT_EARS, 0, x, edge, color)], edge),
      compose([{ at: 0, spans: [tagSpan(props, banner)] }, paint(face, 1, x, edge, color)], edge),
      compose([paint(KIT_PAWS[st.step === 0 ? 0 : wag] ?? '', 2, x, edge, color)], edge),
    ]
    return drawRows(s.elements, rows, height, false)
  }

  const run = props.kind === 'progress' ? props : null
  const color = (row: number, column: number, ch: string) => catColor(st.coat, row, column, ch)
  const face = run !== null && run.isWaiting && !run.isDone ? ALERT : isBlinking ? BLINK : FACE
  const legs = LEGS[pose % LEGS.length] ?? ''
  const art = [EARS, face, BODY, BELLY, legs].map((line, i) => compose([paint(line, i, st.x, edge, color)], edge))
  const rows =
    run === null
      ? art
      : [
          ...bubbleRows(run, Math.round(st.x) + ASCII_HEAD, edge),
          ...art,
          compose([{ at: 0, spans: [{ text: statsOf(run, st.elapsedMs), dim: true }] }], edge),
        ]
  return drawRows(s.elements, rows, height, false)
}

// --- The module ----------------------------------------------------------

const Cat: ClientModule<Props, unknown> = (props, s) => {
  if (props.kind === 'bubble' || props.kind === 'stats' || props.kind === 'tag' || props.kind === 'timer') {
    return PixelCatText(props, s as unknown as ClientSurface<BesideState>)
  }
  return AsciiCat(props, s as unknown as ClientSurface<AsciiState>)
}

export default Cat

// What this file copies from sprite.ts and format.ts, for the test that keeps
// the two in step.
export const MIRRORED = {
  SPRITE_COLUMNS,
  KITTEN_COLUMNS,
  SPRINT_COLUMNS_PER_S,
  MARGIN,
  progress,
  clock,
  compactCount,
  shortModel,
  coatNames: COATS.map(coat => coat.name),
}
