import {inspect} from 'node:util'
import process from 'node:process'
import {colorize, colorizeLevel, FormatterFn, wrapToError} from './utils.ts'

/**
 * Configuration options for the development formatter.
 */
export type DevFormatterConfig = {
  /** The locale used for formatting the timestamp. Defaults to the system locale. */
  locale?: string
  /** Standard Intl.DateTimeFormatOptions to customize the timestamp output. */
  timeOptions?: Intl.DateTimeFormatOptions
  /** Enable ANSI colors and dimming in the output. Defaults to true. */
  colors?: boolean
}

/**
 * Creates a built-in formatter optimized for local development.
 * Emits colored, human-readable strings to stdout/stderr.
 *
 * @param config Optional configuration for the formatter, like timestamp formats.
 * @returns A `FormatterFn` that writes to the console.
 */
export const createDevFormatter = (config: DevFormatterConfig = {}): FormatterFn => {
  const colors = config.colors ?? true
  // Resolve locale and time settings once, then reuse the formatter for every line.
  const timeFormatter = new Intl.DateTimeFormat(config.locale, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    ...(config.timeOptions || {}),
  })

  const formatter: FormatterFn = (level, context, msg, data, opts) => {
    const now = new Date()

    const timestamp = timeFormatter.format(now)

    // 1. Render context badges
    const contextStr = context.filter(ctx => ctx.hideIn !== 'dev').map(ctx => {
      const key = ctx.omitKey ? '' : `${ctx.key}:`
      const content = `${key}${ctx.value}`
      return colors ? colorize(`[${content}]`, ctx.colorIndex, ctx.color) : `[${content}]`
    }).join(' ')

    // 2. Format payload
    if (level === 'error' && data === undefined) {
      const realError = wrapToError(msg)
      data = realError
      msg = realError.message
    }

    let dataStr = ''
    if (data !== undefined) {
      const inspectOptions = opts?.pretty
        ? {compact: false, colors, depth: null}
        : {compact: true, breakLength: Infinity, colors, depth: null}

      dataStr = inspect(data, inspectOptions)
    }

    // 3. Assemble the output line
    const msgStr = typeof msg === 'object' && msg !== null ? inspect(msg, {colors, compact: true, breakLength: Infinity}) : String(msg)
    const levelMessage = level === 'error'
      ? `[ERROR] ${msgStr}`
      : level === 'warn'
        ? `[WARN] ${msgStr}`
        : msgStr
    const parts = [
      `[${timestamp}]`, // Normal (not dimmed)
      contextStr,
      colors ? colorizeLevel(level, levelMessage) : levelMessage,
      colors && level === 'debug' && dataStr
        ? `\x1b[2m${dataStr.replace(/\x1b\[0m/g, '\x1b[0m\x1b[2m')}\x1b[0m`
        : dataStr
    ]

    let finalLine = parts.filter(Boolean).join(' ') + '\n'

    if (level === 'error') process.stderr.write(finalLine)
    else process.stdout.write(finalLine)
  }

  return formatter
}
