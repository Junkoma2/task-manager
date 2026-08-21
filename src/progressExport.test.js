import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isTaskInProgressRange,
  buildProgressReportText,
  getDefaultProgressRange,
  PROGRESS_DONE_SYMBOL,
  PROGRESS_OPEN_SYMBOL,
} from './progressExport.js'

function completedAtLocal(y, m, d, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min).getTime()
}

function task(overrides) {
  return {
    id: overrides.id ?? 'id',
    title: overrides.title ?? 'タスク',
    completed: false,
    completedAt: null,
    parentId: null,
    dueDate: null,
    ...overrides,
  }
}

test('isTaskInProgressRange: 期間内に完了したタスクは対象', () => {
  const t = task({ completed: true, completedAt: completedAtLocal(2026, 8, 15) })
  assert.equal(isTaskInProgressRange(t, { startDate: '2026-08-10', endDate: '2026-08-20' }), true)
})

test('isTaskInProgressRange: 期間境界（開始日・終了日当日）に完了したタスクは対象', () => {
  const start = task({ completed: true, completedAt: completedAtLocal(2026, 8, 10, 0, 5) })
  const end = task({ completed: true, completedAt: completedAtLocal(2026, 8, 20, 23, 55) })
  assert.equal(isTaskInProgressRange(start, { startDate: '2026-08-10', endDate: '2026-08-20' }), true)
  assert.equal(isTaskInProgressRange(end, { startDate: '2026-08-10', endDate: '2026-08-20' }), true)
})

test('isTaskInProgressRange: 期間外に完了したタスクは対象外', () => {
  const before = task({ completed: true, completedAt: completedAtLocal(2026, 8, 9) })
  const after = task({ completed: true, completedAt: completedAtLocal(2026, 8, 21) })
  assert.equal(isTaskInProgressRange(before, { startDate: '2026-08-10', endDate: '2026-08-20' }), false)
  assert.equal(isTaskInProgressRange(after, { startDate: '2026-08-10', endDate: '2026-08-20' }), false)
})

test('isTaskInProgressRange: 完了日時が無い完了タスクは対象外', () => {
  const t = task({ completed: true, completedAt: null })
  assert.equal(isTaskInProgressRange(t, { startDate: '2026-08-10', endDate: '2026-08-20' }), false)
})

test('isTaskInProgressRange: 開始日より前に期限超過した未完了タスクも対象', () => {
  const t = task({ completed: false, dueDate: '2026-08-01' })
  assert.equal(isTaskInProgressRange(t, { startDate: '2026-08-10', endDate: '2026-08-20' }), true)
})

test('isTaskInProgressRange: 終了日より後が期限の未完了タスクは対象外', () => {
  const t = task({ completed: false, dueDate: '2026-08-21' })
  assert.equal(isTaskInProgressRange(t, { startDate: '2026-08-10', endDate: '2026-08-20' }), false)
})

test('isTaskInProgressRange: 期限が終了日当日の未完了タスクは対象', () => {
  const t = task({ completed: false, dueDate: '2026-08-20' })
  assert.equal(isTaskInProgressRange(t, { startDate: '2026-08-10', endDate: '2026-08-20' }), true)
})

test('isTaskInProgressRange: 期限なしの未完了タスクはincludeNoDueDateで切り替わる', () => {
  const t = task({ completed: false, dueDate: null })
  assert.equal(isTaskInProgressRange(t, { startDate: '2026-08-10', endDate: '2026-08-20', includeNoDueDate: false }), false)
  assert.equal(isTaskInProgressRange(t, { startDate: '2026-08-10', endDate: '2026-08-20', includeNoDueDate: true }), true)
})

test('buildProgressReportText: 対象が無ければ空文字列', () => {
  const tasks = [task({ id: 'a', completed: false, dueDate: '2026-09-01' })]
  assert.equal(buildProgressReportText(tasks, { startDate: '2026-08-10', endDate: '2026-08-20' }), '')
})

test('buildProgressReportText: 完了・未完了の記号と改行で出力する', () => {
  const tasks = [
    task({ id: 'a', title: '日本語タスクA', completed: true, completedAt: completedAtLocal(2026, 8, 15) }),
    task({ id: 'b', title: 'タスクB', completed: false, dueDate: '2026-08-05' }),
  ]
  const text = buildProgressReportText(tasks, { startDate: '2026-08-10', endDate: '2026-08-20' })
  assert.equal(text, `${PROGRESS_DONE_SYMBOL} 日本語タスクA\n${PROGRESS_OPEN_SYMBOL} タスクB`)
})

test('buildProgressReportText: 子タスクは全角スペース1つで親子階層を保つ', () => {
  const tasks = [
    task({ id: 'parent', title: '親タスク', completed: false, dueDate: '2026-09-01' }),
    task({ id: 'child', title: '子タスク', parentId: 'parent', completed: true, completedAt: completedAtLocal(2026, 8, 15) }),
  ]
  const text = buildProgressReportText(tasks, { startDate: '2026-08-10', endDate: '2026-08-20' })
  assert.equal(text, [
    PROGRESS_OPEN_SYMBOL + ' 親タスク',
    '　' + PROGRESS_DONE_SYMBOL + ' 子タスク',
  ].join('\n'))
})

test('buildProgressReportText: 対象外の親タスクも文脈として実際の状態で含める', () => {
  const tasks = [
    task({ id: 'parent', title: '対象外の親', completed: true, completedAt: completedAtLocal(2026, 7, 1) }),
    task({ id: 'child', title: '対象の子', parentId: 'parent', completed: true, completedAt: completedAtLocal(2026, 8, 15) }),
  ]
  const text = buildProgressReportText(tasks, { startDate: '2026-08-10', endDate: '2026-08-20' })
  assert.equal(text, [
    PROGRESS_DONE_SYMBOL + ' 対象外の親',
    '　' + PROGRESS_DONE_SYMBOL + ' 対象の子',
  ].join('\n'))
})

test('buildProgressReportText: 孫タスクは深さに応じて全角スペースを重ねる', () => {
  const tasks = [
    task({ id: 'gp', title: '祖父タスク', completed: false, dueDate: '2026-09-01' }),
    task({ id: 'p', title: '親タスク', parentId: 'gp', completed: false, dueDate: '2026-09-01' }),
    task({ id: 'c', title: '子タスク', parentId: 'p', completed: true, completedAt: completedAtLocal(2026, 8, 15) }),
  ]
  const text = buildProgressReportText(tasks, { startDate: '2026-08-10', endDate: '2026-08-20' })
  assert.equal(text, [
    PROGRESS_OPEN_SYMBOL + ' 祖父タスク',
    '　' + PROGRESS_OPEN_SYMBOL + ' 親タスク',
    '　　' + PROGRESS_DONE_SYMBOL + ' 子タスク',
  ].join('\n'))
})

test('buildProgressReportText: 開始日が終了日より後なら空文字列', () => {
  const tasks = [task({ id: 'a', completed: false, dueDate: '2026-08-01' })]
  assert.equal(buildProgressReportText(tasks, { startDate: '2026-08-20', endDate: '2026-08-10' }), '')
})

test('getDefaultProgressRange: 直近7日間（当日を含む）を返す', () => {
  const { startDate, endDate } = getDefaultProgressRange('2026-08-20')
  assert.equal(endDate, '2026-08-20')
  assert.equal(startDate, '2026-08-14')
})
