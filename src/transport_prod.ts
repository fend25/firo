import {inspect} from 'node:util'
import process from 'node:process'
import {ContextItemWithOptions, LogLevel, TransportFn, extractMessage, jsonReplacer, serializeError} from './utils.ts'

export type TimestampFormat = 'iso' | 'epoch'

export type ProdTransportConfig = {
  /** Timestamp format: 'iso' (default) for ISO 8601 string, 'epoch' for ms since Unix epoch. */
  timestamp?: TimestampFormat
  /** Output destination. Any object with a `.write(string)` method. Defaults to `process.stdout`. */
  dest?: { write(s: string): unknown }
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
  const logRecord: Record<string, unknown> = {
    timestamp: getTimestamp(),
    level,
  }

  // Flatten context directly — no intermediate object or spread
  for (let i = 0, len = context.length; i < len; i++) {
    logRecord[context[i].key] = context[i].value
  }

  logRecord.message = extractMessage(msg)

  if (level === 'error') {
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
    if (msg instanceof Error) {
      logRecord.error = serializeError(msg)
    }
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
  const dest = config.dest ?? process.stdout

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

    dest.write(line)
  }
}
