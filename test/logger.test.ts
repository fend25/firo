import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createFiro} from '../src/index.ts'
import type {TransportFn, ContextItemWithOptions, LogLevel, LogOptions} from '../src/utils.ts'

// --- Helpers ---

type SpyCall = {level: LogLevel; context: ContextItemWithOptions[]; msg: unknown; data: unknown; opts?: LogOptions}

function createSpyTransport() {
  const calls: SpyCall[] = []
  const fn: TransportFn = (level, context, msg, data, opts) => {
    calls.push({level, context: [...context], msg, data, opts})
  }
  return {fn, calls}
}

function captureOutput(fn: () => void): {stdout: string; stderr: string} {
  let stdout = ''
  let stderr = ''
  const origOut = process.stdout.write
  const origErr = process.stderr.write
  process.stdout.write = ((chunk: unknown) => {stdout += String(chunk); return true}) as typeof process.stdout.write
  process.stderr.write = ((chunk: unknown) => {stderr += String(chunk); return true}) as typeof process.stderr.write
  try {
    fn()
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
  return {stdout, stderr}
}

// --- Log level filtering ---

test('default minLevel is debug — all levels pass through', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['debug', 'info', 'warn', 'error'])
})

test('minLevel: info — suppresses debug', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn, minLevel: 'info'})

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['info', 'warn', 'error'])
})

test('minLevel: error — only error passes', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn, minLevel: 'error'})

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['error'])
})

test('minLevelInDev overrides minLevel in dev mode', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn, mode: 'dev', minLevel: 'debug', minLevelInDev: 'warn'})

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['warn', 'error'])
})

test('minLevelInProd overrides minLevel in prod mode', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn, mode: 'prod', minLevel: 'debug', minLevelInProd: 'error'})

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['error'])
})

// --- Context ---

test('addContext — appears in transport calls', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.addContext('service', 'auth')
  log.info('test')

  assert.strictEqual(calls[0].context.length, 1)
  assert.strictEqual(calls[0].context[0].key, 'service')
  assert.strictEqual(calls[0].context[0].value, 'auth')
})

test('addContext — object form', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.addContext({key: 'env', value: 'prod', omitKey: true})
  log.info('test')

  assert.strictEqual(calls[0].context[0].key, 'env')
  assert.strictEqual(calls[0].context[0].omitKey, true)
})

test('addContext — explicit colorIndex is preserved', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.addContext({key: 'x', value: 'y', colorIndex: 7})
  log.info('test')

  assert.strictEqual(calls[0].context[0].colorIndex, 7)
})

test('addContext — custom color is preserved and used in output', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.addContext({key: 'trace', value: 'abc', color: '38;5;214'})
  log.info('test')

  assert.strictEqual(calls[0].context[0].color, '38;5;214')

  // Verify it renders with the custom color in dev transport
  const devLog = createFiro({mode: 'dev'})
  devLog.addContext({key: 'trace', value: 'abc', color: '38;5;214'})
  let stdout = ''
  const origWrite = process.stdout.write
  process.stdout.write = ((chunk: unknown) => {stdout += String(chunk); return true}) as typeof process.stdout.write
  try {
    devLog.info('test')
  } finally {
    process.stdout.write = origWrite
  }
  assert.ok(stdout.includes('\x1b[38;5;214m'), 'Should use custom 256-color code')
})

test('hasInContext — returns true for existing key', () => {
  const {fn} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.addContext('service', 'auth')

  assert.strictEqual(log.hasInContext('service'), true)
  assert.strictEqual(log.hasInContext('missing'), false)
})

test('removeFromContext — removes by key', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.addContext('a', '1')
  log.addContext('b', '2')
  log.removeFromContext('a')
  log.info('test')

  assert.strictEqual(calls[0].context.length, 1)
  assert.strictEqual(calls[0].context[0].key, 'b')
})

test('removeFromContext — non-existent key does not throw', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})
  log.removeFromContext('nope')
  log.info('test')
  assert.strictEqual(calls[0].context.length, 0)
})

test('getContext returns current context', () => {
  const {fn} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.addContext('a', '1')
  log.addContext('b', '2')

  const ctx = log.getContext()
  assert.strictEqual(ctx.length, 2)
  assert.strictEqual(ctx[0].key, 'a')
  assert.strictEqual(ctx[1].key, 'b')
})

// --- Per-call context ---

test('opts.ctx adds inline context for single call', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})
  log.addContext('service', 'auth')

  log.info('with ctx', undefined, {ctx: [{key: 'reqId', value: '42'}]})
  log.info('without ctx')

  assert.strictEqual(calls[0].context.length, 2) // service + reqId
  assert.strictEqual(calls[0].context[1].key, 'reqId')
  assert.strictEqual(calls[1].context.length, 1) // only service
})

test('opts.ctx works on error', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.error('boom', new Error('fail'), {ctx: [{key: 'op', value: 'delete'}]})

  assert.strictEqual(calls[0].context.length, 1)
  assert.strictEqual(calls[0].context[0].key, 'op')
})

// --- Child loggers ---

test('child inherits parent context', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})
  log.addContext('service', 'auth')

  const child = log.child({requestId: 123})
  child.info('test')

  assert.strictEqual(calls[0].context.length, 2)
  assert.strictEqual(calls[0].context[0].key, 'service')
  assert.strictEqual(calls[0].context[1].key, 'requestId')
  assert.strictEqual(calls[0].context[1].value, 123)
})

test('child context does not mutate parent', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})
  log.addContext('service', 'auth')

  const child = log.child({requestId: 123})
  child.addContext('extra', 'val')

  log.info('parent')
  child.info('child')

  assert.strictEqual(calls[0].context.length, 1) // parent: only service
  assert.strictEqual(calls[1].context.length, 3) // child: service + requestId + extra
})

test('parent mutation after child does not affect child', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})
  log.addContext('a', '1')

  const child = log.child({b: '2'})
  log.addContext('c', '3') // added to parent AFTER child creation

  child.info('test')

  assert.deepStrictEqual(calls[0].context.map(c => c.key), ['a', 'b']) // no 'c'
})

test('deeply nested children accumulate context', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  const deep = log.child({a: 1}).child({b: 2}).child({c: 3})
  deep.info('test')

  assert.deepStrictEqual(calls[0].context.map(c => c.key), ['a', 'b', 'c'])
})

test('child inherits minLevel', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn, minLevel: 'warn'})

  const child = log.child({x: 1})
  child.debug('d')
  child.info('i')
  child.warn('w')
  child.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['warn', 'error'])
})

// --- Error method ---

test('error(msg) — string only', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.error('something broke')

  assert.strictEqual(calls[0].level, 'error')
  assert.strictEqual(calls[0].msg, 'something broke')
  assert.strictEqual(calls[0].data, undefined)
})

test('error(msg, err) — string + Error', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})
  const err = new Error('db failed')

  log.error('query failed', err)

  assert.strictEqual(calls[0].msg, 'query failed')
  assert.strictEqual(calls[0].data, err)
})

test('error(err) — Error only', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})
  const err = new Error('boom')

  log.error(err)

  assert.strictEqual(calls[0].msg, err)
  assert.strictEqual(calls[0].data, undefined)
})

// --- Dev transport ---

test('dev transport — writes to stdout for info', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout, stderr} = captureOutput(() => log.info('hello'))

  assert.ok(stdout.includes('hello'))
  assert.strictEqual(stderr, '')
})

test('dev transport — writes to stderr for error', () => {
  const log = createFiro({mode: 'dev'})
  const {stderr} = captureOutput(() => log.error('bad'))

  assert.ok(stderr.includes('bad'))
})

test('dev transport — timestamp format HH:MM:SS.mmm', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(/\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(stdout), `No timestamp in: ${stdout}`)
})

test('dev transport — context rendered as [key:value]', () => {
  const log = createFiro({mode: 'dev'})
  log.addContext('svc', 'api')
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[svc:api]'))
})

test('dev transport — omitKey renders [value] only', () => {
  const log = createFiro({mode: 'dev'})
  log.addContext({key: 'userId', value: 'bob', omitKey: true})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[bob]'))
  assert.ok(!stdout.includes('[userId:bob]'))
})

test('dev transport — hideIn dev hides context badge', () => {
  const log = createFiro({mode: 'dev'})
  log.addContext('svc', 'api')
  log.addContext('traceId', {value: 'abc-123', hideIn: 'dev'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[svc:api]'))
  assert.ok(!stdout.includes('traceId'))
  assert.ok(!stdout.includes('abc-123'))
})

test('dev transport — hideIn prod still shows in dev', () => {
  const log = createFiro({mode: 'dev'})
  log.addContext('debugInfo', {value: 'xyz', hideIn: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[debugInfo:xyz]'))
})

test('dev transport — hideIn dev works with child context', () => {
  const log = createFiro({mode: 'dev'})
  const child = log.child({traceId: {value: 'trace-99', hideIn: 'dev'}})
  const {stdout} = captureOutput(() => child.info('test'))

  assert.ok(!stdout.includes('trace-99'))
})

test('dev transport — error has [ERROR] prefix', () => {
  const log = createFiro({mode: 'dev'})
  const {stderr} = captureOutput(() => log.error('oops'))

  assert.ok(stderr.includes('[ERROR]'))
})

test('dev transport — warn has [WARN] prefix', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.warn('careful'))

  assert.ok(stdout.includes('[WARN]'))
})

test('dev transport — debug lines are dimmed', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.debug('dim me'))

  // Message should be dimmed (\x1b[2m)
  assert.ok(stdout.includes('\x1b[2mdim me\x1b[0m'), 'debug message should be dimmed')
})

test('dev transport — data is serialized', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.info('req', {status: 200}))

  assert.ok(stdout.includes('status'))
  assert.ok(stdout.includes('200'))
})

test('dev transport — info with Error as data', () => {
  const log = createFiro({mode: 'dev'})
  const err = new Error('whoops')
  const {stdout} = captureOutput(() => log.info('something failed', err))

  assert.ok(stdout.includes('something failed'), 'Should output message')
  assert.ok(stdout.includes('Error: whoops'), 'Should output error')
  assert.ok(stdout.includes('at '), 'Should output stack trace')
})

test('dev transport — ends with newline', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.endsWith('\n'))
})

test('dev transport — handles circular structures without crashing', () => {
  const log = createFiro({mode: 'dev'})
  const obj: any = {a: 1}
  obj.self = obj // circular reference

  const {stderr} = captureOutput(() => {
    log.error('fail', obj)
    log.error(obj) // edge case where msg is the circular object
  })

  assert.ok(stderr.includes('[Circular *1]'))
})

test('dev transport — applies devTransportConfig time options', () => {
  const log = createFiro({
    mode: 'dev',
    devTransportConfig: {
      timeOptions: {hour: 'numeric', minute: undefined, second: undefined, fractionalSecondDigits: undefined}
    }
  })

  const {stdout} = captureOutput(() => log.info('test'))

  // E.g. [14] instead of [14:32:01.123]
  assert.match(stdout, /\[\d{1,2}\]/)
})

test('dev transport — stringifies object message instead of [object Object]', () => {
  const log = createFiro({mode: 'dev'})
  //@ts-expect-error — info() expects string, but we test runtime handling of objects
  const {stdout} = captureOutput(() => log.info({status: 'ok', count: 42}))

  assert.ok(!stdout.includes('[object Object]'), 'Should not output [object Object]')
  assert.ok(stdout.includes('status:'), 'Should output object properties')
  assert.ok(stdout.includes("'ok'"), 'Should output object values')
  assert.ok(stdout.includes('42'), 'Should output numeric values')
})

// --- Prod transport ---

test('prod transport — valid NDJSON', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('hello'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.level, 'info')
  assert.strictEqual(parsed.message, 'hello')
  assert.ok(parsed.timestamp)
})

test('prod transport — context flattened into record', () => {
  const log = createFiro({mode: 'prod'})
  log.addContext('service', 'api')
  log.addContext('env', 'prod')
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.service, 'api')
  assert.strictEqual(parsed.env, 'prod')
})

test('prod transport — hideIn prod hides context from JSON', () => {
  const log = createFiro({mode: 'prod'})
  log.addContext('service', 'api')
  log.addContext('debugInfo', {value: 'xyz', hideIn: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.service, 'api')
  assert.strictEqual(parsed.debugInfo, undefined)
})

test('prod transport — hideIn dev still shows in prod', () => {
  const log = createFiro({mode: 'prod'})
  log.addContext('traceId', {value: 'abc-123', hideIn: 'dev'})
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.traceId, 'abc-123')
})

test('prod transport — hideIn prod works with child context', () => {
  const log = createFiro({mode: 'prod'})
  const child = log.child({debugTag: {value: 'dbg', hideIn: 'prod'}})
  const {stdout} = captureOutput(() => child.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.debugTag, undefined)
})

test('prod transport — data field for non-error', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('req', {status: 200}))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.data.status, 200)
})

test('prod transport — error with msg + Error', () => {
  const log = createFiro({mode: 'prod'})
  const err = new Error('db down')
  const {stdout} = captureOutput(() => log.error('query failed', err))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.level, 'error')
  assert.strictEqual(parsed.message, 'query failed')
  assert.strictEqual(parsed.error.message, 'db down')
  assert.ok(parsed.error.stack)
})

test('prod transport — error writes to stdout (not stderr)', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout, stderr} = captureOutput(() => log.error('bad'))

  assert.ok(stdout.length > 0)
  assert.strictEqual(stderr, '')
})

test('prod transport — ends with newline', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.endsWith('\n'))
})

test('prod transport — handles circular structures without crashing', () => {
  const log = createFiro({mode: 'prod'})
  const obj: any = {a: 1}
  obj.self = obj

  const {stdout} = captureOutput(() => {
    log.error('fail', obj)
    log.info('info with circular', obj)
  })

  // We have 2 lines of JSON output, both should be parsed without issue
  const lines = stdout.trim().split('\n')
  assert.strictEqual(lines.length, 2)

  const parsedErr = JSON.parse(lines[0])
  assert.strictEqual(parsedErr.level, 'error')
  assert.ok(typeof parsedErr.data === 'string' && parsedErr.data.includes('[Circular *1]'))

  const parsedInfo = JSON.parse(lines[1])
  assert.strictEqual(parsedInfo.level, 'info')
  assert.ok(typeof parsedInfo.data === 'string' && parsedInfo.data.includes('[Circular *1]'))
})

test('prod transport — error preserves data object', () => {
  const log = createFiro({mode: 'prod'})

  const {stdout} = captureOutput(() => {
    log.error('Payment failed', {userId: 123, reason: 'timeout'})
  })

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.level, 'error')
  assert.strictEqual(parsed.message, 'Payment failed')
  assert.strictEqual(parsed.data.userId, 123)
  assert.strictEqual(parsed.data.reason, 'timeout')
})

test('prod transport — info with Error as data', () => {
  const log = createFiro({mode: 'prod'})
  const err = new Error('db timeout')
  const {stdout} = captureOutput(() => log.info('query slow', err))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.level, 'info')
  assert.strictEqual(parsed.message, 'query slow')
  assert.strictEqual(parsed.data.message, 'db timeout')
  assert.ok(parsed.data.stack)
})

test('prod transport — error with cause chain', () => {
  const log = createFiro({mode: 'prod'})
  const root = new Error('connection refused')
  const wrapped = new Error('Query failed', {cause: root})
  const {stdout} = captureOutput(() => log.error(wrapped))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.message, 'Query failed')
  assert.strictEqual(parsed.error.cause.message, 'connection refused')
  assert.ok(parsed.error.cause.stack)
})

test('prod transport — error with Error + extra data', () => {
  const log = createFiro({mode: 'prod'})
  const err = new Error('boom')
  const {stdout} = captureOutput(() => log.error(err, {reqId: 123}))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.message, 'boom')
  assert.strictEqual(parsed.error.message, 'boom')
  assert.ok(parsed.error.stack)
  assert.strictEqual(parsed.data.reqId, 123)
})

test('prod transport — error with non-Error cause', () => {
  const log = createFiro({mode: 'prod'})
  const err = new Error('fail', {cause: 'some string reason'})
  const {stdout} = captureOutput(() => log.error(err))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.error.cause, 'some string reason')
})

// --- Prod transport timestamp config ---

test('prod transport — ISO timestamp by default', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(typeof parsed.timestamp, 'string')
  assert.ok(!isNaN(Date.parse(parsed.timestamp)))
  assert.ok(parsed.timestamp.endsWith('Z'))
})

test('prod transport — epoch timestamp', () => {
  const before = Date.now()
  const log = createFiro({mode: 'prod', prodTransportConfig: {timestamp: 'epoch'}})
  const {stdout} = captureOutput(() => log.info('test'))
  const after = Date.now()

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(typeof parsed.timestamp, 'number')
  assert.ok(parsed.timestamp >= before && parsed.timestamp <= after)
})

test('prod transport — epoch timestamp with context and data', () => {
  const log = createFiro({mode: 'prod', prodTransportConfig: {timestamp: 'epoch'}})
  log.addContext('service', 'api')
  const {stdout} = captureOutput(() => log.info('req', {status: 200}))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(typeof parsed.timestamp, 'number')
  assert.strictEqual(parsed.service, 'api')
  assert.strictEqual(parsed.data.status, 200)
})

// --- Mode-based transport selection ---

test('default mode uses dev transport (ANSI in output)', () => {
  const log = createFiro()
  log.addContext('svc', 'api')
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('\x1b['), 'dev mode should produce ANSI codes (e.g. for context badges)')
})

test('mode: prod uses JSON transport', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(typeof parsed, 'object')
})

test('explicit transport overrides mode', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({mode: 'prod', transport: fn})

  log.info('test')

  assert.strictEqual(calls.length, 1)
})

test('`log` is callable (shorthand for info)', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log('shorthand')

  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0].level, 'info')
  assert.strictEqual(calls[0].msg, 'shorthand')
})

test('`log` callable shorthand accepts data and opts', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log('with data', {foo: 'bar'}, {pretty: true})

  assert.strictEqual(calls[0].msg, 'with data')
  assert.deepStrictEqual(calls[0].data, {foo: 'bar'})
  assert.strictEqual(calls[0].opts?.pretty, true)
})

test('child loggers are also callable', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})
  const child = log.child({reqId: 'abc'})

  child('child log')

  assert.strictEqual(calls[0].level, 'info')
  assert.strictEqual(calls[0].msg, 'child log')
  assert.strictEqual(calls[0].context[0].key, 'reqId')
})

test('falsy context values (0, false, null) are preserved', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn})

  log.addContext('count', 0)
  log.addContext('active', false)
  log.addContext('tag', null)
  log.info('test')

  assert.strictEqual(calls[0].context[0].value, 0)
  assert.strictEqual(calls[0].context[1].value, false)
  assert.strictEqual(calls[0].context[2].value, null)
})

test('useAllColors — auto-hash can assign extended palette indices (10+)', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn, useAllColors: true})

  // Add enough keys to statistically hit extended indices
  const keys = Array.from({length: 30}, (_, i) => `key-${i}`)
  for (const key of keys) log.addContext(key, key)
  log.info('test')

  const indices = calls[0].context.map(c => c.colorIndex)
  assert.ok(indices.some(i => i >= 10), `Expected at least one index >= 10, got: ${indices}`)
})

test('useAllColors: false — auto-hash stays in safe zone 0-9', () => {
  const {fn, calls} = createSpyTransport()
  const log = createFiro({transport: fn, useAllColors: false})

  const keys = Array.from({length: 30}, (_, i) => `key-${i}`)
  for (const key of keys) log.addContext(key, key)
  log.info('test')

  const indices = calls[0].context.map(c => c.colorIndex)
  assert.ok(indices.every(i => i >= 0 && i <= 9), `Expected all indices 0-9, got: ${indices}`)
})
