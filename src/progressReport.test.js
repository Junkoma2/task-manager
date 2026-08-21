import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesProgressRange, selectProgressTaskIds, buildProgressText, buildProgressReport } from './progressReport.js'

function completedAtLocal(y, m, d, h = 12, min = 0) {
  return new Date(y, m - 1, d, h, min).getTime()
}

function task(overrides) {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    title: 'タスク',
    completed: false,
    completedAt: null,
    parentId: null,
    dueDate: null,
    ...overrides,
  }
}

const RANGE = { startISO: '2026-08-10', endISO: '2026-08-16', includeNoDueDate: false }

test('開始日より前に期限切れの未完了タスクが含まれる', () => {
  const t = task({ id: 'a', title: '期限切れ', dueDate: '2026-08-01' })
  assert.equal(matchesProgressRange(t, RANGE), true)
})

test('期間内が期限の未完了タスクが含まれる', () => {
  const t = task({ id: 'a', title: '期間内期限', dueDate: '2026-08-12' })
  assert.equal(matchesProgressRange(t, RANGE), true)
})

test('終了日より後が期限の未完了タスクは除外される', () => {
  const t = task({ id: 'a', title: '未来の期限', dueDate: '2026-08-17' })
  assert.equal(matchesProgressRange(t, RANGE), false)
})

test('完了タスクは開始日当日・終了日当日の境界を含む', () => {
  const startBoundary = task({ id: 'a', completed: true, completedAt: completedAtLocal(2026, 8, 10, 0, 5) })
  const endBoundary = task({ id: 'b', completed: true, completedAt: completedAtLocal(2026, 8, 16, 23, 55) })
  const beforeRange = task({ id: 'c', completed: true, completedAt: completedAtLocal(2026, 8, 9, 23, 0) })
  const afterRange = task({ id: 'd', completed: true, completedAt: completedAtLocal(2026, 8, 17, 0, 0) })
  assert.equal(matchesProgressRange(startBoundary, RANGE), true)
  assert.equal(matchesProgressRange(endBoundary, RANGE), true)
  assert.equal(matchesProgressRange(beforeRange, RANGE), false)
  assert.equal(matchesProgressRange(afterRange, RANGE), false)
})

test('完了日時を持たない完了タスクは対象外', () => {
  const t = task({ id: 'a', completed: true, completedAt: null })
  assert.equal(matchesProgressRange(t, RANGE), false)
})

test('期限なしの未完了タスクは includeNoDueDate の切り替えで結果が変わる', () => {
  const t = task({ id: 'a', dueDate: null })
  assert.equal(matchesProgressRange(t, { ...RANGE, includeNoDueDate: false }), false)
  assert.equal(matchesProgressRange(t, { ...RANGE, includeNoDueDate: true }), true)
})

test('子タスクが対象に合致する場合、親タスクが条件を満たさなくても文脈として含まれる', () => {
  const parent = task({ id: 'p', title: '親', dueDate: '2026-09-01' }) // 範囲外の期限（対象外のはず）
  const child = task({ id: 'c', title: '子', parentId: 'p', dueDate: '2026-08-12' }) // 範囲内
  const { matchedIds, includedIds } = selectProgressTaskIds([parent, child], RANGE)
  assert.equal(matchedIds.has('p'), false)
  assert.equal(matchedIds.has('c'), true)
  assert.equal(includedIds.has('p'), true)
  assert.equal(includedIds.has('c'), true)
})

test('条件に合致しない親子はどちらも出力対象に含まれない', () => {
  const parent = task({ id: 'p', title: '親', dueDate: '2026-09-01' })
  const child = task({ id: 'c', title: '子', parentId: 'p', dueDate: '2026-09-02' })
  const { matchedIds, includedIds } = selectProgressTaskIds([parent, child], RANGE)
  assert.equal(matchedIds.size, 0)
  assert.equal(includedIds.size, 0)
})

test('親子階層のテキストは全角スペースで子を字下げする', () => {
  const parent = task({ id: 'p', title: '親タスク', completed: true, completedAt: completedAtLocal(2026, 8, 12) })
  const child = task({ id: 'c', title: '子タスク', parentId: 'p', dueDate: '2026-08-12' })
  const { includedIds } = selectProgressTaskIds([parent, child], RANGE)
  const text = buildProgressText([parent, child], includedIds)
  assert.equal(text, '◼︎ 親タスク\n　◻︎ 子タスク')
})

test('孫タスクは深さ2段分の全角スペースで字下げする', () => {
  const parent = task({ id: 'p', title: '親', completed: true, completedAt: completedAtLocal(2026, 8, 12) })
  const child = task({ id: 'c', title: '子', parentId: 'p', completed: true, completedAt: completedAtLocal(2026, 8, 12) })
  const grandchild = task({ id: 'g', title: '孫', parentId: 'c', dueDate: '2026-08-12' })
  const { includedIds } = selectProgressTaskIds([parent, child, grandchild], RANGE)
  const text = buildProgressText([parent, child, grandchild], includedIds)
  assert.equal(text, '◼︎ 親\n　◼︎ 子\n　　◻︎ 孫')
})

test('日本語を含むタスク名がそのまま出力される', () => {
  const t = task({ id: 'a', title: '進捗レポートを作成する（週次まとめ）', dueDate: '2026-08-12' })
  const { includedIds } = selectProgressTaskIds([t], RANGE)
  const text = buildProgressText([t], includedIds)
  assert.equal(text, '◻︎ 進捗レポートを作成する（週次まとめ）')
})

test('buildProgressReport は対象0件のとき空文字列と件数0を返す', () => {
  const parent = task({ id: 'p', title: '親', dueDate: '2026-09-01' })
  const { text, matchedCount } = buildProgressReport([parent], RANGE)
  assert.equal(text, '')
  assert.equal(matchedCount, 0)
})

test('buildProgressReport は matchedCount に文脈用の親を含めない', () => {
  const parent = task({ id: 'p', title: '親', dueDate: '2026-09-01' })
  const child = task({ id: 'c', title: '子', parentId: 'p', dueDate: '2026-08-12' })
  const { matchedCount } = buildProgressReport([parent, child], RANGE)
  assert.equal(matchedCount, 1)
})
