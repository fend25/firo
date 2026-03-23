import { createFiro } from '../src/index.ts'
import pino from 'pino'

const RUNS = 10
const BATCH = 100_000
const TOTAL = BATCH * RUNS
const results: {scenario: string, firo: string, pino: string, firoMs: string, pinoMs: string}[] = []

let benchStart = 0
let benchIndex = 0
const SCENARIOS = 7

function bench(name: string, setupFiro: () => () => void, setupPino: () => () => void) {
  benchIndex++
  w(`  [${benchIndex}/${SCENARIOS}] "${name}" ...`)
  const testStart = performance.now()

  const fnFiro = setupFiro()
  const fnPino = setupPino()

  // warmup
  for (let i = 0; i < 100; i++) { fnFiro(); fnPino() }

  // bench firo
  const startFiro = performance.now()
  for (let i = 0; i < RUNS; i++) {
    for (let j = 0; j < BATCH; j++) fnFiro()
  }
  const elapsedFiro = performance.now() - startFiro

  // bench pino
  const startPino = performance.now()
  for (let i = 0; i < RUNS; i++) {
    for (let j = 0; j < BATCH; j++) fnPino()
  }
  const elapsedPino = performance.now() - startPino

  const testElapsed = ((performance.now() - testStart) / 1000).toFixed(1)
  const totalSoFar = ((performance.now() - benchStart) / 1000).toFixed(1)
  w(` done in ${testElapsed}s (total ${totalSoFar}s)\n`)

  const opsFiro = Math.round(TOTAL / (elapsedFiro / 1000))
  const opsPino = Math.round(TOTAL / (elapsedPino / 1000))

  results.push({
    scenario: name,
    firo: opsFiro.toLocaleString(),
    pino: opsPino.toLocaleString(),
    firoMs: (elapsedFiro / RUNS).toFixed(1),
    pinoMs: (elapsedPino / RUNS).toFixed(1),
  })
}

const w = (s: string) => process.stderr.write(s)

w(`\n  🌲 firo vs pino — prod benchmark\n\n`)
w(`  Running ${SCENARIOS} scenarios, ${RUNS} runs × ${BATCH.toLocaleString()} logs each = ${TOTAL.toLocaleString()} logs total.\n`)
w(`  This will take a moment. Sit back and relax.\n\n`)

const totalStart = performance.now()
benchStart = totalStart

const initFiro = () => createFiro({mode: "prod", prodTransportConfig: {timestamp: "epoch"}})
const initPino = () => pino({timestamp: () => `,"timestamp":${Date.now()}`})

bench("simple string",
  () => { const log = initFiro(); return () => log.info("Hello world") },
  () => { const log = initPino(); return () => log.info("Hello world") },
)

bench("string + small obj",
  () => { const log = initFiro(); return () => log.info("Request handled", { status: 200, method: "GET" }) },
  () => { const log = initPino(); return () => log.info({ status: 200, method: "GET" }, "Request handled") },
)

bench("string + bigger obj",
  () => { const log = initFiro(); return () => log.info("Request", { status: 200, method: "GET", path: "/api/users", duration: 42, headers: { "content-type": "application/json", "x-request-id": "abc-123" } }) },
  () => { const log = initPino(); return () => log.info({ status: 200, method: "GET", path: "/api/users", duration: 42, headers: { "content-type": "application/json", "x-request-id": "abc-123" } }, "Request") },
)

bench("with 3 context items",
  () => {
    const log = initFiro()
    log.addContext("service", "api")
    log.addContext("env", "production")
    log.addContext("pod", "web-3")
    return () => log.info("Request", { status: 200 })
  },
  () => {
    const log = initPino().child({ service: "api", env: "production", pod: "web-3" })
    return () => log.info({ status: 200 }, "Request")
  },
)

bench("child logger (2 ctx)",
  () => {
    const log = initFiro()
    log.addContext("service", "api")
    const child = log.child({ requestId: "req-123", method: "POST" })
    return () => child.info("Handled", { status: 200 })
  },
  () => {
    const base = initPino().child({ service: "api" })
    const child = base.child({ requestId: "req-123", method: "POST" })
    return () => child.info({ status: 200 }, "Handled")
  },
)

const richData = {
  status: 200,
  duration: 142,
  path: "/api/v2/orders",
  ip: "192.168.1.42",
  bytes: 2048,
  cache: "miss",
  response: {
    contentType: "application/json",
    compressed: true,
    items: 25,
  },
  auth: {
    role: "admin",
    scope: "write",
    expiresIn: 3600,
  },
}

bench("deep child (7 ctx) + rich data",
  () => {
    const base = initFiro()
    base.addContext("service", "api")
    base.addContext("env", "production")
    base.addContext("region", "eu-west-1")
    const child1 = base.child({ requestId: "req-abc-123", method: "POST" })
    const child2 = child1.child({ userId: "usr-42", traceId: "trace-xyz-789" })
    return () => child2.info("Order processed", richData)
  },
  () => {
    const base = initPino()
      .child({ service: "api", env: "production", region: "eu-west-1" })
      .child({ requestId: "req-abc-123", method: "POST" })
      .child({ userId: "usr-42", traceId: "trace-xyz-789" })
    return () => base.info(richData, "Order processed")
  },
)

bench("error with Error obj",
  () => {
    const log = initFiro()
    const err = new Error("ECONNREFUSED")
    return () => log.error("Connection lost", err)
  },
  () => {
    const log = initPino()
    const err = new Error("ECONNREFUSED")
    return () => log.error({ err }, "Connection lost")
  },
)

const totalElapsed = ((performance.now() - totalStart) / 1000).toFixed(1)

const S = 34, O = 14, M = 8, P = 9
const c = (s: number) => '─'.repeat(s + 2)
const row = (a: string, b: string, c: string, d: string, e: string, f: string) =>
  `  │ ${a} │ ${b} │ ${c} │ ${d} │ ${e} │ ${f} │`

w(`\n  ms = avg time per ${BATCH.toLocaleString()} logs (lower is better)\n\n`)
w(`  ┌${c(S)}┬${c(O)}┬${c(O)}┬${c(M)}┬${c(M)}┬${c(P)}┐\n`)
w(row('Scenario'.padEnd(S), 'pino'.padStart(O), 'firo'.padStart(O), 'pino'.padStart(M), 'firo'.padStart(M), 'diff'.padStart(P)) + '\n')
w(row(''.padEnd(S), 'ops/sec'.padStart(O), 'ops/sec'.padStart(O), 'ms'.padStart(M), 'ms'.padStart(M), '%'.padStart(P)) + '\n')
w(`  ├${c(S)}┼${c(O)}┼${c(O)}┼${c(M)}┼${c(M)}┼${c(P)}┤\n`)
for (const r of results) {
  const diff = (parseFloat(r.firoMs) / parseFloat(r.pinoMs) - 1) * 100
  const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(2) + '%'
  w(row(r.scenario.padEnd(S), r.pino.padStart(O), r.firo.padStart(O), r.pinoMs.padStart(M), r.firoMs.padStart(M), diffStr.padStart(P)) + '\n')
}
w(`  └${c(S)}┴${c(O)}┴${c(O)}┴${c(M)}┴${c(M)}┴${c(P)}┘\n\n`)
w(`  Done in ${totalElapsed}s. Happy logging! 🪵\n\n`)
