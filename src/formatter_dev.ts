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
}

/**
 * Creates a built-in formatter optimized for local development.
 * Emits colored, human-readable strings to stdout/stderr.
 *
 * @param config Optional configuration for the formatter, like timestamp formats.
 * @returns A `FormatterFn` that writes to the console.
 */
export const createDevFormatter = (config: DevFormatterConfig = {}): FormatterFn => {
  // Bake settings once at formatter creation time
  const locale = config.locale ?? undefined // undefined = system locale
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    ...(config.timeOptions || {}),
  }

  const formatter: FormatterFn = (level, context, msg, data, opts) => {
    const now = new Date()

    // Build timestamp using closed-over locale settings
    const timestamp = now.toLocaleTimeString(locale, timeOpts)

    // 1. Render context badges
    const contextStr = context.filter(ctx => ctx.hideIn !== 'dev').map(ctx => {
      const key = ctx.omitKey ? '' : `${ctx.key}:`
      const content = `${key}${ctx.value}`
      return colorize(`[${content}]`, ctx.colorIndex, ctx.color)
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
        ? {compact: false, colors: true, depth: null}
        : {compact: true, breakLength: Infinity, colors: true, depth: null}

      dataStr = inspect(data, inspectOptions)
    }

    // 3. Assemble the output line
    const msgStr = typeof msg === 'object' && msg !== null ? inspect(msg, {colors: true, compact: true, breakLength: Infinity}) : String(msg)
    const parts = [
      `[${timestamp}]`, // Normal (not dimmed)
      contextStr,
      level === 'error'
        ? colorizeLevel('error', `[ERROR] ${msgStr}`)
        : level === 'warn'
          ? colorizeLevel('warn', `[WARN] ${msgStr}`)
          : level === 'debug'
            ? colorizeLevel('debug', msgStr)
            : msgStr,
      level === 'debug' && dataStr
        ? `\x1b[2m${dataStr.replace(/\x1b\[0m/g, '\x1b[0m\x1b[2m')}\x1b[0m`
        : dataStr
    ]

    let finalLine = parts.filter(Boolean).join(' ') + '\n'

    if (level === 'error') process.stderr.write(finalLine)
    else process.stdout.write(finalLine)
  }

  return formatter
}
