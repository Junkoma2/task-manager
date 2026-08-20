import { getLocalDateISO } from './date.js'

// 完了済みタスクの表示期間フィルター（表示用。タスクデータ自体は削除しない）
export const COMPLETED_FILTER_OPTIONS = ['week', 'today', 'hidden']
export const DEFAULT_COMPLETED_FILTER = 'week'
// 週の開始曜日は Date#getDay() と同じ数値（0=日曜 ... 6=土曜）。既定は月曜。
export const DEFAULT_WEEK_START_DAY = 1

export const WEEK_START_DAY_OPTIONS = [
  { value: 1, label: '月曜' },
  { value: 2, label: '火曜' },
  { value: 3, label: '水曜' },
  { value: 4, label: '木曜' },
  { value: 5, label: '金曜' },
  { value: 6, label: '土曜' },
  { value: 0, label: '日曜' },
]

/**
 * todayISO を含む「週」の開始日・終了日（ともにISO文字列、両端含む）を返す。
 * 選択した開始曜日から次の開始曜日の直前までを同じ週として扱う。
 */
export function getWeekRange(todayISO, weekStartDay) {
  const start = new Date(todayISO + 'T00:00:00')
  const diff = (start.getDay() - weekStartDay + 7) % 7
  start.setDate(start.getDate() - diff)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return { startISO: getLocalDateISO(start), endISO: getLocalDateISO(end) }
}

/**
 * タスクが現在の完了済みフィルター設定のもとで表示対象かどうかを判定する。
 * 未完了タスクは常に表示対象。完了日時が無い（移行前の既存データ等）タスクは、
 * 期間を特定できないため today / week フィルターでは非表示として扱う（hidden 相当）。
 * これによりデータを失うことなく、予測可能な挙動になる。
 */
export function isTaskVisibleForCompletionFilter(task, settings, now = new Date()) {
  if (!task.completed) return true
  const completedFilter = settings?.completedFilter ?? DEFAULT_COMPLETED_FILTER
  if (completedFilter === 'hidden') return false
  if (typeof task.completedAt !== 'number') return false

  const todayISO = getLocalDateISO(now)
  const completedISO = getLocalDateISO(new Date(task.completedAt))

  if (completedFilter === 'today') return completedISO === todayISO

  const weekStartDay = Number.isInteger(settings?.weekStartDay) ? settings.weekStartDay : DEFAULT_WEEK_START_DAY
  const { startISO, endISO } = getWeekRange(todayISO, weekStartDay)
  return completedISO >= startISO && completedISO <= endISO
}
