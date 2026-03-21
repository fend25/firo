# @cm/logger

The logger for Node.js, Bun and Deno you've been looking for.

Zero-config and beautiful dev output out of the box. Structured and robust NDJSON for prod.

Think of it as pino, but with brilliant DX.

## Features

- **Dev mode** — colored, timestamped, human-readable output with context badges
- **Prod mode** — structured NDJSON, one record per line, ready for log aggregators
- **Context system** — attach key/value pairs that beautifully appear in every subsequent log line
- **Child loggers** — inherit parent context, fully isolated from each other
- **Per-call context** — attach extra fields to a single log call without mutating state
- **Severity Level filtering** — globally or per-mode thresholds to reduce noise
- **Custom transports** — good dev and prod outputs out of the box, easily configurable or replaceable if needed.
- **Zero dependencies** — small and fast, no bloat, no native addons. Works on Node.js, Bun and Deno.

## Install

```bash
# for node.js, one of:
npm install @cm/logger
yarn add @cm/logger
pnpm add @cm/logger
npx jsr add @cm/logger

# or, for deno:
deno add jsr:@cm/logger
```


## Quick start

```ts
import { createLogger } from '@cm/logger'

const log = createLogger()

log.info('Server started')
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
const log = createLogger({ mode: 'dev' })
```

### Prod

Structured NDJSON. Everything goes to `stdout` — let your infrastructure route it.

```ts
const log = createLogger({ mode: 'prod' })

log.info('Request handled', { status: 200 })
// {"timestamp":"2024-01-15T14:32:01.204Z","level":"info","message":"Request handled","data":{"status":200}}
```

Error records include a serialized `error` field:

```ts
log.error('Query failed', new Error('timeout'))
// {"timestamp":"...","level":"error","message":"Query failed","error":{"name":"Error","message":"timeout","stack":"..."}}
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
log.addContext({ key: 'userId', value: 'u-789', options: { omitKey: true } })
// renders as [u-789] instead of [userId:u-789]

// Pin a specific color (0–9)
log.addContext({ key: 'region', value: 'eu-west', options: { colorIndex: 3 } })
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
  ctx: [{ key: 'userId', value: 42, options: { omitKey: true } }]
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
import type { TransportFn } from '@cm/logger'

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
import { createLogger } from '@cm/logger'

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

## Why not pino?

pino is great — especially in production. It's fast, structured, and pairs well with any log aggregator.

The problem is development. pino's default output is raw JSON — one giant line per log entry, completely unreadable. So you reach for `pino-pretty` - which is a distinct package and it's strange, configure a transport, maybe wrap it in a script... and suddenly you're maintaining logging infrastructure just to see what your app is doing.

And even then: one log entry with a moderately sized object takes 10-20 lines. Three requests in, your terminal is a wall of JSON and you can't see anything.

**@cm/logger is the opposite approach:**

- Context lives in colored badges `[requestId:abc]` `[userId:42]` on the same line — not dirty mixing with line-specific object fields in a single JSON tree
- Data objects are printed inline with `util.inspect`, compact by default — one line, not twenty. And may be expanded.
- Debug lines are visually dimmed — high-signal logs stay readable
- Zero config to get beautiful output — just `createLogger()` and go

**Message first, data second.** pino's signature is `log.info(obj, 'message')` — object comes first. Here it's `log.info('message', obj)` — always message first. Because the message is the point: it tells you *what happened* and *why you're even looking at this entry*. The data object is supporting evidence — useful, but secondary. Reading a wall of `{ userId: 42, token: '...', createdAt: '...' }` before you even know what event you're looking at is backwards.

**On child loggers:** in pino, `child()` is the only way to add context. Here you have a choice — 
mutate the instance with `addContext()` for module-level context, or use `child()` when you need 
a fully isolated snapshot. This is especially useful for traceable entities: create a pre-tuned 
child logger with `requestId`, `userId`, or `traceId` already attached, store it in request context 
(e.g. AsyncLocalStorage), and every log call downstream gets the right context automatically — 
no threading through function arguments.

In prod it emits clean NDJSON, same as pino. Your log aggregator won't know the difference.

## API reference

### `createLogger(config?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `mode` | `'dev' \| 'prod'` | `'dev'` | Selects the built-in transport |
| `minLevel` | `LogLevel` | `'debug'` | Minimum level for both modes |
| `minLevelInDev` | `LogLevel` | — | Overrides `minLevel` in dev mode |
| `minLevelInProd` | `LogLevel` | — | Overrides `minLevel` in prod mode |
| `transport` | `TransportFn` | — | Custom transport, overrides `mode` |
| `devTransportConfig` | `DevTransportConfig` | — | Options for the built-in dev transport |

### Logger methods

| Method | Description |
|---|---|
| `debug(msg, data?, opts?)` | Debug-level log (dimmed in dev) |
| `info(msg, data?, opts?)` | Info-level log |
| `warn(msg, data?, opts?)` | Warning |
| `error(msg, err?, opts?)` | Error — also accepts `error(err)` |
| `child(ctx)` | Create a child logger with additional context |
| `addContext(key, value, opts?)` | Add a context entry |
| `addContext(item)` | Add a context entry (object form) |
| `removeFromContext(key)` | Remove a context entry by key |
| `getContext()` | Return the current context array |

## License

MIT License
