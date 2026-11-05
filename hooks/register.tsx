// walking-cat's hooks: they note what the session does, and draw the band
// above the prompt from those notes. None of them changes or decides anything;
// each passes its event on exactly as it came.

import type { EngineInterface, Register } from 'claude-code'

import { agentTag, contextOf, describe, EMPTY_TALLY, tallied, UNKNOWN_AGENT } from './activity'
import type { AgentTag } from './activity'
import { desktopBand, isEmpty, terminalBand } from './band'
import type { BandState } from './band'
import type { Kitten, Run, Summary } from './model'
import { pickCoatName } from './sprite'
import { summaryOf } from './summary'

// The cat's values live in this module, not in Claude Code's session state:
// a change asks Claude Code to draw the band again. A reload of the module
// starts them afresh, which at worst sends the cat off until the next turn.
type Cell<T> = { value: T }

const cell = <T,>(initial: T): Cell<T> => ({ value: initial })

const strolls = cell(0) // /cat strolls asked for
const strolled = cell(0) // the last stroll that finished
const run = cell<Run | null>(null)
const summary = cell<Summary | null>(null)
const kittens = cell<Kitten[]>([])

// Sets a value, and redraws the band when it changed; resolves to the value.
async function update<T>($: EngineInterface, target: Cell<T>, change: (value: T) => T): Promise<T> {
  const value = change(target.value)
  if (value !== target.value) {
    target.value = value
    $.ui.invalidate('ui.render')
  }
  return value
}

// How long a turn and a subagent take, on average across sessions, kept in
// Claude Code's plugin storage: what paces the walks.
const TURN_AVERAGE = { key: 'averageTurnMs', fallbackMs: 20_000 }
const AGENT_AVERAGE = { key: 'averageAgentMs', fallbackMs: 60_000 }

async function averageMs($: EngineInterface, average: typeof TURN_AVERAGE) {
  const stored = await $.store.get(average.key)
  return typeof stored === 'number' ? stored : average.fallbackMs
}

// Folds one more duration into the average, the latest weighing 30%.
async function addToAverage($: EngineInterface, average: typeof TURN_AVERAGE, ms: number) {
  const stored = await $.store.get(average.key)
  const before = typeof stored === 'number' ? stored : ms
  await $.store.set(average.key, Math.round(before * 0.7 + ms * 0.3))
}

// A kitten whose agent's end never came is dropped after this long.
const KITTEN_MAX_AGE_MS = 30 * 60_000

// Takes the first item that matches out of `list`, if there is one.
const removeFirst = <T,>(list: T[], matches: (item: T) => boolean) => {
  const at = list.findIndex(matches)
  if (at >= 0) {
    list.splice(at, 1)
  }
}

// Tags of spawns not yet matched to an agent id, oldest first.
const pendingTags: AgentTag[] = []

// A kitten for agent `id`, made on first sight; `tag` names it when known.
async function ensureKitten($: EngineInterface, id: string, tag?: AgentTag) {
  const now = await $.clock.now()
  const expectedMs = await averageMs($, AGENT_AVERAGE)
  await update($, kittens, list => {
    if (list.some(kitten => kitten.id === id)) {
      return tag === undefined ? list : list.map(k => (k.id === id ? { ...k, ...tag } : k))
    }
    const fresh = list.filter(k => now - k.startedAt < KITTEN_MAX_AGE_MS)
    const kitten: Kitten = {
      id,
      ...(tag ?? pendingTags.shift() ?? UNKNOWN_AGENT),
      expectedMs,
      startedAt: now,
      isDone: false,
      steps: 0,
      outputTokens: 0,
      doneAt: null,
      coat: pickCoatName(fresh[fresh.length - 1]?.coat ?? null),
    }
    return [...fresh, kitten]
  })
}

const updateKitten = ($: EngineInterface, id: string, change: (kitten: Kitten) => Kitten) =>
  update($, kittens, list => list.map(k => (k.id === id ? change(k) : k)))

// Every Client the band draws: the surface module in cat.tsx, written as a
// string tag with its path fixed in the source, the form the plugin directory
// reads.
function client(key: string, props: unknown, width: number, height: number) {
  return h('Client', { key, module: './cat.tsx', props, width, height })
}

export const register: Register = on => {
  // The main loop's tool calls in flight, oldest first: the newest is what
  // the cat says, and when it ends the one before it is again.
  const inFlight: { id: string; label: string }[] = []
  const saying = () => inFlight[inFlight.length - 1]?.label ?? null

  // /cat

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'cat', description: 'Send the cat for a stroll across the screen' })
    return next(e)
  })

  on('command.run', { command: 'cat' }, async $ => {
    await update($, strolls, n => n + 1)
    return { text: 'Here comes the cat.' }
  })

  // Turns: the main loop's walks the cat; a subagent's, its kitten.

  on('agent.spawn', async ($, e, next) => {
    const tag = agentTag(e.subagentType, e.description)
    pendingTags.push(tag)
    const spawned = await next(e)
    removeFirst(pendingTags, pending => pending === tag)
    if (spawned.agentId !== undefined) {
      // A teammate's own name is known only once it has started.
      await ensureKitten($, spawned.agentId, agentTag(e.subagentType, e.description, spawned.teammateId))
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
    const expectedMs = await averageMs($, TURN_AVERAGE)
    const startedAt = await $.clock.now()
    await update($, run, last => ({
      id: e.turnId,
      expectedMs,
      isDone: false,
      activity: null,
      steps: 0,
      isWaiting: false,
      // The model and context carry over until this turn's first request.
      model: last?.model ?? null,
      effort: last?.effort ?? null,
      contextTokens: last?.contextTokens ?? 0,
      outputTokens: 0,
      tally: EMPTY_TALLY,
      startedAt,
      doneAt: null,
      coat: pickCoatName(last?.coat ?? null),
    }))
    return next(e)
  })

  // Each model request: its model and effort as it goes out, its usage once
  // the response has streamed through untouched.
  on('turn.step', async function* ($, e, next) {
    const agentId = e.agentId
    if (agentId === undefined) {
      const effort = e.effort === undefined ? null : String(e.effort)
      await update($, run, current => (current === null ? current : { ...current, model: e.model, effort }))
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
            : { ...current, contextTokens: contextOf(usage), outputTokens: current.outputTokens + usage.output_tokens },
        )
      } else {
        await updateKitten($, agentId, k => ({ ...k, outputTokens: k.outputTokens + usage.output_tokens }))
      }
    }
    return response
  })

  on('turn.complete', async ($, e, next) => {
    const now = await $.clock.now()
    if (e.agentId !== undefined) {
      await updateKitten($, e.agentId, k => ({ ...k, isDone: true, doneAt: now }))
      if (!e.isAborted) {
        await addToAverage($, AGENT_AVERAGE, e.durationMs)
      }
      return next(e)
    }
    const finished = await update($, run, current =>
      current?.id === e.turnId ? { ...current, isDone: true, isWaiting: false, doneAt: now } : current,
    )
    if (finished?.id === e.turnId) {
      await update($, summary, () => summaryOf(finished, e.durationMs, e.isAborted))
    }
    if (!e.isAborted) {
      await addToAverage($, TURN_AVERAGE, e.durationMs)
    }
    return next(e)
  })

  // Tool calls: what the cat says, and the turn's tally.

  on('tool.call', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId !== undefined) {
      await updateKitten($, agentId, k => ({ ...k, steps: k.steps + 1 }))
      return next(e)
    }
    const id = e.tool_use_id
    inFlight.push({ id, label: describe(e) })
    await update($, run, current =>
      current === null || current.isDone
        ? current
        : {
            ...current,
            activity: saying(),
            steps: current.steps + 1,
            isWaiting: e.tool === 'AskUserQuestion',
            tally: tallied(current.tally, e),
          },
    )
    try {
      return await next(e)
    } finally {
      removeFirst(inFlight, call => call.id === id)
      await update($, run, current => (current === null ? current : { ...current, activity: saying(), isWaiting: false }))
    }
  })

  // Claude Code's notice that a prompt waits on the person (a permission, or a
  // question from an MCP server): the cat raises the alarm until that tool call
  // ends. It reads the notice only; the prompt itself is never touched.
  on('classic.Notification', async ($, e, next) => {
    if (e.notification_type === 'permission_prompt' || e.notification_type === 'elicitation_dialog') {
      await update($, run, current => (current === null || current.isDone ? current : { ...current, isWaiting: true }))
    }
    return next(e)
  })

  // Drawing: the surface module posts { done: <turn id or stroll number>,
  // coat? } once a cat has left the right edge, and { kitten: <agent id> }
  // once a kitten has.

  on('ui.message', async ($, e, next) => {
    const data = e.data as { done?: unknown; coat?: unknown; kitten?: unknown } | null
    const done = data?.done
    const kitten = data?.kitten
    if (typeof done === 'number') {
      await update($, strolled, n => Math.max(n, done))
    } else if (typeof done === 'string') {
      const coat = typeof data?.coat === 'string' ? data.coat : null
      await update($, run, current => (current?.id === done ? null : current))
      await update($, summary, last => (last?.turnId === done ? { ...last, coat: coat ?? last.coat } : last))
    } else if (typeof kitten === 'string') {
      await update($, kittens, list => list.filter(k => k.id !== kitten))
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' && e.surface !== 'desktop') {
      return next(e)
    }
    const band: BandState = {
      run: run.value,
      stroll: strolls.value,
      isStrolling: strolls.value > strolled.value,
      kittens: kittens.value,
      // The receipt shows once the cat has walked off, until the next turn.
      summary: run.value === null ? summary.value : null,
    }
    if (e.props.hasSurvey || isEmpty(band)) {
      return next(e)
    }
    const view = { columns: e.props.bodyColumns, maxRows: e.props.maxRows, now: await $.clock.now() }
    const { Box, Text } = $.ui.resolve(e)
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      return desktopBand({ Box, Text, Svg }, band, view, client)
    }
    return terminalBand({ Box, Text }, band, view, client)
  })
}
