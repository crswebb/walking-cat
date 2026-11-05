// The band above the prompt: what it holds on each surface. The desktop gets
// the pixel cat (an animated SVG) with text above and below it; the terminal
// gets the ASCII cat, drawn whole by the surface module in cat.tsx.

import type { BoxProps, ElementConstructor, RenderNode, SvgProps, TextProps } from 'claude-code'

import type { Kitten, Run, Summary } from './model'
import {
  coatNamed,
  KITTEN_COLUMNS,
  progress,
  rowsFor,
  SPRITE_COLUMNS,
  spriteSvg,
  STROLL_COLUMNS_PER_S,
  walkEnd,
} from './sprite'
import { summaryLines } from './summary'

// What the band shows: the turn's cat, a /cat stroll, the subagents'
// kittens, and the last turn's receipt (only once its cat has gone).
export type BandState = {
  run: Run | null
  stroll: number
  isStrolling: boolean
  kittens: Kitten[]
  summary: Summary | null
}

// The room the band draws in, in text cells; `now` in ms since the epoch.
export type View = { columns: number; maxRows: number; now: number }

type Elements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
}

// A Client element for the surface module in cat.tsx: register.tsx makes it,
// so the module's path stays written in the hooks module's source.
export type MakeClient = (key: string, props: unknown, width: number, height: number) => RenderNode | null | undefined

export const isEmpty = (band: BandState) =>
  band.run === null && !band.isStrolling && band.kittens.length === 0 && band.summary === null

// The desktop code font's advance in CSS pixels, measured off a screenshot:
// an animated SVG sits in a frame that takes no size from its markup, so it
// is sized here, one column of the drawing to one column of text.
const CELL_PX = 7.6
const svgSize = (columns: number, spriteColumns: number) => ({
  width: Math.floor(columns * CELL_PX),
  height: Math.ceil(rowsFor(spriteColumns) * CELL_PX),
})

// How many kittens fit, each `rowsEach` tall, once `used` rows are taken.
const roomFor = (maxRows: number, used: number, rowsEach: number) =>
  Math.max(1, Math.floor((maxRows - used - 1) / rowsEach))

// The SVG for each state of a cat, drawn once: its animations start where the
// cat was when the state began, and the same markup keeps the picture as it is.
const drawn = new Map<string, string>()
const remember = (key: string, make: () => string) => {
  const known = drawn.get(key)
  if (known !== undefined) {
    return known
  }
  if (drawn.size > 16) {
    drawn.clear()
  }
  const made = make()
  drawn.set(key, made)
  return made
}

// A walker's SVG: walking `elapsedMs` into its run, or sprinting off from
// where it stood when it finished.
const walkerSvg = (
  walker: { startedAt: number; expectedMs: number; isDone: boolean; doneAt: number | null; coat: string },
  columns: number,
  now: number,
  spriteColumns: number,
  isAlert: boolean,
) => {
  const coat = coatNamed(walker.coat)
  if (walker.isDone) {
    const doneAt = walker.doneAt ?? now
    const fromX = progress(doneAt - walker.startedAt, walker.expectedMs) * walkEnd(columns, spriteColumns)
    const motion = { kind: 'sprint', fromX, elapsedMs: now - doneAt } as const
    return spriteSvg({ columns, coat, motion, isAlert: false, spriteColumns })
  }
  const motion = { kind: 'walk', elapsedMs: now - walker.startedAt, expectedMs: walker.expectedMs } as const
  return spriteSvg({ columns, coat, motion, isAlert, spriteColumns })
}

const SummaryLines = ({ Text }: Elements, summary: Summary | null) => {
  if (summary === null) {
    return []
  }
  const lines = summaryLines(summary)
  return [
    <Text wrap="truncate">
      <Text color={summary.isAborted ? 'warning' : 'success'}>✓ </Text>
      <Text dimColor>{lines.head}</Text>
    </Text>,
    ...(lines.body === null
      ? []
      : [
          <Text wrap="truncate" dimColor>
            {`  ${lines.body}`}
          </Text>,
        ]),
  ]
}

const MoreAgents = ({ Text }: Elements, hidden: number) =>
  hidden > 0 ? (
    <Text dimColor>
      +{hidden} more {hidden === 1 ? 'agent' : 'agents'}
    </Text>
  ) : null

// The desktop: text rows a surface module keeps ticking, around SVGs that
// animate by themselves and are drawn anew only when a cat's state changes.
export const desktopBand = (
  el: Elements & { Svg: ElementConstructor<SvgProps> },
  band: BandState,
  view: View,
  client: MakeClient,
) => {
  const { Box, Svg } = el
  const { columns, now } = view
  const { run } = band
  const hasCat = run !== null || band.isStrolling

  // Each kitten: its tag riding above it, then the pixel kitten.
  const shown = band.kittens.slice(0, roomFor(view.maxRows, hasCat ? 7 : 2, 4))
  const kittens = (
    <Box flexDirection="column">
      {shown.map(kitten => {
        const phase = kitten.isDone ? 'sprint' : 'walk'
        const source = remember(`kitten-${kitten.id}-${phase}-${columns}`, () =>
          walkerSvg(kitten, columns, now, KITTEN_COLUMNS, false),
        )
        const tag = { kind: 'tag', ...kitten, elapsedMs: now - kitten.startedAt }
        return (
          <Box flexDirection="column">
            {client(`tag-${kitten.id}`, tag, columns, 1)}
            <Svg
              source={source}
              alt={`A pixel ${kitten.coat} kitten for ${kitten.agent}: ${kitten.label}`}
              isInteractive
              {...svgSize(columns, KITTEN_COLUMNS)}
            />
          </Box>
        )
      })}
      {MoreAgents(el, band.kittens.length - shown.length)}
    </Box>
  )

  if (run === null && !band.isStrolling) {
    return (
      <Box flexDirection="column">
        {SummaryLines(el, band.summary)}
        {kittens}
      </Box>
    )
  }

  if (run === null) {
    const source = remember(`stroll-${band.stroll}-${columns}`, () =>
      spriteSvg({ columns, coat: coatNamed(null), motion: { kind: 'stroll', elapsedMs: 0 }, isAlert: false }),
    )
    // The timer draws nothing: it tells the hooks when the stroll is over.
    const durationMs = ((columns + SPRITE_COLUMNS + 1) / STROLL_COLUMNS_PER_S) * 1000
    return (
      <Box flexDirection="column">
        <Svg source={source} alt="A pixel cat strolling across" isInteractive {...svgSize(columns, SPRITE_COLUMNS)} />
        {client(`timer-${band.stroll}`, { kind: 'timer', id: band.stroll, durationMs }, columns, 1)}
        {kittens}
      </Box>
    )
  }

  const isAlert = run.isWaiting && !run.isDone
  const phase = run.isDone ? 'sprint' : isAlert ? 'alert' : 'walk'
  const source = remember(`${run.id}-${phase}-${columns}`, () => walkerSvg(run, columns, now, SPRITE_COLUMNS, isAlert))
  const text = { ...run, elapsedMs: now - run.startedAt }
  return (
    <Box flexDirection="column">
      {client(`bubble-${run.id}`, { kind: 'bubble', ...text }, columns, 2)}
      <Svg source={source} alt={`A pixel ${run.coat} cat walking`} isInteractive {...svgSize(columns, SPRITE_COLUMNS)} />
      {client(`stats-${run.id}`, { kind: 'stats', ...text }, columns, 1)}
      {kittens}
    </Box>
  )
}

// The terminal: the receipt, then the ASCII cat and kittens, each a surface
// module instance that walks by itself.
export const terminalBand = (el: Elements, band: BandState, view: View, client: MakeClient) => {
  const { Box } = el
  const { columns } = view
  const { run } = band
  const hasCat = run !== null || band.isStrolling
  const summary = SummaryLines(el, band.summary)
  const catRows = run !== null ? 8 : hasCat ? 5 : 0
  const shown = band.kittens.slice(0, roomFor(view.maxRows, catRows + summary.length, 3))
  const cat = run !== null ? { kind: 'progress', ...run } : { kind: 'stroll', id: band.stroll }
  const catKey = run !== null ? `cat-${run.id}` : `cat-${band.stroll}`

  return (
    <Box flexDirection="column">
      {summary}
      {hasCat && client(catKey, cat, columns, catRows)}
      {shown.map(kitten => client(`kitten-${kitten.id}`, { kind: 'kitten', ...kitten }, columns, 3))}
      {MoreAgents(el, band.kittens.length - shown.length)}
    </Box>
  )
}
