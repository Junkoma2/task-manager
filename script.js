const STORAGE_KEY = 'task-manager-items'

const form = document.querySelector('#task-form')
const input = document.querySelector('#task-input')
const list = document.querySelector('#task-list')
const emptyState = document.querySelector('#empty-state')
const openCount = document.querySelector('#open-count')
const clearCompleted = document.querySelector('#clear-completed')
const checkUpdateButton = document.querySelector('#check-update')
const exportButton = document.querySelector('#export-data')
const importButton = document.querySelector('#import-data')
const importFile = document.querySelector('#import-file')
const statusMessage = document.querySelector('#status-message')

let tasks = loadTasks()

function loadTasks() {
  try {
    const savedTasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
    const taskIds = new Set(savedTasks.map(task => task.id))

    return savedTasks.map(task => ({
      ...task,
      parentId: taskIds.has(task.parentId) ? task.parentId : null,
    }))
  } catch {
    return []
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

function showStatus(message) {
  statusMessage.textContent = message
  window.clearTimeout(showStatus.timer)
  showStatus.timer = window.setTimeout(() => {
    statusMessage.textContent = ''
  }, 2600)
}

function exportTasks() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `task-manager-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
  showStatus('エクスポートしました')
}

function isValidTask(value) {
  return (
    value &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.completed === 'boolean' &&
    (value.parentId == null || typeof value.parentId === 'string')
  )
}

function importTasks(file) {
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    showStatus('ファイルが大きすぎます')
    return
  }

  const reader = new FileReader()
  reader.onload = event => {
    try {
      const payload = JSON.parse(event.target.result)
      if (!Array.isArray(payload.tasks) || !payload.tasks.every(isValidTask)) {
        throw new Error('invalid')
      }
      if (!window.confirm('現在のタスクを置き換えてインポートしますか？')) return
      tasks = payload.tasks.map(task => ({
        ...task,
        parentId: task.parentId ?? null,
      }))
      saveTasks()
      render()
      showStatus('インポートしました')
    } catch {
      showStatus('JSON を読み込めませんでした')
    } finally {
      importFile.value = ''
    }
  }
  reader.readAsText(file)
}

async function checkForUpdate() {
  if (!('serviceWorker' in navigator)) {
    window.location.reload()
    return
  }

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    window.location.reload()
    return
  }

  await registration.update()
  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    showStatus('更新を適用しています')
    return
  }
  showStatus('最新です')
}

function render() {
  list.innerHTML = ''

  renderTaskList(null, list)

  const remaining = tasks.filter(task => !task.completed).length
  openCount.textContent = `${remaining}件`
  emptyState.hidden = tasks.length > 0
  clearCompleted.disabled = !tasks.some(task => task.completed)
}

function renderTaskList(parentId, container) {
  getChildren(parentId).forEach(task => {
    const item = document.createElement('li')
    item.className = `task-item${task.completed ? ' completed' : ''}`

    const row = document.createElement('div')
    row.className = 'task-row'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = task.completed
    checkbox.setAttribute('aria-label', `${task.title}を完了`)
    checkbox.addEventListener('change', () => {
      task.completed = checkbox.checked
      saveTasks()
      render()
    })

    const title = document.createElement('span')
    title.className = 'task-title'
    title.textContent = task.title

    const actions = document.createElement('div')
    actions.className = 'task-actions'

    const addChild = document.createElement('button')
    addChild.className = 'quiet-button'
    addChild.type = 'button'
    addChild.textContent = '子タスク'
    addChild.addEventListener('click', () => {
      openChildForm(item, task)
    })

    const edit = document.createElement('button')
    edit.className = 'quiet-button'
    edit.type = 'button'
    edit.textContent = '編集'
    edit.addEventListener('click', () => {
      openEditField(row, task)
    })

    const remove = document.createElement('button')
    remove.className = 'delete-button'
    remove.type = 'button'
    remove.textContent = '削除'
    remove.addEventListener('click', () => {
      removeTaskTree(task.id)
      saveTasks()
      render()
    })

    actions.append(addChild, edit, remove)
    row.append(checkbox, title, actions)
    item.append(row)

    const children = getChildren(task.id)
    if (children.length > 0) {
      const childList = document.createElement('ul')
      childList.className = 'task-children'
      renderTaskList(task.id, childList)
      item.append(childList)
    }

    container.append(item)
  })
}

function getChildren(parentId) {
  return tasks.filter(task => task.parentId === parentId)
}

function openEditField(row, task) {
  const currentTitle = row.querySelector('.task-title')
  const editButton = row.querySelector('.quiet-button:nth-of-type(2)')
  const field = document.createElement('input')
  field.className = 'task-edit-input'
  field.type = 'text'
  field.maxLength = 80
  field.value = task.title
  field.setAttribute('aria-label', 'タスク名を編集')

  currentTitle.replaceWith(field)
  editButton.disabled = true
  field.focus()
  field.select()

  let cancelled = false

  const commit = () => {
    if (cancelled) return
    const nextTitle = field.value.trim()
    if (nextTitle) {
      task.title = nextTitle
      saveTasks()
    }
    render()
  }

  field.addEventListener('blur', commit)
  field.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      field.blur()
    }
    if (event.key === 'Escape') {
      cancelled = true
      render()
    }
  })
}

function openChildForm(item, parentTask) {
  if (item.querySelector('.child-task-form')) return

  const form = document.createElement('form')
  form.className = 'child-task-form'

  const field = document.createElement('input')
  field.type = 'text'
  field.maxLength = 80
  field.placeholder = '子タスクを追加'
  field.setAttribute('aria-label', `${parentTask.title}の子タスクを追加`)

  const add = document.createElement('button')
  add.type = 'submit'
  add.textContent = '追加'

  form.append(field, add)
  const childList = item.querySelector('.task-children')
  item.insertBefore(form, childList)
  field.focus()

  form.addEventListener('submit', event => {
    event.preventDefault()
    const title = field.value.trim()
    if (!title) return

    tasks.push({
      id: crypto.randomUUID(),
      title,
      completed: false,
      parentId: parentTask.id,
    })
    saveTasks()
    render()
  })
}

function removeTaskTree(taskId) {
  const descendantIds = new Set([taskId])
  let changed = true

  while (changed) {
    changed = false
    tasks.forEach(task => {
      if (descendantIds.has(task.parentId) && !descendantIds.has(task.id)) {
        descendantIds.add(task.id)
        changed = true
      }
    })
  }

  tasks = tasks.filter(task => !descendantIds.has(task.id))
}

form.addEventListener('submit', event => {
  event.preventDefault()
  const title = input.value.trim()
  if (!title) return

  tasks.unshift({
    id: crypto.randomUUID(),
    title,
    completed: false,
    parentId: null,
  })
  input.value = ''
  saveTasks()
  render()
  input.focus()
})

clearCompleted.addEventListener('click', () => {
  const completedIds = tasks.filter(task => task.completed).map(task => task.id)
  completedIds.forEach(removeTaskTree)
  saveTasks()
  render()
})

exportButton.addEventListener('click', exportTasks)
importButton.addEventListener('click', () => importFile.click())
importFile.addEventListener('change', event => importTasks(event.target.files?.[0]))
checkUpdateButton.addEventListener('click', checkForUpdate)

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
}

render()
