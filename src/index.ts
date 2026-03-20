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

export type LoggerConfig = {
  minLevel?: LogLevel
  minLevelInDev?: LogLevel
  minLevelInProd?: LogLevel
  mode?: 'dev' | 'prod'
  transport?: TransportFn // Custom transport override
  devTransportConfig?: DevTransportConfig // Options for the dev transport
}

export interface ILogger {
  debug: (msg: string, data?: unknown, opts?: LogOptions) => void
  info: (msg: string, data?: unknown, opts?: LogOptions) => void
  warn: (msg: string, data?: unknown, opts?: LogOptions) => void

  // Overload signatures for error
  error(err: Error | unknown): void

  error(msg: string, err?: Error | unknown, opts?: LogOptions): void

  child: (ctx: Record<string, ContextValue>) => ILogger

  addContext(key: string, value: ContextValue, opts?: ContextOptions): void

  addContext(item: ContextItem): void

  removeFromContext(key: string): void

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

export const createLogger = (config: LoggerConfig = {}, parentContext: ContextItem[] = []): ILogger => {
  // Mutable context array for this instance.
  // We copy the parent context so mutations here do not affect the parent.
  const context: ContextItemWithOptions[] = [...parentContext.map(fillContextItem)]

  // Resolve transport once at creation time
  const transport: TransportFn = config.transport
    ?? (config.mode === 'prod' ? createJsonTransport() : createDevTransport())

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
