import test from 'node:test'
import assert from 'node:assert/strict'
import { getWeekRange, isTaskVisibleForCompletionFilter } from './completionFilter.js'

// 2026-08-19 は水曜日、2026-08-20 は木曜日（日本時間の日付境界を想定したローカル日時で検証する）
const WEDNESDAY = new Date(2026, 7, 19, 9, 0) // JST想定のローカル時刻
const THURSDAY = new Date(2026, 7, 20, 23, 59)

function completedAtLocal(y, m, d, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min).getTime()
}

test('getWeekRange: 月曜開始で水曜を含む週の範囲を返す', () => {
  const { startISO, endISO } = getWeekRange('2026-08-19', 1)
  assert.equal(startISO, '2026-08-17') // 月曜
  assert.equal(endISO, '2026-08-23') // 次の月曜の前日（日曜）
})

test('getWeekRange: 日曜開始の場合、開始曜日自身が週の起点になる', () => {
  const { startISO, endISO } = getWeekRange('2026-08-19', 0)
  assert.equal(startISO, '2026-08-16') // 直近の日曜
  assert.equal(endISO, '2026-08-22')
})

test('getWeekRange: todayISOが開始曜日そのものなら週の初日として扱う', () => {
  const { startISO, endISO } = getWeekRange('2026-08-17', 1) // 月曜
  assert.equal(startISO, '2026-08-17')
  assert.equal(endISO, '2026-08-23')
})

test('week フィルター: 当週内に完了したタスクは表示する', () => {
  const task = { completed: true, completedAt: completedAtLocal(2026, 8, 18) } // 火曜（当週）
  const settings = { completedFilter: 'week', weekStartDay: 1 }
  assert.equal(isTaskVisibleForCompletionFilter(task, settings, WEDNESDAY), true)
})

test('week フィルター: 前週に完了したタスクは表示しない', () => {
  const task = { completed: true, completedAt: completedAtLocal(2026, 8, 16) } // 前週の日曜
  const settings = { completedFilter: 'week', weekStartDay: 1 }
  assert.equal(isTaskVisibleForCompletionFilter(task, settings, WEDNESDAY), false)
})

test('week フィルター: 週替わり境界（開始曜日当日）は新しい週として扱う', () => {
  const task = { completed: true, completedAt: completedAtLocal(2026, 8, 17, 0, 5) } // 月曜0時台
  const settings = { completedFilter: 'week', weekStartDay: 1 }
  assert.equal(isTaskVisibleForCompletionFilter(task, settings, WEDNESDAY), true)
})

test('today フィルター: 当日完了のみ表示し、前日完了は非表示', () => {
  const settingsToday = { completedFilter: 'today', weekStartDay: 1 }
  const completedToday = { completed: true, completedAt: completedAtLocal(2026, 8, 20, 8, 0) }
  const completedYesterday = { completed: true, completedAt: completedAtLocal(2026, 8, 19, 23, 0) }
  assert.equal(isTaskVisibleForCompletionFilter(completedToday, settingsToday, THURSDAY), true)
  assert.equal(isTaskVisibleForCompletionFilter(completedYesterday, settingsToday, THURSDAY), false)
})

test('hidden フィルター: 完了済みタスクはすべて非表示', () => {
  const settings = { completedFilter: 'hidden', weekStartDay: 1 }
  const task = { completed: true, completedAt: completedAtLocal(2026, 8, 20) }
  assert.equal(isTaskVisibleForCompletionFilter(task, settings, THURSDAY), false)
})

test('未完了タスクはどのフィルターでも常に表示する', () => {
  const task = { completed: false, completedAt: null }
  for (const completedFilter of ['week', 'today', 'hidden']) {
    assert.equal(isTaskVisibleForCompletionFilter(task, { completedFilter, weekStartDay: 1 }, THURSDAY), true)
  }
})

test('完了日時が無い既存データ（移行前）は today/week フィルターで非表示になる（データは削除しない前提の表示制御）', () => {
  const legacyTask = { completed: true, completedAt: null }
  assert.equal(isTaskVisibleForCompletionFilter(legacyTask, { completedFilter: 'week', weekStartDay: 1 }, THURSDAY), false)
  assert.equal(isTaskVisibleForCompletionFilter(legacyTask, { completedFilter: 'today', weekStartDay: 1 }, THURSDAY), false)
})
