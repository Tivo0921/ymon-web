# YNU Monsters (MVP)

## 概要

シンプルな3v3バトルゲムです。マッチメイキング機能を搭載しています。

## 技術スタック

- Next.js (App Router)
- Express
- Supabase (Postgres)

## 現在の機能

- ユーザーの作成・取得（ハンドル名ベース）
- マッチメイキング（べき等、競合状態対応）
- 3v3バトルシミュレーション
- バトル結果のDB保存

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

## 更新履歴
2026-02-25 HMD-A join
