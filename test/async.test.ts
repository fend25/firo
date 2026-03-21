import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createLogger } from '../src/index.ts'

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

test('async: true — logs are written to stdout in prod mode', () => {
  const log = createLogger({ mode: 'prod', async: true })
  const { stdout } = captureOutput(() => {
    log.info('async test')
  })

  assert.ok(stdout.includes('async test'))
  const parsed = JSON.parse(stdout.trim())
  assert.strictEqual(parsed.message, 'async test')
})

test('async: true — handles multiple logs in order', () => {
  const log = createLogger({ mode: 'prod', async: true })
  const { stdout } = captureOutput(() => {
    log.info('one')
    log.info('two')
  })

  const lines = stdout.trim().split('\n')
  assert.strictEqual(lines.length, 2)
  assert.strictEqual(JSON.parse(lines[0]).message, 'one')
  assert.strictEqual(JSON.parse(lines[1]).message, 'two')
})

test('async: true — defers writing when stdout is full (backpressure)', () => {
  const log = createLogger({ mode: 'prod', async: true })
  
  let stdout = ''
  const origWrite = process.stdout.write
  let shouldReturnFalse = true
  
  // 1. Mock stdout so that it "fills up"
  process.stdout.write = ((chunk: string) => {
    stdout += chunk
    if (shouldReturnFalse) {
      shouldReturnFalse = false // Allow in next call
      return false // Stream is full!
    }
    return true
  }) as any

  try {
    // 2. Write first log — it will pass (as per flush logic),
    // but return false, blocking the queue for subsequent logs.
    log.info('first')
    
    // 3. Write second log — it should get stuck in the queue
    log.info('second')
    
    assert.ok(stdout.includes('first'))
    assert.ok(!stdout.includes('second'), 'Second log should be buffered, not written yet')

    // 4. Simulate 'drain' event (buffer freed)
    process.stdout.emit('drain')

    // 5. Now the second log should appear
    assert.ok(stdout.includes('second'), 'Second log should be flushed after drain event')
    
    // 6. Ensure no duplicates of 'second' log
    const matches = stdout.match(/second/g)
    assert.strictEqual(matches?.length, 1, 'Second log should only be written once')
  } finally {
    process.stdout.write = origWrite
  }
})
