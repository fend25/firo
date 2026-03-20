# @cm/logger

A structured logger with a human face. Beautiful colored output in development, clean NDJSON in production — same API, zero config.

## Features

- **Dev mode** — colored, timestamped, human-readable output with context badges
- **Prod mode** — structured NDJSON, one record per line, ready for log aggregators
- **Context system** — attach key/value pairs that appear in every subsequent log line
- **Child loggers** — inherit parent context, fully isolated from each other
- **Per-call context** — attach extra fields to a single log call without mutating state
- **Level filtering** — per-mode overrides (`minLevelInDev`, `minLevelInProd`)
- **Custom transports** — swap the output layer entirely
- **Zero dependencies**

## Install

```bash
npm install @cm/logger
```

```bash
# JSR
npx jsr add @cm/logger
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
log.debug('Cache miss', { key: 'user:42' })
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
  ctx: [{ key: 'userId', value: 'u-42', options: { omitKey: true } }]
})
```

Works on all log methods including `error`:

```ts
log.error('Payment failed', err, {
  ctx: [{ key: 'orderId', value: 'ord-7' }]
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

Fine-tune the dev transport's timestamp format:

```ts
import { createLogger, createDevTransport } from '@cm/logger'

const log = createLogger({
  transport: createDevTransport({
    locale: 'en-US',
    timeOptions: { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' },
  })
})
```

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
