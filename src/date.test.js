import test from 'node:test'
import assert from 'node:assert/strict'
import { getLocalDateISO } from './date.js'
import { generateRecurringTasks } from './recurring.js'

test('formats the date using local calendar values', () => {
  const localDate = new Date(2026, 5, 9, 0, 30)

  assert.equal(getLocalDateISO(localDate), '2026-06-09')
})

test('pads single-digit months and days', () => {
  const localDate = new Date(2026, 0, 2, 12, 0)

  assert.equal(getLocalDateISO(localDate), '2026-01-02')
})

test('uses the local date for recurring task generation', () => {
  const now = new Date(2026, 5, 9, 0, 30)
  const templates = [{
    id: 'daily-template',
    title: 'Daily task',
    recurrence: 'daily',
  }]

  const generated = generateRecurringTasks([], templates, now)

  assert.equal(generated.length, 1)
  assert.equal(generated[0].dueDate, '2026-06-09')
  assert.equal(generated[0].generatedDate, '2026-06-09')
})
