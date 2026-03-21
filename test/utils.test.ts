import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getColorIndex, colorize, colorizeLevel, dim, LOG_LEVELS } from '../src/utils.ts'

test('LOG_LEVELS ordering', () => {
  assert.ok(LOG_LEVELS.debug < LOG_LEVELS.info)
  assert.ok(LOG_LEVELS.info < LOG_LEVELS.warn)
  assert.ok(LOG_LEVELS.warn < LOG_LEVELS.error)
})

test('getColorIndex — deterministic', () => {
  assert.strictEqual(getColorIndex('service'), getColorIndex('service'))
})

test('getColorIndex — in range 0..9', () => {
  for (const str of ['a', 'foo', 'user-1', 'user-2', '', 'a-very-long-string-value']) {
    const idx = getColorIndex(str)
    assert.ok(idx >= 0 && idx <= 9, `"${str}" gave index ${idx}`)
  }
})

test('getColorIndex — different strings get different indices', () => {
  const a = getColorIndex('user-1')
  const b = getColorIndex('user-2')
  assert.ok(a !== b, `"user-1" and "user-2" got same index ${a}`)
})

test('colorize wraps with ANSI code', () => {
  assert.strictEqual(colorize('hi', 0), '\x1b[36mhi\x1b[0m') // index 0 = cyan (36)
})

test('colorize handles out of bounds index safely', () => {
  assert.strictEqual(colorize('hi', 10), '\x1b[36mhi\x1b[0m') // index 10 wraps to 0
  assert.strictEqual(colorize('hi', 15), '\x1b[96mhi\x1b[0m') // wraps correctly
})

test('colorizeLevel — info returns unchanged', () => {
  assert.strictEqual(colorizeLevel('info', 'hello'), 'hello')
})

test('colorizeLevel — error wraps red', () => {
  assert.strictEqual(colorizeLevel('error', 'boom'), '\x1b[31mboom\x1b[0m')
})

test('colorizeLevel — warn wraps yellow', () => {
  assert.strictEqual(colorizeLevel('warn', 'careful'), '\x1b[33mcareful\x1b[0m')
})

test('colorizeLevel — debug wraps dim', () => {
  assert.strictEqual(colorizeLevel('debug', 'verbose'), '\x1b[2mverbose\x1b[0m')
})

test('dim wraps with ANSI dim', () => {
  assert.strictEqual(dim('text'), '\x1b[2mtext\x1b[0m')
})
