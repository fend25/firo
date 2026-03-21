// --- Types ---

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const LOG_LEVELS = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
} as const

export type ContextValue = string | number | boolean | null | undefined

export type ContextOptions = {
  colorIndex?: number
  omitKey?: boolean
}

export type ContextItem = {
  key: string
  value: ContextValue
  options?: ContextOptions
}
export type ContextItemWithOptions = ContextItem & { options: Required<ContextOptions> }

export type LogOptions = {
  pretty?: boolean // Enable multiline output for data
  ctx?: ContextItem[] // Additional per-call context items
}

export type TransportFn = (
  level: LogLevel,
  context: ContextItemWithOptions[],
  message: string | Error | unknown,
  data?: Error | unknown,
  options?: LogOptions
) => void

// --- Colors & formatting utils ---

const COLORS = [
  36, // Cyan
  32, // Green
  33, // Yellow
  35, // Magenta
  34, // Blue
  96, // Bright Cyan
  92, // Bright Green
  93, // Bright Yellow
  95, // Bright Magenta
  94, // Bright Blue
]

// Hash a string to a stable color index
export const getColorIndex = (str: string): number => {
  let hash = 0

  // Produces an integer hash from a string.
  // Uses a bit-shift to multiply by 31: (x << 5) - x === x * 31.
  // This gives good distribution for color selection so that
  // similar strings (e.g. "user-1", "user-2") land on different indices.
  str.split('').forEach(char => {
    hash = char.charCodeAt(0) + ((hash << 5) - hash)
  })
  return Math.abs(hash % COLORS.length)
}

export const colorize = (text: string, colorIndex: number): string => `\x1b[${COLORS[colorIndex % COLORS.length]}m${text}\x1b[0m`

// Maps log level to ANSI color: error=red, warn=yellow, debug=dim, info=plain
export const colorizeLevel = (level: LogLevel, text: string): string => {
  if (level === 'info') return text

  switch (level) {
    case 'error':
      return `\x1b[31m${text}\x1b[0m` // Red
    case 'warn':
      return `\x1b[33m${text}\x1b[0m` // Yellow
    case 'debug':
      return `\x1b[2m${text}\x1b[0m`  // Dim
    default:
      return text
  }
}

export const dim = (text: string) => `\x1b[2m${text}\x1b[0m`
