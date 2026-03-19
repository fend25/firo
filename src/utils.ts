// --- Types ---

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export const LOG_LEVELS = {
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
} as const

export type ContextValue = string | number | boolean | null | undefined

export type ContextOptions = {
  colorIndex?: number
  omitKey?: boolean
}

export type ContextItem = {
  key: string
  value: ContextValue
  options?: ContextOptions
}
export type ContextItemWithOptions = ContextItem & { options: Required<ContextOptions> }

export type LogOptions = {
  pretty?: boolean // Включить multiline для data
  timeLocale?: string // Локаль для форматирования времени
  time12h?: boolean // 12-часовой формат времени
  ctx?: ContextItem[] // Дополнительный контекст для данного лога
}

export type TransportFn = (
  level: LogLevel,
  context: ContextItemWithOptions[],
  message: string | Error | unknown,
  data?: Error | unknown,
  options?: LogOptions
) => void

// --- Colors & formatting utils ---

const COLORS = [
  36, // Cyan
  32, // Green
  33, // Yellow
  35, // Magenta
  34, // Blue
  96, // Bright Cyan
  92, // Bright Green
  93, // Bright Yellow
  95, // Bright Magenta
  94, // Bright Blue
]

// Простой хэш строки в индекс цвета
export const getColorIndex = (str: string): number => {
  let hash = 0

  // Генерирует целочисленный хэш из строки.
  // Использует побитовый сдвиг для умножения на 31: (x << 5) - x === x * 31.
  // Это обеспечивает хорошее распределение значений для выбора цвета,
  // чтобы похожие строки (напр. "user-1", "user-2") получали разные индексы.
  str.split('').forEach(char => {
    hash = char.charCodeAt(0) + ((hash << 5) - hash)
  })
  return Math.abs(hash % COLORS.length)
}

// Обертка в цвет ANSI
export const colorize = (text: string, colorIndex: number): string => `\x1b[${COLORS[colorIndex]}m${text}\x1b[0m`

// Раскрашивание уровня (ошибки красным, остальное без изменений)
export const colorizeLevel = (level: LogLevel, text: string): string => {
  if (level === 'info') return text

  switch (level) {
    case 'error':
      return `\x1b[31m${text}\x1b[0m` // Red
    case 'warn':
      return `\x1b[33m${text}\x1b[0m` // Yellow
    case 'debug':
      // return `\x1b[36m${text}\x1b[0m` // Cyan
      return `\x1b[2m${text}\x1b[0m` // dimmed
    default:
      return text
  }
}

// Тусклый текст
export const dim = (text: string) => `\x1b[2m${text}\x1b[0m`
