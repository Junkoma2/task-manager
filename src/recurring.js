import { getLocalDateISO } from './date.js'

export function shouldGenerateToday(tmpl, today) {
  // startDateより前は自動生成しない（利用者が選んだ起点日を尊重する）
  if (tmpl.startDate && today < tmpl.startDate) return false
  const date = new Date(today + 'T00:00:00')
  if (tmpl.recurrence === 'daily') return true
  if (tmpl.recurrence === 'weekly') {
    return date.getDay() === (tmpl.weekDay ?? 1)
  }
  if (tmpl.recurrence === 'monthly') {
    // monthDayがその月に存在しない場合（例: 31日→2月）は月末日に生成する
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
    return date.getDate() === Math.min(tmpl.monthDay ?? 1, lastDayOfMonth)
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
