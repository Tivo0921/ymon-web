# YNU Monsters Web - Docker セットアップ完了

Docker コンテナ化により、開発メンバーが同じ環境で開発できるようになりました。🎉

## 📋 セットアップの概要

以下のファイルが作成されました：

### Docker ファイル

| ファイル | 説明 |
|---------|------|
| `apps/api/Dockerfile` | API サーバー (Express.js) のコンテナイメージ |
| `apps/web/Dockerfile` | Web サーバー (Next.js) のコンテナイメージ |
| `docker-compose.yml` | 3つのサービス (api, web, postgres) を管理 |
| `apps/api/.dockerignore` | Docker ビルド時に除外するファイル |
| `apps/web/.dockerignore` | Docker ビルド時に除外するファイル |
| `apps/api/.env.example` | API 設定ファイルのテンプレート |
| `DOCKER_SETUP.md` | 詳細なセットアップガイド |

## 🚀 クイックスタート

**Step 1:** 環境変数の設定

```bash
cp apps/api/.env.example apps/api/.env
# .env ファイルを編集して Supabase 認証情報を入力
```

**Step 2:** Docker コンテナの起動

```bash
docker-compose up --build
```

**Step 3:** アプリにアクセス

- Web: <http://localhost:3000>
- API: <http://localhost:3001>
- Health Check: <http://localhost:3001/health>

詳細は [DOCKER_SETUP.md](DOCKER_SETUP.md) をご覧ください。

## 🏗️ アーキテクチャ

```
┌─────────────────────────────────────────┐
│          ymon-network (Bridge)          │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────────┐                  │
│  │   Web Service    │ :3000             │
│  │   (Next.js)      │                   │
│  └────────┬─────────┘                   │
│           │                             │
│  ┌────────▼──────────┐                  │
│  │   API Service     │ :3001             │
│  │  (Express.js)     │                   │
│  └────────┬──────────┘                   │
│           │                             │
│  ┌────────▼──────────┐                  │
│  │  Supabase Cloud   │                  │
│  │  (PostgreSQL)     │                  │
│  └───────────────────┘                  │
│                                         │
│  ┌──────────────────┐ (Optional)        │
│  │  postgres Local  │ :5432             │
│  │  (Development)   │                  │
│  └───────────────────┘                  │
│                                         │
└─────────────────────────────────────────┘
```

## 📝 使用テクノロジー

- **Node.js**: 20 (Alpine - 軽量)
- **Frontend**: Next.js 13+
- **Backend**: Express.js
- **Database**: Supabase PostgreSQL (クラウド)
- **Container**: Docker + Docker Compose

## 🎯 各サービスの詳細

### API サービス (port 3001)

- Base: Node 20-Alpine
- 最適化: Multi-stage build
- Health Check: `/health` エンドポイント
- ホットリロード: ファイル変更で自動再起動

### Web サービス (port 3000)

- Base: Node 20-Alpine
- ビルド: Multi-stage build with Next.js optimization
- Health Check: 30秒ごとに確認
- ホットリロード: コード変更時にブラウザ自動更新

### PostgreSQL (port 5432) - オプション

- Image: postgres:16-Alpine
- 用途: ローカル開発用（使用しない場合はスキップ可能）
- ボリューム: `postgres_data` で永続化

## 🔧 よく使うコマンド

```bash
# コンテナの起動
docker-compose up

# バックグラウンド起動
docker-compose up -d

# 停止
docker-compose down

# ログを確認
docker-compose logs -f

# 特定サービスのログ
docker-compose logs -f api
docker-compose logs -f web

# コンテナ内でコマンド実行
docker-compose exec api npm install
docker-compose exec web npm run build

# キャッシュクリア・完全再ビルド
docker-compose down -v
docker-compose up --build
```

## ⚠️ 重要な注意事項

1. **Supabase 認証情報が必須です**
   - `apps/api/.env` ファイルに SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を設定する必要があります

2. **Supabase テーブルは手動で作成してください**

   ```sql
   -- courses テーブル
   CREATE TABLE courses (
     key TEXT PRIMARY KEY,
     display_name TEXT NOT NULL,
     category TEXT NOT NULL,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   
   -- reviews テーブル
   CREATE TABLE reviews (
     id SERIAL PRIMARY KEY,
     course_key TEXT NOT NULL REFERENCES courses(key),
     author_handle TEXT NOT NULL,
     rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
     comment TEXT,
     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   ```

3. **初回ビルドは2～3分かかります**
   - npm install と Next.js のビルドが必要です
   - その後のビルドは Docker レイヤーキャッシュで高速化されます

## 💡 トラブルシューティング

### ポートが既に使用されている場合

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### モジュールのインストール問題

```bash
docker-compose down -v
docker system prune -a
docker-compose up --build
```

詳細は [DOCKER_SETUP.md](DOCKER_SETUP.md) を参照してください。

## 📚 関連ドキュメント

- [DOCKER_SETUP.md](DOCKER_SETUP.md) - 詳細なセットアップガイド
- [README.md](README.md) - プロジェクト概要
- [docker-compose.yml](docker-compose.yml) - サービス定義

---

**チーム開発を楽しみましょう！** 🚀
