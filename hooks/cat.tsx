import type { ClientModule, ClientSurface } from 'claude-code'

import type { Kitten, Run } from '../types'

// `progress` walks toward the end as a turn runs and sprints there once it is
// done, saying what is going on; `stroll` just crosses the screen; `kitten`
// is a subagent's progress bar, pulling a banner that names it.
type Progress = { kind: 'progress' } & Run
type Kit = { kind: 'kitten' } & Kitten
// Beside the desktop's pixel cat, which an SVG draws: `bubble` says what is
// going on above it, following it across; `stats` is the line below; `timer`
// draws nothing and ends a /cat stroll once the cat is across. `elapsedMs` is
// how far into the turn the hook drew them, so they keep time with the SVG.
// `tag` is a pixel kitten's label, time and steps, riding above it.
type Beside =
  | ({ kind: 'bubble' | 'stats'; elapsedMs: number } & Run)
  | ({ kind: 'tag'; elapsedMs: number } & Kitten)
  | { kind: 'timer'; id: number; durationMs: number }
type Props = Progress | Kit | Beside | { kind: 'stroll'; id: number }
// `live` is this instance's own box: the timer reads the newest props from it.
type State = {
  x: number
  elapsedMs: number
  step: number
  isPosted: boolean
  coat: Coat
  live: { props: Props }
}

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
const WIDTH = BODY.length

// A kitten, three rows: its tail wags and its paws shuffle as it walks.
const KIT_EARS = String.raw`   /\_/\  `
const KIT_FACES = [String.raw` ~( o.o ) `, String.raw` _( o.o ) `]
const KIT_BLINKS = [String.raw` ~( -.- ) `, String.raw` _( -.- ) `]
const KIT_PAWS = [String.raw`   (")(") `, String.raw`  (") (") `]
const KIT_WIDTH = KIT_EARS.length
// The kitten's banner: its label, then time and steps in a fixed width so the
// kitten does not jump as they change.
const STATS_WIDTH = 16

const STEP_MS = 90
const STEPS_PER_POSE = 2
const WALK = 1
const SPRINT = 4
// Cells kept free at the right edge, where a surface may measure a little
// narrower than it says: the cat is cut before it, so never wraps.
const MARGIN = 2

// A coat: the body's color, and any part that differs from it (a Siamese's
// points, a tuxedo's white paws and muzzle). `stripe` cycles when a list.
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

const COATS: Coat[] = [
  { name: 'orange tabby', body: '#E8892B', stripe: '#A85418', eyes: [GREEN, GREEN], nose: PINK },
  { name: 'brown tabby', body: '#A47A52', stripe: '#5E4028', eyes: [GREEN, GREEN], nose: '#C97B6A' },
  { name: 'silver tabby', body: '#B4BAC1', stripe: '#626A74', eyes: [AMBER, AMBER], nose: PINK },
  { name: 'russian blue', body: '#7F8EA0', stripe: '#7F8EA0', eyes: [GREEN, GREEN], nose: '#8C7C88' },
  { name: 'black', body: BLACK, stripe: BLACK, eyes: [AMBER, AMBER], nose: '#3E3E3E' },
  {
    name: 'tuxedo',
    body: BLACK,
    legs: WHITE,
    muzzle: WHITE,
    stripe: BLACK,
    eyes: [GREEN, GREEN],
    nose: PINK,
  },
  {
    name: 'siamese',
    body: '#EADBC8',
    head: '#6B4A36',
    tail: '#6B4A36',
    legs: '#6B4A36',
    stripe: '#EADBC8',
    eyes: [BLUE, BLUE],
    nose: '#6B4A36',
  },
  {
    name: 'calico',
    body: WHITE,
    head: '#E8892B',
    tail: BLACK,
    stripe: ['#E8892B', BLACK],
    eyes: [AMBER, AMBER],
    nose: PINK,
  },
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
  if (column >= 16) {
    return coat.head ?? coat.body
  }

  return coat.body
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

// The share of the way across after `elapsedMs`: 80% at the expected time,
// then ever slower, never reaching the end until the work is done.
const progress = (elapsedMs: number, expectedMs: number) =>
  0.95 * (1 - Math.exp((-1.85 * elapsedMs) / Math.max(1000, expectedMs)))

type Run_ = { text: string; color?: string | undefined; dim?: boolean }

// One art row with its left edge at x, cut to the left edge and to `edge`:
// runs of one color each, with no leading spaces.
const paint = (
  line: string,
  row: number,
  x: number,
  edge: number,
  colorOf: (row: number, column: number, ch: string) => string,
): { at: number; runs: Run_[] } => {
  const left = Math.round(x)
  const from = Math.max(0, -left)
  const visible = line.trimEnd().slice(from, Math.max(from, edge - left))
  const runs: Run_[] = []
  Array.from(visible).forEach((ch, i) => {
    const color = ch === ' ' ? undefined : colorOf(row, from + i, ch)
    const last = runs[runs.length - 1]
    if (last !== undefined && last.color === color) {
      last.text += ch
    } else {
      runs.push({ text: ch, color })
    }
  })

  return { at: Math.max(0, left), runs }
}

// Pieces of one row, each at its own column, left to right, cut at `edge`.
const compose = (pieces: { at: number; runs: Run_[] }[], edge: number): Run_[] => {
  const out: Run_[] = []
  let column = 0
  for (const piece of pieces) {
    if (piece.at > column) {
      out.push({ text: ' '.repeat(piece.at - column) })
      column = piece.at
    }
    for (const run of piece.runs) {
      const text = run.text.slice(0, Math.max(0, edge - column))
      if (text !== '') {
        out.push({ ...run, text })
        column += text.length
      }
    }
  }

  return out
}

const clock = (ms: number) => {
  const seconds = Math.round(ms / 1000)

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const tokens = (n: number) =>
  n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

// `claude-opus-5-5-20261001[1m]` is `opus-5-5`.
const shortModel = (model: string) =>
  model.replace(/^claude-/, '').replace(/\[.*\]$/, '').replace(/-\d{8}$/, '')

// What the bubble says, and in what color: done, waiting on the person,
// or the step under way.
const speech = (p: Run) => {
  if (p.isDone) {
    return { text: 'Done!', color: 'success' }
  }
  if (p.isWaiting) {
    const text = p.activity === 'Waiting for your answer' ? p.activity : 'Waiting for your permission'
    return { text: `! ${text}`, color: 'warning' }
  }

  return { text: p.activity ?? 'Thinking…', color: undefined }
}

// The main cat's stats: time, steps, then what the model run costs.
const statsOf = (p: Run, elapsedMs: number) => {
  const time = p.isDone
    ? `Done in ${clock(elapsedMs)}`
    : `${clock(elapsedMs)} / ~${clock(p.expectedMs)}`
  const model = p.model === null ? [] : [shortModel(p.model) + (p.effort === null ? '' : ` ${p.effort}`)]
  const usage = p.contextTokens > 0 ? [`${tokens(p.contextTokens)} ctx`, `${tokens(p.outputTokens)} out`] : []

  return [time, plural(p.steps, 'step'), ...model, ...usage].join(' · ')
}

// Where the kitten walks from: right of its banner, which takes the label
// and a fixed width of stats, at most 45% of the room.
const bannerWidth = (p: Kit, columns: number) =>
  Math.min(Math.floor(columns * 0.45), p.label.length + 3 + STATS_WIDTH)

// The pixel sprite's width in columns and its sprint, as sprite.ts has them.
const SPRITE_COLUMNS = 14
const SPRITE_SPRINT = 44 * (STEP_MS / 1000)
// The bubble's tail sits over the sprite's ears, this far in from its left.
const SPRITE_HEAD = 10
// A pixel kitten's width in columns, as sprite.ts has it.
const KITTEN_SPRITE = 8

type BesideState = { x: number; elapsedMs: number; isPosted: boolean; live: { props: Beside } }

// The text beside the pixel cat: its own clock, so the time ticks and the
// bubble follows the cat with no new SVG.
const BesideCat = (props: Beside, s: ClientSurface<BesideState>) => {
  const { Box, Text } = s.elements
  const atStart = () => {
    const columns = s.columns || 80
    const sprite = props.kind === 'tag' ? KITTEN_SPRITE : SPRITE_COLUMNS
    return props.kind === 'timer'
      ? 0
      : progress(props.elapsedMs, props.expectedMs) * Math.max(0, columns - MARGIN - sprite)
  }
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
        if (elapsedMs >= p.durationMs) {
          s.post({ done: p.id })
          s.setState({ ...st, elapsedMs, isPosted: true })
        } else {
          s.setState({ ...st, elapsedMs })
        }
        return
      }
      const edge = columns - MARGIN
      if ((p.kind === 'bubble' || p.kind === 'tag') && p.isDone && st.x > edge) {
        s.post(p.kind === 'tag' ? { kitten: p.id } : { done: p.id })
        s.setState({ ...st, isPosted: true })
        return
      }
      const sprite = p.kind === 'tag' ? KITTEN_SPRITE : SPRITE_COLUMNS
      const x = p.isDone
        ? st.x + SPRITE_SPRINT
        : progress(elapsedMs, p.expectedMs) * Math.max(0, edge - sprite)
      s.setState({ ...st, x, elapsedMs })
    })
    s.setState({
      x: atStart(),
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
    return <Box height={height} />
  }
  const edge = (s.columns || 80) - MARGIN
  const rows: Run_[][] = []
  if (props.kind === 'bubble') {
    const said = speech(props)
    const head = Math.round(st.x) + SPRITE_HEAD
    const text = said.text.slice(0, Math.max(1, edge - 4))
    const left = Math.max(0, Math.min(head, edge - text.length - 4))
    rows.push(
      compose(
        [{ at: left, runs: [{ text: '( ', dim: true }, { text, color: said.color }, { text: ' )', dim: true }] }],
        edge,
      ),
      head < edge ? compose([{ at: head, runs: [{ text: '/', dim: true }] }], edge) : [],
    )
  } else if (props.kind === 'tag') {
    // The tag rides above the kitten, sliding left near the edge to stay whole.
    const time = props.isDone && props.doneAt !== null ? props.doneAt - props.startedAt : st.elapsedMs
    const stats = props.isDone ? 'done' : `${clock(time)} · ${plural(props.steps, 'step')}`
    const label = props.label.slice(0, Math.max(1, edge - stats.length - 3))
    const text = `${label} · ${stats}`
    const left = Math.max(0, Math.min(Math.round(st.x), edge - text.length))
    rows.push(
      compose(
        [{ at: left, runs: [{ text, color: props.isDone ? 'success' : undefined, dim: !props.isDone }] }],
        edge,
      ),
    )
  } else {
    // Once done, the time is the turn's own, not the sprint's.
    const elapsedMs =
      props.isDone && props.doneAt !== null ? props.doneAt - props.startedAt : st.elapsedMs
    rows.push(compose([{ at: 0, runs: [{ text: statsOf(props, elapsedMs), dim: true }] }], edge))
  }

  return (
    <Box flexDirection="column" overflow="hidden" height={height}>
      {rows.map(runs => (
        <Text mono wrap="truncate">
          {runs.length === 0
            ? ' '
            : runs.map(run => (
                <Text color={run.color} dimColor={run.dim}>
                  {run.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  )
}

const Cat: ClientModule<Props, State> = (props, s) => {
  if (props.kind === 'bubble' || props.kind === 'stats' || props.kind === 'tag' || props.kind === 'timer') {
    return BesideCat(props, s as unknown as ClientSurface<BesideState>)
  }
  const { Box, Text } = s.elements
  const width = props.kind === 'kitten' ? KIT_WIDTH : WIDTH
  const start = { x: props.kind === 'stroll' ? -WIDTH : 0, elapsedMs: 0, step: 0 }

  if (s.state === undefined) {
    const live = { props }
    // A turn's cat wears the coat the hook picked for it.
    const coat =
      (props.kind === 'progress' ? COATS.find(one => one.name === props.coat) : undefined) ?? pickCoat()
    s.every(STEP_MS, () => {
      const st = s.state
      const columns = s.columns
      if (st === undefined || columns === 0) {
        return
      }
      if (st.isPosted) {
        return
      }
      const p = live.props
      // A kitten's x counts from the right of its banner.
      const offset = p.kind === 'kitten' ? bannerWidth(p, columns) + 1 : 0
      // The visible edge sits MARGIN cells in; the cat walks out past it.
      const edge = columns - MARGIN - offset
      if (st.x > edge) {
        s.post(p.kind === 'kitten' ? { kitten: p.id } : { done: p.id, coat: st.coat.name })
        s.setState({ ...st, isPosted: true })
        return
      }
      const elapsedMs = st.elapsedMs + STEP_MS
      const isRunning = p.kind !== 'stroll' && !p.isDone
      const target = isRunning
        ? progress(elapsedMs, p.expectedMs) * Math.max(0, edge - width)
        : edge + 1
      const speed = p.kind !== 'stroll' && p.isDone ? SPRINT : WALK
      const x = st.x < target ? Math.min(target, st.x + speed) : st.x
      const isMoving = x > st.x + 0.05
      s.setState({ ...st, x, elapsedMs, step: isMoving ? st.step + 1 : 0 })
    })
    s.setState({ ...start, isPosted: false, coat, live })
  } else {
    s.state.live.props = props
  }

  const height = props.kind === 'progress' ? 8 : props.kind === 'kitten' ? 3 : 5
  const st = s.state
  if (st === undefined || st.isPosted) {
    return <Box height={height} />
  }
  const columns = s.columns || 80
  const edge = columns - MARGIN
  const isBlinking = Math.floor(st.elapsedMs / STEP_MS) % 40 > 36
  const pose = Math.floor(st.step / STEPS_PER_POSE)
  const rows: Run_[][] = []

  if (props.kind === 'kitten') {
    const offset = bannerWidth(props, columns) + 1
    const x = offset + st.x
    const color = (row: number, column: number, ch: string) => kittenColor(st.coat, row, column, ch)
    const wag = pose % 2
    const face = (isBlinking ? KIT_BLINKS : KIT_FACES)[wag] ?? ''
    const stats = props.isDone ? 'done' : `${clock(st.elapsedMs)} · ${plural(props.steps, 'step')}`
    const label = props.label.slice(0, Math.max(0, offset - 4 - stats.length))
    const banner = `${label} · ${stats}`
    rows.push(
      compose([paint(KIT_EARS, 0, x, edge, color)], edge),
      compose(
        [
          { at: 0, runs: [{ text: banner, color: props.isDone ? 'success' : undefined, dim: !props.isDone }] },
          paint(face, 1, x, edge, color),
        ],
        edge,
      ),
      compose([paint(KIT_PAWS[st.step === 0 ? 0 : wag] ?? '', 2, x, edge, color)], edge),
    )
  } else {
    const p = props.kind === 'progress' ? props : null
    const isAlert = p !== null && p.isWaiting && !p.isDone
    const color = (row: number, column: number, ch: string) => catColor(st.coat, row, column, ch)
    // Standing still, the cat stands; walking, it cycles through the stride.
    const legs = LEGS[pose % LEGS.length] ?? ''
    const face = isAlert ? ALERT : isBlinking ? BLINK : FACE
    if (p !== null) {
      // The bubble floats up and right of the head, its tail just above the
      // ears; near the edge it slides left to stay whole.
      const said = speech(p)
      const head = Math.round(st.x) + 18
      const text = said.text.slice(0, Math.max(1, edge - 4))
      const left = Math.max(0, Math.min(head, edge - text.length - 4))
      rows.push(
        compose(
          [{ at: left, runs: [{ text: '( ', dim: true }, { text, color: said.color }, { text: ' )', dim: true }] }],
          edge,
        ),
        head < edge ? compose([{ at: head, runs: [{ text: '/', dim: true }] }], edge) : [],
      )
    }
    for (const [i, line] of [EARS, face, BODY, BELLY, legs].entries()) {
      rows.push(compose([paint(line, i, st.x, edge, color)], edge))
    }
    if (p !== null) {
      rows.push(compose([{ at: 0, runs: [{ text: statsOf(p, st.elapsedMs), dim: true }] }], edge))
    }
  }

  // `mono`: the desktop's own face is proportional, where a space is about
  // half a cell and the cat would stop midway; the terminal ignores it.
  return (
    <Box flexDirection="column" overflow="hidden" height={height}>
      {rows.map(runs => (
        <Text mono wrap="truncate">
          {runs.length === 0
            ? ' '
            : runs.map(run => (
                <Text color={run.color} dimColor={run.dim}>
                  {run.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  )
}

export default Cat
