import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getColorIndex, colorize, colorizeLevel, LOG_LEVELS, FIRO_COLORS } from '../src/utils.ts'

test('LOG_LEVELS ordering', () => {
  assert.ok(LOG_LEVELS.debug < LOG_LEVELS.info)
  assert.ok(LOG_LEVELS.info < LOG_LEVELS.warn)
  assert.ok(LOG_LEVELS.warn < LOG_LEVELS.error)
})

test('getColorIndex — deterministic', () => {
  assert.strictEqual(getColorIndex('service'), getColorIndex('service'))
})

test('getColorIndex — default range 0..29 (all colors)', () => {
  for (const str of ['a', 'foo', 'user-1', 'user-2', '', 'a-very-long-string-value']) {
    const idx = getColorIndex(str)
    assert.ok(idx >= 0 && idx <= 29, `"${str}" gave index ${idx}`)
  }
})

test('getColorIndex — safe range 0..9 when useSafeColors', () => {
  for (const str of ['a', 'foo', 'user-1', 'user-2', '', 'a-very-long-string-value']) {
    const idx = getColorIndex(str, true)
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

test('colorize — extended palette index returns 256-color', () => {
  assert.strictEqual(colorize('hi', 10), '\x1b[38;5;214mhi\x1b[0m') // index 10 = Orange
  assert.strictEqual(colorize('hi', 15), '\x1b[38;5;210mhi\x1b[0m') // index 15 = Salmon
})

test('colorize — out of bounds index wraps to safe zone', () => {
  assert.strictEqual(colorize('hi', 999), '\x1b[94mhi\x1b[0m') // 999 % 10 = 9 → Bright Blue
  assert.strictEqual(colorize('hi', 30), '\x1b[36mhi\x1b[0m')  // 30 % 10 = 0 → Cyan
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

test('FIRO_COLORS — has 30 named colors', () => {
  const values = Object.values(FIRO_COLORS)
  assert.strictEqual(values.length, 30)
})

test('FIRO_COLORS — named values match expected ANSI codes', () => {
  assert.strictEqual(FIRO_COLORS.cyan, '36')
  assert.strictEqual(FIRO_COLORS.orange, '38;5;214')
  assert.strictEqual(FIRO_COLORS.skyBlue, '38;5;117')
})

test('FIRO_COLORS — works with colorize via color param', () => {
  assert.strictEqual(colorize('hi', 0, FIRO_COLORS.coral), '\x1b[38;5;209mhi\x1b[0m')
})
