import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldGenerateToday, generateRecurringTasks } from './recurring.js'

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

// 起点日（startDate）を持つ繰り返しは、起点日より前に自動生成しない
test('daily template with a future startDate does not generate before the start date', () => {
  const startDate = '2026-08-10'
  assert.equal(shouldGenerateToday({ recurrence: 'daily', startDate }, '2026-08-09'), false)
  assert.equal(shouldGenerateToday({ recurrence: 'daily', startDate }, startDate), true)
  assert.equal(shouldGenerateToday({ recurrence: 'daily', startDate }, '2026-08-11'), true)
})

test('weekly template with a future startDate does not generate on an earlier matching weekday', () => {
  const startDate = '2026-08-10' // 起点日（例: 来週月曜として選ばれた期限日）
  const weekDay = new Date(startDate + 'T00:00:00').getDay()
  const oneWeekEarlierSameWeekday = '2026-08-03' // startDateと同じ曜日だが1週間前
  const oneWeekLater = '2026-08-17'
  assert.equal(shouldGenerateToday({ recurrence: 'weekly', weekDay, startDate }, oneWeekEarlierSameWeekday), false)
  assert.equal(shouldGenerateToday({ recurrence: 'weekly', weekDay, startDate }, startDate), true)
  assert.equal(shouldGenerateToday({ recurrence: 'weekly', weekDay, startDate }, oneWeekLater), true)
})

test('monthly template with a future startDate does not generate on an earlier matching day-of-month', () => {
  const startDate = '2026-09-30' // 起点日（例: 月末日として選ばれた期限日）
  const monthDay = new Date(startDate + 'T00:00:00').getDate()
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay, startDate }, '2026-08-30'), false)
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay, startDate }, startDate), true)
  assert.equal(shouldGenerateToday({ recurrence: 'monthly', monthDay, startDate }, '2026-10-30'), true)
})

test('generateRecurringTasks does not duplicate the task already generated on the start date', () => {
  const startDate = '2026-08-10'
  const tmpl = {
    id: 'weekly-template',
    title: '来週月曜からの週次タスク',
    recurrence: 'weekly',
    weekDay: new Date(startDate + 'T00:00:00').getDay(),
    startDate,
  }
  const existingTasks = [{
    id: 'existing-id',
    title: tmpl.title,
    completed: false,
    parentId: null,
    createdAt: Date.now(),
    dueDate: startDate,
    generatedFrom: tmpl.id,
    generatedDate: startDate,
  }]
  const now = new Date(startDate + 'T09:00:00')

  const result = generateRecurringTasks(existingTasks, [tmpl], now)

  assert.equal(result, existingTasks)
})

test('generateRecurringTasks generates the next occurrence after the start date without touching earlier dates', () => {
  const startDate = '2026-08-10'
  const weekDay = new Date(startDate + 'T00:00:00').getDay()
  const tmpl = { id: 'weekly-template', title: '週次タスク', recurrence: 'weekly', weekDay, startDate }
  const existingTasks = [{
    id: 'existing-id',
    title: tmpl.title,
    completed: false,
    parentId: null,
    createdAt: Date.now(),
    dueDate: startDate,
    generatedFrom: tmpl.id,
    generatedDate: startDate,
  }]

  const dayBeforeStart = new Date(new Date(startDate + 'T00:00:00').getTime() - 24 * 60 * 60 * 1000)
  const beforeStart = generateRecurringTasks(existingTasks, [tmpl], dayBeforeStart)
  assert.equal(beforeStart, existingTasks)

  const nextOccurrence = '2026-08-17'
  const result = generateRecurringTasks(existingTasks, [tmpl], new Date(nextOccurrence + 'T09:00:00'))

  assert.equal(result.length, 2)
  assert.equal(result[1].dueDate, nextOccurrence)
  assert.equal(result[1].generatedFrom, tmpl.id)
})
