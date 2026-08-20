import { getLocalDateISO } from './date.js'
import { COMPLETED_FILTER_OPTIONS, DEFAULT_COMPLETED_FILTER, DEFAULT_WEEK_START_DAY } from './completionFilter.js'

// localStorage キーは既存のまま維持（データ互換性のため）
export const STORAGE_KEY = 'task-manager-items'
export const SORT_KEY = 'task-manager-sort'
export const SETTINGS_KEY = 'task-manager-settings'
export const RECURRING_KEY = 'task-manager-recurring'

// schema version は既存データにはない。v1扱いとする
const CURRENT_SCHEMA_VERSION = 3

/**
 * 旧形式（version なし / v1 / v2）から v3 へのマイグレーション
 * - version フィールドを追加
 * - parentId が不正なタスクを null に補正
 * - completedAt（完了日時、未完了時は null）を補う。既存データに完了日時は無いため
 *   常に null とし、いつ完了したか不明なタスクとして扱う（today/week 表示フィルターでは
 *   非表示になるが、タスクデータ自体は失われない）
 */
function migrateTasks(rawTasks) {
  if (!Array.isArray(rawTasks)) return []
  const ids = new Set(rawTasks.map(t => t?.id).filter(Boolean))
  return rawTasks
    .filter(t => t && typeof t.id === 'string' && typeof t.title === 'string')
    .map(t => ({
      id: t.id,
      title: t.title,
      completed: Boolean(t.completed),
      completedAt: typeof t.completedAt === 'number' ? t.completedAt : null,
      parentId: ids.has(t.parentId) ? t.parentId : null,
      createdAt: t.createdAt ?? Date.now(),
      dueDate: t.dueDate ?? null,
      generatedFrom: t.generatedFrom ?? null,
      generatedDate: t.generatedDate ?? null,
    }))
}

export function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // 旧形式: 配列直接保存、新形式: { version, tasks }
    if (Array.isArray(parsed)) {
      return migrateTasks(parsed)
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.tasks)) {
      return migrateTasks(parsed.tasks)
    }
    return []
  } catch {
    return []
  }
}

export function saveTasks(tasks) {
  try {
    // v2形式で保存
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: CURRENT_SCHEMA_VERSION, tasks }))
  } catch {
    // 保存失敗は呼び出し元が検知
    throw new Error('保存に失敗しました')
  }
}

const DEFAULT_SETTINGS = { completedFilter: DEFAULT_COMPLETED_FILTER, weekStartDay: DEFAULT_WEEK_START_DAY }

/**
 * 完了済み表示設定のマイグレーション
 * - 新形式（completedFilter / weekStartDay）はそのまま使う（不正値は既定値で補正）
 * - 旧形式（showCompleted: boolean のみ）は、表示していた場合は既定の「今週」、
 *   非表示にしていた場合は「すべて非表示」へ対応させる
 * - どちらの形式でもない場合は既定値
 */
function migrateSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }

  if (typeof raw.completedFilter === 'string') {
    return {
      completedFilter: COMPLETED_FILTER_OPTIONS.includes(raw.completedFilter) ? raw.completedFilter : DEFAULT_COMPLETED_FILTER,
      weekStartDay: Number.isInteger(raw.weekStartDay) && raw.weekStartDay >= 0 && raw.weekStartDay <= 6
        ? raw.weekStartDay
        : DEFAULT_WEEK_START_DAY,
    }
  }

  if (typeof raw.showCompleted === 'boolean') {
    return {
      completedFilter: raw.showCompleted ? DEFAULT_COMPLETED_FILTER : 'hidden',
      weekStartDay: DEFAULT_WEEK_START_DAY,
    }
  }

  return { ...DEFAULT_SETTINGS }
}

export function loadSettings() {
  try {
    return migrateSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch { /* noop */ }
}

export function loadSortMode() {
  return localStorage.getItem(SORT_KEY) ?? 'manual'
}

export function saveSortMode(mode) {
  localStorage.setItem(SORT_KEY, mode)
}

/**
 * startDateを持たない過去データ向けのマイグレーション
 * - startDateが無ければ作成日（createdAt）から補う
 */
function migrateRecurringTemplates(rawTemplates) {
  if (!Array.isArray(rawTemplates)) return []
  return rawTemplates.map(t => ({
    ...t,
    startDate: t.startDate ?? getLocalDateISO(new Date(t.createdAt ?? Date.now())),
  }))
}

export function loadRecurringTemplates() {
  try {
    return migrateRecurringTemplates(JSON.parse(localStorage.getItem(RECURRING_KEY)) ?? [])
  } catch {
    return []
  }
}

export function saveRecurringTemplates(templates) {
  try {
    localStorage.setItem(RECURRING_KEY, JSON.stringify(templates))
  } catch { /* noop */ }
}
