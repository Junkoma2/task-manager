import { getLocalDateISO } from './date.js'

export function shouldGenerateToday(tmpl, today) {
  const date = new Date(today + 'T00:00:00')
  if (tmpl.recurrence === 'daily') return true
  if (tmpl.recurrence === 'weekly') {
    return date.getDay() === (tmpl.weekDay ?? 1)
  }
  if (tmpl.recurrence === 'monthly') {
    return date.getDate() === (tmpl.monthDay ?? 1)
  }
  return false
}

export function generateRecurringTasks(tasks, recurringTemplates, now = new Date()) {
  const today = getLocalDateISO(now)
  const newTasks = [...tasks]
  let changed = false

  recurringTemplates.forEach(tmpl => {
    const alreadyExists = tasks.some(
      t => t.generatedFrom === tmpl.id && t.generatedDate === today
    )
    if (alreadyExists) return
    if (!shouldGenerateToday(tmpl, today)) return
    newTasks.push({
      id: crypto.randomUUID(),
      title: tmpl.title,
      completed: false,
      parentId: null,
      createdAt: Date.now(),
      dueDate: today,
      generatedFrom: tmpl.id,
      generatedDate: today,
    })
    changed = true
  })

  return changed ? newTasks : tasks
}
