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

## 現在の画面遷移
- /: POST api/usersが成功したら/matchmakingへ
- /matchmaking:POST 
- /matches/[matchId]

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

## 更新履歴
2026-02-25 HMD-A join
