const STORAGE_KEY = 'task-manager-items'
const SORT_KEY = 'task-manager-sort'

const list = document.querySelector('#task-list')
const emptyState = document.querySelector('#empty-state')
const openCount = document.querySelector('#open-count')
const clearCompleted = document.querySelector('#clear-completed')
const checkUpdateButton = document.querySelector('#check-update')
const exportButton = document.querySelector('#export-data')
const importButton = document.querySelector('#import-data')
const importFile = document.querySelector('#import-file')
const statusMessage = document.querySelector('#status-message')
const sortSelect = document.querySelector('#sort-select')
const sortBar = document.querySelector('.sort-bar')

let tasks = loadTasks()
let sortMode = localStorage.getItem(SORT_KEY) ?? 'manual'

sortSelect.value = sortMode

// ---- SVG icons ----
function svgIcon(type) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')

  if (type === 'edit') {
    svg.innerHTML = '<path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5Z" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"/>'
  } else if (type === 'delete') {
    svg.innerHTML = '<path d="M3 5h10M6 5V3h4v2M5 5l.667 8h4.666L11 5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>'
  } else if (type === 'add-child') {
    svg.innerHTML = '<path d="M4 3h5M4 3v10M7 9h5M9 7v4" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/>'
  } else if (type === 'drag') {
    svg.innerHTML = '<circle cx="5" cy="4" r="1" fill="currentColor"/><circle cx="11" cy="4" r="1" fill="currentColor"/><circle cx="5" cy="8" r="1" fill="currentColor"/><circle cx="11" cy="8" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="11" cy="12" r="1" fill="currentColor"/>'
  }

  return svg
}

// ---- data ----
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  } catch {
    showStatus('保存に失敗しました')
  }
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
  link.download = 'task-manager-' + new Date().toISOString().slice(0, 10) + '.json'
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

/**
 * ボタンを2ステップ確認状態に切り替え、3秒後にリセットする。
 * @param {HTMLElement} btn - 対象ボタン
 * @param {string} confirmLabel - 確認状態のラベル
 * @param {Function} onConfirm - 確認後に実行する関数
 * @returns {boolean} - すでに確認状態だった場合 true
 */
function twoStepConfirm(btn, confirmLabel, onConfirm) {
  if (btn.dataset.confirming === 'true') {
    clearTimeout(btn._confirmTimer)
    delete btn.dataset.confirming
    btn.classList.remove('is-confirming')
    btn.setAttribute('aria-label', btn.dataset.originalLabel || '')
    onConfirm()
    return true
  }
  btn.dataset.originalLabel = btn.getAttribute('aria-label')
  btn.dataset.confirming = 'true'
  btn.classList.add('is-confirming')
  btn.setAttribute('aria-label', confirmLabel)
  btn._confirmTimer = setTimeout(() => {
    delete btn.dataset.confirming
    btn.classList.remove('is-confirming')
    btn.setAttribute('aria-label', btn.dataset.originalLabel || '')
  }, 3000)
  return false
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
      const importedIds = new Set(payload.tasks.map(t => t.id))
      tasks = payload.tasks.map(task => ({
        ...task,
        parentId: importedIds.has(task.parentId) ? task.parentId : null,
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

// ---- sort ----
function getSortedTopLevel() {
  const topLevel = tasks.filter(task => task.parentId === null)

  if (sortMode === 'manual') return topLevel

  return [...topLevel].sort((a, b) => {
    if (sortMode === 'created-desc') {
      return (b.createdAt ?? 0) - (a.createdAt ?? 0)
    }
    if (sortMode === 'created-asc') {
      return (a.createdAt ?? 0) - (b.createdAt ?? 0)
    }
    if (sortMode === 'due-asc') {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate)
    }
    if (sortMode === 'due-desc') {
      if (!a.dueDate && !b.dueDate) return 0
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return b.dueDate.localeCompare(a.dueDate)
    }
    return 0
  })
}

// ---- render ----
function render() {
  list.innerHTML = ''

  const topLevel = getSortedTopLevel()
  topLevel.forEach(task => renderTaskItem(task, list))

  const addRow = document.createElement('li')
  addRow.className = 'task-add-row'
  addRow.setAttribute('role', 'button')
  addRow.setAttribute('tabindex', '0')
  addRow.setAttribute('aria-label', 'タスクを追加')
  addRow.textContent = '+ タスクを追加'
  addRow.addEventListener('click', () => openAddForm(addRow))
  addRow.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openAddForm(addRow)
    }
  })
  list.append(addRow)

  const remaining = tasks.filter(task => !task.completed).length
  openCount.textContent = '残り' + remaining + '件'
  emptyState.hidden = tasks.length > 0
  clearCompleted.hidden = !tasks.some(task => task.completed)
  sortBar.hidden = tasks.length === 0
}

function openAddForm(addRow) {
  if (addRow.querySelector('input')) return

  addRow.textContent = ''
  addRow.removeAttribute('role')
  addRow.removeAttribute('tabindex')

  const formWrapper = document.createElement('div')
  formWrapper.className = 'task-add-form'

  const row1 = document.createElement('div')
  row1.className = 'task-add-form-row'

  const field = document.createElement('input')
  field.type = 'text'
  field.maxLength = 80
  field.placeholder = 'タスクを追加'
  field.setAttribute('aria-label', 'タスクを追加')
  field.className = 'task-add-input'

  const dateField = document.createElement('input')
  dateField.type = 'date'
  dateField.className = 'task-add-date'
  dateField.setAttribute('aria-label', '期限日')

  row1.append(field, dateField)
  formWrapper.append(row1)
  addRow.append(formWrapper)
  field.focus()

  let done = false

  const commit = (event) => {
    if (event && (event.relatedTarget === dateField || event.relatedTarget === field)) return
    if (done) return
    done = true
    const title = field.value.trim()
    if (title) {
      tasks.push({
        id: crypto.randomUUID(),
        title,
        completed: false,
        parentId: null,
        createdAt: Date.now(),
        dueDate: dateField.value || null,
      })
      saveTasks()
    }
    render()
  }

  const cancel = () => {
    if (done) return
    done = true
    render()
  }

  field.addEventListener('blur', commit)
  dateField.addEventListener('blur', commit)

  field.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commit(null) }
    if (event.key === 'Escape') cancel()
  })
  dateField.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commit(null) }
    if (event.key === 'Escape') cancel()
  })
}

function renderTaskItem(task, container) {
  const children = getChildren(task.id)

  const item = document.createElement('li')
  item.className = 'task-item' + (task.completed ? ' completed' : '')
  item.dataset.taskId = task.id

  const row = document.createElement('div')
  row.className = 'task-row'

  const handle = document.createElement('span')
  handle.className = 'drag-handle'
  handle.setAttribute('aria-label', '並び替え')
  handle.setAttribute('title', '並び替え')
  handle.append(svgIcon('drag'))

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = task.completed
  checkbox.setAttribute('aria-label', task.title + 'を完了')
  checkbox.addEventListener('change', () => {
    task.completed = checkbox.checked
    saveTasks()
    render()
  })

  const titleArea = document.createElement('div')
  titleArea.className = 'task-title-area'

  const titleSpan = document.createElement('span')
  titleSpan.className = 'task-title'
  titleSpan.textContent = task.title

  if (children.length > 0) {
    const completedCount = children.filter(c => c.completed).length
    if (completedCount < children.length) {
      const badge = document.createElement('span')
      badge.className = 'subtask-badge'
      badge.textContent = completedCount + '/' + children.length
      titleSpan.append(badge)
    }
  }

  titleArea.append(titleSpan)

  if (task.dueDate) {
    const dueSpan = document.createElement('span')
    dueSpan.className = 'task-due'
    const today = new Date().toISOString().slice(0, 10)
    if (task.dueDate < today) dueSpan.classList.add('overdue')
    const parts = task.dueDate.split('-')
    dueSpan.textContent = parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10)
    titleArea.append(dueSpan)
  }

  const actions = document.createElement('div')
  actions.className = 'task-actions'

  const addChild = document.createElement('button')
  addChild.className = 'icon-button add-child-button'
  addChild.type = 'button'
  addChild.setAttribute('aria-label', task.title + 'に子タスクを追加')
  addChild.setAttribute('title', '子タスクを追加')
  addChild.append(svgIcon('add-child'))
  addChild.addEventListener('click', () => openChildForm(item, task))

  const edit = document.createElement('button')
  edit.className = 'icon-button edit-button'
  edit.type = 'button'
  edit.setAttribute('aria-label', task.title + 'を編集')
  edit.setAttribute('title', '編集')
  edit.append(svgIcon('edit'))
  edit.addEventListener('click', () => openEditField(row, task))

  const remove = document.createElement('button')
  remove.className = 'icon-button delete-button'
  remove.type = 'button'
  remove.setAttribute('aria-label', task.title + 'を削除')
  remove.setAttribute('title', '削除')
  remove.append(svgIcon('delete'))
  remove.addEventListener('click', () => {
    const hasChildren = getChildren(task.id).length > 0
    const confirmLabel = hasChildren
      ? '本当に削除（子タスクも削除）'
      : '本当に削除'
    twoStepConfirm(remove, confirmLabel, () => {
      removeTaskTree(task.id)
      saveTasks()
      render()
    })
  })

  actions.append(addChild, edit, remove)

  if (sortMode === 'manual') {
    row.classList.add('task-row--sortable')
    row.append(handle, checkbox, titleArea, actions)
  } else {
    row.append(checkbox, titleArea, actions)
  }

  item.append(row)

  if (children.length > 0) {
    const childList = document.createElement('ul')
    childList.className = 'task-children'
    children.forEach(child => renderTaskItem(child, childList))
    item.append(childList)
  }

  if (sortMode === 'manual' && task.parentId === null) {
    item.setAttribute('draggable', 'true')
    setupDragEvents(item, task)
  }

  container.append(item)
}

// ---- DnD ----
let dragSrcId = null

function setupDragEvents(item, task) {
  item.addEventListener('dragstart', event => {
    dragSrcId = task.id
    item.classList.add('dragging')
    event.dataTransfer.effectAllowed = 'move'
  })

  item.addEventListener('dragend', () => {
    item.classList.remove('dragging')
    document.querySelectorAll('.task-item.drag-over').forEach(el => el.classList.remove('drag-over'))
    dragSrcId = null
  })

  item.addEventListener('dragover', event => {
    if (!dragSrcId || dragSrcId === task.id) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    document.querySelectorAll('.task-item.drag-over').forEach(el => el.classList.remove('drag-over'))
    item.classList.add('drag-over')
  })

  item.addEventListener('dragleave', () => {
    item.classList.remove('drag-over')
  })

  item.addEventListener('drop', event => {
    event.preventDefault()
    item.classList.remove('drag-over')
    if (!dragSrcId || dragSrcId === task.id) return

    const srcIndex = tasks.findIndex(t => t.id === dragSrcId)
    if (srcIndex === -1) return
    const [moved] = tasks.splice(srcIndex, 1)
    const newDst = tasks.findIndex(t => t.id === task.id)
    if (newDst === -1) { tasks.splice(srcIndex, 0, moved); return }
    tasks.splice(newDst, 0, moved)
    saveTasks()
    render()
  })
}

// ---- edit / child form ----
function getChildren(parentId) {
  return tasks.filter(task => task.parentId === parentId)
}

function openEditField(row, task) {
  const titleArea = row.querySelector('.task-title-area')
  const editBtn = row.querySelector('.edit-button')

  const field = document.createElement('input')
  field.className = 'task-edit-input'
  field.type = 'text'
  field.maxLength = 80
  field.value = task.title
  field.setAttribute('aria-label', 'タスク名を編集')

  const dateField = document.createElement('input')
  dateField.type = 'date'
  dateField.className = 'task-add-date'
  dateField.setAttribute('aria-label', '期限日を編集')
  dateField.value = task.dueDate ?? ''

  titleArea.replaceWith(field)
  editBtn.replaceWith(dateField)

  field.focus()
  field.select()

  let cancelled = false

  const commit = (event) => {
    if (event && (event.relatedTarget === dateField || event.relatedTarget === field)) return
    if (cancelled) return
    const nextTitle = field.value.trim()
    if (nextTitle) {
      task.title = nextTitle
      task.dueDate = dateField.value || null
      saveTasks()
    }
    render()
  }

  field.addEventListener('blur', commit)
  dateField.addEventListener('blur', commit)

  field.addEventListener('keydown', event => {
    if (event.key === 'Enter') field.blur()
    if (event.key === 'Escape') { cancelled = true; render() }
  })
  dateField.addEventListener('keydown', event => {
    if (event.key === 'Enter') dateField.blur()
    if (event.key === 'Escape') { cancelled = true; render() }
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
  field.setAttribute('aria-label', parentTask.title + 'の子タスクを追加')

  const add = document.createElement('button')
  add.type = 'submit'
  add.textContent = '追加'

  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = 'キャンセル'
  cancel.addEventListener('click', () => render())

  form.append(field, add, cancel)
  const childList = item.querySelector('.task-children')
  item.insertBefore(form, childList ?? null)
  field.focus()

  field.addEventListener('keydown', event => {
    if (event.key === 'Escape') render()
  })

  form.addEventListener('submit', event => {
    event.preventDefault()
    const title = field.value.trim()
    if (!title) return

    tasks.push({
      id: crypto.randomUUID(),
      title,
      completed: false,
      parentId: parentTask.id,
      createdAt: Date.now(),
      dueDate: null,
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

// ---- event listeners ----
sortSelect.addEventListener('change', () => {
  sortMode = sortSelect.value
  localStorage.setItem(SORT_KEY, sortMode)
  render()
})

clearCompleted.addEventListener('click', () => {
  const completedIds = new Set(tasks.filter(task => task.completed).map(task => task.id))
  twoStepConfirm(clearCompleted, completedIds.size + '件を削除（確認）', () => {
    let changed = true
    while (changed) {
      changed = false
      tasks = tasks.map(task => {
        if (!task.completed && task.parentId !== null && completedIds.has(task.parentId)) {
          changed = true
          return { ...task, parentId: null }
        }
        return task
      })
    }

    completedIds.forEach(removeTaskTree)
    saveTasks()
    render()
  })
})

const menuToggle = document.querySelector('#menu-toggle')
const menuPopup = document.querySelector('#menu-popup')

menuToggle.addEventListener('click', () => {
  const isOpen = menuPopup.hidden === false
  menuPopup.hidden = isOpen
  menuToggle.setAttribute('aria-expanded', String(!isOpen))
})

document.addEventListener('click', event => {
  if (!menuToggle.contains(event.target) && !menuPopup.contains(event.target)) {
    menuPopup.hidden = true
    menuToggle.setAttribute('aria-expanded', 'false')
  }
})

exportButton.addEventListener('click', exportTasks)
importButton.addEventListener('click', () => importFile.click())
importFile.addEventListener('change', event => importTasks(event.target.files?.[0]))
checkUpdateButton.addEventListener('click', checkForUpdate)


// ---- pull-to-refresh ----
const PULL_THRESHOLD = 80

let pullStartY = null
let pullY = 0
let isPullReturning = false

const pullIndicator = document.createElement('div')
pullIndicator.className = 'pull-indicator'
pullIndicator.setAttribute('aria-live', 'polite')
pullIndicator.setAttribute('aria-label', '引っ張って更新')
document.body.prepend(pullIndicator)

function setPullIndicator(text, isComplete) {
  pullIndicator.textContent = text
  pullIndicator.classList.toggle('complete', Boolean(isComplete))
}

function updatePullIndicatorHeight(y) {
  pullIndicator.style.height = y > 0 ? (y + 'px') : ''
  pullIndicator.style.opacity = y > 0 ? String(Math.min(y / PULL_THRESHOLD, 1)) : ''
}

document.addEventListener('touchstart', event => {
  if (window.scrollY > 0) return
  pullStartY = event.touches[0].clientY
}, { passive: true })

document.addEventListener('touchmove', event => {
  if (pullStartY === null) return
  const dy = event.touches[0].clientY - pullStartY
  if (dy <= 0) {
    pullStartY = null
    return
  }
  const visual = dy * 0.4
  pullY = visual <= PULL_THRESHOLD
    ? visual
    : Math.min(PULL_THRESHOLD + (visual - PULL_THRESHOLD) * 0.3, PULL_THRESHOLD + 50)
  updatePullIndicatorHeight(pullY)
  setPullIndicator(pullY >= PULL_THRESHOLD ? '放して更新' : '引っ張って更新', false)
}, { passive: true })

document.addEventListener('touchend', async () => {
  if (pullStartY === null) return
  pullStartY = null
  if (pullY < PULL_THRESHOLD) {
    isPullReturning = true
    updatePullIndicatorHeight(0)
    setTimeout(() => { isPullReturning = false }, 400)
    pullY = 0
    return
  }
  pullY = 0
  setPullIndicator('更新中…', false)
  updatePullIndicatorHeight(PULL_THRESHOLD)

  await checkForUpdate()

  setPullIndicator('完了', true)
  setTimeout(() => {
    updatePullIndicatorHeight(0)
    setTimeout(() => setPullIndicator('', false), 400)
  }, 700)
})

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload())
}

render()
