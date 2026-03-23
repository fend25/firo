# firo 🌲

[![npm](https://img.shields.io/npm/v/@fend/firo)](https://www.npmjs.com/package/@fend/firo)
[![JSR](https://jsr.io/badges/@fend/firo)](https://jsr.io/@fend/firo)
[![JSR Score](https://jsr.io/badges/@fend/firo/score)](https://jsr.io/@fend/firo/score)
[![License: MIT](https://img.shields.io/badge/license-MIT-pink)](https://github.com/fend25/firo/blob/main/README.md)
[![Build](https://github.com/fend25/firo/actions/workflows/publish.yml/badge.svg)](https://github.com/fend25/firo/actions/workflows/publish.yml)
[![Best logger ever](https://img.shields.io/badge/best_logger-ever-166FFF)](https://github.com/fend25/firo)

**Spruce up your logs!**

The logger for Node.js, Bun and Deno you've been looking for.

Beautiful **dev** output - out of the box. Fast, structured NDJSON for **prod**.

Think of it as pino, but with brilliant DX.

## Demo

Beautiful colors in dev mode:

![firo in action](https://github.com/fend25/firo/blob/main/img/dev_mode.png?raw=true)

Structured NDJSON in production mode:

![firo prod output](https://github.com/fend25/firo/blob/main/img/prod_mode.png?raw=true)

## Features

- **Dev mode** — colored, timestamped, human-readable output with context badges
- **Prod mode** — structured NDJSON, one record per line
- **Context system** — attach key/value pairs that beautifully appear in every subsequent log line
- **Child loggers** — inherit parent context, fully isolated from each other
- **Per-call context** — attach extra fields to a single log call without mutating state
- **Severity Level filtering** — globally or per-mode thresholds to reduce noise
- **30 named colors** — `FIRO_COLORS` palette with great handpicked colors, plus raw ANSI/256-color/truecolor support
- **Zero dependencies** — small and fast, no bloat, no native addons. Works on Node.js, Bun and Deno.

## Install

```bash
# for node.js, one of:
npm install @fend/firo
yarn add @fend/firo
pnpm add @fend/firo

# for bun:
bun add @fend/firo

# for deno:
deno add jsr:@fend/firo
```

## Quick start

```ts
import { createFiro } from '@fend/firo'

const log = createFiro()

// log() is shorthand for log.info()
log('Server started')

log.warn('Disk usage high', { used: '92%' })
log.error('Connection lost', new Error('ECONNREFUSED'))
```

Dev output:
```
[14:32:01.204] Server started
[14:32:01.205] [WARN] Disk usage high { used: '92%' }
[14:32:01.206] [ERROR] Connection lost Error: ECONNREFUSED
```

## Modes

### Dev (default)

Colored, human-readable. Errors go to `stderr`, everything else to `stdout`.

```ts
const log = createFiro({ mode: 'dev' })
```

### Prod

Structured NDJSON. Everything goes to `stdout` — let your infrastructure route it.

```ts
const log = createFiro({ mode: 'prod' })

log.info('Request handled', { status: 200 })
// {"timestamp":"2024-01-15T14:32:01.204Z","level":"info","message":"Request handled","data":{"status":200}}
```

## Log levels

Four levels, in order: `debug` → `info` → `warn` → `error`.

```ts
log.debug('Cache miss', { user: 42, requestId: 'req-123' })
log.info('Request received')
log.warn('Retry attempt', { n: 3 })
log.error('Unhandled exception', err)
```

Debug lines are dimmed in dev mode to reduce visual noise.

### Filtering

```ts
const log = createFiro({ minLevel: 'warn' })
```

## Error signatures

`error()` accepts multiple call signatures:

```ts
// Message only will be automatically wrapped in an Error object to intentionally capture and preserve the stack trace
// because stack trace with a couple of extra levels of indirection is definitely better than no stack trace at all
log.error('Something went wrong')

// Message + Error object
log.error('Query failed', new Error('timeout'))

// Error object only
log.error(new Error('Unhandled'))

// Error + extra data
log.error(new Error('DB down'), { query: 'SELECT ...', reqId: 123 })

// Anything — will be coerced to Error
log.error(someUnknownThing)
```

## Context

Attach persistent key/value pairs to a logger instance. They appear in every log line.

```ts
const log = createFiro()

log.addContext('service', 'auth')
log.addContext('env', 'production')

log.info('Started')
// dev:  [14:32:01.204] [service:auth] [env:production] Started
// prod: {"level":"info","service":"auth","env":"production","message":"Started",...}
```

### Context options

Three ways to add context:

```ts
// 1. Simple key-value — just the basics
log.addContext('service', 'auth')

// 2. Key + value with options — when you need control
log.addContext('traceId', { value: 'abc-123-xyz', hideIn: 'dev' })
log.addContext('region', { value: 'west', color: '38;5;214' })

// 3. Object form — everything in one object
log.addContext({ key: 'userId', value: 'u-789', omitKey: true })
log.addContext({ key: 'span', value: 'xyz', color: '38;2;255;100;0' })
```

Available options (styles 2 and 3):

```ts
// Hide the key, show only the value: [u-789] instead of [userId:u-789]
log.addContext({ key: 'userId', value: 'u-789', omitKey: true })

// Pin a specific color by palette index (0–29)
log.addContext('region', { value: 'west', colorIndex: 3 })

// Use any ANSI color — 256-color, truecolor, anything
log.addContext('trace', { value: 'abc', color: '38;5;214' })       // 256-color orange
log.addContext({ key: 'span', value: 'xyz', color: '38;2;255;100;0' })  // truecolor

// Hide in dev — useful for traceIds that clutter the terminal
log.addContext('traceId', { value: 'abc-123-xyz', hideIn: 'dev' })

// Hide in prod — dev-only debugging context
log.addContext('debugTag', { value: 'perf-test', hideIn: 'prod' })
```

### Context API

```ts
log.getContext()        // ContextItem[]
log.hasInContext('key') // boolean
log.removeFromContext('env')
```

## Child loggers

Create a scoped logger that inherits the parent's context at the moment of creation. Parent and child are fully isolated — mutations on one do not affect the other.

```ts
const log = createFiro()
log.addContext('service', 'api')

const reqLog = log.child({ requestId: 'req-123', method: 'POST' })
reqLog.info('Request received')
// [service:api] [requestId:req-123] [method:POST] Request received

// Parent is unchanged
log.info('Still here')
// [service:api] Still here
```

Children can be nested arbitrarily:

```ts
const txLog = reqLog.child({ txId: 'tx-999' })
txLog.info('Transaction committed')
// [service:api] [requestId:req-123] [method:POST] [txId:tx-999] Transaction committed
```

## Per-call context

Add context to a single log call without touching the logger's state:

```ts
log.info('User action', payload, {
  ctx: [{ key: 'userId', value: 42, omitKey: true }]
})
```

Works on all log methods including `error`:

```ts
log.error('Payment failed', err, {
  ctx: [{ key: 'orderId', value: 7 }]
})
```

## Dev formatter options

Fine-tune the dev formatter's timestamp format. For example, to remove seconds and milliseconds:

```ts
import { createFiro } from '@fend/firo'

const log = createFiro({
  devFormatterConfig: {
    timeOptions: {
      hour: '2-digit',
      minute: '2-digit',
      second: undefined,
      fractionalSecondDigits: undefined
    }
  }
})
```

## Color palette

Most loggers give you monochrome walls of text. Firo gives you **30 handpicked colors** that make context badges instantly scannable — you stop reading and start seeing.

![firo color palette](https://github.com/fend25/firo/blob/main/img/color_madness.png?raw=true)

### How it works

By default, firo auto-assigns colors from all 30 palette colors using a hash of the context key. Similar keys like `user-1` and `user-2` land on different colors automatically.

You can also pin a specific color using `FIRO_COLORS` — a named palette with full IDE autocomplete:

```ts
import { createFiro, FIRO_COLORS } from '@fend/firo'

const log = createFiro()

log.addContext('region', { value: 'west', color: FIRO_COLORS.coral })
log.addContext('service', { value: 'auth', color: FIRO_COLORS.skyBlue })
log.addContext('env', { value: 'staging', color: FIRO_COLORS.lavender })
```

Available colors: `cyan`, `green`, `yellow`, `magenta`, `blue`, `brightCyan`, `brightGreen`, `brightYellow`, `brightMagenta`, `brightBlue`, `orange`, `pink`, `lilac`, `skyBlue`, `mint`, `salmon`, `lemon`, `lavender`, `sage`, `coral`, `teal`, `rose`, `pistachio`, `mauve`, `aqua`, `gold`, `thistle`, `seafoam`, `tangerine`, `periwinkle`.

### Want even more variety?

You can also pass any raw ANSI code as a string — 256-color, truecolor, go wild:

```ts
log.addContext('trace', { value: 'abc', color: '38;5;214' })         // 256-color
log.addContext('span', { value: 'xyz', color: '38;2;255;105;180' })  // truecolor pink
```

### Restrict to safe colors

If your terminal doesn't support 256 colors, you can restrict auto-hash to 10 basic terminal-safe colors:

```ts
const log = createFiro({ useSafeColors: true })
```

## Prod formatter options

Configure the prod (JSON) formatter's timestamp format:

```ts
// Epoch ms (faster, same as pino)
const log = createFiro({
  mode: 'prod',
  prodFormatterConfig: { timestamp: 'epoch' }
})
// {"timestamp":1711100000000,"level":"info","message":"hello"}

// ISO 8601 (default, human-readable)
const log = createFiro({ mode: 'prod' })
// {"timestamp":"2024-01-15T14:32:01.204Z","level":"info","message":"hello"}
```

### Custom destination

By default, prod formatter writes to `process.stdout`. You can redirect output to any object with a `.write(string)` method:

```ts
import { createFiro } from '@fend/firo'
import { createWriteStream } from 'node:fs'

// Write to a file
const log = createFiro({
  mode: 'prod',
  prodFormatterConfig: { dest: createWriteStream('/var/log/app.log') }
})

// Use SonicBoom for async buffered writes (same as pino)
import SonicBoom from 'sonic-boom'
const log = createFiro({
  mode: 'prod',
  prodFormatterConfig: { dest: new SonicBoom({ fd: 1 }) }
})
```

## Custom formatter

If for some reason all the options are not enough and you need to take full control of the output, you can provide your own formatter function.

```ts
import type { FormatterFn } from '@fend/firo'

const myFormatter: FormatterFn = (level, context, msg, data, opts) => {
  // level:   'debug' | 'info' | 'warn' | 'error'
  // context: ContextItemWithOptions[]
  // msg:     string | Error | unknown
  // data:    Error | unknown
  // opts:    LogOptions | undefined
}

const log = createFiro({ formatter: myFormatter })
```

You don't have to start from scratch — all the helpers we use internally are yours too:

#### FiroUtils

`FiroUtils` exposes helper functions useful for building custom formatters:

```ts
import { FiroUtils } from '@fend/firo'

FiroUtils.wrapToError(value)      // coerce unknown → Error
FiroUtils.serializeError(err)     // Error → plain object { message, stack, name, cause?, ... }
FiroUtils.safeStringify(obj)      // JSON.stringify with bigint support + fallback
FiroUtils.jsonReplacer            // replacer for JSON.stringify (handles bigint)
FiroUtils.extractMessage(msg)     // extract message string from string | Error | unknown
FiroUtils.colorize(text, idx, c?) // wrap text in ANSI color by palette index or raw code
FiroUtils.colorizeLevel(level, t) // wrap text in level color (red/yellow/dim)
```

## Best practices

### AsyncLocalStorage (Traceability)

The best way to use **firo** in web frameworks is to store a child logger in `AsyncLocalStorage`. This gives you automatic traceability (e.g. `requestId`) across your entire call stack without passing the logger as an argument.

```ts
import { AsyncLocalStorage } from 'node:util'
import { createFiro } from '@fend/firo'

const logger = createFiro()
const storage = new AsyncLocalStorage()

// Middleware — traceId is essential in prod logs but noisy in dev terminal
function middleware(req, res, next) {
  const reqLog = logger.child({
    traceId: { value: req.headers['x-trace-id'] || crypto.randomUUID(), hideIn: 'dev' },
    method: req.method
  })
  storage.run(reqLog, next)
}

// Deeply nested function — no logger passing needed
function someService() {
  const log = storage.getStore() ?? logger
  log.info('Service action performed')
  // dev:  [method:GET] Service action performed
  // prod: {"traceId":"a1b2c3","method":"GET","message":"Service action performed"}
}
```

## Why not pino?

**Pino** is Italian for *Pine*. It's a great, sturdy tree, especially in production.

But sometimes you need to **Spruce** up your development experience.

The problem with pino is development. Its default output is raw JSON — one giant line per log entry, completely unreadable. You reach for `pino-pretty`, and suddenly you're maintaining infrastructure just to see what your app is doing.

**firo** is the **Fir** of logging: elegant, refined, and designed to look great in your terminal, while remaining a rock-solid performer in the production forest.

- **Context first:** Badges like `[requestId:abc]` stay on the same line — no messy JSON trees.
- **Message first:** `log.info('message', data)` — because why you're looking at the log is more important than the supporting data.
- **Compact by default:** Objects are printed inline, one line, not twenty.
- **Visual hierarchy:** Debug lines are dimmed; high-signal logs stay readable.
- **Zero config:** Beautiful output from the first second.

In prod it emits clean NDJSON, same as pino. Your log aggregator won't know the difference. And the speed tax? Smaller than you'd think.

## Performance

Firo vs [pino](https://github.com/pinojs/pino) — head-to-head, both writing to stdout, same machine, same conditions.

| Scenario                       | pino ops/sec | firo ops/sec | pino ms | firo ms |  diff    |
| ------------------------------ | -----------: | -----------: | ------: | ------: | -------: |
| simple string                  |      941,986 |      812,970 |   106.2 |   123.0 |  +15.82% |
| string + small obj             |      749,782 |      673,332 |   133.4 |   148.5 |  +11.32% |
| string + bigger obj            |      582,000 |      523,643 |   171.8 |   191.0 |  +11.18% |
| with 3 context items           |      818,123 |      589,433 |   122.2 |   169.7 |  +38.87% |
| child logger (2 ctx)           |      807,551 |      592,472 |   123.8 |   168.8 |  +36.35% |
| deep child (7 ctx) + rich data |      408,246 |      314,244 |   245.0 |   318.2 |  +29.88% |
| error with Error obj           |      389,665 |      458,247 |   256.6 |   218.2 |  -14.96% |

<sub>Apple M1, Node.js 25, 10 runs × 100K logs per scenario.</sub>

Pino is backed by 10 years of relentless optimization: [SonicBoom](https://github.com/pinojs/sonic-boom) async writer, [fast-json-stringify](https://github.com/fastify/fast-json-stringify) with schema-compiled serialization, pre-serialized child context stored as raw JSON fragments, C++ worker threads. It is an obsessively optimized piece of engineering and fully deserves its reputation as the fastest logger in Node.js.

Firo uses the most vanilla tools imaginable — `JSON.stringify` and `process.stdout.write`, shipping since 2009. Zero dependencies. Zero tricks. ~30% behind pino on a realistic deep-child scenario with nested payloads. 15% ahead on error serialization.

For context, here's where the other loggers stand according to [pino's own benchmarks](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md) (basic "hello world", same machine): winston 174ms, bunyan 228ms, bole 107ms. firo's 123ms puts it comfortably ahead of winston and bunyan, neck and neck with bole — and all of that with a DX that none of them can match.

So yes — if you're looking for a pino alternative with gorgeous DX, structured context, and beautiful dev output, firo is right there performance-wise. Almost a drop-in replacement.*

<sub>* Okay, not exactly drop-in — we put the message first and the data second, like normal humans. `log.info("hello", data)` instead of `log.info(data, "hello")`. We'll let you decide which API sparks more joy.</sub>

Run the benchmark yourself: `pnpm bench`

## API reference

### Logger methods

| Method | Description |
|---|---|
| `debug(msg, data?, opts?)` | Debug-level log (dimmed in dev) |
| `info(msg, data?, opts?)` | Info-level log |
| `warn(msg, data?, opts?)` | Warning |
| `error(msg, err?, opts?)` | Error — also accepts `error(err)` |
| `child(ctx)` | Create a child logger with additional context |
| `addContext(key, value \| ext)` | Add a context entry |
| `addContext(item)` | Add a context entry (object form) |
| `removeFromContext(key)` | Remove a context entry by key |
| `getContext()` | Return the current context array |
| `hasInContext(key)` | Check if a context key exists |

### `createFiro(config?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `'dev' \| 'prod'` | `'dev'` | Selects the built-in formatter |
| `minLevel` | `LogLevel` | `'debug'` | Minimum log level |
| `formatter` | `FormatterFn` | — | Custom formatter, overrides `mode` |
| `devFormatterConfig` | `DevFormatterConfig` | — | Options for the built-in dev formatter |
| `prodFormatterConfig` | `ProdFormatterConfig` | — | Options for the built-in JSON prod formatter |
| `useSafeColors` | `boolean` | `false` | Restrict auto-hash to 10 terminal-safe colors (set `true` for basic terminals) |

### Context options

| Option | Type | Default | Description |
|---|---|---|---|
| `colorIndex` | `number` | auto | Color palette index (0–29) |
| `color` | `string` | — | Raw ANSI color code (e.g. `'38;5;214'`). Takes priority over `colorIndex` |
| `omitKey` | `boolean` | `false` | Hide the key, show only the value as `[value]` |
| `hideIn` | `'dev' \| 'prod'` | — | Hide this context item in dev or prod mode |

## License

MIT License
