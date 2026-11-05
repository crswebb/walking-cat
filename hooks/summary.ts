// The receipt left above the prompt once the cat has walked off.

import { clock, modelLabel, plural, usageParts } from './format'
import type { Run, Summary } from './model'

// A finished turn's receipt.
export const summaryOf = (run: Run, durationMs: number, isAborted: boolean): Summary => ({
  turnId: run.id,
  durationMs,
  isAborted,
  steps: run.steps,
  model: run.model,
  effort: run.effort,
  contextTokens: run.contextTokens,
  outputTokens: run.outputTokens,
  tally: run.tally,
  coat: run.coat,
})

// Its two lines: how it went, then what it did (null when it did nothing of
// a kind the tally counts).
export const summaryLines = (s: Summary) => {
  const model = modelLabel(s.model, s.effort)
  const head = [
    `${s.isAborted ? 'Stopped after' : 'Done in'} ${clock(s.durationMs)}`,
    plural(s.steps, 'step'),
    ...(model === null ? [] : [model]),
    ...usageParts(s.contextTokens, s.outputTokens),
    ...(s.coat === null ? [] : [`walked by a ${s.coat}`]),
  ].join(' · ')

  const t = s.tally
  const more = t.edited.length > 3 ? ` +${t.edited.length - 3} more` : ''
  const body = [
    ...(t.reads > 0 ? [`read ${plural(t.reads, 'file')}`] : []),
    ...(t.edited.length > 0 ? [`edited ${t.edited.slice(0, 3).join(', ')}${more}`] : []),
    ...(t.codeSearches > 0 ? [plural(t.codeSearches, 'code search', 'code searches')] : []),
    ...(t.webSearches > 0 ? [plural(t.webSearches, 'web lookup')] : []),
    ...(t.commands > 0 ? [plural(t.commands, 'command')] : []),
    ...(t.agents > 0 ? [plural(t.agents, 'agent')] : []),
  ].join(' · ')

  return { head, body: body === '' ? null : body.charAt(0).toUpperCase() + body.slice(1) }
}
