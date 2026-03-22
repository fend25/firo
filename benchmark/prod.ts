import { createFiro } from '../src/index.ts'

const RUNS = 10
const BATCH = 100_000
const TOTAL = BATCH * RUNS
const results: {scenario: string, 'ops/sec': string, ms: string}[] = []

function bench(name: string, setup: () => () => void) {
  const fn = setup()
  for (let i = 0; i < 100; i++) fn()

  const start = performance.now()
  for (let i = 0; i < RUNS; i++) {
    for (let j = 0; j < BATCH; j++) fn()
  }
  const elapsed = performance.now() - start
  const opsPerSec = Math.round(TOTAL / (elapsed / 1000))
  results.push({scenario: name, 'ops/sec': opsPerSec.toLocaleString(), ms: (elapsed / RUNS).toFixed(1)})
}

const w = (s: string) => process.stderr.write(s)

w(`\n  🌲 firo prod benchmark\n\n`)
w(`  Running 6 scenarios, ${RUNS} runs × ${BATCH.toLocaleString()} logs each = ${TOTAL.toLocaleString()} logs total.\n`)
w(`  This will take ~10-15 seconds. Sit back and relax.\n\n`)

const totalStart = performance.now()

const initLogger = () => {
  return createFiro({mode: "prod", prodTransportConfig: {timestamp: "epoch"}})
}

bench("simple string", () => {
  const log = initLogger()
  return () => log.info("Hello world")
})

bench("string + small obj", () => {
  const log = initLogger()
  return () => log.info("Request handled", { status: 200, method: "GET" })
})

bench("string + bigger obj", () => {
  const log = initLogger()
  return () => log.info("Request", { status: 200, method: "GET", path: "/api/users", duration: 42, headers: { "content-type": "application/json", "x-request-id": "abc-123" } })
})

bench("with 3 context items", () => {
  const log = initLogger()
  log.addContext("service", "api")
  log.addContext("env", "production")
  log.addContext("pod", "web-3")
  return () => log.info("Request", { status: 200 })
})

bench("child logger (2 ctx)", () => {
  const log = initLogger()
  log.addContext("service", "api")
  const child = log.child({ requestId: "req-123", method: "POST" })
  return () => child.info("Handled", { status: 200 })
})

bench("error with Error obj", () => {
  const log = initLogger()
  const err = new Error("ECONNREFUSED")
  return () => log.error("Connection lost", err)
})

const totalElapsed = ((performance.now() - totalStart) / 1000).toFixed(1)

w(`  ms = avg time per ${BATCH.toLocaleString()} logs (lower is better)\n\n`)
w(`  ┌──────────────────────────────┬──────────────┬────────┐\n`)
w(`  │ Scenario                     │      ops/sec │     ms │\n`)
w(`  ├──────────────────────────────┼──────────────┼────────┤\n`)
for (const r of results) {
  w(`  │ ${r.scenario.padEnd(28)} │ ${r['ops/sec'].padStart(12)} │ ${String(r.ms).padStart(6)} │\n`)
}
w(`  └──────────────────────────────┴──────────────┴────────┘\n\n`)
w(`  Done in ${totalElapsed}s. Happy logging! 🪵\n\n`)
