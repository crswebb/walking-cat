import type { EngineInterface, Register, ToolCallInput, TurnUsage } from 'claude-code'

import type { Kitten, Run, Summary, Tally } from './model'

import {
  coatNamed,
  KITTEN_COLUMNS,
  pickCoatName,
  rowsFor,
  progress,
  spriteSvg,
  SPRITE_COLUMNS,
  STROLL_COLUMNS_PER_S,
  walkEnd,
} from './sprite'

// The cat's values live in this module, not in Claude Code's session state:
// a change asks Claude Code to draw the band again. A reload of the module
// starts them afresh, which at worst sends the cat off until the next turn.
type Cell<T> = { value: T }

function cell<T>(initial: T): Cell<T> {
  return { value: initial }
}

async function read<T>(_$: EngineInterface, source: Cell<T>): Promise<T> {
  return source.value
}

async function update<T>($: EngineInterface, target: Cell<T>, change: (value: T) => T): Promise<T> {
  const value = change(target.value)
  if (value !== target.value) {
    target.value = value
    $.ui.invalidate('ui.render')
  }
  return value
}

const walk = cell(0)
const done = cell(0)
const run = cell<Run | null>(null)
const summary = cell<Summary | null>(null)
const kittens = cell<Kitten[]>([])

// How long a turn and a subagent take, on average, across sessions: paces
// the walks.
const AVERAGE_KEY = 'averageTurnMs'
const AGENT_AVERAGE_KEY = 'averageAgentMs'
const DEFAULT_MS = 20_000
const AGENT_DEFAULT_MS = 60_000
// A kitten whose agent's end never came is dropped after this long.
const KITTEN_MAX_AGE_MS = 30 * 60_000
const LABEL_MAX = 40
const TAG_MAX = 30
// The desktop's code font advance in CSS pixels, measured off a screenshot:
// an animated SVG sits in a frame that takes no size from its markup, so it
// is sized here, one column of the drawing to one column of text.
const CELL_PX = 7.6
const svgSize = (columns: number, spriteColumns: number) => ({
  width: Math.floor(columns * CELL_PX),
  height: Math.ceil(rowsFor(spriteColumns) * CELL_PX),
})

// The last path segment: `C:\a\b\cat.tsx` and `a/b/cat.tsx` are `cat.tsx`.
const base = (path: string) => path.split(/[\\/]/).pop() ?? path

const clip = (text: string, max: number) => {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// What the cat says while a tool call runs, in a few words.
const describe = (e: ToolCallInput) => {
  const input = e as unknown as Record<string, unknown>
  const field = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '')
  const file = base(field('file_path') || field('notebook_path'))
  const label = (() => {
    switch (e.tool) {
      case 'Read':
        return `Reading ${file}`
      case 'Edit':
      case 'NotebookEdit':
        return `Editing ${file}`
      case 'Write':
        return `Writing ${file}`
      case 'Bash':
      case 'PowerShell':
        // The command's own description only: its text may hold a secret.
        return field('description') || 'Running a command'
      case 'Grep':
        return `Searching for "${field('pattern')}"`
      case 'Glob':
        return `Looking for ${field('pattern')}`
      case 'WebSearch':
        return `Searching the web: ${field('query')}`
      case 'WebFetch':
        return `Reading ${field('url').replace(/^https?:\/\//, '').split('/')[0]}`
      case 'Agent':
        return `Delegating: ${field('description')}`
      case 'Skill':
        return `Using the ${field('skill')} skill`
      case 'AskUserQuestion':
        return 'Waiting for your answer'
      case 'ToolSearch':
        return 'Loading tools'
      default: {
        const name = e.tool.split('__').pop() ?? e.tool
        return name === 'update_plan' || name === 'TodoWrite'
          ? 'Updating the plan'
          : name === 'wrap_up'
            ? 'Wrapping up'
            : `Using ${name.replace(/[_-]+/g, ' ')}`
      }
    }
  })()

  return clip(label, LABEL_MAX)
}

// Everything the request sent: fresh input plus what the cache wrote and read.
const contextOf = (usage: TurnUsage) =>
  usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)

const EMPTY_TALLY: Tally = {
  reads: 0,
  edited: [],
  codeSearches: 0,
  webSearches: 0,
  commands: 0,
  agents: 0,
}

// The tally with one more call of `e`'s kind; tools of no kind leave it.
const tallied = (tally: Tally, e: ToolCallInput): Tally => {
  const input = e as unknown as Record<string, unknown>
  switch (e.tool) {
    case 'Read':
      return { ...tally, reads: tally.reads + 1 }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit': {
      const path = input.file_path ?? input.notebook_path
      const file = typeof path === 'string' ? base(path) : ''
      return file === '' || tally.edited.includes(file)
        ? tally
        : { ...tally, edited: [...tally.edited, file] }
    }
    case 'Grep':
    case 'Glob':
      return { ...tally, codeSearches: tally.codeSearches + 1 }
    case 'WebSearch':
    case 'WebFetch':
      return { ...tally, webSearches: tally.webSearches + 1 }
    case 'Bash':
    case 'PowerShell':
      return { ...tally, commands: tally.commands + 1 }
    case 'Agent':
      return { ...tally, agents: tally.agents + 1 }
    default:
      return tally
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const clock = (ms: number) => {
  const seconds = Math.round(ms / 1000)

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const tokens = (n: number) =>
  n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`

// `claude-opus-5-5-20261001[1m]` is `opus-5-5`.
const shortModel = (model: string) =>
  model.replace(/^claude-/, '').replace(/\[.*\]$/, '').replace(/-\d{8}$/, '')

// The summary's two lines: how it went, then what it did (null when it did
// nothing of a kind the tally counts).
const summaryLines = (s: Summary) => {
  const head = [
    `${s.isAborted ? 'Stopped after' : 'Done in'} ${clock(s.durationMs)}`,
    plural(s.steps, 'step'),
    ...(s.model === null ? [] : [shortModel(s.model) + (s.effort === null ? '' : ` ${s.effort}`)]),
    ...(s.contextTokens > 0 ? [`${tokens(s.contextTokens)} ctx`, `${tokens(s.outputTokens)} out`] : []),
    ...(s.coat === null ? [] : [`walked by a ${s.coat}`]),
  ].join(' · ')
  const t = s.tally
  const more = t.edited.length > 3 ? ` +${t.edited.length - 3} more` : ''
  const parts = [
    ...(t.reads > 0 ? [`read ${plural(t.reads, 'file')}`] : []),
    ...(t.edited.length > 0 ? [`edited ${t.edited.slice(0, 3).join(', ')}${more}`] : []),
    ...(t.codeSearches > 0 ? [plural(t.codeSearches, 'code search', 'code searches')] : []),
    ...(t.webSearches > 0 ? [plural(t.webSearches, 'web lookup')] : []),
    ...(t.commands > 0 ? [plural(t.commands, 'command')] : []),
    ...(t.agents > 0 ? [plural(t.agents, 'agent')] : []),
  ]
  const body = parts.join(' · ')

  return { head, body: body === '' ? null : body.charAt(0).toUpperCase() + body.slice(1) }
}

const averaged = (stored: unknown, ms: number) =>
  Math.round((typeof stored === 'number' ? stored : ms) * 0.7 + ms * 0.3)

// Labels of spawns not yet matched to an agent id, oldest first.
const pending: string[] = []

// The pixel cat's SVG per state, drawn once: its animations start where the
// cat was when the state began, and the same text keeps the picture as it is.
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

// A kitten for `id`, made on first sight; `label` names it when known.
async function ensureKitten($: EngineInterface, id: string, label?: string) {
  const now = await $.clock.now()
  const stored = await $.store.get(AGENT_AVERAGE_KEY)
  const expectedMs = typeof stored === 'number' ? stored : AGENT_DEFAULT_MS
  await update($, kittens, list => {
    const known = list.find(kitten => kitten.id === id)
    if (known !== undefined) {
      return label === undefined ? list : list.map(k => (k.id === id ? { ...k, label } : k))
    }
    const name = label ?? pending.shift() ?? 'Agent'
    const fresh = list.filter(k => now - k.startedAt < KITTEN_MAX_AGE_MS)

    const coat = pickCoatName(fresh[fresh.length - 1]?.coat ?? null)

    return [
      ...fresh,
      {
        id,
        label: name,
        expectedMs,
        startedAt: now,
        isDone: false,
        steps: 0,
        outputTokens: 0,
        doneAt: null,
        coat,
      },
    ]
  })
}

export const register: Register = on => {
  // The main loop's tool calls in flight, oldest first: the newest is what
  // the cat says, and when it ends the one before it is again.
  const inFlight: { id: string; label: string }[] = []
  const newest = () => inFlight[inFlight.length - 1]?.label ?? null

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'cat',
      description: 'Send the cat for a stroll across the screen',
    })

    return next(e)
  })

  on('command.run', { command: 'cat' }, async $ => {
    await update($, walk, n => n + 1)

    return { text: 'Here comes the cat.' }
  })

  on('agent.spawn', async ($, e, next) => {
    // A kitten's tag is short, to ride above it: the task, and the agent type
    // when it is not the everyday one.
    const label = clip(
      e.subagentType === 'general-purpose' ? e.description : `${e.subagentType}: ${e.description}`,
      TAG_MAX,
    )
    pending.push(label)
    const spawned = await next(e)
    if (spawned.agentId !== undefined) {
      const at = pending.indexOf(label)
      if (at >= 0) {
        pending.splice(at, 1)
      }
      await ensureKitten($, spawned.agentId, label)
    }

    return spawned
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      await ensureKitten($, e.agentId)
      return next(e)
    }
    inFlight.length = 0
    await update($, summary, () => null)
    const stored = await $.store.get(AVERAGE_KEY)
    const expectedMs = typeof stored === 'number' ? stored : DEFAULT_MS
    const startedAt = await $.clock.now()
    await update($, run, current => ({
      id: e.turnId,
      expectedMs,
      isDone: false,
      activity: null,
      steps: 0,
      isWaiting: false,
      model: current?.model ?? null,
      effort: current?.effort ?? null,
      contextTokens: current?.contextTokens ?? 0,
      outputTokens: 0,
      tally: EMPTY_TALLY,
      startedAt,
      doneAt: null,
      coat: pickCoatName(current?.coat ?? null),
    }))

    return next(e)
  })

  // Each model request: its model and effort as it goes out, its usage as the
  // response ends.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    if (agentId === undefined) {
      const effort = e.effort === undefined ? null : String(e.effort)
      await update($, run, current =>
        current === null ? current : { ...current, model: e.model, effort },
      )
    } else {
      await ensureKitten($, agentId)
    }
    const response = yield* next(e)
    const usage = response.usage
    if (usage !== null) {
      if (agentId === undefined) {
        await update($, run, current =>
          current === null
            ? current
            : {
                ...current,
                contextTokens: contextOf(usage),
                outputTokens: current.outputTokens + usage.output_tokens,
              },
        )
      } else {
        await update($, kittens, list =>
          list.map(k =>
            k.id === agentId ? { ...k, outputTokens: k.outputTokens + usage.output_tokens } : k,
          ),
        )
      }
    }

    return response
  })

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      await update($, kittens, list =>
        list.map(k => (k.id === agentId ? { ...k, steps: k.steps + 1 } : k)),
      )
      return next(e)
    }
    const id = e.tool_use_id
    inFlight.push({ id, label: describe(e) })
    const isQuestion = e.tool === 'AskUserQuestion'
    await update($, run, current =>
      current === null || current.isDone
        ? current
        : {
            ...current,
            activity: newest(),
            steps: current.steps + 1,
            isWaiting: isQuestion,
            tally: tallied(current.tally, e),
          },
    )
    try {
      return await next(e)
    } finally {
      const at = inFlight.findIndex(call => call.id === id)
      if (at >= 0) {
        inFlight.splice(at, 1)
      }
      await update($, run, current =>
        current === null ? current : { ...current, activity: newest(), isWaiting: false },
      )
    }
  })

  // Fires as a permission prompt is about to be shown: the cat raises the alarm
  // until that tool call ends, allowed or denied.
  on('classic.PermissionRequest', async ($, e, next) => {
    await update($, run, current =>
      current === null || current.isDone ? current : { ...current, isWaiting: true },
    )

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      const endedAt = await $.clock.now()
      await update($, kittens, list =>
        list.map(k => (k.id === agentId ? { ...k, isDone: true, doneAt: endedAt } : k)),
      )
      if (!e.isAborted) {
        await $.store.set(AGENT_AVERAGE_KEY, averaged(await $.store.get(AGENT_AVERAGE_KEY), e.durationMs))
      }
      return next(e)
    }
    const doneAt = await $.clock.now()
    const finished = await update($, run, current =>
      current?.id === e.turnId ? { ...current, isDone: true, isWaiting: false, doneAt } : current,
    )
    if (finished?.id === e.turnId) {
      await update($, summary, () => ({
        turnId: finished.id,
        durationMs: e.durationMs,
        isAborted: e.isAborted,
        steps: finished.steps,
        model: finished.model,
        effort: finished.effort,
        contextTokens: finished.contextTokens,
        outputTokens: finished.outputTokens,
        tally: finished.tally,
        coat: finished.coat,
      }))
    }
    if (!e.isAborted) {
      await $.store.set(AVERAGE_KEY, averaged(await $.store.get(AVERAGE_KEY), e.durationMs))
    }

    return next(e)
  })

  // A cat posts { done: <its id>, coat } once it has left the right edge; a
  // kitten posts { kitten: <its agent id> }.
  on('ui.message', async ($, e, next) => {
    const data = e.data as { done?: unknown; coat?: unknown; kitten?: unknown } | null
    const finished = data?.done
    const coat = typeof data?.coat === 'string' ? data.coat : null
    const kitten = data?.kitten
    if (typeof finished === 'number') {
      await update($, done, n => Math.max(n, finished))
    } else if (typeof finished === 'string') {
      await update($, run, current => (current?.id === finished ? null : current))
      await update($, summary, last =>
        last?.turnId === finished ? { ...last, coat: coat ?? last.coat } : last,
      )
    } else if (typeof kitten === 'string') {
      await update($, kittens, list => list.filter(k => k.id !== kitten))
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      return next(e)
    }
    const current = await read($, run)
    const stroll = await read($, walk)
    const litter = await read($, kittens)
    const isStrolling = stroll > (await read($, done))
    const hasCat = current !== null || isStrolling
    // The receipt shows once the cat has walked off, until the next turn.
    const last = current === null ? await read($, summary) : null
    if (e.props.hasSurvey || (!hasCat && litter.length === 0 && last === null)) {
      return next(e)
    }
    const lines = last === null ? null : summaryLines(last)
    // One table for both surfaces. Each Client element is written
    // h('Client', { module: './cat.tsx', ... }): a string tag, as the plugin
    // directory reads it, with its module path fixed in the source.
    const { Box, Text } = $.ui.resolve(e)

    const kittenRows = (catRows: number, summaryRows: number) =>
      Math.max(1, Math.floor((e.props.maxRows - catRows - summaryRows - 1) / 3))

    // The desktop draws the pixel cat: bubble and stats as text, the cat as
    // one animated SVG between them.
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      const columns = e.props.bodyColumns
      const now = await $.clock.now()
      // Each kitten: its tag as text riding above it, then the pixel kitten.
      const shown = litter.slice(0, Math.max(1, Math.floor((e.props.maxRows - (hasCat ? 7 : 2) - 1) / 4)))
      const hidden = litter.length - shown.length
      const kittensTree = (
        <Box flexDirection="column">
          {shown.map(kitten => {
            const phase = kitten.isDone ? 'sprint' : 'walk'
            const coat = coatNamed(kitten.coat)
            const source = remember(`kitten-${kitten.id}-${phase}-${columns}`, () => {
              if (kitten.isDone) {
                const doneAt = kitten.doneAt ?? now
                const fromX =
                  progress(doneAt - kitten.startedAt, kitten.expectedMs) * walkEnd(columns, KITTEN_COLUMNS)
                return spriteSvg({
                  columns,
                  coat,
                  motion: { kind: 'sprint', fromX, elapsedMs: now - doneAt },
                  isAlert: false,
                  spriteColumns: KITTEN_COLUMNS,
                })
              }
              return spriteSvg({
                columns,
                coat,
                motion: { kind: 'walk', elapsedMs: now - kitten.startedAt, expectedMs: kitten.expectedMs },
                isAlert: false,
                spriteColumns: KITTEN_COLUMNS,
              })
            })
            return (
              <Box flexDirection="column">
                {h('Client', { key: `tag-${kitten.id}`, module: './cat.tsx', props: { kind: 'tag', ...kitten, elapsedMs: now - kitten.startedAt }, width: columns, height: 1 })}
                <Svg
                  source={source}
                  alt={`A pixel ${kitten.coat} kitten for ${kitten.label}`}
                  isInteractive
                  {...svgSize(columns, KITTEN_COLUMNS)}
                />
              </Box>
            )
          })}
          {hidden > 0 && (
            <Text dimColor>
              +{hidden} more {hidden === 1 ? 'agent' : 'agents'}
            </Text>
          )}
        </Box>
      )
      if (!hasCat) {
        return (
          <Box flexDirection="column">
            {lines !== null && (
              <Text wrap="truncate">
                <Text color={last?.isAborted ? 'warning' : 'success'}>✓ </Text>
                <Text dimColor>{lines.head}</Text>
              </Text>
            )}
            {lines !== null && lines.body !== null && (
              <Text wrap="truncate" dimColor>
                {`  ${lines.body}`}
              </Text>
            )}
            {kittensTree}
          </Box>
        )
      }
      if (current === null) {
        const source = remember(`stroll-${stroll}-${columns}`, () =>
          spriteSvg({ columns, coat: coatNamed(null), motion: { kind: 'stroll', elapsedMs: 0 }, isAlert: false }),
        )
        const durationMs = ((columns + SPRITE_COLUMNS + 1) / STROLL_COLUMNS_PER_S) * 1000
        return (
          <Box flexDirection="column">
            <Svg source={source} alt="A pixel cat strolling across" isInteractive {...svgSize(columns, SPRITE_COLUMNS)} />
            {h('Client', { key: `timer-${stroll}`, module: './cat.tsx', props: { kind: 'timer', id: stroll, durationMs }, width: columns, height: 1 })}
            {kittensTree}
          </Box>
        )
      }
      const coat = coatNamed(current.coat)
      const isAlert = current.isWaiting && !current.isDone
      const phase = current.isDone ? 'sprint' : isAlert ? 'alert' : 'walk'
      const source = remember(`${current.id}-${phase}-${columns}`, () => {
        if (current.isDone) {
          const doneAt = current.doneAt ?? now
          const fromX = progress(doneAt - current.startedAt, current.expectedMs) * walkEnd(columns)
          return spriteSvg({ columns, coat, motion: { kind: 'sprint', fromX, elapsedMs: now - doneAt }, isAlert: false })
        }
        return spriteSvg({
          columns,
          coat,
          motion: { kind: 'walk', elapsedMs: now - current.startedAt, expectedMs: current.expectedMs },
          isAlert,
        })
      })
      const textProps = { ...current, elapsedMs: now - current.startedAt }
      return (
        <Box flexDirection="column">
          {h('Client', { key: `bubble-${current.id}`, module: './cat.tsx', props: { kind: 'bubble', ...textProps }, width: columns, height: 2 })}
          <Svg
            source={source}
            alt={`A pixel ${current.coat} cat walking`}
            isInteractive
            {...svgSize(columns, SPRITE_COLUMNS)}
          />
          {h('Client', { key: `stats-${current.id}`, module: './cat.tsx', props: { kind: 'stats', ...textProps }, width: columns, height: 1 })}
          {kittensTree}
        </Box>
      )
    }

    const catRows = current !== null ? 8 : hasCat ? 5 : 0
    // As many kittens as the band has room for, three rows each.
    const summaryRows = lines === null ? 0 : lines.body === null ? 1 : 2
    const room = kittenRows(catRows, summaryRows)
    const shown = litter.slice(0, room)
    const hidden = litter.length - shown.length
    const props =
      current !== null
        ? { kind: 'progress', ...current }
        : { kind: 'stroll', id: stroll }

    return (
      <Box flexDirection="column">
        {lines !== null && (
          <Text wrap="truncate">
            <Text color={last?.isAborted ? 'warning' : 'success'}>✓ </Text>
            <Text dimColor>{lines.head}</Text>
          </Text>
        )}
        {lines !== null && lines.body !== null && (
          <Text wrap="truncate" dimColor>
            {`  ${lines.body}`}
          </Text>
        )}
        {hasCat && (
          h('Client', { key: `cat-${props.id}`, module: './cat.tsx', props: props, width: e.props.bodyColumns, height: catRows })
        )}
        {shown.map(kitten => (
          h('Client', { key: `kitten-${kitten.id}`, module: './cat.tsx', props: { kind: 'kitten', ...kitten }, width: e.props.bodyColumns, height: 3 })
        ))}
        {hidden > 0 && (
          <Text dimColor>
            +{hidden} more {hidden === 1 ? 'agent' : 'agents'}
          </Text>
        )}
      </Box>
    )
  })
}
