import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLogger } from '../src/index.ts'
import type { TransportFn, ContextItemWithOptions, LogLevel, LogOptions } from '../src/utils.ts'

// --- Helpers ---

type SpyCall = { level: LogLevel; context: ContextItemWithOptions[]; msg: unknown; data: unknown; opts?: LogOptions }

function createSpyTransport() {
  const calls: SpyCall[] = []
  const fn: TransportFn = (level, context, msg, data, opts) => {
    calls.push({ level, context: [...context], msg, data, opts })
  }
  return { fn, calls }
}

function captureOutput(fn: () => void): { stdout: string; stderr: string } {
  let stdout = ''
  let stderr = ''
  const origOut = process.stdout.write
  const origErr = process.stderr.write
  process.stdout.write = ((chunk: unknown) => { stdout += String(chunk); return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: unknown) => { stderr += String(chunk); return true }) as typeof process.stderr.write
  try {
    fn()
  } finally {
    process.stdout.write = origOut
    process.stderr.write = origErr
  }
  return { stdout, stderr }
}

// --- Log level filtering ---

test('default minLevel is debug — all levels pass through', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['debug', 'info', 'warn', 'error'])
})

test('minLevel: info — suppresses debug', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn, minLevel: 'info' })

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['info', 'warn', 'error'])
})

test('minLevel: error — only error passes', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn, minLevel: 'error' })

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['error'])
})

test('minLevelInDev overrides minLevel in dev mode', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn, mode: 'dev', minLevel: 'debug', minLevelInDev: 'warn' })

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['warn', 'error'])
})

test('minLevelInProd overrides minLevel in prod mode', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn, mode: 'prod', minLevel: 'debug', minLevelInProd: 'error' })

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['error'])
})

// --- Context ---

test('addContext — appears in transport calls', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })

  log.addContext('service', 'auth')
  log.info('test')

  assert.strictEqual(calls[0].context.length, 1)
  assert.strictEqual(calls[0].context[0].key, 'service')
  assert.strictEqual(calls[0].context[0].value, 'auth')
})

test('addContext — object form', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })

  log.addContext({ key: 'env', value: 'prod', options: { omitKey: true } })
  log.info('test')

  assert.strictEqual(calls[0].context[0].key, 'env')
  assert.strictEqual(calls[0].context[0].options.omitKey, true)
})

test('addContext — explicit colorIndex is preserved', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })

  log.addContext({ key: 'x', value: 'y', options: { colorIndex: 7 } })
  log.info('test')

  assert.strictEqual(calls[0].context[0].options.colorIndex, 7)
})

test('removeFromContext — removes by key', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })

  log.addContext('a', '1')
  log.addContext('b', '2')
  log.removeFromContext('a')
  log.info('test')

  assert.strictEqual(calls[0].context.length, 1)
  assert.strictEqual(calls[0].context[0].key, 'b')
})

test('removeFromContext — non-existent key does not throw', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })
  log.removeFromContext('nope')
  log.info('test')
  assert.strictEqual(calls[0].context.length, 0)
})

test('getContext returns current context', () => {
  const { fn } = createSpyTransport()
  const log = createLogger({ transport: fn })

  log.addContext('a', '1')
  log.addContext('b', '2')

  const ctx = log.getContext()
  assert.strictEqual(ctx.length, 2)
  assert.strictEqual(ctx[0].key, 'a')
  assert.strictEqual(ctx[1].key, 'b')
})

// --- Per-call context ---

test('opts.ctx adds inline context for single call', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })
  log.addContext('service', 'auth')

  log.info('with ctx', undefined, { ctx: [{ key: 'reqId', value: '42' }] })
  log.info('without ctx')

  assert.strictEqual(calls[0].context.length, 2) // service + reqId
  assert.strictEqual(calls[0].context[1].key, 'reqId')
  assert.strictEqual(calls[1].context.length, 1) // only service
})

test('opts.ctx works on error', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })

  log.error('boom', new Error('fail'), { ctx: [{ key: 'op', value: 'delete' }] })

  assert.strictEqual(calls[0].context.length, 1)
  assert.strictEqual(calls[0].context[0].key, 'op')
})

// --- Child loggers ---

test('child inherits parent context', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })
  log.addContext('service', 'auth')

  const child = log.child({ requestId: 123 })
  child.info('test')

  assert.strictEqual(calls[0].context.length, 2)
  assert.strictEqual(calls[0].context[0].key, 'service')
  assert.strictEqual(calls[0].context[1].key, 'requestId')
  assert.strictEqual(calls[0].context[1].value, 123)
})

test('child context does not mutate parent', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })
  log.addContext('service', 'auth')

  const child = log.child({ requestId: 123 })
  child.addContext('extra', 'val')

  log.info('parent')
  child.info('child')

  assert.strictEqual(calls[0].context.length, 1) // parent: only service
  assert.strictEqual(calls[1].context.length, 3) // child: service + requestId + extra
})

test('parent mutation after child does not affect child', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })
  log.addContext('a', '1')

  const child = log.child({ b: '2' })
  log.addContext('c', '3') // added to parent AFTER child creation

  child.info('test')

  assert.deepStrictEqual(calls[0].context.map(c => c.key), ['a', 'b']) // no 'c'
})

test('deeply nested children accumulate context', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })

  const deep = log.child({ a: 1 }).child({ b: 2 }).child({ c: 3 })
  deep.info('test')

  assert.deepStrictEqual(calls[0].context.map(c => c.key), ['a', 'b', 'c'])
})

test('child inherits minLevel', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn, minLevel: 'warn' })

  const child = log.child({ x: 1 })
  child.debug('d')
  child.info('i')
  child.warn('w')
  child.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['warn', 'error'])
})

// --- Error method ---

test('error(msg) — string only', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })

  log.error('something broke')

  assert.strictEqual(calls[0].level, 'error')
  assert.strictEqual(calls[0].msg, 'something broke')
  assert.strictEqual(calls[0].data, undefined)
})

test('error(msg, err) — string + Error', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })
  const err = new Error('db failed')

  log.error('query failed', err)

  assert.strictEqual(calls[0].msg, 'query failed')
  assert.strictEqual(calls[0].data, err)
})

test('error(err) — Error only', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ transport: fn })
  const err = new Error('boom')

  log.error(err)

  assert.strictEqual(calls[0].msg, err)
  assert.strictEqual(calls[0].data, undefined)
})

// --- Dev transport ---

test('dev transport — writes to stdout for info', () => {
  const log = createLogger({ mode: 'dev' })
  const { stdout, stderr } = captureOutput(() => log.info('hello'))

  assert.ok(stdout.includes('hello'))
  assert.strictEqual(stderr, '')
})

test('dev transport — writes to stderr for error', () => {
  const log = createLogger({ mode: 'dev' })
  const { stderr } = captureOutput(() => log.error('bad'))

  assert.ok(stderr.includes('bad'))
})

test('dev transport — timestamp format HH:MM:SS.mmm', () => {
  const log = createLogger({ mode: 'dev' })
  const { stdout } = captureOutput(() => log.info('test'))

  assert.ok(/\d{2}:\d{2}:\d{2}\.\d{3}/.test(stdout), `No timestamp in: ${stdout}`)
})

test('dev transport — context rendered as [key:value]', () => {
  const log = createLogger({ mode: 'dev' })
  log.addContext('svc', 'api')
  const { stdout } = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[svc:api]'))
})

test('dev transport — omitKey renders [value] only', () => {
  const log = createLogger({ mode: 'dev' })
  log.addContext({ key: 'userId', value: 'bob', options: { omitKey: true } })
  const { stdout } = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[bob]'))
  assert.ok(!stdout.includes('[userId:bob]'))
})

test('dev transport — error has [ERROR] prefix', () => {
  const log = createLogger({ mode: 'dev' })
  const { stderr } = captureOutput(() => log.error('oops'))

  assert.ok(stderr.includes('[ERROR]'))
})

test('dev transport — warn has [WARN] prefix', () => {
  const log = createLogger({ mode: 'dev' })
  const { stdout } = captureOutput(() => log.warn('careful'))

  assert.ok(stdout.includes('[WARN]'))
})

test('dev transport — debug lines are dimmed', () => {
  const log = createLogger({ mode: 'dev' })
  const { stdout } = captureOutput(() => log.debug('dim me'))

  assert.ok(stdout.startsWith('\x1b[2m'), 'debug line should start with dim')
  assert.ok(stdout.includes('dim me'))
})

test('dev transport — data is serialized', () => {
  const log = createLogger({ mode: 'dev' })
  const { stdout } = captureOutput(() => log.info('req', { status: 200 }))

  assert.ok(stdout.includes('status'))
  assert.ok(stdout.includes('200'))
})

test('dev transport — ends with newline', () => {
  const log = createLogger({ mode: 'dev' })
  const { stdout } = captureOutput(() => log.info('test'))

  assert.ok(stdout.endsWith('\n'))
})

// --- JSON transport ---

test('json transport — valid NDJSON', () => {
  const log = createLogger({ mode: 'prod' })
  const { stdout } = captureOutput(() => log.info('hello'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.level, 'info')
  assert.strictEqual(parsed.message, 'hello')
  assert.ok(parsed.timestamp)
})

test('json transport — ISO timestamp', () => {
  const log = createLogger({ mode: 'prod' })
  const { stdout } = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.ok(!isNaN(Date.parse(parsed.timestamp)), `Invalid timestamp: ${parsed.timestamp}`)
})

test('json transport — context flattened into record', () => {
  const log = createLogger({ mode: 'prod' })
  log.addContext('service', 'api')
  log.addContext('env', 'prod')
  const { stdout } = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.service, 'api')
  assert.strictEqual(parsed.env, 'prod')
})

test('json transport — data field for non-error', () => {
  const log = createLogger({ mode: 'prod' })
  const { stdout } = captureOutput(() => log.info('req', { status: 200 }))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.data.status, 200)
})

test('json transport — error with msg + Error', () => {
  const log = createLogger({ mode: 'prod' })
  const err = new Error('db down')
  const { stdout } = captureOutput(() => log.error('query failed', err))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.level, 'error')
  assert.strictEqual(parsed.message, 'query failed')
  assert.strictEqual(parsed.error.message, 'db down')
  assert.ok(parsed.error.stack)
})

test('json transport — error writes to stdout (not stderr)', () => {
  const log = createLogger({ mode: 'prod' })
  const { stdout, stderr } = captureOutput(() => log.error('bad'))

  assert.ok(stdout.length > 0)
  assert.strictEqual(stderr, '')
})

test('json transport — ends with newline', () => {
  const log = createLogger({ mode: 'prod' })
  const { stdout } = captureOutput(() => log.info('test'))

  assert.ok(stdout.endsWith('\n'))
})

// --- Mode-based transport selection ---

test('default mode uses dev transport (ANSI in output)', () => {
  const log = createLogger()
  const { stdout } = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('\x1b['), 'default mode should produce ANSI codes')
})

test('mode: prod uses JSON transport', () => {
  const log = createLogger({ mode: 'prod' })
  const { stdout } = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(typeof parsed, 'object')
})

test('explicit transport overrides mode', () => {
  const { fn, calls } = createSpyTransport()
  const log = createLogger({ mode: 'prod', transport: fn })

  log.info('test')

  assert.strictEqual(calls.length, 1)
})
