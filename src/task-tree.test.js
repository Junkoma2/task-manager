import test from 'node:test'
import assert from 'node:assert/strict'
import { clearCompletedTaskTrees, getCompletedTaskTreeIds } from './task-tree.js'

function task(id, { completed = false, parentId = null } = {}) {
  return { id, title: id, completed, parentId }
}

test('removes unfinished descendants of a completed parent', () => {
  const tasks = [
    task('parent', { completed: true }),
    task('child', { parentId: 'parent' }),
    task('grandchild', { parentId: 'child' }),
    task('open'),
  ]

  assert.deepEqual(clearCompletedTaskTrees(tasks), [task('open')])
})

test('removes a completed child tree without removing its open parent', () => {
  const tasks = [
    task('parent'),
    task('child', { completed: true, parentId: 'parent' }),
    task('grandchild', { parentId: 'child' }),
  ]

  assert.deepEqual(clearCompletedTaskTrees(tasks), [task('parent')])
})

test('keeps unrelated unfinished task trees', () => {
  const tasks = [
    task('parent'),
    task('child', { parentId: 'parent' }),
  ]

  assert.deepEqual(clearCompletedTaskTrees(tasks), tasks)
})

test('counts descendants inherited from a completed task', () => {
  const tasks = [
    task('parent', { completed: true }),
    task('child', { parentId: 'parent' }),
    task('open'),
  ]

  assert.equal(getCompletedTaskTreeIds(tasks).size, 2)
})
