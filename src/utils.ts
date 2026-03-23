import {inspect} from 'node:util'

// --- Types ---

/** Available log severity levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** Numeric severity values for each log level, used for threshold filtering. */
export const LOG_LEVELS = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
} as const

/** Primitive types allowed as context values. */
export type ContextValue = string | number | boolean | null | undefined

/** Options to customize how a context item is rendered. */
export type ContextOptions = {
  /** Color index: 0-9 for safe terminal colors (used by auto-hash), 10+ for extended 256-color palette. */
  colorIndex?: number
  /** Raw ANSI color code string (e.g. '36', '38;5;214', '38;2;255;100;0'). Takes priority over colorIndex. */
  color?: string
  /** If true, the key name is hidden, and only the value is printed. */
  omitKey?: boolean
  /** Hide this context item in 'dev' or 'prod' mode. Useful for keeping traceIds out of dev output. */
  hideIn?: 'dev' | 'prod'
}

/** A single key-value context entry. */
export type ContextItem = {
  key: string
  value: ContextValue
} & Partial<ContextOptions>

/** Configuration options for creating a logger child instance. */
export type ContextExtension = {
  value: ContextValue
} & Partial<ContextOptions>

/** A context entry where options have been fully resolved with defaults. */
export type ContextItemWithOptions = ContextItem & {
  colorIndex: number
  omitKey: boolean
  color?: string
  hideIn?: 'dev' | 'prod'
}

/** Options that can be passed to a single log call. */
export type LogOptions = {
  /** If true, stringifies objects with indentation and line breaks. */
  pretty?: boolean // Enable multiline output for data
  /** Additional inline context items applied only to this log call. */
  ctx?: ContextItem[] // Additional per-call context items
}

/** The signature of a function responsible for formatting and emitting log records. */
export type FormatterFn = (
  level: LogLevel,
  context: ContextItemWithOptions[],
  message: string | Error | unknown,
  data?: Error | unknown,
  options?: LogOptions
) => void

// --- Colors & formatting utils ---

/** Named color palette for context badges. Use with `color` option: `{ color: FIRO_COLORS.skyBlue }` */
export const FIRO_COLORS = {
  // Basic ANSI (safe for any terminal)
  cyan: '36',
  green: '32',
  yellow: '33',
  magenta: '35',
  blue: '34',
  brightCyan: '96',
  brightGreen: '92',
  brightYellow: '93',
  brightMagenta: '95',
  brightBlue: '94',
  // Extended 256-color palette
  orange: '38;5;214',
  pink: '38;5;213',
  lilac: '38;5;141',
  skyBlue: '38;5;117',
  mint: '38;5;156',
  salmon: '38;5;210',
  lemon: '38;5;228',
  lavender: '38;5;183',
  sage: '38;5;114',
  coral: '38;5;209',
  teal: '38;5;116',
  rose: '38;5;219',
  pistachio: '38;5;150',
  mauve: '38;5;175',
  aqua: '38;5;81',
  gold: '38;5;222',
  thistle: '38;5;182',
  seafoam: '38;5;115',
  tangerine: '38;5;208',
  periwinkle: '38;5;147',
} as const

const COLORS_LIST = Object.values(FIRO_COLORS)
const SAFE_COLORS_COUNT = 10

/** Hash a string to a stable color palette index. Similar strings land on different colors. */
export const getColorIndex = (str: string, useAllColors = false): number => {
  let hash = 0

  // Produces an integer hash from a string.
  // Uses a bit-shift to multiply by 31: (x << 5) - x === x * 31.
  // This gives good distribution for color selection so that
  // similar strings (e.g. "user-1", "user-2") land on different indices.
  for (let i = 0, len = str.length; i < len; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const range = useAllColors ? COLORS_LIST.length : SAFE_COLORS_COUNT
  return Math.abs(hash % range)
}

/** Wrap text in an ANSI color escape sequence by palette index or raw ANSI code. */
export const colorize = (text: string, colorIndex: number, color?: string): string => {
  const code = color ?? (COLORS_LIST[colorIndex] || COLORS_LIST[colorIndex % SAFE_COLORS_COUNT])
  return `\x1b[${code}m${text}\x1b[0m`
}

// --- Shared serialization utils ---

/** JSON.stringify replacer that converts BigInt values to strings. */
export const jsonReplacer = (_key: string, value: unknown): unknown =>
  typeof value === 'bigint' ? value.toString() : value

/** Safely stringify any value to JSON with BigInt support. Falls back to `util.inspect` on circular references. */
export const safeStringify = (obj: unknown): string => {
  try {
    return JSON.stringify(obj, jsonReplacer)
  } catch {
    return inspect(obj)
  }
}

/** Coerce any value to an Error instance. If already an Error, returns as-is. */
export const wrapToError = (obj: unknown): Error => {
  if (obj instanceof Error) return obj
  return new Error(
    (typeof obj === 'object' && obj !== null) ? safeStringify(obj) : String(obj)
  )
}

/** Serialize an error-like value to a plain object with `message`, `stack`, `name`, and recursively serialized `cause`. */
export const serializeError = (_err: unknown): Record<string, unknown> => {
  const err = wrapToError(_err)
  const result: Record<string, unknown> = {
    message: err.message,
    stack: err.stack,
    name: err.name,
    ...(err as any),
  }
  if (err.cause !== undefined) {
    result.cause = err.cause instanceof Error ? serializeError(err.cause) : err.cause
  }
  return result
}

/** Extract a human-readable message string from any log input. Useful for building custom formatters. */
export const extractMessage = (msg: string | Error | unknown): string =>
  typeof msg === 'string'
    ? msg
    : msg instanceof Error
      ? msg.message
      : (typeof msg === 'object' && msg !== null)
        ? safeStringify(msg)
        : String(msg)

/** Wrap text in an ANSI color based on log level: red for error, yellow for warn, dim for debug. */
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

