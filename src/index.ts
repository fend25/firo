import {
  ContextExtension,
  ContextItem, ContextItemWithOptions,
  ContextValue,
  getColorIndex,
  LOG_LEVELS,
  LogLevel,
  LogOptions,
  TransportFn
} from './utils.ts'
import {createDevTransport, DevTransportConfig} from './transport_dev.ts'
import {createProdTransport, ProdTransportConfig} from './transport_prod.ts'

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
  devTransportConfig?: DevTransportConfig
  /** Options for the built-in prod transport (e.g. timestamp format). */
  prodTransportConfig?: ProdTransportConfig
  /** Use the full extended color palette (30 colors including 256-color) for auto-assigned context badges. Defaults to true. Set to false to restrict to 10 terminal-safe colors. */
  useAllColors?: boolean
}

/**
 * The logger instance returned by `createFiro`.
 * It is a callable object: calling `log(msg)` is shorthand for `log.info(msg)`.
 */
export interface Firo {
  /** Shorthand for log.info() */
  (msg: string, data?: unknown, opts?: LogOptions): void

  /** Log a debug message (dimmed in dev mode). */
  debug: (msg: string, data?: unknown, opts?: LogOptions) => void
  /** Log an informational message. */
  info: (msg: string, data?: unknown, opts?: LogOptions) => void
  /** Log a warning message. */
  warn: (msg: string, data?: unknown, opts?: LogOptions) => void

  // Overload signatures for error
  /** Log an error object directly. */
  error(err: Error | unknown): void

  /** Log an error object with additional data. */
  error(err: Error, data?: unknown, opts?: LogOptions): void

  /** Log a message alongside an error or custom data object. */
  error(msg: string, err?: Error | unknown, opts?: LogOptions): void

  /**
   * Create a scoped child logger that inherits the current logger's context.
   * @param ctx An object containing key-value pairs to add to the child logger's context.
   */
  child: (ctx: Record<string, ContextValue | ContextExtension>) => Firo

  /** Add a context entry by key and value. */
  addContext(key: string, value: ContextValue | ContextExtension): void

  /** Add a context entry using the object form. */
  addContext(item: ContextItem): void

  /** Remove a context entry by its key. */
  removeFromContext(key: string): void

  /** Return the current context array attached to this logger instance. */
  getContext(): ContextItem[]

  /** Check if a context key exists in the current logger instance. */
  hasInContext(key: string): boolean
}

export type { DevTransportConfig } from './transport_dev.ts'
export type { ProdTransportConfig, TimestampFormat } from './transport_prod.ts'
export type {LogLevel, ContextValue, ContextOptions, ContextExtension, ContextItem, ContextItemWithOptions, LogOptions, TransportFn} from './utils.ts'
export { FIRO_COLORS } from './utils.ts'
export {createDevTransport} from './transport_dev.ts'
export {createProdTransport} from './transport_prod.ts'

export * as FiroUtils from './utils.ts'

/**
 * Creates a new logger instance with the specified configuration.
 *
 * @param config Optional configuration for log levels, mode, and transports.
 * @returns A fully configured `Firo` instance.
 */
export const createFiro = (config: LoggerConfig = {}, parentContext: ContextItem[] = []): Firo => {
  const useAllColors = config.useAllColors ?? true
  const fill = (item: ContextItem): ContextItemWithOptions => ({
    ...item,
    colorIndex: (typeof item.colorIndex === 'number')
      ? item.colorIndex
      : getColorIndex(item.key, useAllColors),
    color: item.color,
    omitKey: item.omitKey ?? false,
  })

  const appendContextWithInvokeContext = (
    context: ContextItemWithOptions[],
    invokeContext?: ContextItem[]
  ): ContextItemWithOptions[] => {
    if (!invokeContext || invokeContext.length === 0) return context
    return [...context, ...invokeContext.map(fill)]
  }

  // Mutable context array for this instance.
  // We copy the parent context so mutations here do not affect the parent.
  const context: ContextItemWithOptions[] = [...parentContext.map(fill)]

  // Resolve transport once at creation time
  const transport: TransportFn = config.transport
    ?? (config.mode === 'prod' ? createProdTransport(config.prodTransportConfig) : createDevTransport(config.devTransportConfig))

  const minLevelName: LogLevel | undefined = config.mode === 'prod'
    ? config.minLevelInProd ?? config.minLevel
    : config.minLevelInDev ?? config.minLevel
  const minLevel = LOG_LEVELS[minLevelName ?? 'debug']

  const getContext = () => context
  const hasInContext = (key: string) => context.some(ctx => ctx.key === key)

  const addContext = (key: string | ContextItem, value?: ContextValue | ContextExtension) => {
    let item: ContextItem
    if (typeof key === 'string') {
      if (value !== null && value !== undefined && typeof value === 'object') {
        const { value: extValue, ...opts } = value as ContextExtension
        item = {key, value: extValue, ...opts}
      } else {
        item = {key, value: value as ContextValue}
      }
    } else {
      item = key
    }
    context.push(fill(item))
  }
  const removeKeyFromContext = (key: string) => {
    const index = context.findIndex(ctx => ctx.key === key)
    if (index !== -1) context.splice(index, 1)
  }

  const child = (ctx: Record<string, ContextValue | ContextExtension>): Firo => {
    const newItems: ContextItem[] = Object.entries(ctx).map(([key, value]) => {
      if (value !== null && value !== undefined && typeof value === 'object') {
        const { value: extValue, ...opts } = value as ContextExtension
        return {key, value: extValue, ...opts}
      }
      return {key, value: value as ContextValue, colorIndex: getColorIndex(key, useAllColors)}
    })

    // Pass current context snapshot + new items.
    // Reuse the same transport instance to avoid recreating it.
    return createFiro({transport, minLevel: minLevelName, useAllColors}, [...context, ...newItems])
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

  // error implementation accepts a union type; Firo overloads expose a clean API to callers
  const error = (msgOrError: string | Error | unknown, err?: Error | unknown, opts?: LogOptions) => {
    if (minLevel > LOG_LEVELS.error) return
    transport('error', appendContextWithInvokeContext(context, opts?.ctx), msgOrError as any, err, opts)
  }

  const logInstance = ((msg: string, data?: unknown, opts?: LogOptions) => {
    info(msg, data, opts)
  }) as Firo

  return Object.assign(logInstance, {
    debug,
    info,
    warn,
    error,
    child,
    addContext,
    getContext,
    hasInContext,
    removeFromContext: removeKeyFromContext,
  })
}
