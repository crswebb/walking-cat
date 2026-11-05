// Small text helpers: names, counts and times as the cat shows them.

// The last path segment: `C:\a\b\cat.tsx` and `a/b/cat.tsx` are `cat.tsx`.
export const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path

// One line of at most `max` characters, an ellipsis where it was cut.
export const clip = (text: string, max: number) => {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// Milliseconds as `m:ss`.
export const clock = (ms: number) => {
  const seconds = Math.round(ms / 1000)

  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// A count as `950`, `1.2k` or `45k`.
export const compactCount = (n: number) =>
  n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`

// `claude-opus-5-5-20261001[1m]` is `opus-5-5`.
export const shortModel = (model: string) =>
  model.replace(/^claude-/, '').replace(/\[.*\]$/, '').replace(/-\d{8}$/, '')

// `opus-5-5 high`, or null before the first model request.
export const modelLabel = (model: string | null, effort: string | null) =>
  model === null ? null : shortModel(model) + (effort === null ? '' : ` ${effort}`)

// `45k ctx`, `1.2k out`: what the latest request sent and what the turn wrote.
export const usageParts = (contextTokens: number, outputTokens: number) =>
  contextTokens > 0 ? [`${compactCount(contextTokens)} ctx`, `${compactCount(outputTokens)} out`] : []
