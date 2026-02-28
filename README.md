# YNU Monsters

## 概要

3v3バトル。マッチメイキング機能搭載

## 技術スタック

- Next.js (App Router)
- Express
- Supabase (Postgres)
- Docker & Docker Compose

## 現在の機能

- ユーザーの作成・取得（ハンドル名ベース）
- マッチメイキング（べき等、競合状態対応）
- 3v3バトルシミュレーション
- バトル結果のDB保存
- ターン制バトルシステム（SPD ベースのターン順序）
- 攻撃・交替アクション管理
- コース評価システム（星評価・コメント）

---

## 🚀 はじめに

**👇 開発者はここから始めてください：**

1. このページの「[開発者向けセットアップガイド](#開発者向けセットアップガイド)」を読む
2. **推奨: Docker を使ったセットアップ**の 4 つのステップに従う
3. <http://localhost:3000> でアプリが起動したら完了！

**重要な注意:**

- Supabase の認証情報が必須です（ステップ 2 で設定）
- トラブルが発生した場合は [トラブルシューティング](#トラブルシューティング) を参照

---

## 開発者向けセットアップガイド

### 推奨: Docker を使ったセットアップ（容易・環境統一）

チーム全員が同じ Docker 環境で開発できます。Node.js のインストール不要です。

**前提条件:**

- Docker Desktop がインストールされていること
  - [Windows/Mac: Docker Desktop](https://www.docker.com/products/docker-desktop)
  - [Linux: Docker](https://docs.docker.com/engine/install/)

**セットアップ手順:**

#### Step 1: リポジトリをクローン

```bash
git clone https://github.com/Tivo0921/ymon-web.git
cd ymon-web
```

#### Step 2: 環境変数の設定

```bash
cp apps/api/.env.example apps/api/.env
```

`.env` ファイルを編集して、Supabase の認証情報を入力します：

```bash
# apps/api/.env
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PORT=3001
NODE_ENV=development
```

#### Step 3: Docker コンテナで起動

```bash
# コンテナをビルドして起動
docker-compose up --build

# バックグラウンドで実行する場合
docker-compose up -d --build
```

初回は npm install と Next.js ビルドで 2～3 分かかります。その後のビルドは高速化されます。

#### Step 4: アプリにアクセス

起動完了後、以下の URL にアクセスしてください：

- **Web フロントエンド**: <http://localhost:3000>
- **API サーバー**: <http://localhost:3001>
- **ヘルスチェック**: <http://localhost:3001/health>

---

### 代替: ローカルで直接セットアップ（手動管理）

Node.js がインストール済みの場合は、ローカルで直接開発することも可能です。

**前提条件:**

- Node.js 20 以上がインストールされていること
- npm または yarn がインストールされていること
- Supabase の認証情報を取得していること

#### 1. リポジトリをクローン

```bash
git clone https://github.com/Tivo0921/ymon-web.git
cd ymon-web
```

#### 2. API サーバーのセットアップ

```bash
cd apps/api
cp .env.example .env
# .env ファイルを編集して Supabase 認証情報を入力
npm install
npm run dev
```

API サーバーは `http://localhost:3001` で起動します。

#### 3. Web アプリのセットアップ

新しいターミナルで：

```bash
cd apps/web
npm install
npm run dev
```

Web アプリは `http://localhost:3000` で起動します。

---

## 🏗️ システムアーキテクチャ

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
└─────────────────────────────────────────┘
```

### 各サービスの詳細

- **Web Service (port 3000)**: Node 20-Alpine 上の Next.js
  - Multi-stage build で最適化
  - Hot Module Reload (HMR) 対応
  - ファイル変更時にブラウザ自動更新

- **API Service (port 3001)**: Node 20-Alpine 上の Express.js
  - Health Check: `/health` エンドポイント
  - ホットリロード: ファイル変更で自動再起動
  - Multi-stage build で最適化

- **データベース**: Supabase PostgreSQL (クラウド)

---

## Supabase の設定

### 1. Supabase プロジェクトを作成

[Supabase](https://supabase.com/) でアカウントを作成し、新しいプロジェクトを作成してください。

### 2. 認証情報を取得

- Supabase ダッシュボード → Settings → API Keys
- `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` をコピーして `.env` ファイルに貼り付けます

### 3. 必要なテーブルを作成

Supabase ダッシュボード → SQL Editor で以下を実行：

```sql
-- courses テーブル（授業情報）
CREATE TABLE courses (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- reviews テーブル（評価情報）
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  course_key TEXT NOT NULL REFERENCES courses(key),
  author_handle TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## よく使うコマンド

### Docker を使う場合

```bash
# コンテナの起動
docker-compose up

# バックグラウンド起動
docker-compose up -d

# 停止
docker-compose down

# ログを確認（全サービス）
docker-compose logs -f

# 特定サービスのログ
docker-compose logs -f api
docker-compose logs -f web

# コンテナ内でコマンド実行
docker-compose exec api npm install <package>
docker-compose exec web npm install <package>

# コンテナ内でシェルを開く
docker-compose exec api sh
docker-compose exec web sh

# 完全にリセット（ボリュームも削除）
docker-compose down -v
docker-compose up --build

# キャッシュをクリアして再ビルド
docker-compose up --build --force-recreate

# Docker イメージをクリア
docker system prune -a
```

### ローカル実行の場合

```bash
# API サーバー
cd apps/api
npm install
npm run dev

# Web アプリ（新しいターミナル）
cd apps/web
npm install
npm run dev
```

---

## トラブルシューティング

### ポート競合エラー

別のアプリケーションがポート 3000 や 3001 を使用している場合：

**Windows:**

```powershell
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Mac/Linux:**

```bash
lsof -i :3000
kill -9 <PID>
```

### Docker での node_modules エラー

```bash
# ホスト側の node_modules を削除
rm -rf apps/api/node_modules
rm -rf apps/web/node_modules

# コンテナをリセット
docker-compose down -v
docker-compose up --build
```

### コンテナがビルドできない

```bash
# Docker イメージをクリアしてリビルド
docker-compose down
docker system prune -a
docker-compose up --build
```

### Supabase 接続エラー

- `.env` ファイルに正しい `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が設定されているか確認
- Supabase プロジェクトの API キーが有効か確認
- Supabase ダッシュボードでテーブルが作成されているか確認

### ホットリロードが働かない

**Docker での開発の場合:**

```bash
# コンテナをリセット
docker-compose down
docker-compose up --build
```

**ローカル開発の場合:**

```bash
# npm run dev を再起動してください
```

---

## 開発ワークフロー

### コード変更時

**Docker での開発:**

- ファイル保存時に自動的にアプリが再読み込みします
- Next.js は Hot Module Reload (HMR) に対応しており、ブラウザも自動更新されます

**ローカルでの開発:**

- `npm run dev` で起動した場合、自動的にホットリロードが有効です

### 新しい npm パッケージのインストール

**Docker での開発:**

```bash
docker-compose exec api npm install <package-name>
docker-compose exec web npm install <package-name>
```

**ローカルでの開発:**

```bash
cd apps/api
npm install <package-name>

cd ../web
npm install <package-name>
```

---

## プロジェクト構成

```
ymon-web/
├── apps/
│   ├── api/                    # Express.js バックエンド
│   │   ├── index.js            # メインのバトルロジック
│   │   ├── Dockerfile          # API コンテナイメージ
│   │   ├── .env.example        # 環境変数テンプレート
│   │   ├── package.json
│   │   └── node_modules/
│   │
│   └── web/                    # Next.js フロントエンド
│       ├── src/app/
│       │   ├── matches/        # バトル画面
│       │   ├── reviews/        # 評価画面
│       │   └── matchmaking/    # マッチメイキング画面
│       ├── Dockerfile          # Web コンテナイメージ
│       ├── package.json
│       └── node_modules/
│
├── docker-compose.yml          # サービス定義
├── README.md                   # このファイル
└── .gitignore
```

---

## 参考リンク

- [Supabase ドキュメント](https://supabase.com/docs)
- [Next.js ドキュメント](https://nextjs.org/docs)
- [Express ドキュメント](https://expressjs.com/)
- [Docker ドキュメント](https://docs.docker.com/)

---

## サポート

問題が発生した場合は、以下を確認してください：

1. [トラブルシューティング](#トラブルシューティング) セクションを参照
2. チームメンバーに相談
