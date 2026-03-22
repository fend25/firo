import {inspect} from 'node:util'
import process from 'node:process'
import {ContextItemWithOptions, LogLevel, TransportFn, jsonReplacer, safeStringify, serializeError} from './utils.ts'

export type TimestampFormat = 'iso' | 'epoch'

export type ProdTransportConfig = {
  /** Timestamp format: 'iso' (default) for ISO 8601 string, 'epoch' for ms since Unix epoch. */
  timestamp?: TimestampFormat
}

/**
 * Builds a structured log record object from log call arguments.
 */
const buildRecord = (
  level: LogLevel,
  context: ContextItemWithOptions[],
  msg: string | Error | unknown,
  getTimestamp: () => string | number,
  data?: Error | unknown,
): Record<string, unknown> => {
  const contextObj = context.reduce((acc, item) => {
    acc[item.key] = item.value
    return acc
  }, {} as Record<string, unknown>)

  const logRecord: Record<string, unknown> = {
    timestamp: getTimestamp(),
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
 * Creates a built-in transport optimized for production.
 * Emits strictly structured NDJSON (Newline Delimited JSON) to stdout.
 *
 * @returns A `TransportFn` that writes JSON to standard output.
 */
export const createProdTransport = (config: ProdTransportConfig = {}): TransportFn => {
  const getTimestamp = config.timestamp === 'epoch'
    ? () => Date.now()
    : () => new Date().toISOString()

  return (level, context, msg, data) => {
    const record = buildRecord(level, context, msg, getTimestamp, data)
    let line: string

    try {
      line = JSON.stringify(record, jsonReplacer) + '\n'
    } catch {
      // Fallback for circular structures
      if (record.data) record.data = inspect(record.data)
      try {
        line = JSON.stringify(record, jsonReplacer) + '\n'
      } catch {
        line = JSON.stringify({
          timestamp: record.timestamp,
          level,
          message: record.message,
          error: 'Failed to serialize log record'
        }) + '\n'
      }
    }

    process.stdout.write(line)
  }
}
