import { getLocalDateISO } from './date.js'

// localStorage キーは既存のまま維持（データ互換性のため）
export const STORAGE_KEY = 'task-manager-items'
export const SORT_KEY = 'task-manager-sort'
export const SETTINGS_KEY = 'task-manager-settings'
export const RECURRING_KEY = 'task-manager-recurring'

// schema version は既存データにはない。v1扱いとする
const CURRENT_SCHEMA_VERSION = 2

/**
 * 旧形式（version なし / v1）から v2 へのマイグレーション
 * - version フィールドを追加
 * - parentId が不正なタスクを null に補正
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

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? { showCompleted: true }
  } catch {
    return { showCompleted: true }
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
