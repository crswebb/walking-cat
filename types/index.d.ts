// A /cat stroll's number: the cat is on screen while walk > done.
export type WalkId = number

// The main loop's turn the cat is walking for: `expectedMs` paces the walk,
// `isDone` sends it sprinting to the end once the turn has finished.
// `activity` is what the cat says (null: thinking), `steps` the tool calls
// so far, `isWaiting` true while a permission prompt or a question waits.
// `model` and `effort` are the latest request's; `contextTokens` is what the
// latest request sent, `outputTokens` what the turn's responses wrote.
export type Run = {
  id: string
  expectedMs: number
  isDone: boolean
  activity: string | null
  steps: number
  isWaiting: boolean
  model: string | null
  effort: string | null
  contextTokens: number
  outputTokens: number
  tally: Tally
  // When the turn started and ended (ms since the epoch), and the coat the
  // cat wears for it: what the pixel cat's animation is drawn from.
  startedAt: number
  doneAt: number | null
  coat: string
}

// What a turn did, by kind: the summary's second line.
export type Tally = {
  reads: number
  edited: string[]
  codeSearches: number
  webSearches: number
  commands: number
  agents: number
}

// The receipt left above the prompt once the cat has walked off, kept until
// the next turn starts. `coat` is the cat that walked, once it says so.
export type Summary = {
  turnId: string
  durationMs: number
  isAborted: boolean
  steps: number
  model: string | null
  effort: string | null
  contextTokens: number
  outputTokens: number
  tally: Tally
  coat: string | null
}

// A subagent's kitten: walks as that agent's progress bar, pulling a banner
// with `label`. `startedAt` lets a kitten whose end never came be dropped.
export type Kitten = {
  id: string
  label: string
  expectedMs: number
  startedAt: number
  isDone: boolean
  steps: number
  outputTokens: number
  // When the agent ended, and the coat its pixel kitten wears.
  doneAt: number | null
  coat: string
}

declare module 'claude-code' {
  interface PluginState {
    'walking-cat': {
      walk: WalkId
      done: WalkId
      run: Shaped<Run | null>
      kittens: Shaped<Kitten[]>
      summary: Shaped<Summary | null>
    }
  }
}
