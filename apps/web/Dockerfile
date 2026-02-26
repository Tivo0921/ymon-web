# マルチステージビルド - Web サーバー (Next.js)
# Stage 1: ビルドステージ
FROM node:20-alpine AS builder

WORKDIR /app

# package.json と package-lock.json をコピー
COPY package*.json ./

# 依存関係をインストール
RUN npm ci

# アプリケーションコードをコピー
COPY . .

# Next.js をビルド
RUN npm run build

# Stage 2: 実行環境
FROM node:20-alpine

WORKDIR /app

# Node 環境設定
ENV NODE_ENV=production

# builder ステージから必要なファイルをコピー
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# ポート 3000 を公開
EXPOSE 3000

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)}).on('error', () => process.exit(1))" || exit 1

# Next.js サーバー起動
CMD ["npm", "start"]
