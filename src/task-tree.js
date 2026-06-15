export function getCompletedTaskTreeIds(tasks) {
  const deleteIds = new Set(tasks.filter(task => task.completed).map(task => task.id))
  let changed = true

  while (changed) {
    changed = false
    tasks.forEach(task => {
      if (deleteIds.has(task.parentId) && !deleteIds.has(task.id)) {
        deleteIds.add(task.id)
        changed = true
      }
    })
  }

  return deleteIds
}

export function clearCompletedTaskTrees(tasks) {
  const deleteIds = getCompletedTaskTreeIds(tasks)
  return tasks.filter(task => !deleteIds.has(task.id))
}
