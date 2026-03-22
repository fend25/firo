import {createFiro, type Firo, FIRO_COLORS} from './src'


const mainWithColors = (log: Firo) => {
    // 1. Start with a clean system message
    log.info('firo 🌲 initialized', {version: '0.1.0', mode: 'dev'})

    // 2. Global context (different colors for keys)
    log.addContext('service', 'auth-api')
    log.addContext('region', {value: 'west', color: '38;5;214'})  // 256-color orange
    log.addContext('worker', {value: 'primary', color: FIRO_COLORS.pink}) // named color pink
    log.addContext('color2', {value: 'lilac', color: FIRO_COLORS.lilac, omitKey: true}) // named color lilac
    log.addContext('color3', {value: 'pistachio', color: FIRO_COLORS.green, omitKey: true}) // named color pistachio

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
}


const main = (log: Firo) => {
    // 1. Start with a clean system message
    log.info('firo 🌲 initialized', {version: '0.1.0', mode: 'dev'})

    // 2. Global context (different colors for keys)
    log.addContext('service', 'auth')
    // log.addContext('region', 'west')
    // log.addContext('worker', 'primary', {color: FIRO_COLORS.pink}) // truecolor

    // 3. Dimmed debug (visual hierarchy)
    log.debug('Reading configuration...', {source: 'env', items: 12})

    // 4. Child logger with request-specific context
    const reqLog = log.child({reqId: 'a7b8', user: {value: 'firo'}})

    // 5. Callable shorthand (log() instead of log.info())
    reqLog('Processing incoming request', {method: 'POST', path: '/v1/upload'})
    reqLog('User resolved (expanded output)', {user: {id: 123, name: 'Firo'}}, {pretty: true})

    // 6. Vibrant Warning
    reqLog.warn('Heavy payload detected', {size: '4.2MB', limit: '5.0MB'})

    // 7. Sharp Error with stack trace
    const error = new Error('Disk quota exceeded')
    reqLog.error('File upload failed', error)

    // 8. Closing log
    log.info('Service remains healthy')
}

console.log('Beautiful colors in dev mode:\n')
main(createFiro())
console.log('\nAnd robust and boring NDJSON in production mode:\n')
main(createFiro({mode: 'prod'}))
console.log('\n')