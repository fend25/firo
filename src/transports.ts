import {inspect} from 'node:util'
import {colorize, colorizeLevel, dim, TransportFn} from './utils.ts'

// --- DEV Transport Factory ---

export type DevTransportConfig = {
  locale?: string
  timeOptions?: Intl.DateTimeFormatOptions
}

export const createDevTransport = (config: DevTransportConfig = {}): TransportFn => {
  // "Запекаем" настройки один раз при создании транспорта
  const locale = config.locale ?? undefined // undefined = системная локаль
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...(config.timeOptions || {}),
  }

  // Возвращаем саму функцию транспорта (TransportFn)
  const transport: TransportFn = (level, context, msg, data, opts) => {
    const now = new Date()

    // Формируем время. toLocaleTimeString использует настройки из замыкания
    const timeString = now.toLocaleTimeString(locale, timeOpts)
    const ms = String(now.getMilliseconds()).padStart(3, '0')
    const timestamp = `${timeString}.${ms}`

    // 1. Собираем контекст в радугу
    const contextStr = context.map(ctx => {
      const key = ctx.options?.omitKey ? '' : `${ctx.key}:`
      const content = `${key}${ctx.value}`
      return colorize(`[${content}]`, ctx.options.colorIndex)
    }).join(' ')

    // 2. Форматируем Payload
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

    // 3. Собираем строку
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

    // Пишем
    if (level === 'error') process.stderr.write(finalLine)
    else process.stdout.write(finalLine)
  }

  return transport
}

// --- PROD Transport (JSON) ---

// Для JSON фабрика обычно не нужна (там ISO время),
// но для единообразия API можно тоже сделать createJsonTransport,
// если вдруг захотим "запекать" туда статические поля (версию app, env и т.д.)

const wrapToError = (obj: unknown): Error => {
  if (obj instanceof Error) return obj
  return new Error(
    (typeof obj === 'object' && obj !== null) ? JSON.stringify(obj) : String(obj)
  )
}

// Хелпер для правильной сериализации ошибки
const serializeError = (_err: unknown) => {
  const err = wrapToError(_err)
  return {
    message: err.message,
    stack: err.stack,
    name: err.name,
    ...(err as any)
  }
}

export const createJsonTransport = (): TransportFn => (level, context, msg: string | Error | unknown, data?) => {
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
            ? JSON.stringify(msg)
            : String(msg)
      )
    const error = data instanceof Error || (typeof data === 'object' && data !== null)
      ? serializeError(data)
      : serializeError(msg)

    logRecord.message = message
    logRecord.error = error
  } else {
    logRecord.message = String(msg)
    logRecord.data = data
  }

  process.stdout.write(JSON.stringify(logRecord) + '\n')
}
