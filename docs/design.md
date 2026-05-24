# design.md

task-manager の設計ドキュメント。

---

## 設計思想

**静かに使い続けられるタスク管理。** 入力しやすさと「戻ってきやすさ」を第一に。
過剰演出・自己啓発感・ゲーミフィケーションは禁止。機能追加より続けて使えることを優先する。

### 判断基準

- 速く入力できるか
- 迷わず戻ってこられるか
- 情報が増えても落ち着いて見えるか
- 便利さのために、日々の負担を増やしていないか

### 避けるもの

- 過剰な演出
- 必要以上の通知
- 達成感を煽りすぎる表現
- 機能のための機能

---

## アーキテクチャ概要

`index.html` / `script.js` / `styles.css` がエントリポイント。フレームワーク・ビルドステップなし。
デプロイは `docs/` フォルダを GitHub Pages のソースとして公開。`main` への push で即時反映。

```
task-manager/
├── index.html          # アプリ本体
├── script.js           # ロジック全体
├── styles.css          # スタイル
├── sw.js               # Service Worker
├── manifest.webmanifest
└── docs/
    ├── product-principles.md
    └── design.md       # このファイル
```

---

## データ構造

### localStorage キー

| キー | 内容 |
|---|---|
| `task-manager-items` | タスクリスト（JSON配列） |
| `task-manager-sort` | ソートモード（文字列） |
| `task-manager-settings` | 設定（JSON） |
| `task-manager-recurring` | 繰り返しテンプレート（JSON配列） |

### タスクのスキーマ

```json
{
  "id": "uuid-v4",
  "title": "資料を作る",
  "completed": false,
  "parentId": null,
  "createdAt": 1700000000000,
  "dueDate": "2026-05-30",
  "generatedFrom": null,
  "generatedDate": null
}
```

- `id` — `crypto.randomUUID()` で生成
- `parentId` — 子タスクの場合は親タスクのID。トップレベルは `null`
- `createdAt` — Unix タイムスタンプ（ms）
- `dueDate` — 期限日（`YYYY-MM-DD`）または `null`
- `generatedFrom` — 繰り返しテンプレートのID。手動追加は `null`
- `generatedDate` — 自動生成された日付（`YYYY-MM-DD`）。重複生成防止に使用

### 繰り返しテンプレートのスキーマ

```json
{
  "id": "uuid-v4",
  "title": "日報を書く",
  "recurrence": "daily",
  "weekDay": 1,
  "monthDay": 1,
  "createdAt": 1700000000000
}
```

- `recurrence` — `"daily"` / `"weekly"` / `"monthly"`
- `weekDay` — `"weekly"` の場合の曜日（0=日〜6=土）
- `monthDay` — `"monthly"` の場合の日付（1〜31）

### 設定のスキーマ

```json
{
  "showCompleted": true
}
```

### エクスポートのフォーマット

```json
{
  "version": 1,
  "exportedAt": "2026-01-20T08:00:00.000Z",
  "tasks": [...]
}
```

インポート時は `isValidTask` でバリデーションを行い、孤立した `parentId`（対応する親タスクが存在しない）は `null` に正規化する。ファイルサイズ上限は 2MB。

---

## 主要な動作

### タスクの入力フロー

「+ タスクを追加」行をタップするとその場にインライン入力フォームが展開される。フォームはタイトル・期限日・繰り返しを1画面で設定できる。Enter またはフォーカスアウトで保存。Escape でキャンセル。

### 削除の2ステップ確認

削除ボタンは1回タップで「本当に削除」ラベルに切り替わり、3秒以内に再タップすると実行される。子タスクを持つ場合はラベルに「（子タスクも削除）」が付く。誤操作防止のため `window.confirm` は使わない。

### 繰り返しタスクの自動生成

アプリ起動時（`generateRecurringTasks`）に、当日分がまだ生成されていないテンプレートを確認し、タスクを自動追加する。`generatedFrom` + `generatedDate` の組み合わせで重複生成を防ぐ。

### 完了済みタスクの削除

「完了済みを削除」ボタンは同じく2ステップ確認。削除時、完了済みタスクの子タスクが未完了の場合は孤立しないよう `parentId = null`（トップレベル昇格）に変換してから削除する。

---

## 今後の拡張方針・やらないこと

### やってよいこと

- 期限切れタスクの強調表示改善
- 繰り返しタスクの管理UIの改善

### やらないこと

- 階層を2段以上に深くすること（子タスクは1階層のみ）
- タグ・ラベル・優先度などの属性付与
- クラウド同期・アカウント機能
- カレンダー連携・リマインダー通知
- ガントチャート・かんばんビュー
