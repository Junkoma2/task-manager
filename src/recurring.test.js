import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldGenerateToday } from './recurring.js'

// Issue #124: weekDay=0（日曜）が正しく扱われること
test('weekly template with weekDay 0 generates on Sunday', () => {
  // 2026-06-14 は日曜日
  assert.equal(shouldGenerateToday({ recurrence: 'weekly', weekDay: 0 }, '2026-06-14'), true)
})

test('weekly template with weekDay 0 does not generate on Monday', () => {
  // 2026-06-15 は月曜日
  assert.equal(shouldGenerateToday({ recurrence: 'weekly', weekDay: 0 }, '2026-06-15'), false)
})

test('weekly template generates only on its weekday', () => {
  // 2026-06-17 は水曜日
  assert.equal(shouldGenerateToday({ recurrence: 'weekly', weekDay: 3 }, '2026-06-17'), true)
  assert.equal(shouldGenerateToday({ recurrence: 'weekly', weekDay: 3 }, '2026-06-18'), false)
})

// Issue #125: monthDayが存在しない月は月末日にフォールバック
test('monthly template with monthDay 31 generates on the last day of February', () => {
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay: 31 }, '2026-02-28'), true)
})

test('monthly template with monthDay 31 generates on Feb 29 in a leap year', () => {
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay: 31 }, '2028-02-29'), true)
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay: 31 }, '2028-02-28'), false)
})

test('monthly template with monthDay 31 generates on Apr 30', () => {
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay: 31 }, '2026-04-30'), true)
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay: 31 }, '2026-04-29'), false)
})

test('monthly template with monthDay 31 still generates on the 31st when it exists', () => {
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay: 31 }, '2026-05-31'), true)
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay: 31 }, '2026-05-30'), false)
})

test('monthly template with monthDay 15 is unaffected by the fallback', () => {
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay: 15 }, '2026-02-15'), true)
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay: 15 }, '2026-02-28'), false)
})
