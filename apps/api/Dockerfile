# マルチステージビルド - API サーバー
# Stage 1: 依存関係とビルド
FROM node:20-alpine AS builder

WORKDIR /app

# package.json と package-lock.json をコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm ci --only=production

# Stage 2: 実行環境
FROM node:20-alpine

WORKDIR /app

# builder ステージから node_modules をコピー
COPY --from=builder /app/node_modules ./node_modules

# アプリケーションコードをコピー
COPY . .

# ポート 3001 を公開
EXPOSE 3001

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# アプリケーション起動
CMD ["node", "index.js"]
