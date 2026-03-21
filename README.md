# firo 🌲

**Spruce up your logs!** 

The logger for Node.js, Bun and Deno you've been looking for.

Beautiful **dev** output - out of the box. High-load ready NDJSON for **prod**.

Think of it as pino, but with brilliant DX.

## Demo

Beautiful colors in dev mode:

![firo in action](https://github.com/fend25/firo/blob/main/img/dev_mode.png?raw=true)

With fast and robust NDJSON flushing in production mode:

![firo prod output](https://github.com/fend25/firo/blob/main/img/prod_mode.png)

## Features

- **Dev mode** — colored, timestamped, human-readable output with context badges
- **Prod mode** — structured NDJSON, one record per line, with non-blocking buffered output for high-load production
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
import { createLogger } from '@fend/firo'

const log = createLogger()

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

[toc]

## Modes

### Dev (default)

Colored, human-readable. Errors go to `stderr`, everything else to `stdout`.

```ts
const log = createLogger({ mode: 'dev' })
```

### Prod

Structured NDJSON. Everything goes to `stdout` — let your infrastructure route it.

```ts
const log = createLogger({ mode: 'prod' })

log.info('Request handled', { status: 200 })
// {"timestamp":"2024-01-15T14:32:01.204Z","level":"info","message":"Request handled","data":{"status":200}}
```

#### Async mode (Prod only)

Prod mode uses asynchronous buffered output by default. Logs are queued and flushed when the stream is ready (handling backpressure), avoiding event loop blocking. All buffered logs are flushed synchronously if the process exits or crashes.

If you need synchronous writes (e.g. for debugging), disable it explicitly:

```ts
const log = createLogger({
  mode: 'prod',
  async: false // Force synchronous output
})
```

## Best practices

### AsyncLocalStorage (Traceability)

The best way to use **firo** in web frameworks is to store a child logger in `AsyncLocalStorage`. This gives you automatic traceability (e.g. `requestId`) across your entire call stack without passing the logger as an argument.

```ts
import { AsyncLocalStorage } from 'node:util'
import { createLogger } from '@fend/firo'

const logger = createLogger()
const storage = new AsyncLocalStorage()

// Middleware example
function middleware(req, res, next) {
  const reqLog = logger.child({ 
    requestId: req.headers['x-request-id'] || 'gen-123',
    method: req.method
  })
  storage.run(reqLog, next)
}

// Deeply nested function
function someService() {
  const log = storage.getStore() ?? logger
  log.info('Service action performed') 
  // Output: [requestId:gen-123] [method:GET] Service action performed
}
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
// Suppress debug in dev, keep everything in prod
const log = createLogger({
  minLevelInDev: 'info',
  minLevelInProd: 'warn',
})

// Or a single threshold for both modes
const log = createLogger({ minLevel: 'warn' })
```

## Context

Attach persistent key/value pairs to a logger instance. They appear in every log line.

```ts
const log = createLogger()

log.addContext('service', 'auth')
log.addContext('env', 'production')

log.info('Started')
// dev:  [14:32:01.204] [service:auth] [env:production] Started
// prod: {"level":"info","service":"auth","env":"production","message":"Started",...}
```

### Context options

```ts
// Hide the key, show only the value — useful for IDs
log.addContext({ key: 'userId', value: 'u-789', omitKey: true })
// renders as [u-789] instead of [userId:u-789]

// Pin a specific color (0–9)
log.addContext({ key: 'region', value: 'west', colorIndex: 3 })

// Use any ANSI color — 256-color, truecolor, anything
log.addContext({ key: 'trace', value: 'abc', color: '38;5;214' })       // 256-color orange
log.addContext({ key: 'span', value: 'xyz', color: '38;2;255;100;0' })  // truecolor
```

### Remove context

```ts
log.removeFromContext('env')
```

### Read context

```ts
const ctx = log.getContext() // ContextItem[]
```

## Child loggers

Create a scoped logger that inherits the parent's context at the moment of creation. Parent and child are fully isolated — mutations on one do not affect the other.

```ts
const log = createLogger()
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

## Error signatures

`error()` accepts multiple call signatures:

```ts
// Message only
log.error('Something went wrong')

// Message + Error object
log.error('Query failed', new Error('timeout'))

// Error object only
log.error(new Error('Unhandled'))

// Anything — will be coerced to Error
log.error(someUnknownThing)
```

## Custom transport

Provide your own transport function to take full control of output:

```ts
import type { TransportFn } from '@fend/firo'

const myTransport: TransportFn = (level, context, msg, data, opts) => {
  // level:   'debug' | 'info' | 'warn' | 'error'
  // context: ContextItemWithOptions[]
  // msg:     string | Error | unknown
  // data:    Error | unknown
  // opts:    LogOptions | undefined
}

const log = createLogger({ transport: myTransport })
```

## Dev transport options

Fine-tune the dev transport's timestamp format. For example, to remove seconds and milliseconds:

```ts
import { createLogger } from '@fend/firo'

const log = createLogger({
  devTransportConfig: {
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

Most loggers give you monochrome walls of text. firo gives you **30 handpicked colors** that make context badges instantly scannable — you stop reading and start seeing.

![firo color palette](https://github.com/fend25/firo/blob/main/img/color_madness.png)

### How it works

By default, firo auto-assigns colors from 10 terminal-safe base colors using a hash of the context key. Similar keys like `user-1` and `user-2` land on different colors automatically.

But the real fun starts when you reach for `FIRO_COLORS` — a named palette of 30 colors with full IDE autocomplete:

```ts
import { createLogger, FIRO_COLORS } from '@fend/firo'

const log = createLogger()

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

### Use all 30 colors for auto-hash

By default, auto-hash only picks from the 10 basic terminal-safe colors. If your terminal supports 256 colors (most modern terminals do), unleash the full palette:

```ts
const log = createLogger({ useAllColors: true })

// Now every context key auto-gets one of 30 distinct colors
log.addContext('service', 'api')
log.addContext('region', 'west')
log.addContext('pod', 'web-3')
// Each badge is a different, beautiful color — no configuration needed
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

In prod it emits clean NDJSON, same as pino. Your log aggregator won't know the difference.

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

### `createLogger(config?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `'dev' \| 'prod'` | `'dev'` | Selects the built-in transport |
| `minLevel` | `LogLevel` | `'debug'` | Minimum level for both modes |
| `minLevelInDev` | `LogLevel` | — | Overrides `minLevel` in dev mode |
| `minLevelInProd` | `LogLevel` | — | Overrides `minLevel` in prod mode |
| `transport` | `TransportFn` | — | Custom transport, overrides `mode` |
| `devTransportConfig` | `DevTransportConfig` | — | Options for the built-in dev transport |
| `async` | `boolean` | `true` in prod | Enable non-blocking output (Prod mode only) |
| `useAllColors` | `boolean` | `false` | Use all 30 palette colors for auto-hash (instead of 10 safe) |

## License

MIT License
