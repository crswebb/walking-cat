// What the cat makes of the session's activity: the words in its speech
// bubble, a kitten's tag, and the tally of a turn's work.

import type { ToolCallInput, TurnUsage } from 'claude-code'

import { baseName, clip } from './format'
import type { Tally } from './model'

const LABEL_MAX = 40
const TAG_MAX = 30

// A tool call's input field as text, or '' where it has none.
const fieldOf = (e: ToolCallInput, key: string) => {
  const value = (e as unknown as Record<string, unknown>)[key]

  return typeof value === 'string' ? value : ''
}

const fileOf = (e: ToolCallInput) => baseName(fieldOf(e, 'file_path') || fieldOf(e, 'notebook_path'))

// What the cat says while a tool call runs, in a few words.
export const describe = (e: ToolCallInput) => {
  const label = (() => {
    switch (e.tool) {
      case 'Read':
        return `Reading ${fileOf(e)}`
      case 'Edit':
      case 'NotebookEdit':
        return `Editing ${fileOf(e)}`
      case 'Write':
        return `Writing ${fileOf(e)}`
      case 'Bash':
      case 'PowerShell':
        // The command's own description only: its text may hold a secret.
        return fieldOf(e, 'description') || 'Running a command'
      case 'Grep':
        return `Searching for "${fieldOf(e, 'pattern')}"`
      case 'Glob':
        return `Looking for ${fieldOf(e, 'pattern')}`
      case 'WebSearch':
        return `Searching the web: ${fieldOf(e, 'query')}`
      case 'WebFetch':
        return `Reading ${fieldOf(e, 'url').replace(/^https?:\/\//, '').split('/')[0]}`
      case 'Agent':
        return `Delegating: ${fieldOf(e, 'description')}`
      case 'Skill':
        return `Using the ${fieldOf(e, 'skill')} skill`
      case 'AskUserQuestion':
        return 'Waiting for your answer'
      case 'ToolSearch':
        return 'Loading tools'
      default: {
        const name = e.tool.split('__').pop() ?? e.tool
        if (name === 'update_plan' || name === 'TodoWrite') {
          return 'Updating the plan'
        }
        return name === 'wrap_up' ? 'Wrapping up' : `Using ${name.replace(/[_-]+/g, ' ')}`
      }
    }
  })()

  return clip(label, LABEL_MAX)
}

// A kitten's tag, short enough to ride above it: the task, and the agent type
// when it is not the everyday one.
export const agentTag = (subagentType: string, description: string) =>
  clip(subagentType === 'general-purpose' ? description : `${subagentType}: ${description}`, TAG_MAX)

// Everything a request sent: fresh input plus what the cache wrote and read.
export const contextOf = (usage: TurnUsage) =>
  usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)

export const EMPTY_TALLY: Tally = {
  reads: 0,
  edited: [],
  codeSearches: 0,
  webSearches: 0,
  commands: 0,
  agents: 0,
}

// The tally with one more call of `e`'s kind; a tool of no kind leaves it.
export const tallied = (tally: Tally, e: ToolCallInput): Tally => {
  switch (e.tool) {
    case 'Read':
      return { ...tally, reads: tally.reads + 1 }
    case 'Edit':
    case 'Write':
    case 'NotebookEdit': {
      const file = fileOf(e)
      return file === '' || tally.edited.includes(file) ? tally : { ...tally, edited: [...tally.edited, file] }
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
