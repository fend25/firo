import {createLogger} from './dist'

// 1. Create logger (dev mode by default)
const log = createLogger({ mode: 'dev' })

// 2. Simple log
log.info('Server started')

// 3. Add global context (mutation)
log.addContext('service', 'auth')
log.info('Connected to DB')
log.debug('Connected to DB - dimmed')
log.debug('Connected to DB - dimmed', {ctx: [{key: 'debugInfo', value: 'connection pool established', options: {colorIndex: 2}}]})

// 4. Create child logger (inherits parent context)
const userLog = log.child({ requestId: 123, ip: '127.0.0.1' })
userLog.info('Incoming request')

// 5. Log with data (compact by default)
const complexObj = {
  headers: { host: 'localhost', 'user-agent': 'curl' },
  body: { foo: 'bar', nested: { a: 1, b: 2 } }
}
userLog.info('Request details', complexObj, {
  ctx: [{ key: 'userId', value: 'user-789', options: { omitKey: true } }]
})

// 6. Log with data (pretty-printed)
userLog.info('Full dump for debug', complexObj, { pretty: true })

// 7. Error logging
try {
  throw new Error('Database went away')
} catch (err) {
  // All three error() call signatures
  console.log()
  userLog.error('Failed to fetch user')
  userLog.error('Failed to fetch user', err)
  console.log()
  userLog.error(err)
  console.log()
  userLog.error(123)
}

// 8. Context rainbow — deeply nested children
const deepLog = userLog.child({ module: 'billing' }).child({ txId: 999 })
deepLog.info('Transaction processed')
// Output: [service:auth] [requestId:123] [ip:...] [module:billing] [txId:999] Transaction processed
