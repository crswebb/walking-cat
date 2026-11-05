import type { ToolCallInput } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { agentTag, contextOf, describe, EMPTY_TALLY, tallied } from '../hooks/activity'

// A tool call as the hooks see it: the tool, its id, its input beside them.
const call = (tool: string, input: Record<string, unknown> = {}) =>
  ({ tool, tool_use_id: 'toolu_1', ...input }) as unknown as ToolCallInput

test('the bubble names the file, search or page a tool works on', () => {
  expect(describe(call('Read', { file_path: 'C:\\repo\\hooks\\cat.tsx' }))).toBe('Reading cat.tsx')
  expect(describe(call('Edit', { file_path: '/repo/README.md' }))).toBe('Editing README.md')
  expect(describe(call('Grep', { pattern: 'tally' }))).toBe('Searching for "tally"')
  expect(describe(call('WebFetch', { url: 'https://example.com/a/b' }))).toBe('Reading example.com')
})

test("a command shows its description, never its text", () => {
  expect(describe(call('Bash', { command: 'deploy --token=s3cret', description: 'Deploy the site' }))).toBe(
    'Deploy the site',
  )
  expect(describe(call('PowerShell', { command: 'Get-Secret -Name api' }))).toBe('Running a command')
})

test('other tools get a readable name', () => {
  expect(describe(call('mcp__ccd_turn__update_plan'))).toBe('Updating the plan')
  expect(describe(call('mcp__server__list_issues'))).toBe('Using list issues')
})

test('a long label is cut to fit the bubble', () => {
  const label = describe(call('WebSearch', { query: 'a very long search query about cats and their many habits' }))
  expect(label.length).toBe(40)
  expect(label.endsWith('…')).toBe(true)
})

test("a kitten's tag drops the everyday agent type", () => {
  expect(agentTag('general-purpose', 'Cat sleep facts')).toBe('Cat sleep facts')
  expect(agentTag('Explore', 'Find the auth code')).toBe('Explore: Find the auth code')
})

test('the context counts fresh input and both kinds of cache', () => {
  const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 1_000, model: 'm' }
  expect(contextOf(usage)).toBe(1_110)
})

test('the tally counts each kind once per call, and edited files once each', () => {
  const tally = [
    call('Read', { file_path: '/a.ts' }),
    call('Edit', { file_path: '/a.ts' }),
    call('Write', { file_path: '/a.ts' }),
    call('Grep'),
    call('WebSearch'),
    call('Bash'),
    call('Agent'),
    call('ToolSearch'),
  ].reduce(tallied, EMPTY_TALLY)
  expect(tally).toEqual({ reads: 1, edited: ['a.ts'], codeSearches: 1, webSearches: 1, commands: 1, agents: 1 })
})
