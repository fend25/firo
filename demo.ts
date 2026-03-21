import {createLogger} from './src'

// 1. Create logger (dev mode by default)
const log = createLogger({ mode: 'dev' })
const prod = createLogger({mode: 'prod'})

// 2. Simple log
log.info('Server started')

// 3. Add global context (mutation)
log.addContext('service', 'auth')
log.info('Connected to DB')

log.debug('Connected to DB - dimmed', {}, {ctx: [{key: 'user', value: 42}]})
prod.debug('Connected to DB - dimmed', {}, {ctx: [{key: 'user', value: 42}]})
prod.debug('Connected to DB - dimmed', {}, {ctx: [{key: 'user', value: 42}]})

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

// 6.1. Warnings (Yellow!)
console.log()
log.warn('High disk usage detected', { used: '85%', partition: '/var/log' })
userLog.warn('Rate limit approaching', { remaining: 5, reset: '30s' })
console.log()

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

// 9.1. Circular structures
const circularObj: any = {status: 'failed'}
circularObj.self = circularObj // Create circular reference

log.info('This circular object would crash JSON.stringify:', circularObj)
log.error('This circular object would crash JSON.stringify:', circularObj)
prod.error('Prod gracefully stringifies circular refs too:', circularObj)

// 9.2. Prod error with data
prod.error('Payment failed', new Error('timeout'), {
  ctx: [{key: 'txId', value: 'tx-999'}]
})
prod.error('Data without error object', {userId: 42, reason: 'banned'})

// 9.3. Out of bounds color index (safely wraps around)
log.info('Safe colors', undefined, {
  ctx: [
    {key: 'index10', value: 'wraps', options: {colorIndex: 10}},
    {key: 'index99', value: 'safe', options: {colorIndex: 99}}
  ]
})

// 9.4. Custom time formatting
const customLog = createLogger({
  mode: 'dev',
  devTransportConfig: {
    timeOptions: {hour: '2-digit', minute: '2-digit', second: undefined, fractionalSecondDigits: undefined}
  }
})
customLog.info('Custom time format (HH:MM)')
