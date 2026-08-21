import { getLocalDateISO } from './date.js'

// 進捗テキスト出力: 期間内の完了/未完了タスクを抽出し、親子階層を保ったテキストを組み立てる

/**
 * タスクが抽出条件（進捗テキストの出力対象）に合致するか判定する。
 * - 完了タスク: completedAt の日付が startISO〜endISO の範囲内（両端含む）
 * - 未完了タスク: dueDate が endISO 以前（startISOより前に期限切れのものも含む）。
 *   期限日が無いタスクは includeNoDueDate で切り替える
 */
export function matchesProgressRange(task, { startISO, endISO, includeNoDueDate }) {
  if (task.completed) {
    if (typeof task.completedAt !== 'number') return false
    const completedISO = getLocalDateISO(new Date(task.completedAt))
    return completedISO >= startISO && completedISO <= endISO
  }
  if (task.dueDate) return task.dueDate <= endISO
  return Boolean(includeNoDueDate)
}

function buildChildrenMap(tasks) {
  const byId = new Map(tasks.map(t => [t.id, t]))
  const childrenOf = new Map()
  for (const t of tasks) {
    if (t.parentId && byId.has(t.parentId)) {
      if (!childrenOf.has(t.parentId)) childrenOf.set(t.parentId, [])
      childrenOf.get(t.parentId).push(t)
    }
  }
  return { byId, childrenOf }
}

/**
 * 抽出条件に合致したタスクIDの集合（matchedIds）と、
 * 親子階層を表示するために文脈として必要な親タスクも加えたID集合（includedIds）を返す。
 * 親タスク自体は抽出条件に合致しなくても、子タスクの文脈として includedIds に含まれる。
 */
export function selectProgressTaskIds(tasks, range) {
  const { byId } = buildChildrenMap(tasks)
  const matchedIds = new Set()
  const includedIds = new Set()

  for (const task of tasks) {
    if (!matchesProgressRange(task, range)) continue
    matchedIds.add(task.id)
    includedIds.add(task.id)
    let parent = task.parentId ? byId.get(task.parentId) : null
    while (parent) {
      includedIds.add(parent.id)
      parent = parent.parentId ? byId.get(parent.parentId) : null
    }
  }

  return { matchedIds, includedIds }
}

/**
 * includedIds に含まれるタスクを、元の並び順を保ったまま親子階層のテキストへ整形する。
 * 完了タスクは ◼︎、未完了タスクは ◻︎ を行頭に付け、子タスクは深さ1段につき全角スペース1つを追加する。
 */
export function buildProgressText(tasks, includedIds) {
  const { childrenOf } = buildChildrenMap(tasks)
  const lines = []

  function walk(task, depth) {
    const indent = '　'.repeat(depth) // 全角スペース
    const mark = task.completed ? '◼︎' : '◻︎'
    lines.push(`${indent}${mark} ${task.title}`)
    const children = (childrenOf.get(task.id) ?? []).filter(c => includedIds.has(c.id))
    for (const child of children) walk(child, depth + 1)
  }

  tasks
    .filter(t => t.parentId === null && includedIds.has(t.id))
    .forEach(t => walk(t, 0))

  return lines.join('\n')
}

/**
 * 進捗テキストと対象件数（抽出条件に直接合致した件数。文脈用の親は含めない）をまとめて返す。
 */
export function buildProgressReport(tasks, range) {
  const { matchedIds, includedIds } = selectProgressTaskIds(tasks, range)
  return {
    text: buildProgressText(tasks, includedIds),
    matchedCount: matchedIds.size,
  }
}
