import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createFiro} from '../src/index.ts'
import type {FormatterFn, ContextItemWithOptions, LogLevel, LogOptions} from '../src/utils.ts'

// --- Helpers ---

type SpyCall = {level: LogLevel; context: ContextItemWithOptions[]; msg: unknown; data: unknown; opts?: LogOptions}

function createSpyFormatter() {
  const calls: SpyCall[] = []
  const fn: FormatterFn = (level, context, msg, data, opts) => {
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
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['debug', 'info', 'warn', 'error'])
})

test('minLevel: info — suppresses debug', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn, minLevel: 'info'})

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['info', 'warn', 'error'])
})

test('minLevel: error — only error passes', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn, minLevel: 'error'})

  log.debug('d')
  log.info('i')
  log.warn('w')
  log.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['error'])
})

// --- Context ---

test('addContext — appears in formatter calls', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.addContext('service', 'auth')
  log.info('test')

  assert.strictEqual(calls[0].context.length, 1)
  assert.strictEqual(calls[0].context[0].key, 'service')
  assert.strictEqual(calls[0].context[0].value, 'auth')
})

test('addContext — object form', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.addContext({key: 'env', value: 'prod', omitKey: true})
  log.info('test')

  assert.strictEqual(calls[0].context[0].key, 'env')
  assert.strictEqual(calls[0].context[0].omitKey, true)
})

test('addContext — explicit colorIndex is preserved', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.addContext({key: 'x', value: 'y', colorIndex: 7})
  log.info('test')

  assert.strictEqual(calls[0].context[0].colorIndex, 7)
})

test('addContext — custom color is preserved and used in output', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.addContext({key: 'trace', value: 'abc', color: '38;5;214'})
  log.info('test')

  assert.strictEqual(calls[0].context[0].color, '38;5;214')

  // Verify it renders with the custom color in dev formatter
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
  const {fn} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.addContext('service', 'auth')

  assert.strictEqual(log.hasInContext('service'), true)
  assert.strictEqual(log.hasInContext('missing'), false)
})

test('removeFromContext — removes by key', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.addContext('a', '1')
  log.addContext('b', '2')
  log.removeFromContext('a')
  log.info('test')

  assert.strictEqual(calls[0].context.length, 1)
  assert.strictEqual(calls[0].context[0].key, 'b')
})

test('removeFromContext — non-existent key does not throw', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})
  log.removeFromContext('nope')
  log.info('test')
  assert.strictEqual(calls[0].context.length, 0)
})

test('getContext returns current context', () => {
  const {fn} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.addContext('a', '1')
  log.addContext('b', '2')

  const ctx = log.getContext()
  assert.strictEqual(ctx.length, 2)
  assert.strictEqual(ctx[0].key, 'a')
  assert.strictEqual(ctx[1].key, 'b')
})

test('addContext replaces the value and options without moving the key', () => {
  const log = createFiro({formatter: () => {}})
  log.addContext('reqId', {value: 1, color: '31', hideIn: 'prod'})
  log.addContext('service', 'api')
  log.addContext('reqId', {value: 2, omitKey: true})

  assert.deepStrictEqual(log.getContext().map(({key, value}) => ({key, value})), [
    {key: 'reqId', value: 2},
    {key: 'service', value: 'api'},
  ])
  assert.strictEqual(log.getContext()[0].omitKey, true)
  assert.strictEqual(log.getContext()[0].color, undefined)
  assert.strictEqual(log.getContext()[0].hideIn, undefined)

  log.addContext({key: 'reqId', value: 0})
  assert.strictEqual(log.getContext().length, 2)
  assert.strictEqual(log.getContext()[0].value, 0)
  assert.strictEqual(log.getContext()[0].omitKey, false)
})

test('initial context keeps the latest entry for each key', () => {
  const context = [
    {key: 'service', value: 'api'},
    {key: 'env', value: 'test'},
    {key: 'service', value: 'worker'},
  ]
  const log = createFiro({formatter: () => {}}, context)

  assert.deepStrictEqual(log.getContext().map(({key, value}) => ({key, value})), [
    {key: 'service', value: 'worker'},
    {key: 'env', value: 'test'},
  ])
  assert.strictEqual(context.length, 3)
  assert.strictEqual(context[0].value, 'api')
})

// --- Reserved context keys ---

for (const mode of ['dev', 'prod', 'custom'] as const) {
  test(`${mode} — reserved context keys are omitted on input by default`, () => {
    const {fn, calls} = createSpyFormatter()
    const config = mode === 'custom' ? {formatter: fn} : {mode}
    const reserved = ['timestamp', 'level', 'message', 'data', 'error'].map(key => ({key, value: 'ignored'}))
    const initial = [...reserved, {key: 'service', value: 'api'}]
    const log = createFiro(config, initial)
    for (const item of reserved) log.addContext(item)
    log.addContext('level', 'gold')
    const child = log.child({level: 'gold', data: 'ignored', reqId: 123}).child({message: 'ignored'})

    assert.deepStrictEqual(log.getContext().map(ctx => ctx.key), ['service'])
    assert.deepStrictEqual(child.getContext().map(ctx => ctx.key), ['service', 'reqId'])
    assert.strictEqual(child.hasInContext('level'), false)

    const ctx = [...reserved, {key: 'service', value: 'worker'}]
    const {stdout} = captureOutput(() => child.info('hello', undefined, {ctx}))

    if (mode === 'custom') {
      assert.deepStrictEqual(calls[0].context.map(({key, value}) => ({key, value})), [
        {key: 'service', value: 'worker'},
        {key: 'reqId', value: 123},
      ])
    } else if (mode === 'dev') {
      assert.ok(stdout.includes('[service:worker]'))
      assert.ok(stdout.includes('[reqId:123]'))
      for (const {key} of reserved) assert.ok(!stdout.includes(`[${key}:`))
    } else {
      const record = JSON.parse(stdout)
      assert.strictEqual(record.level, 'info')
      assert.strictEqual(record.message, 'hello')
      assert.strictEqual(record.service, 'worker')
      assert.strictEqual(record.reqId, 123)
      assert.ok(!('data' in record))
      assert.ok(!('error' in record))
    }
    assert.strictEqual(child.getContext()[0].value, 'api')
    assert.strictEqual(initial.length, 6)
    assert.strictEqual(ctx.length, 6)
  })

  test(`${mode} — throwOnReservedContextKeys rejects input immediately and is inherited`, () => {
    const {fn, calls} = createSpyFormatter()
    const config = {throwOnReservedContextKeys: true, ...(mode === 'custom' ? {formatter: fn} : {mode})}
    const log = createFiro(config)
    log.addContext('service', 'api')
    const child = log.child({reqId: 123}).child({})

    for (const key of ['timestamp', 'level', 'message', 'data', 'error']) {
      const expectedError = {
        name: 'Error',
        message: `Context key "${key}" is reserved. Rename it or set throwOnReservedContextKeys: false.`,
      }
      assert.throws(() => createFiro(config, [{key, value: 'ignored'}]), expectedError)
      assert.throws(() => log.addContext(key, 'ignored'), expectedError)
      assert.throws(() => log.addContext({key, value: 'ignored', hideIn: 'prod'}), expectedError)
      assert.throws(() => log.child({[key]: 'ignored'}), expectedError)
      assert.throws(() => child.addContext(key, 'ignored'), expectedError)
    }

    const {stdout, stderr} = captureOutput(() => {
      for (const method of [child, child.debug, child.info, child.warn, child.error]) {
        assert.throws(() => method('hello', undefined, {
          ctx: [{key: 'service', value: 'temporary'}, {key: 'level', value: 'gold'}],
        }), /Context key "level" is reserved/)
      }
    })
    assert.strictEqual(stdout, '')
    assert.strictEqual(stderr, '')
    assert.strictEqual(calls.length, 0)
    assert.deepStrictEqual(child.getContext().map(({key, value}) => ({key, value})), [
      {key: 'service', value: 'api'},
      {key: 'reqId', value: 123},
    ])
  })
}

// --- Per-call context ---

test('opts.ctx overrides persistent and repeated inline keys for one call', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})
  log.addContext('service', 'api')
  log.addContext('env', 'test')
  const ctx = [
    {key: 'service', value: 'worker'},
    {key: 'reqId', value: 'old'},
    {key: 'service', value: 'job'},
    {key: 'reqId', value: 'new'},
  ]

  log.info('with overrides', undefined, {ctx})
  log.info('without overrides')

  assert.deepStrictEqual(calls[0].context.map(({key, value}) => ({key, value})), [
    {key: 'service', value: 'job'},
    {key: 'env', value: 'test'},
    {key: 'reqId', value: 'new'},
  ])
  assert.deepStrictEqual(calls[1].context.map(({key, value}) => ({key, value})), [
    {key: 'service', value: 'api'},
    {key: 'env', value: 'test'},
  ])
  assert.strictEqual(ctx.length, 4)
  assert.strictEqual(ctx[0].value, 'worker')
})

test('opts.ctx adds inline context for single call', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})
  log.addContext('service', 'auth')

  log.info('with ctx', undefined, {ctx: [{key: 'reqId', value: '42'}]})
  log.info('without ctx')

  assert.strictEqual(calls[0].context.length, 2) // service + reqId
  assert.strictEqual(calls[0].context[1].key, 'reqId')
  assert.strictEqual(calls[1].context.length, 1) // only service
})

test('opts.ctx works on error', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.error('boom', new Error('fail'), {ctx: [{key: 'op', value: 'delete'}]})

  assert.strictEqual(calls[0].context.length, 1)
  assert.strictEqual(calls[0].context[0].key, 'op')
})

// --- Child loggers ---

test('child overrides and removes a key without changing its ancestors', () => {
  const log = createFiro({formatter: () => {}})
  log.addContext('service', 'api')
  log.addContext('env', 'test')
  const child = log.child({service: 'worker'})
  const nested = child.child({service: 'job'})

  assert.deepStrictEqual(nested.getContext().map(({key, value}) => ({key, value})), [
    {key: 'service', value: 'job'},
    {key: 'env', value: 'test'},
  ])
  nested.removeFromContext('service')
  assert.strictEqual(nested.hasInContext('service'), false)
  assert.deepStrictEqual(nested.getContext().map(ctx => ctx.key), ['env'])
  assert.strictEqual(child.getContext()[0].value, 'worker')
  assert.strictEqual(log.getContext()[0].value, 'api')
})

for (const mode of ['dev', 'prod'] as const) {
  test(`${mode} output uses the latest context entry and its visibility`, () => {
    const log = createFiro({mode})
    log.addContext('service', 'api')
    log.addContext('service', 'worker')
    const child = log.child({service: 'job'})
    const {stdout} = captureOutput(() => child.info('test'))

    if (mode === 'dev') {
      assert.strictEqual(stdout.match(/\[service:/g)?.length, 1)
      assert.ok(stdout.includes('[service:job]'))
    } else {
      assert.strictEqual(JSON.parse(stdout).service, 'job')
    }

    const hidden = child.child({service: {value: 'hidden', hideIn: mode}})
    const hiddenOutput = captureOutput(() => hidden.info('test')).stdout
    const overrideOutput = captureOutput(() => hidden.info('test', undefined, {
      ctx: [{key: 'service', value: 'visible', omitKey: true}],
    })).stdout

    if (mode === 'dev') {
      assert.ok(!hiddenOutput.includes('[service:'))
      assert.ok(!hiddenOutput.includes('hidden'))
      assert.ok(overrideOutput.includes('[visible]'))
      assert.ok(!overrideOutput.includes('[service:'))
    } else {
      assert.strictEqual(JSON.parse(hiddenOutput).service, undefined)
      assert.strictEqual(JSON.parse(overrideOutput).service, 'visible')
    }
    assert.strictEqual(hidden.getContext()[0].value, 'hidden')
    assert.strictEqual(hidden.getContext()[0].hideIn, mode)
  })
}

test('child inherits parent context', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})
  log.addContext('service', 'auth')

  const child = log.child({requestId: 123})
  child.info('test')

  assert.strictEqual(calls[0].context.length, 2)
  assert.strictEqual(calls[0].context[0].key, 'service')
  assert.strictEqual(calls[0].context[1].key, 'requestId')
  assert.strictEqual(calls[0].context[1].value, 123)
})

test('child context does not mutate parent', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})
  log.addContext('service', 'auth')

  const child = log.child({requestId: 123})
  child.addContext('extra', 'val')

  log.info('parent')
  child.info('child')

  assert.strictEqual(calls[0].context.length, 1) // parent: only service
  assert.strictEqual(calls[1].context.length, 3) // child: service + requestId + extra
})

test('parent mutation after child does not affect child', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})
  log.addContext('a', '1')

  const child = log.child({b: '2'})
  log.addContext('c', '3') // added to parent AFTER child creation

  child.info('test')

  assert.deepStrictEqual(calls[0].context.map(c => c.key), ['a', 'b']) // no 'c'
})

test('deeply nested children accumulate context', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  const deep = log.child({a: 1}).child({b: 2}).child({c: 3})
  deep.info('test')

  assert.deepStrictEqual(calls[0].context.map(c => c.key), ['a', 'b', 'c'])
})

test('child inherits minLevel', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn, minLevel: 'warn'})

  const child = log.child({x: 1})
  child.debug('d')
  child.info('i')
  child.warn('w')
  child.error('e')

  assert.deepStrictEqual(calls.map(c => c.level), ['warn', 'error'])
})

// --- Error method ---

test('error(msg) — string only', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.error('something broke')

  assert.strictEqual(calls[0].level, 'error')
  assert.strictEqual(calls[0].msg, 'something broke')
  assert.strictEqual(calls[0].data, undefined)
})

test('error(msg, err) — string + Error', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})
  const err = new Error('db failed')

  log.error('query failed', err)

  assert.strictEqual(calls[0].msg, 'query failed')
  assert.strictEqual(calls[0].data, err)
})

test('error(err) — Error only', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})
  const err = new Error('boom')

  log.error(err)

  assert.strictEqual(calls[0].msg, err)
  assert.strictEqual(calls[0].data, undefined)
})

// --- Dev formatter ---

test('dev formatter — writes to stdout for info', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout, stderr} = captureOutput(() => log.info('hello'))

  assert.ok(stdout.includes('hello'))
  assert.strictEqual(stderr, '')
})

test('dev formatter — writes to stderr for error', () => {
  const log = createFiro({mode: 'dev'})
  const {stderr} = captureOutput(() => log.error('bad'))

  assert.ok(stderr.includes('bad'))
})

test('dev formatter — timestamp format HH:MM:SS.mmm', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(/\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(stdout), `No timestamp in: ${stdout}`)
})

test('dev formatter — context rendered as [key:value]', () => {
  const log = createFiro({mode: 'dev'})
  log.addContext('svc', 'api')
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[svc:api]'))
})

test('dev formatter — omitKey renders [value] only', () => {
  const log = createFiro({mode: 'dev'})
  log.addContext({key: 'userId', value: 'bob', omitKey: true})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[bob]'))
  assert.ok(!stdout.includes('[userId:bob]'))
})

test('dev formatter — hideIn dev hides context badge', () => {
  const log = createFiro({mode: 'dev'})
  log.addContext('svc', 'api')
  log.addContext('traceId', {value: 'abc-123', hideIn: 'dev'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[svc:api]'))
  assert.ok(!stdout.includes('traceId'))
  assert.ok(!stdout.includes('abc-123'))
})

test('dev formatter — hideIn prod still shows in dev', () => {
  const log = createFiro({mode: 'dev'})
  log.addContext('debugInfo', {value: 'xyz', hideIn: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('[debugInfo:xyz]'))
})

test('dev formatter — hideIn dev works with child context', () => {
  const log = createFiro({mode: 'dev'})
  const child = log.child({traceId: {value: 'trace-99', hideIn: 'dev'}})
  const {stdout} = captureOutput(() => child.info('test'))

  assert.ok(!stdout.includes('trace-99'))
})

test('dev formatter — error has [ERROR] prefix', () => {
  const log = createFiro({mode: 'dev'})
  const {stderr} = captureOutput(() => log.error('oops'))

  assert.ok(stderr.includes('[ERROR]'))
})

test('dev formatter — warn has [WARN] prefix', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.warn('careful'))

  assert.ok(stdout.includes('[WARN]'))
})

test('dev formatter — debug lines are dimmed', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.debug('dim me'))

  // Message should be dimmed (\x1b[2m)
  assert.ok(stdout.includes('\x1b[2mdim me\x1b[0m'), 'debug message should be dimmed')
})

for (const pretty of [false, true]) {
  test(`dev formatter — colors: false keeps readable output without ANSI (pretty: ${pretty})`, () => {
    const log = createFiro({devFormatterConfig: {colors: false}})
    log.addContext('service', {value: 'api', color: '31'})
    const child = log.child({reqId: 123})
    const data = {status: 'ready', nested: {active: true, count: 42}}
    const {stdout, stderr} = captureOutput(() => {
      child.debug('debug message', data, {pretty})
      child.info('info message', data, {pretty})
      child.warn('warn message', data, {pretty})
      child.error(new Error('failed'), data, {pretty})
    })

    assert.doesNotMatch(stdout + stderr, /\x1b\[/)
    assert.ok(stdout.includes('[service:api] [reqId:123] debug message'))
    assert.ok(stdout.includes('info message'))
    assert.ok(stdout.includes('[WARN] warn message'))
    assert.ok(stderr.includes('[ERROR] Error: failed'))
    for (const output of [stdout, stderr]) {
      assert.ok(output.includes("status: 'ready'"))
      assert.ok(output.includes('active: true'))
      assert.ok(output.includes('count: 42'))
      assert.ok(output.endsWith('\n'))
    }
  })
}

test('dev formatter — data is serialized', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.info('req', {status: 200}))

  assert.ok(stdout.includes('status'))
  assert.ok(stdout.includes('200'))
})

test('dev formatter — info with Error as data', () => {
  const log = createFiro({mode: 'dev'})
  const err = new Error('whoops')
  const {stdout} = captureOutput(() => log.info('something failed', err))

  assert.ok(stdout.includes('something failed'), 'Should output message')
  assert.ok(stdout.includes('Error: whoops'), 'Should output error')
  assert.ok(stdout.includes('at '), 'Should output stack trace')
})

test('dev formatter — ends with newline', () => {
  const log = createFiro({mode: 'dev'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.endsWith('\n'))
})

test('dev formatter — handles circular structures without crashing', () => {
  const log = createFiro({mode: 'dev'})
  const obj: any = {a: 1}
  obj.self = obj // circular reference

  const {stderr} = captureOutput(() => {
    log.error('fail', obj)
    log.error(obj) // edge case where msg is the circular object
  })

  assert.ok(stderr.includes('[Circular *1]'))
})

test('dev formatter — applies devFormatterConfig time options', () => {
  const log = createFiro({
    mode: 'dev',
    devFormatterConfig: {
      timeOptions: {hour: 'numeric', minute: undefined, second: undefined, fractionalSecondDigits: undefined}
    }
  })

  const {stdout} = captureOutput(() => log.info('test'))

  // E.g. [14] instead of [14:32:01.123]
  assert.match(stdout, /\[\d{1,2}\]/)
})

test('dev formatter — stringifies object message instead of [object Object]', () => {
  const log = createFiro({mode: 'dev'})
  //@ts-expect-error — info() expects string, but we test runtime handling of objects
  const {stdout} = captureOutput(() => log.info({status: 'ok', count: 42}))

  assert.ok(!stdout.includes('[object Object]'), 'Should not output [object Object]')
  assert.ok(stdout.includes('status:'), 'Should output object properties')
  assert.ok(stdout.includes("'ok'"), 'Should output object values')
  assert.ok(stdout.includes('42'), 'Should output numeric values')
})

// --- Prod formatter ---

test('prod formatter — valid NDJSON', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('hello'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.level, 'info')
  assert.strictEqual(parsed.message, 'hello')
  assert.ok(parsed.timestamp)
})

test('prod formatter — context flattened into record', () => {
  const log = createFiro({mode: 'prod'})
  log.addContext('service', 'api')
  log.addContext('env', 'prod')
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.service, 'api')
  assert.strictEqual(parsed.env, 'prod')
})

test('prod formatter — omitted context keys leave unused record fields absent', () => {
  const log = createFiro({mode: 'prod'}, [{key: 'timestamp', value: 'yesterday'}])
  log.addContext('level', 'gold')
  log.addContext('message', 'context message')
  log.addContext('data', 'context data')
  log.addContext('error', 'context error')
  log.addContext('service', 'api')
  const child = log.child({level: 'silver', data: 'child data', error: 'child error'})

  const {stdout} = captureOutput(() => {
    log.info('hello')
    child.info('hello')
  })

  const records = stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.strictEqual(records.length, 2)
  for (const record of records) {
    assert.strictEqual(record.level, 'info')
    assert.strictEqual(record.message, 'hello')
    assert.strictEqual(record.service, 'api')
    assert.ok(!isNaN(Date.parse(record.timestamp)))
    assert.ok(!('data' in record))
    assert.ok(!('error' in record))
  }
})

test('prod formatter — omitted inline keys preserve record fields', () => {
  const log = createFiro({
    mode: 'prod',
    prodFormatterConfig: {timestamp: 'epoch'},
  })
  const err = new Error('query failed')
  const before = Date.now()
  const {stdout} = captureOutput(() => log.error(err, {reqId: 123}, {
    ctx: [
      {key: 'timestamp', value: 'yesterday'},
      {key: 'level', value: 'gold'},
      {key: 'message', value: 'context message'},
      {key: 'data', value: 'context data'},
      {key: 'error', value: 'context error'},
      {key: 'service', value: 'api'},
    ],
  }))
  const after = Date.now()

  const record = JSON.parse(stdout)
  assert.strictEqual(typeof record.timestamp, 'number')
  assert.ok(record.timestamp >= before && record.timestamp <= after)
  assert.strictEqual(record.level, 'error')
  assert.strictEqual(record.message, err.message)
  assert.deepStrictEqual(record.data, {reqId: 123})
  assert.strictEqual(record.error.message, err.message)
  assert.strictEqual(record.error.stack, err.stack)
  assert.strictEqual(record.service, 'api')
})

test('prod formatter — hideIn prod hides context from JSON', () => {
  const log = createFiro({mode: 'prod'})
  log.addContext('service', 'api')
  log.addContext('debugInfo', {value: 'xyz', hideIn: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.service, 'api')
  assert.strictEqual(parsed.debugInfo, undefined)
})

test('prod formatter — hideIn dev still shows in prod', () => {
  const log = createFiro({mode: 'prod'})
  log.addContext('traceId', {value: 'abc-123', hideIn: 'dev'})
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.traceId, 'abc-123')
})

test('prod formatter — hideIn prod works with child context', () => {
  const log = createFiro({mode: 'prod'})
  const child = log.child({debugTag: {value: 'dbg', hideIn: 'prod'}})
  const {stdout} = captureOutput(() => child.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.debugTag, undefined)
})

test('prod formatter — data field for non-error', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('req', {status: 200}))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.data.status, 200)
})

test('prod formatter — error with msg + Error', () => {
  const log = createFiro({mode: 'prod'})
  const err = new Error('db down')
  const {stdout} = captureOutput(() => log.error('query failed', err))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.level, 'error')
  assert.strictEqual(parsed.message, 'query failed')
  assert.strictEqual(parsed.error.message, 'db down')
  assert.ok(parsed.error.stack)
})

test('prod formatter — error writes to stdout (not stderr)', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout, stderr} = captureOutput(() => log.error('bad'))

  assert.ok(stdout.length > 0)
  assert.strictEqual(stderr, '')
})

test('prod formatter — ends with newline', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.endsWith('\n'))
})

test('prod formatter — handles circular structures without crashing', () => {
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

test('prod formatter — error preserves data object', () => {
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

test('prod formatter — info with Error as data', () => {
  const log = createFiro({mode: 'prod'})
  const err = new Error('db timeout')
  const {stdout} = captureOutput(() => log.info('query slow', err))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.level, 'info')
  assert.strictEqual(parsed.message, 'query slow')
  assert.strictEqual(parsed.data.message, 'db timeout')
  assert.ok(parsed.data.stack)
})

test('prod formatter — error with cause chain', () => {
  const log = createFiro({mode: 'prod'})
  const root = new Error('connection refused')
  const wrapped = new Error('Query failed', {cause: root})
  const {stdout} = captureOutput(() => log.error(wrapped))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.message, 'Query failed')
  assert.strictEqual(parsed.error.cause.message, 'connection refused')
  assert.ok(parsed.error.cause.stack)
})

test('prod formatter — cyclic error causes produce valid NDJSON in message and data arguments', () => {
  const log = createFiro({mode: 'prod'})
  const err = new Error('cyclic failure')
  err.cause = err

  const {stdout} = captureOutput(() => {
    log.error(err, {reqId: 123})
    log.error('request failed', err)
    log.info('retrying', err)
  })

  const records = stdout.trim().split('\n').map(line => JSON.parse(line))
  assert.strictEqual(records.length, 3)
  assert.deepStrictEqual(records.map(record => record.level), ['error', 'error', 'info'])
  assert.deepStrictEqual(records.map(record => record.message), ['cyclic failure', 'request failed', 'retrying'])
  assert.strictEqual(records[0].data.reqId, 123)
  for (const error of [records[0].error, records[1].error, records[2].data]) {
    assert.strictEqual(error.message, err.message)
    assert.strictEqual(error.stack, err.stack)
    assert.strictEqual(error.cause, '[Circular]')
  }
})

test('prod formatter — error with Error + extra data', () => {
  const log = createFiro({mode: 'prod'})
  const err = new Error('boom')
  const {stdout} = captureOutput(() => log.error(err, {reqId: 123}))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.message, 'boom')
  assert.strictEqual(parsed.error.message, 'boom')
  assert.ok(parsed.error.stack)
  assert.strictEqual(parsed.data.reqId, 123)
})

test('prod formatter — error with non-Error cause', () => {
  const log = createFiro({mode: 'prod'})
  const err = new Error('fail', {cause: 'some string reason'})
  const {stdout} = captureOutput(() => log.error(err))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.error.cause, 'some string reason')
})

// --- Prod formatter timestamp config ---

test('prod formatter — ISO timestamp by default', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(typeof parsed.timestamp, 'string')
  assert.ok(!isNaN(Date.parse(parsed.timestamp)))
  assert.ok(parsed.timestamp.endsWith('Z'))
})

test('prod formatter — epoch timestamp', () => {
  const before = Date.now()
  const log = createFiro({mode: 'prod', prodFormatterConfig: {timestamp: 'epoch'}})
  const {stdout} = captureOutput(() => log.info('test'))
  const after = Date.now()

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(typeof parsed.timestamp, 'number')
  assert.ok(parsed.timestamp >= before && parsed.timestamp <= after)
})

test('prod formatter — epoch timestamp with context and data', () => {
  const log = createFiro({mode: 'prod', prodFormatterConfig: {timestamp: 'epoch'}})
  log.addContext('service', 'api')
  const {stdout} = captureOutput(() => log.info('req', {status: 200}))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(typeof parsed.timestamp, 'number')
  assert.strictEqual(parsed.service, 'api')
  assert.strictEqual(parsed.data.status, 200)
})

// --- Mode-based formatter selection ---

test('default mode uses dev formatter (ANSI in output)', () => {
  const log = createFiro()
  log.addContext('svc', 'api')
  const {stdout} = captureOutput(() => log.info('test'))

  assert.ok(stdout.includes('\x1b['), 'dev mode should produce ANSI codes (e.g. for context badges)')
})

test('mode: prod uses JSON formatter', () => {
  const log = createFiro({mode: 'prod'})
  const {stdout} = captureOutput(() => log.info('test'))

  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(typeof parsed, 'object')
})

test('explicit formatter overrides mode', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({mode: 'prod', formatter: fn})

  log.info('test')

  assert.strictEqual(calls.length, 1)
})

test('`log` is callable (shorthand for info)', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log('shorthand')

  assert.strictEqual(calls.length, 1)
  assert.strictEqual(calls[0].level, 'info')
  assert.strictEqual(calls[0].msg, 'shorthand')
})

test('`log` callable shorthand accepts data and opts', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log('with data', {foo: 'bar'}, {pretty: true})

  assert.strictEqual(calls[0].msg, 'with data')
  assert.deepStrictEqual(calls[0].data, {foo: 'bar'})
  assert.strictEqual(calls[0].opts?.pretty, true)
})

test('child loggers are also callable', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})
  const child = log.child({reqId: 'abc'})

  child('child log')

  assert.strictEqual(calls[0].level, 'info')
  assert.strictEqual(calls[0].msg, 'child log')
  assert.strictEqual(calls[0].context[0].key, 'reqId')
})

test('falsy context values (0, false, null) are preserved', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn})

  log.addContext('count', 0)
  log.addContext('active', false)
  log.addContext('tag', null)
  log.info('test')

  assert.strictEqual(calls[0].context[0].value, 0)
  assert.strictEqual(calls[0].context[1].value, false)
  assert.strictEqual(calls[0].context[2].value, null)
})

test('useSafeColors: false (default) — auto-hash can assign extended palette indices (10+)', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn, useSafeColors: false})

  // Add enough keys to statistically hit extended indices
  const keys = Array.from({length: 30}, (_, i) => `key-${i}`)
  for (const key of keys) log.addContext(key, key)
  log.info('test')

  const indices = calls[0].context.map(c => c.colorIndex)
  assert.ok(indices.some(i => i >= 10), `Expected at least one index >= 10, got: ${indices}`)
})

test('useSafeColors: true — auto-hash stays in safe zone 0-9', () => {
  const {fn, calls} = createSpyFormatter()
  const log = createFiro({formatter: fn, useSafeColors: true})

  const keys = Array.from({length: 30}, (_, i) => `key-${i}`)
  for (const key of keys) log.addContext(key, key)
  log.info('test')

  const indices = calls[0].context.map(c => c.colorIndex)
  assert.ok(indices.every(i => i >= 0 && i <= 9), `Expected all indices 0-9, got: ${indices}`)
})
