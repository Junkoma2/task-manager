import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRecurringTemplates, RECURRING_KEY, loadTasks, STORAGE_KEY, loadSettings, saveSettings, SETTINGS_KEY } from './storage.js'

class MemoryStorage {
  constructor() { this.store = new Map() }
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null }
  setItem(key, value) { this.store.set(key, String(value)) }
  removeItem(key) { this.store.delete(key) }
  clear() { this.store.clear() }
}

globalThis.localStorage = new MemoryStorage()

test('loadRecurringTemplates fills in startDate for legacy templates without it', () => {
  const createdAt = new Date(2026, 5, 1, 9, 0).getTime() // 2026-06-01 09:00 local
  localStorage.setItem(RECURRING_KEY, JSON.stringify([
    { id: 'legacy', title: '既存の週次テンプレート', recurrence: 'weekly', weekDay: 1, createdAt },
  ]))

  const templates = loadRecurringTemplates()

  assert.equal(templates.length, 1)
  assert.equal(templates[0].startDate, '2026-06-01')
})

test('loadRecurringTemplates keeps an existing startDate untouched', () => {
  localStorage.setItem(RECURRING_KEY, JSON.stringify([
    { id: 'new', title: '新規の週次テンプレート', recurrence: 'weekly', weekDay: 1, createdAt: Date.now(), startDate: '2026-08-10' },
  ]))

  const templates = loadRecurringTemplates()

  assert.equal(templates[0].startDate, '2026-08-10')
})

test('loadTasks: 完了日時（completedAt）を持たない既存データは null で補われ、データは失われない', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 2,
    tasks: [{ id: 'legacy-1', title: '既存の完了タスク', completed: true, parentId: null }],
  }))

  const tasks = loadTasks()

  assert.equal(tasks.length, 1)
  assert.equal(tasks[0].completed, true)
  assert.equal(tasks[0].completedAt, null)
})

test('loadTasks: completedAt を持つ新形式データはそのまま維持する', () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 3,
    tasks: [{ id: 'new-1', title: '新規タスク', completed: true, completedAt: 1700000000000, parentId: null }],
  }))

  const tasks = loadTasks()

  assert.equal(tasks[0].completedAt, 1700000000000)
})

test('loadSettings: 旧形式（showCompleted: true）は今週表示へ移行する', () => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ showCompleted: true }))

  const settings = loadSettings()

  assert.equal(settings.completedFilter, 'week')
  assert.equal(settings.weekStartDay, 1)
})

test('loadSettings: 旧形式（showCompleted: false）はすべて非表示へ移行する', () => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ showCompleted: false }))

  const settings = loadSettings()

  assert.equal(settings.completedFilter, 'hidden')
})

test('loadSettings: 新形式はそのまま保存・再読込できる', () => {
  saveSettings({ completedFilter: 'today', weekStartDay: 0 })

  const settings = loadSettings()

  assert.equal(settings.completedFilter, 'today')
  assert.equal(settings.weekStartDay, 0)
})

test('loadSettings: データが無い場合は既定値（今週・月曜始まり）を返す', () => {
  localStorage.removeItem(SETTINGS_KEY)

  const settings = loadSettings()

  assert.equal(settings.completedFilter, 'week')
  assert.equal(settings.weekStartDay, 1)
})
