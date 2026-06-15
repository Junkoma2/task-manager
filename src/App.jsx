import { useState, useEffect, useRef, useCallback } from 'react'
import {
  loadTasks, saveTasks,
  loadSettings, saveSettings,
  loadSortMode, saveSortMode,
  loadRecurringTemplates, saveRecurringTemplates,
  STORAGE_KEY, SORT_KEY, SETTINGS_KEY, RECURRING_KEY,
} from './storage.js'
import { generateRecurringTasks } from './recurring.js'
import { getLocalDateISO } from './date.js'
import { clearCompletedTaskTrees, getCompletedTaskTreeIds } from './task-tree.js'
import { EditIcon, DeleteIcon, AddChildIcon, DragIcon, CloseIcon } from './icons.jsx'
import { APP_VERSION } from './version.js'

function formatDueDate(dueDate) {
  const parts = dueDate.split('-')
  return parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10)
}

function useTwoStepConfirm(timeout = 3000) {
  const [confirmingId, setConfirmingId] = useState(null)
  const timerRef = useRef(null)

  const requestConfirm = useCallback((id, onConfirm) => {
    if (confirmingId === id) {
      clearTimeout(timerRef.current)
      setConfirmingId(null)
      onConfirm()
      return
    }
    setConfirmingId(id)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setConfirmingId(null), timeout)
  }, [confirmingId, timeout])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  return { confirmingId, requestConfirm }
}

function usePullToRefresh(mainRef, onRefresh) {
  const PULL_THRESHOLD = 80
  const pullStartY = useRef(null)
  const pullStateRef = useRef({ height: 0 })
  const [pullState, setPullState] = useState({ height: 0, label: '', complete: false })

  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const onTouchStart = (e) => {
      // スクロール要素の最上部でのみpull-to-refreshを起動する
      if (el.scrollTop > 0 || window.scrollY > 0) return
      pullStartY.current = e.touches[0].clientY
    }
    const onTouchMove = (e) => {
      if (pullStartY.current === null) return
      const dy = e.touches[0].clientY - pullStartY.current
      if (dy <= 0) { pullStartY.current = null; return }
      const visual = dy * 0.4
      const pullY = visual <= PULL_THRESHOLD
        ? visual
        : Math.min(PULL_THRESHOLD + (visual - PULL_THRESHOLD) * 0.3, PULL_THRESHOLD + 50)
      pullStateRef.current = { height: pullY }
      setPullState({
        height: pullY,
        label: pullY >= PULL_THRESHOLD ? '放して更新' : '引っ張って更新',
        complete: false,
      })
    }
    const onTouchEnd = async () => {
      if (pullStartY.current === null) return
      pullStartY.current = null
      const { height } = pullStateRef.current
      if (height < PULL_THRESHOLD) {
        pullStateRef.current = { height: 0 }
        setPullState({ height: 0, label: '', complete: false })
        return
      }
      setPullState(s => ({ ...s, label: '更新中...' }))
      await onRefresh()
      setPullState({ height: PULL_THRESHOLD, label: '完了', complete: true })
      setTimeout(() => {
        pullStateRef.current = { height: 0 }
        setPullState({ height: 0, label: '', complete: false })
      }, 700)
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [mainRef, onRefresh])

  return pullState
}

export default function App() {
  const [tasks, setTasksState] = useState(() => {
    const loaded = loadTasks()
    const templates = loadRecurringTemplates()
    return generateRecurringTasks(loaded, templates)
  })
  const [sortMode, setSortModeState] = useState(() => loadSortMode())
  const [settings, setSettingsState] = useState(() => loadSettings())
  const [recurringTemplates, setRecurringTemplatesState] = useState(() => loadRecurringTemplates())
  const [statusMsg, setStatusMsg] = useState("")
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null) // { message, onConfirm }
  const statusTimerRef = useRef(null)
  const mainRef = useRef(null)

  const { confirmingId, requestConfirm } = useTwoStepConfirm()

  function showStatus(msg) {
    setStatusMsg(msg)
    clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => setStatusMsg(""), 2600)
  }

  function setTasks(next) {
    setTasksState(next)
    try { saveTasks(next) } catch { showStatus("保存に失敗しました") }
  }

  function setSortMode(mode) { setSortModeState(mode); saveSortMode(mode) }
  function setSettings(next) { setSettingsState(next); saveSettings(next) }
  function setRecurringTemplates(next) { setRecurringTemplatesState(next); saveRecurringTemplates(next) }

  const handleRefresh = useCallback(async () => {
    if (!('serviceWorker' in navigator)) { window.location.reload(); return }
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) { window.location.reload(); return }
    await reg.update()
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      showStatus('更新を適用しています')
      return
    }
    showStatus('最新です')
  }, [])

  const pullState = usePullToRefresh(mainRef, handleRefresh)

  // 他タブの書き込みを検知し、localStorageから最新データを読み直して同期する（issue #108）
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === null || e.key === STORAGE_KEY) setTasksState(loadTasks())
      if (e.key === null || e.key === SORT_KEY) setSortModeState(loadSortMode())
      if (e.key === null || e.key === SETTINGS_KEY) setSettingsState(loadSettings())
      if (e.key === null || e.key === RECURRING_KEY) setRecurringTemplatesState(loadRecurringTemplates())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function getSortedTopLevel() {
    const topLevel = tasks.filter(t => t.parentId === null)
    if (sortMode === 'manual') return topLevel
    return [...topLevel].sort((a, b) => {
      if (sortMode === 'created-desc') return (b.createdAt ?? 0) - (a.createdAt ?? 0)
      if (sortMode === 'created-asc') return (a.createdAt ?? 0) - (b.createdAt ?? 0)
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

  function addTask({ title, dueDate, recurrence }) {
    if (recurrence && recurrence !== 'none') {
      const tmpl = {
        id: crypto.randomUUID(),
        title,
        recurrence,
        weekDay: recurrence === 'weekly' ? new Date().getDay() : undefined,
        monthDay: recurrence === 'monthly' ? new Date().getDate() : undefined,
        createdAt: Date.now(),
      }
      setRecurringTemplates([...recurringTemplates, tmpl])
      const today = getLocalDateISO()
      setTasks([...tasks, {
        id: crypto.randomUUID(),
        title,
        completed: false,
        parentId: null,
        createdAt: Date.now(),
        dueDate: today,
        generatedFrom: tmpl.id,
        generatedDate: today,
      }])
    } else {
      setTasks([...tasks, {
        id: crypto.randomUUID(),
        title,
        completed: false,
        parentId: null,
        createdAt: Date.now(),
        dueDate: dueDate || null,
        generatedFrom: null,
        generatedDate: null,
      }])
    }
  }

  function addChildTask(parentId, title) {
    setTasks([...tasks, {
      id: crypto.randomUUID(),
      title,
      completed: false,
      parentId,
      createdAt: Date.now(),
      dueDate: null,
      generatedFrom: null,
      generatedDate: null,
    }])
  }

  function toggleTask(id) {
    setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
  }

  function editTask(id, { title, dueDate }) {
    setTasks(tasks.map(t => t.id === id ? { ...t, title, dueDate: dueDate || null } : t))
  }

  function getDescendantIds(taskId) {
    const ids = new Set([taskId])
    let changed = true
    while (changed) {
      changed = false
      tasks.forEach(t => {
        if (ids.has(t.parentId) && !ids.has(t.id)) { ids.add(t.id); changed = true }
      })
    }
    return ids
  }

  function deleteTask(id) {
    setTasks(tasks.filter(t => !getDescendantIds(id).has(t.id)))
  }

  function clearCompletedTasks() {
    setTasks(clearCompletedTaskTrees(tasks))
  }

  function moveTask(srcId, dstId) {
    const srcIndex = tasks.findIndex(t => t.id === srcId)
    if (srcIndex === -1) return
    const next = [...tasks]
    const [moved] = next.splice(srcIndex, 1)
    const dstIndex = next.findIndex(t => t.id === dstId)
    if (dstIndex === -1) { next.splice(srcIndex, 0, moved) } else { next.splice(dstIndex, 0, moved) }
    setTasks(next)
  }

  function exportTasks() {
    const payload = { version: 1, exportedAt: new Date().toISOString(), tasks }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'task-manager-' + getLocalDateISO() + '.json'
    link.click()
    URL.revokeObjectURL(url)
    showStatus('エクスポートしました')
  }

  function isValidTask(v) {
    return v && typeof v.id === 'string' && typeof v.title === 'string' &&
      typeof v.completed === 'boolean' && (v.parentId == null || typeof v.parentId === 'string')
  }

  function importTasksFromFile(file) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { showStatus('ファイルが大きすぎます'); return }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const payload = JSON.parse(e.target.result)
        if (!Array.isArray(payload.tasks) || !payload.tasks.every(isValidTask)) throw new Error('invalid')
        const importedIds = new Set(payload.tasks.map(t => t.id))
        const importedTasks = payload.tasks.map(t => ({ ...t, parentId: importedIds.has(t.parentId) ? t.parentId : null }))
        setConfirmModal({
          message: '現在のタスクを置き換えてインポートしますか？',
          onConfirm: () => {
            setTasks(importedTasks)
            showStatus('インポートしました')
          },
        })
      } catch {
        showStatus('JSON を読み込めませんでした')
      }
    }
    reader.readAsText(file)
  }

  async function checkForUpdate() {
    if (!('serviceWorker' in navigator)) { window.location.reload(); return }
    const reg = await navigator.serviceWorker.getRegistration()
    if (!reg) { window.location.reload(); return }
    await reg.update()
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' })
      showStatus('更新を適用しています')
      return
    }
    showStatus('最新です')
  }

  function deleteRecurringTemplate(id) {
    setRecurringTemplates(recurringTemplates.filter(t => t.id !== id))
  }

  const sortedTopLevel = getSortedTopLevel()
  const visibleTopLevel = settings.showCompleted ? sortedTopLevel : sortedTopLevel.filter(t => !t.completed)
  const remaining = tasks.filter(t => !t.completed).length
  const hasCompleted = tasks.some(t => t.completed)
  const completedDeleteCount = getCompletedTaskTreeIds(tasks).size
  const hasTasks = tasks.length > 0
  const hasVisibleTopLevel = visibleTopLevel.length > 0
  const emptyState = !hasTasks
    ? {
        text: 'タスクを追加してみましょう',
        sub: 'リスト末尾の＋ボタンから追加できます',
      }
    : !hasVisibleTopLevel && !settings.showCompleted
      ? {
          text: '表示中のタスクはありません',
          sub: '完了済みを表示すると確認できます',
        }
      : null
  const RECURRENCE_LABELS = { daily: '毎日', weekly: '毎週', monthly: '毎月' }

  return (
    <>
      {pullState.height > 0 && (
        <div
          className={'pull-indicator' + (pullState.complete ? ' complete' : '')}
          style={{ height: pullState.height + 'px', opacity: Math.min(pullState.height / 80, 1) }}
          aria-live="polite"
          aria-label="引っ張って更新"
        >
          {pullState.label}
        </div>
      )}
      <main className="app-shell" ref={mainRef}>
        <header className="app-header">
          <h1>task manager</h1>
          <div className="app-menu" aria-label="データ操作">
            <button
              id="menu-toggle"
              className="menu-toggle"
              type="button"
              aria-expanded={String(menuOpen)}
              aria-haspopup="true"
              aria-label="その他の操作"
              onClick={() => setMenuOpen(v => !v)}
            >
              &#9776;
            </button>
            {menuOpen && (
              <MenuPopup
                onClose={() => setMenuOpen(false)}
                onSettingsOpen={() => { setMenuOpen(false); setSettingsOpen(true) }}
                onCheckUpdate={() => { setMenuOpen(false); checkForUpdate() }}
                onExport={() => { setMenuOpen(false); exportTasks() }}
                onImport={importTasksFromFile}
                onCloseMenu={() => setMenuOpen(false)}
              />
            )}
          </div>
        </header>
        <section className="task-section" aria-label="タスク一覧">
          <div className="task-summary">
            <span id="open-count">残り{remaining}件</span>
            {hasCompleted && (
              <button
                id="clear-completed"
                type="button"
                className={confirmingId === 'clear' ? 'is-confirming' : ''}
                onClick={() => requestConfirm('clear', clearCompletedTasks)}
              >
                {confirmingId === 'clear'
                  ? completedDeleteCount + '件を削除（確認）'
                  : '完了済みを削除'}
              </button>
            )}
          </div>
          {hasTasks && (
            <div className="sort-bar">
              <label htmlFor="sort-select">並び順</label>
              <select
                id="sort-select"
                className="sort-select"
                value={sortMode}
                onChange={e => setSortMode(e.target.value)}
              >
                <option value="manual">手動</option>
                <option value="created-desc">追加日（新しい順）</option>
                <option value="created-asc">追加日（古い順）</option>
                <option value="due-asc">期限日（近い順）</option>
                <option value="due-desc">期限日（遠い順）</option>
              </select>
            </div>
          )}
          <ul className="task-list" id="task-list">
            {visibleTopLevel.map(task => (
              <TaskItem
                key={task.id}
                task={task}
                tasks={tasks}
                sortMode={sortMode}
                confirmingId={confirmingId}
                requestConfirm={requestConfirm}
                onToggle={toggleTask}
                onEdit={editTask}
                onDelete={deleteTask}
                onAddChild={addChildTask}
                onMove={moveTask}
              />
            ))}
            <AddTaskRow onAdd={addTask} />
          </ul>
          {emptyState && (
            <div className="empty-state" id="empty-state" aria-live="polite">
              <svg className="empty-state-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="9" y1="12" x2="15" y2="12"/>
                <line x1="12" y1="9" x2="12" y2="15"/>
              </svg>
              <p className="empty-state-text">{emptyState.text}</p>
              <p className="empty-state-sub">{emptyState.sub}</p>
            </div>
          )}
        </section>
      </main>
      <p id="status-message" className="status-message" role="status" aria-live="polite">
        {statusMsg}
      </p>
      {confirmModal && (
        <ConfirmModal
          message={confirmModal.message}
          onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null) }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          recurringTemplates={recurringTemplates}
          confirmingId={confirmingId}
          requestConfirm={requestConfirm}
          onSettingsChange={setSettings}
          onDeleteTemplate={deleteRecurringTemplate}
          onClose={() => setSettingsOpen(false)}
          RECURRENCE_LABELS={RECURRENCE_LABELS}
        />
      )}
    </>
  )
}

function MenuPopup({ onClose, onSettingsOpen, onCheckUpdate, onExport, onImport, onCloseMenu }) {
  const importRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (!e.target.closest('.app-menu')) onClose() }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [onClose])

  return (
    <div id="menu-popup" className="menu-popup">
      <button className="menu-item" type="button" onClick={onSettingsOpen}>設定</button>
      <button className="menu-item" type="button" onClick={onCheckUpdate}>更新を確認</button>
      <button className="menu-item" type="button" onClick={onExport}>エクスポート</button>
      <button className="menu-item" type="button" onClick={() => importRef.current?.click()}>インポート</button>
      <input
        ref={importRef}
        className="sr-only"
        type="file"
        accept="application/json"
        onChange={e => { onImport(e.target.files?.[0]); onCloseMenu(); e.target.value = '' }}
      />
    </div>
  )
}

function AddTaskRow({ onAdd }) {
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [recurrence, setRecurrence] = useState('none')
  const fieldRef = useRef(null)
  const formRef = useRef(null)

  function open() {
    setIsOpen(true)
    setTimeout(() => fieldRef.current?.focus(), 0)
  }

  function commit() {
    if (title.trim()) onAdd({ title: title.trim(), dueDate, recurrence })
    setIsOpen(false); setTitle(''); setDueDate(''); setRecurrence('none')
  }

  function cancel() {
    setIsOpen(false); setTitle(''); setDueDate(''); setRecurrence('none')
  }

  function handleBlur(e) {
    if (e.relatedTarget) {
      if (formRef.current?.contains(e.relatedTarget)) return
      commit()
    } else {
      // iOS Safari では relatedTarget が null になるため遅延チェック
      setTimeout(() => {
        if (!formRef.current?.contains(document.activeElement)) commit()
      }, 0)
    }
  }

  if (!isOpen) {
    return (
      <li
        className="task-add-row"
        role="button"
        tabIndex={0}
        aria-label="タスクを追加"
        onClick={open}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
      >
        + タスクを追加
      </li>
    )
  }

  return (
    <li className="task-add-row">
      <div className="task-add-form" ref={formRef}>
        <div className="task-add-form-row">
          <input
            ref={fieldRef}
            type="text"
            maxLength={80}
            placeholder="タスクを追加"
            aria-label="タスクを追加"
            className="task-add-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') cancel()
            }}
          />
          <input
            type="date"
            className="task-add-date"
            aria-label="期限日"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') cancel()
            }}
          />
        </div>
        <div className="task-add-recurrence">
          <label htmlFor="task-add-recurrence-select">繰り返し：</label>
          <select
            id="task-add-recurrence-select"
            value={recurrence}
            onChange={e => setRecurrence(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={e => { if (e.key === 'Escape') cancel() }}
          >
            <option value="none">なし</option>
            <option value="daily">毎日</option>
            <option value="weekly">毎週</option>
            <option value="monthly">毎月</option>
          </select>
        </div>
      </div>
    </li>
  )
}

function TaskItem({ task, tasks, sortMode, confirmingId, requestConfirm, onToggle, onEdit, onDelete, onAddChild, onMove, showCompleted = true }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(task.title)
  const [editDue, setEditDue] = useState(task.dueDate ?? '')
  const [showChildForm, setShowChildForm] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [childTitle, setChildTitle] = useState('')
  const editFieldRef = useRef(null)
  const editRowRef = useRef(null)
  const childFieldRef = useRef(null)

  const children = tasks.filter(t => t.parentId === task.id)
  const visibleChildren = showCompleted ? children : children.filter(c => !c.completed)
  const today = getLocalDateISO()
  const deleteConfirmId = 'delete-' + task.id

  function startEdit() {
    setEditTitle(task.title)
    setEditDue(task.dueDate ?? '')
    setIsEditing(true)
    setTimeout(() => { editFieldRef.current?.focus(); editFieldRef.current?.select() }, 0)
  }

  function commitEdit() {
    const nextTitle = editTitle.trim()
    if (nextTitle) onEdit(task.id, { title: nextTitle, dueDate: editDue })
    setIsEditing(false)
  }

  function handleEditBlur(e) {
    if (e.relatedTarget) {
      if (editRowRef.current?.contains(e.relatedTarget)) return
      commitEdit()
    } else {
      // iOS Safari では relatedTarget が null になるため遅延チェック
      setTimeout(() => {
        if (!editRowRef.current?.contains(document.activeElement)) commitEdit()
      }, 0)
    }
  }

  function submitChild(e) {
    e.preventDefault()
    if (!childTitle.trim()) return
    onAddChild(task.id, childTitle.trim())
    setChildTitle('')
    setShowChildForm(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragOver(false)
    const srcId = e.dataTransfer.getData('text/plain')
    if (srcId && srcId !== task.id) onMove(srcId, task.id)
  }

  const hasChildren = visibleChildren.length > 0
  const completedChildren = children.filter(c => c.completed).length
  const confirmLabel = hasChildren ? '本当に削除（子タスクも削除）' : '本当に削除'
  const isSortable = sortMode === 'manual' && task.parentId === null

  return (
    <li
      className={'task-item' + (task.completed ? ' completed' : '') + (isDragOver ? ' drag-over' : '')}
      data-task-id={task.id}
      draggable={isSortable}
      onDragStart={isSortable ? e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id) } : undefined}
      onDragEnd={isSortable ? () => setIsDragOver(false) : undefined}
      onDragOver={isSortable ? e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setIsDragOver(true) } : undefined}
      onDragLeave={isSortable ? () => setIsDragOver(false) : undefined}
      onDrop={isSortable ? handleDrop : undefined}
    >
      <div ref={editRowRef} className={'task-row' + (sortMode === 'manual' ? ' task-row--sortable' : '')}>
        {sortMode === 'manual' && (
          <span className="drag-handle" aria-label="並び替え" title="並び替え">
            <DragIcon />
          </span>
        )}
        <input
          type="checkbox"
          checked={task.completed}
          aria-label={task.title + 'を完了'}
          onChange={() => onToggle(task.id)}
        />
        {isEditing ? (
          <>
            <input
              ref={editFieldRef}
              className="task-edit-input"
              type="text"
              maxLength={80}
              value={editTitle}
              aria-label="タスク名を編集"
              onChange={e => setEditTitle(e.target.value)}
              onBlur={handleEditBlur}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setIsEditing(false)
              }}
            />
            <input
              type="date"
              className="task-add-date"
              aria-label="期限日を編集"
              value={editDue}
              onChange={e => setEditDue(e.target.value)}
              onBlur={handleEditBlur}
              onKeyDown={e => {
                if (e.key === 'Enter') commitEdit()
                if (e.key === 'Escape') setIsEditing(false)
              }}
            />
          </>
        ) : (
          <div className="task-title-area">
            <span className="task-title">
              {task.title}
              {hasChildren && completedChildren < children.length && (
                <span className="subtask-badge">{completedChildren}/{children.length}</span>
              )}
            </span>
            {task.dueDate && (
              <span className={'task-due' + (task.dueDate < today ? ' overdue' : '')}>
                {formatDueDate(task.dueDate)}
              </span>
            )}
            {task.generatedFrom && (
              <span className="recurring-badge" aria-label="繰り返しタスク" title="繰り返しで自動生成されたタスク">↻</span>
            )}
          </div>
        )}
        <div className="task-actions">
          <button
            className="icon-button add-child-button"
            type="button"
            aria-label={task.title + 'に子タスクを追加'}
            title="子タスクを追加"
            onClick={() => { setShowChildForm(v => !v); setTimeout(() => childFieldRef.current?.focus(), 0) }}
          >
            <AddChildIcon />
          </button>
          <button
            className="icon-button edit-button"
            type="button"
            aria-label={task.title + 'を編集'}
            title="編集"
            onClick={startEdit}
          >
            <EditIcon />
          </button>
          <button
            className={'icon-button delete-button' + (confirmingId === deleteConfirmId ? ' is-confirming' : '')}
            type="button"
            aria-label={confirmingId === deleteConfirmId ? confirmLabel : task.title + 'を削除'}
            title="削除"
            onClick={() => requestConfirm(deleteConfirmId, () => onDelete(task.id))}
          >
            <DeleteIcon />
          </button>
        </div>
      </div>
      {showChildForm && (
        <form className="child-task-form" onSubmit={submitChild}>
          <input
            ref={childFieldRef}
            type="text"
            maxLength={80}
            placeholder="子タスクを追加"
            aria-label={task.title + 'の子タスクを追加'}
            value={childTitle}
            onChange={e => setChildTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setShowChildForm(false) }}
          />
          <button type="submit">追加</button>
          <button type="button" onClick={() => setShowChildForm(false)}>キャンセル</button>
        </form>
      )}
      {hasChildren && (
        <ul className="task-children">
          {visibleChildren.map(child => (
            <TaskItem
              key={child.id}
              task={child}
              tasks={tasks}
              sortMode={sortMode}
              confirmingId={confirmingId}
              requestConfirm={requestConfirm}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onMove={onMove}
              showCompleted={showCompleted}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function SettingsPanel({ settings, recurringTemplates, confirmingId, requestConfirm, onSettingsChange, onDeleteTemplate, onClose, RECURRENCE_LABELS }) {
  const overlayRef = useRef(null)

  useEffect(() => { overlayRef.current?.focus() }, [])

  return (
    <div
      ref={overlayRef}
      id="settings-overlay"
      className="settings-overlay"
      aria-modal="true"
      role="dialog"
      aria-label="設定"
      tabIndex={-1}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div className="settings-panel">
        <div className="settings-header">
          <h2 className="settings-title">設定</h2>
          <button id="settings-close" className="icon-button" type="button" aria-label="設定を閉じる" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <section className="settings-section">
          <h3 className="settings-section-title">表示</h3>
          <label className="settings-toggle-row">
            <span>完了済みタスクを表示</span>
            <input
              type="checkbox"
              id="show-completed-toggle"
              checked={settings.showCompleted}
              onChange={e => onSettingsChange({ ...settings, showCompleted: e.target.checked })}
            />
          </label>
        </section>
        <section className="settings-section">
          <h3 className="settings-section-title">繰り返しタスク</h3>
          <p className="settings-desc">繰り返し設定を持つタスクのテンプレートを管理します。タスク追加時に繰り返し設定を指定できます。</p>
          <ul className="recurring-list" id="recurring-list">
            {recurringTemplates.length === 0 ? (
              <li className="recurring-list-empty">繰り返しタスクはありません</li>
            ) : recurringTemplates.map(tmpl => {
              const confirmId = 'recurring-delete-' + tmpl.id
              return (
                <li key={tmpl.id} className="recurring-item">
                  <span className="recurring-item-title">{tmpl.title}</span>
                  <span className="recurring-item-badge">{RECURRENCE_LABELS[tmpl.recurrence] ?? tmpl.recurrence}</span>
                  <button
                    className={'icon-button delete-button' + (confirmingId === confirmId ? ' is-confirming' : '')}
                    type="button"
                    aria-label={confirmingId === confirmId ? '本当に削除' : tmpl.title + 'の繰り返しを削除'}
                    title="削除"
                    onClick={() => requestConfirm(confirmId, () => onDeleteTemplate(tmpl.id))}
                  >
                    <DeleteIcon />
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
        <p className="settings-version">バージョン {APP_VERSION}</p>
      </div>
    </div>
  )
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  const overlayRef = useRef(null)
  useEffect(() => { overlayRef.current?.focus() }, [])
  return (
    <div
      ref={overlayRef}
      className="settings-overlay"
      aria-modal="true"
      role="dialog"
      aria-label="確認"
      tabIndex={-1}
      onClick={e => { if (e.target === overlayRef.current) onCancel() }}
      onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
    >
      <div className="settings-panel confirm-modal">
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button type="button" className="menu-item" onClick={onConfirm}>はい</button>
          <button type="button" className="menu-item" onClick={onCancel}>キャンセル</button>
        </div>
      </div>
    </div>
  )
}
