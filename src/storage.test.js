import test from 'node:test'
import assert from 'node:assert/strict'
import { loadRecurringTemplates, RECURRING_KEY } from './storage.js'

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
