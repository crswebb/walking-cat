import { expect, test } from 'claude-code/testing'

import { EMPTY_TALLY } from '../hooks/activity'
import type { Run } from '../hooks/model'
import { summaryLines, summaryOf } from '../hooks/summary'

const finishedRun: Run = {
  id: 'turn-1',
  expectedMs: 20_000,
  isDone: true,
  activity: null,
  steps: 6,
  isWaiting: false,
  model: 'claude-opus-5-5',
  effort: 'high',
  contextTokens: 45_000,
  outputTokens: 1_200,
  tally: { ...EMPTY_TALLY, reads: 3, edited: ['cat.tsx', 'register.tsx'], commands: 4 },
  startedAt: 0,
  doneAt: 31_000,
  coat: 'calico',
}

test('the receipt says how the turn went, then what it did', () => {
  const lines = summaryLines(summaryOf(finishedRun, 31_000, false))
  expect(lines.head).toBe('Done in 0:31 · 6 steps · opus-5-5 high · 45k ctx · 1.2k out · walked by a calico')
  expect(lines.body).toBe('Read 3 files · edited cat.tsx, register.tsx · 4 commands')
})

test('an interrupted turn says so', () => {
  const lines = summaryLines(summaryOf(finishedRun, 12_000, true))
  expect(lines.head.startsWith('Stopped after 0:12')).toBe(true)
})

test('a turn that did nothing the tally counts has no second line', () => {
  const quiet = { ...finishedRun, tally: EMPTY_TALLY, model: null, contextTokens: 0 }
  const lines = summaryLines(summaryOf(quiet, 3_000, false))
  expect(lines.head).toBe('Done in 0:03 · 6 steps · walked by a calico')
  expect(lines.body).toBeNull()
})

test('more than three edited files are counted, not listed', () => {
  const tally = { ...EMPTY_TALLY, edited: ['a', 'b', 'c', 'd', 'e'] }
  const lines = summaryLines(summaryOf({ ...finishedRun, tally }, 1_000, false))
  expect(lines.body).toBe('Edited a, b, c +2 more')
})
