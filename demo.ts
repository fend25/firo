import {createLogger} from './src'

const log = createLogger()

// 1. Start with a clean system message
log.info('firo 🌲 initialized', {version: '0.1.0', mode: 'dev'})

// 2. Global context (different colors for keys)
log.addContext('service', 'auth-api')
log.addContext('worker', 'primary')

// 3. Dimmed debug (visual hierarchy)
log.debug('Reading configuration...', {source: 'env', items: 12})

// 4. Child logger with request-specific context
const reqLog = log.child({reqId: 'a7b8', user: 'firo'})

// 5. Callable shorthand (log() instead of log.info())
reqLog('Processing incoming request', {method: 'POST', path: '/v1/upload'})

// 6. Vibrant Warning
reqLog.warn('Heavy payload detected', {size: '4.2MB', limit: '5.0MB'})

// 7. Sharp Error with stack trace
const error = new Error('Disk quota exceeded')
reqLog.error('File upload failed', error)

// 8. Closing log
log.info('Service remains healthy')

console.log('\n')