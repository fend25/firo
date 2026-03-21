import {inspect} from 'node:util'
import process from 'node:process'
import fs from 'node:fs'
import {colorize, colorizeLevel, dim, TransportFn, ContextItemWithOptions, LogLevel, LogOptions} from './utils.ts'

// --- DEV Transport Factory ---

/**
 * Configuration options for the development transport.
 */
export type DevTransportConfig = {
  /** The locale used for formatting the timestamp. Defaults to the system locale. */
  locale?: string
  /** Standard Intl.DateTimeFormatOptions to customize the timestamp output. */
  timeOptions?: Intl.DateTimeFormatOptions
}

/**
 * Creates a built-in transport optimized for local development.
 * Emits colored, human-readable strings to stdout/stderr.
 *
 * @param config Optional configuration for the transport, like timestamp formats.
 * @returns A `TransportFn` that writes to the console.
 */
export const createDevTransport = (config: DevTransportConfig = {}): TransportFn => {
  // Bake settings once at transport creation time
  const locale = config.locale ?? undefined // undefined = system locale
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    ...(config.timeOptions || {}),
  }

  const transport: TransportFn = (level, context, msg, data, opts) => {
    const now = new Date()

    // Build timestamp using closed-over locale settings
    const timestamp = now.toLocaleTimeString(locale, timeOpts)

    // 1. Render context badges
    const contextStr = context.map(ctx => {
      const key = ctx.options?.omitKey ? '' : `${ctx.key}:`
      const content = `${key}${ctx.value}`
      return colorize(`[${content}]`, ctx.options.colorIndex)
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
    const parts = [
      dim(`[${timestamp}]`),
      contextStr,
      level === 'error'
        ? colorizeLevel('error', `[ERROR] ${msg}`)
        : level === 'warn'
          ? colorizeLevel('warn', `[WARN] ${msg}`)
          : `${msg}`,
      dataStr
    ]

    let finalLine = parts.filter(Boolean).join(' ') + '\n'
    if (level === 'debug') {
      // Re-enable dim after every \x1b[0m reset inside the line,
      // otherwise inner resets (from colorize, dim timestamp) kill the outer dim
      finalLine = `\x1b[2m${finalLine.replace(/\x1b\[0m/g, '\x1b[0m\x1b[2m')}\x1b[0m`
    }

    if (level === 'error') process.stderr.write(finalLine)
    else process.stdout.write(finalLine)
  }

  return transport
}

// --- PROD Transport (JSON) ---

const safeStringify = (obj: unknown): string => {
  try {
    return JSON.stringify(obj)
  } catch {
    return inspect(obj)
  }
}

const wrapToError = (obj: unknown): Error => {
  if (obj instanceof Error) return obj
  return new Error(
    (typeof obj === 'object' && obj !== null) ? safeStringify(obj) : String(obj)
  )
}

// Serialize an error-like value to a plain object
const serializeError = (_err: unknown) => {
  const err = wrapToError(_err)
  return {
    message: err.message,
    stack: err.stack,
    name: err.name,
    ...(err as any)
  }
}

/**
 * Builds a structured log record object from log call arguments.
 */
const buildRecord = (
  level: LogLevel,
  context: ContextItemWithOptions[],
  msg: string | Error | unknown,
  data?: Error | unknown
): Record<string, unknown> => {
  const contextObj = context.reduce((acc, item) => {
    acc[item.key] = item.value
    return acc
  }, {} as Record<string, unknown>)

  const logRecord: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    ...contextObj,
  }

  if (level === 'error') {
    const message = typeof msg === 'string'
      ? msg
      : (
        msg instanceof Error
          ? msg.message
          : (typeof msg === 'object' && msg !== null)
            ? safeStringify(msg)
            : String(msg)
      )

    logRecord.message = message

    if (data instanceof Error) {
      logRecord.error = serializeError(data)
    } else if (msg instanceof Error) {
      logRecord.error = serializeError(msg)
      if (data !== undefined) logRecord.data = data
    } else {
      logRecord.error = serializeError(msg)
      if (data !== undefined) logRecord.data = data
    }
  } else {
    logRecord.message = (typeof msg === 'object' && msg !== null) ? safeStringify(msg) : String(msg)
    if (data !== undefined) {
      logRecord.data = data instanceof Error ? serializeError(data) : data
    }
  }

  return logRecord
}

/**
 * Configuration for the JSON transport.
 */
export type JsonTransportConfig = {
  /** 
   * Enable asynchronous/buffered output. 
   * When true, logs are queued and written when the stream is ready (handling backpressure).
   */
  async?: boolean
  /** Maximum number of log lines to buffer when async is enabled. Defaults to 1000. */
  maxQueueSize?: number
}

/**
 * Creates a built-in transport optimized for production.
 * Emits strictly structured NDJSON (Newline Delimited JSON) to stdout.
 *
 * @param config Optional configuration for async and buffering behavior.
 * @returns A `TransportFn` that writes JSON to standard output.
 */
export const createJsonTransport = (config: JsonTransportConfig = {}): TransportFn => {
  const queue: string[] = []
  const maxQueueSize = config.maxQueueSize ?? 1000
  let isDraining = false

  const flush = () => {
    if (queue.length === 0 || isDraining) return

    while (queue.length > 0) {
      const line = queue[0]
      const ok = process.stdout.write(line)

      if (!ok) {
        isDraining = true
        process.stdout.once('drain', () => {
          isDraining = false
          flush()
        })
        return
      }
      queue.shift()
    }
  }

  const flushSync = () => {
    while (queue.length > 0) {
      const line = queue.shift()
      if (line) {
        try {
          fs.writeSync(1, line)
        } catch { /* ignore if stdout is closed */ }
      }
    }
  }

  // Ensure any buffered logs are written before the process exits.
  if (config.async) {
    process.on('beforeExit', flushSync)
    process.on('exit', flushSync)
    // Also try to flush on common signals
    process.on('SIGINT', () => { flushSync(); process.exit(0) })
    process.on('SIGTERM', () => { flushSync(); process.exit(0) })
  }

  return (level, context, msg, data) => {
    const record = buildRecord(level, context, msg, data)
    let line: string

    try {
      line = JSON.stringify(record) + '\n'
    } catch {
      // Fallback for circular structures
      if (record.data) record.data = inspect(record.data)
      try {
        line = JSON.stringify(record) + '\n'
      } catch {
        line = JSON.stringify({
          timestamp: record.timestamp,
          level,
          message: record.message,
          error: 'Failed to serialize log record'
        }) + '\n'
      }
    }

    if (!config.async) {
      process.stdout.write(line)
      return
    }

    queue.push(line)
    if (queue.length > maxQueueSize) {
      queue.shift() // Drop oldest logs if queue is too large
    }
    flush()
  }
}
