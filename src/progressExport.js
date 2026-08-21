import { getLocalDateISO } from './date.js'

// メール等へそのまま貼り付けられるプレーンテキストで進捗を表す記号
export const PROGRESS_DONE_SYMBOL = '◼︎' // ◼︎
export const PROGRESS_OPEN_SYMBOL = '◻︎' // ◻︎

/**
 * タスクが指定期間の進捗レポート対象かどうかを判定する。
 * - 完了タスク: 完了日時（completedAt）が startDate〜endDate の範囲内（両端含む）なら対象。
 *   完了日時が無い（移行前の既存データ等）タスクは期間を特定できないため対象外
 * - 未完了タスク: 期限日が endDate 以前なら対象（startDate より前に期限を過ぎたものも含む）。
 *   期限日が endDate より後なら対象外。期限なしは includeNoDueDate が true のときだけ対象
 */
export function isTaskInProgressRange(task, { startDate, endDate, includeNoDueDate = false }) {
  if (task.completed) {
    if (typeof task.completedAt !== 'number') return false
    const completedISO = getLocalDateISO(new Date(task.completedAt))
    return completedISO >= startDate && completedISO <= endDate
  }
  if (task.dueDate) return task.dueDate <= endDate
  return Boolean(includeNoDueDate)
}

/**
 * 対象タスクを、階層が分かる形のプレーンテキストへ整形する。
 * - 完了を PROGRESS_DONE_SYMBOL、未完了を PROGRESS_OPEN_SYMBOL で表す
 * - 子タスクは深さ1段につき全角スペース1つを行頭に加える
 * - 対象タスクの祖先は、それ自身が期間の対象外でも文脈として出力に含める（実際の完了状態で表示）
 * - 対象タスクが1件もない場合は空文字列を返す
 */
export function buildProgressReportText(tasks, { startDate, endDate, includeNoDueDate = false } = {}) {
  if (!Array.isArray(tasks) || !startDate || !endDate || startDate > endDate) return ''

  const matchedIds = new Set(
    tasks
      .filter(t => isTaskInProgressRange(t, { startDate, endDate, includeNoDueDate }))
      .map(t => t.id)
  )
  if (matchedIds.size === 0) return ''

  const byId = new Map(tasks.map(t => [t.id, t]))
  const includedIds = new Set(matchedIds)
  matchedIds.forEach(id => {
    let cur = byId.get(id)
    while (cur && cur.parentId && !includedIds.has(cur.parentId)) {
      includedIds.add(cur.parentId)
      cur = byId.get(cur.parentId)
    }
  })

  const lines = []
  function walk(parentId, depth) {
    tasks
      .filter(t => t.parentId === parentId && includedIds.has(t.id))
      .forEach(t => {
        const symbol = t.completed ? PROGRESS_DONE_SYMBOL : PROGRESS_OPEN_SYMBOL
        lines.push('　'.repeat(depth) + symbol + ' ' + t.title)
        walk(t.id, depth + 1)
      })
  }
  walk(null, 0)
  return lines.join('\n')
}

/**
 * 進捗テキスト出力パネルを開いたときの既定の期間（直近7日間）。
 */
export function getDefaultProgressRange(todayISO = getLocalDateISO()) {
  const end = new Date(todayISO + 'T00:00:00')
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return { startDate: getLocalDateISO(start), endDate: todayISO }
}
