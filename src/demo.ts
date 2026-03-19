import { createLogger } from './index.ts'

// 1. Инициализация (по дефолту dev)
const log = createLogger({ mode: 'dev' })

// 2. Простой лог
log.info('Server started')

// 3. Добавляем глобальный контекст (мутация)
log.addContext('service', 'auth')
log.info('Connected to DB')

// 4. Создаем child (наследование)
const userLog = log.child({ requestId: 123, ip: '127.0.0.1' })
userLog.info('Incoming request')

// 5. Лог с данными (compact по дефолту)
const complexObj = {
  headers: { host: 'localhost', 'user-agent': 'curl' },
  body: { foo: 'bar', nested: { a: 1, b: 2 } }
}
userLog.info('Request details', complexObj, {
  ctx: [{ key: 'userId', value: 'user-789', options: { omitKey: true } }]
})

// 6. Лог с данными (pretty)
userLog.info('Full dump for debug', complexObj, { pretty: true })

// 7. Ошибка
try {
  throw new Error('Database went away')
} catch (err) {
  // Строгий режим: сообщение + объект с ошибкой
  console.log()
  userLog.error('Failed to fetch user')
  userLog.error('Failed to fetch user', err)
  console.log()
  userLog.error(err)
  console.log()
  userLog.error(123)
}

// 8. Пример "Радуги" контекста
const deepLog = userLog.child({ module: 'billing' }).child({ txId: 999 })
deepLog.info('Transaction processed')
// Вывод будет: [service:auth] [requestId:123] [ip:...] [module:billing] [txId:999]: Transaction processed
