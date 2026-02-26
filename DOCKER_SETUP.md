# Docker セットアップガイド

このドキュメントは、開発メンバーが Docker を使用して同じ環境で開発するための手順を説明します。

## 前提条件

- Docker Desktop がインストールされていること
- Docker Compose がインストールされていること（Docker Desktop に含まれます）
- Git がインストールされていること

**インストール:**
- [Docker Desktop (Windows/Mac)](https://www.docker.com/products/docker-desktop)
- [Docker on Linux](https://docs.docker.com/engine/install/)

## クイックスタート

### 1. リポジトリのクローン

```bash
git clone https://github.com/Tivo0921/ymon-web.git
cd ymon-web
```

### 2. 環境変数の設定

API サーバー用の `.env` ファイルを作成します：

```bash
cp apps/api/.env.example apps/api/.env
```

`.env` ファイルを編集して、実際の Supabase 認証情報を入力します：

```bash
# apps/api/.env
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Docker コンテナのビルドと起動

```bash
# コンテナをビルドして起動
docker-compose up --build

# バックグラウンドで起動する場合
docker-compose up -d --build
```

### 4. アプリケーションへのアクセス

セットアップが完了したら、以下の URL にアクセスできます：

- **Web (Next.js)**: http://localhost:3000
- **API (Express)**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

## よく使うコマンド

### コンテナの開始・停止

```bash
# 起動
docker-compose up

# バックグラウンド起動
docker-compose up -d

# 停止
docker-compose down

# ログを見る
docker-compose logs -f

# 特定のサービスのログを見る
docker-compose logs -f api
docker-compose logs -f web
```

### コンテナ内でコマンドを実行

```bash
# API コンテナ内で npm install を実行
docker-compose exec api npm install

# Web コンテナ内で npm install を実行
docker-compose exec web npm install

# API コンテナ内でシェルを開く
docker-compose exec api sh

# Web コンテナ内でシェルを開く
docker-compose exec web sh
```

### キャッシュをクリアして再ビルド

```bash
# 強制的に全て再ビルド
docker-compose up --build --force-recreate

# コンテナとボリュームを削除
docker-compose down -v

# その後、初めから起動
docker-compose up
```

## 開発時のホットリロード

### API サーバー

API サーバーは nodemon でファイル変更を監視しています。`apps/api` 配下のファイルを編集すると自動的に再起動します。

### Web サーバー

Next.js の Dev Service は HMR (Hot Module Reload) に対応しています。`apps/web` 配下のファイルを編集すると、ブラウザが自動的にリロードします。

## トラブルシューティング

### ポート競合エラー

別のアプリケーションがポート 3000 や 3001 を使用している場合：

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### コンテナがビルドできない

```bash
# イメージをクリアしてリビルド
docker-compose down
docker system prune -a
docker-compose up --build
```

### モジュールのインストール問題

ホストの `node_modules` とコンテナの `node_modules` が競合している場合：

```bash
# ホスト側の node_modules を削除
rm -rf apps/api/node_modules
rm -rf apps/web/node_modules

# コンテナ側をリビルド
docker-compose up --build
```

## 本番環境へのデプロイ

本番環境では、`docker-compose.yml` を修正するか、別の `docker-compose.prod.yml` を作成してください：

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## ネットワーク・アーキテクチャ

- **ymon-network**: API と Web がこのネットワークを通じて通信
- **postgres**: ローカル PostgreSQL (オプション、デフォルトは Supabase を使用)
- **ymon-api**: ポート 3001 で公開
- **ymon-web**: ポート 3000 で公開

## 参考リンク

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Node.js in Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
