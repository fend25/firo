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
  transport?: TransportFn // Можно передать кастомный транспорт
  devTransportConfig?: DevTransportConfig // Опции для dev транспорта
}

export interface ILogger {
  debug: (msg: string, data?: unknown, opts?: LogOptions) => void
  info: (msg: string, data?: unknown, opts?: LogOptions) => void
  warn: (msg: string, data?: unknown, opts?: LogOptions) => void

  // Сигнатуры перегрузки для error
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
  // Мутабельный массив контекста данного инстанса.
  // Мы копируем родительский контекст, чтобы изменения здесь не ломали родителя.
  const context: ContextItemWithOptions[] = [...parentContext.map(fillContextItem)]

  // Резолвим транспорт один раз при создании
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

  // Рекурсивное создание ребенка
  const child = (ctx: Record<string, ContextValue>): ILogger => {
    const newItems = Object.entries(ctx).map(([key, value]) => ({
      key,
      value,
      colorIndex: getColorIndex(key)
    }))

    // Важно: передаем текущий context + новые айтемы.
    // Передаем тот же transport, чтобы не пересоздавать его.
    return createLogger({transport}, [...context, ...newItems])
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

  // Реализация error (принимает union types, а интерфейс ILogger разруливает типы для юзера)
  const error = (msgOrError: string | Error | unknown, err?: Error | unknown) => {
    if (minLevel > LOG_LEVELS.error) return
    transport('error', context, msgOrError as any, err)
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
