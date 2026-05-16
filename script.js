const STORAGE_KEY = 'task-manager-items'

const form = document.querySelector('#task-form')
const input = document.querySelector('#task-input')
const list = document.querySelector('#task-list')
const emptyState = document.querySelector('#empty-state')
const openCount = document.querySelector('#open-count')
const clearCompleted = document.querySelector('#clear-completed')

let tasks = loadTasks()

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? []
  } catch {
    return []
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
}

function render() {
  list.innerHTML = ''

  tasks.forEach(task => {
    const item = document.createElement('li')
    item.className = `task-item${task.completed ? ' completed' : ''}`

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

    const remove = document.createElement('button')
    remove.className = 'delete-button'
    remove.type = 'button'
    remove.textContent = '削除'
    remove.addEventListener('click', () => {
      tasks = tasks.filter(itemTask => itemTask.id !== task.id)
      saveTasks()
      render()
    })

    item.append(checkbox, title, remove)
    list.append(item)
  })

  const remaining = tasks.filter(task => !task.completed).length
  openCount.textContent = `${remaining}件`
  emptyState.hidden = tasks.length > 0
  clearCompleted.disabled = !tasks.some(task => task.completed)
}

form.addEventListener('submit', event => {
  event.preventDefault()
  const title = input.value.trim()
  if (!title) return

  tasks.unshift({
    id: crypto.randomUUID(),
    title,
    completed: false,
  })
  input.value = ''
  saveTasks()
  render()
  input.focus()
})

clearCompleted.addEventListener('click', () => {
  tasks = tasks.filter(task => !task.completed)
  saveTasks()
  render()
})

render()
