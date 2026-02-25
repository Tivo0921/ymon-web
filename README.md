## 技術スタック

- Next.js (App Router)
- Express
- Supabase (Postgres)

## 現在の機能

- ユーザーの作成・取得（ハンドル名ベース）
- マッチメイキング（べき等、競合状態対応）
- 3v3バトルシミュレーション
- バトル結果のDB保存

## 現在の画面遷移

### 詳細フロー

#### 1. ホーム画面 (`/`)

| 操作 | エンドポイント | 結果 |
|------|--------------|------|
| 「参加する」ボタン | `POST /api/users` (handle, display_name) | ✅ 成功 → `/matchmaking?handle={handle}` に遷移<br/>❌ エラー → エラー表示 |

#### 2. マッチメイキング (`/matchmaking`)

**自動ポーリング**

| エンドポイント | 条件 | 動作 |
|---------------|------|------|
| `GET /api/matchmaking/status/{handle}` | `status.latest_match.status === "created"` かつ `status.queued === false` | `/matches/{matchId}?handle={handle}` に自動遷移 |

**ユーザーアクション**

| ボタン | エンドポイント | 結果 |
|--------|-------------|------|
| join | `POST /api/matchmaking/join` (handle, mode) | ✅ `matched === true` → `/matches/{matchId}` に遷移<br/>✅ `matched === false` → 待機継続（ポーリング開始）<br/>❌ エラー → エラー表示 |
| leave | `POST /api/matchmaking/leave` (handle) | ✅ キューから削除（ページ内で状態更新）<br/>❌ エラー → エラー表示 |
| refresh | `GET /api/matchmaking/status/{handle}` | 状態手動更新 |

#### 3. マッチページ (`/matches/[matchId]`)

**初期読み込み**

| エンドポイント | 用途 |
|-------------|------|
| `GET /api/matches/{matchId}` | マッチデータ表示 |
| `GET /api/users/{handle}/owned-professors` | 所持教授一覧表示 |

**バトル実行**

| 操作 | エンドポイント | 結果 |
|------|-------------|------|
| 「battle」ボタン | `POST /api/matches/{matchId}/battle` (p1_team_keys, p2_team_keys) | ✅ バトル結果をページ内に表示（遷移なし）<br/>❌ エラー → エラー表示 |
| 「reload」ボタン | `GET /api/matches/{matchId}` | マッチデータ更新 |

#### 追加ページ（テスト・デバッグ用）

- `/professors` - 教授(モンスター)の一覧表示
- `/playground` - APIの動作確認用テストページ
- `/debug` - ヘルスチェック・ユーザー一覧確認

<img width="1536" height="836" alt="image" src="https://github.com/user-attachments/assets/f41fb03c-7501-446a-a2a4-27875f9dc422" />


## ローカルセットアップ

### APIサーバ

```bash
cd apps/api
npm install
npm run dev
```

### Webアプリ

```bash
cd apps/web
npm install
npm run dev
```


## トラブルシューティング

| エラー | 原因 | 対処 |
|--------|------|------|
| APIが起動しない | 3001番ポートが既に使用中 | `PORT=3002 npm run dev` で別ポート指定 |
| フロントから API に接続できない | `NEXT_PUBLIC_API_BASE_URL` が誤った設定 | 環境変数を確認（デフォルト: `http://localhost:3001`） |
| Supabase エラー | 認証情報が不正 | `SUPABASE_*` の値が正しいか確認 |

## 開発時の注意

- **APIサーバとWebアプリは別プロセス** - 両方同時に起動する必要があります
- APIサーバ: `cd apps/api && npm run dev`
- Webアプリ: `cd apps/web && npm run dev` (別ターミナル)

## 更新履歴
2026-02-25 Tivo
