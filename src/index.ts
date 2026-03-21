import {
  ContextItem, ContextItemWithOptions,
  ContextOptions,
  ContextValue,
  getColorIndex,
  LOG_LEVELS,
  LogLevel,
  LogOptions,
  TransportFn
} from './utils.ts'
import {createDevTransport, createJsonTransport, DevTransportConfig} from './transports.ts'

/**
 * Configuration options for creating a logger instance.
 */
export type LoggerConfig = {
  /** The minimum log level for both modes. Overridden by mode-specific thresholds. */
  minLevel?: LogLevel
  /** Minimum log level to emit in 'dev' mode. */
  minLevelInDev?: LogLevel
  /** Minimum log level to emit in 'prod' mode. */
  minLevelInProd?: LogLevel
  /** Specifies the built-in transport to use. Defaults to 'dev'. */
  mode?: 'dev' | 'prod'
  /** Provide a custom transport function to override the built-in behaviors. */
  transport?: TransportFn // Custom transport override
  /** Options for fine-tuning the built-in development transport (e.g. timestamp format). */
  devTransportConfig?: DevTransportConfig // Options for the dev transport
}

/**
 * The logger instance returned by `createLogger`.
 */
export interface ILogger {
  /** Log a debug message (dimmed in dev mode). */
  debug: (msg: string, data?: unknown, opts?: LogOptions) => void
  /** Log an informational message. */
  info: (msg: string, data?: unknown, opts?: LogOptions) => void
  /** Log a warning message. */
  warn: (msg: string, data?: unknown, opts?: LogOptions) => void

  // Overload signatures for error
  /** Log an error object directly. */
  error(err: Error | unknown): void

  /** Log a message alongside an error or custom data object. */
  error(msg: string, err?: Error | unknown, opts?: LogOptions): void

  /**
   * Create a scoped child logger that inherits the current logger's context.
   * @param ctx An object containing key-value pairs to add to the child logger's context.
   */
  child: (ctx: Record<string, ContextValue>) => ILogger

  /** Add a context entry by key and value. */
  addContext(key: string, value: ContextValue, opts?: ContextOptions): void

  /** Add a context entry using the object form. */
  addContext(item: ContextItem): void

  /** Remove a context entry by its key. */
  removeFromContext(key: string): void

  /** Return the current context array attached to this logger instance. */
  getContext(): ContextItem[]
}

const fillContextItem = (item: ContextItem): ContextItemWithOptions => {
  return {
    ...item,
    options: {
      colorIndex: (item.options && typeof item.options.colorIndex === 'number')
        ? item.options.colorIndex
        : getColorIndex(item.key),
      omitKey: item.options?.omitKey ?? false,
    }
  }
}

const appendContextWithInvokeContext = (
  context: ContextItemWithOptions[],
  invokeContext?: ContextItem[]
): ContextItemWithOptions[] => {
  if (!invokeContext || invokeContext.length === 0) return context
  return [...context, ...invokeContext?.map(fillContextItem)]
}

export { createDevTransport, createJsonTransport } from './transports.ts'
export type { DevTransportConfig } from './transports.ts'
export type { LogLevel, ContextValue, ContextOptions, ContextItem, ContextItemWithOptions, LogOptions, TransportFn } from './utils.ts'

/**
 * Creates a new logger instance with the specified configuration.
 *
 * @param config Optional configuration for log levels, mode, and transports.
 * @param parentContext Internal parameter used when creating child loggers.
 * @returns A fully configured `ILogger` instance.
 */
export const createLogger = (config: LoggerConfig = {}, parentContext: ContextItem[] = []): ILogger => {
  // Mutable context array for this instance.
  // We copy the parent context so mutations here do not affect the parent.
  const context: ContextItemWithOptions[] = [...parentContext.map(fillContextItem)]

  // Resolve transport once at creation time
  const transport: TransportFn = config.transport
    ?? (config.mode === 'prod' ? createJsonTransport() : createDevTransport(config.devTransportConfig))

  const minLevelName: LogLevel | undefined = config.mode === 'prod'
    ? config.minLevelInProd ?? config.minLevel
    : config.minLevelInDev ?? config.minLevel
  const minLevel = LOG_LEVELS[minLevelName ?? 'debug']

  const getContext = () => context

  const addContext = (key: string | ContextItem, value?: ContextValue, options?: ContextOptions) => {
    let item = (typeof key === 'string') ? {key, value, options} : key
    context.push(fillContextItem(item))
  }
  const removeKeyFromContext = (key: string) => {
    const index = context.findIndex(ctx => ctx.key === key)
    if (index !== -1) context.splice(index, 1)
  }

  const child = (ctx: Record<string, ContextValue>): ILogger => {
    const newItems: ContextItem[] = Object.entries(ctx).map(([key, value]) => ({
      key,
      value,
      options: { colorIndex: getColorIndex(key) }
    }))

    // Pass current context snapshot + new items.
    // Reuse the same transport instance to avoid recreating it.
    return createLogger({transport, minLevel: minLevelName}, [...context, ...newItems])
  }

  const debug = (msg: string, data?: unknown, opts?: LogOptions) => {
    if (minLevel > LOG_LEVELS.debug) return
    transport('debug', appendContextWithInvokeContext(context, opts?.ctx), msg, data, opts)
  }
  const info = (msg: string, data?: unknown, opts?: LogOptions) => {
    if (minLevel > LOG_LEVELS.info) return
    transport('info', appendContextWithInvokeContext(context, opts?.ctx), msg, data, opts)
  }
  const warn = (msg: string, data?: unknown, opts?: LogOptions) => {
    if (minLevel > LOG_LEVELS.warn) return
    transport('warn', appendContextWithInvokeContext(context, opts?.ctx), msg, data, opts)
  }

  // error implementation accepts a union type; ILogger overloads expose a clean API to callers
  const error = (msgOrError: string | Error | unknown, err?: Error | unknown, opts?: LogOptions) => {
    if (minLevel > LOG_LEVELS.error) return
    transport('error', appendContextWithInvokeContext(context, opts?.ctx), msgOrError as any, err, opts)
  }

  return {
    debug,
    info,
    warn,
    error,
    child,
    addContext,
    getContext,
    removeFromContext: removeKeyFromContext,
  } satisfies ILogger
}
