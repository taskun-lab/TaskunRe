# ムキムキタスくん３ セットアップガイド

## 構成
- フロントエンド: main/ → GitHub Pages
- バックエンド: supabase/functions/ → Supabase Edge Functions
- DB: Supabase (新規プロジェクト)
- 決済: Stripe

---

## 手順1: Supabaseプロジェクト作成

1. https://supabase.com でNew Projectを作成
2. Project URLとanon keyをメモ
3. SQL Editorで `supabase/migrations/001_initial_schema.sql` を実行

---

## 手順2: 環境変数の設定

Supabase Dashboard > Project Settings > Edge Functions > Secrets で以下を設定:

| キー | 値 |
|------|-----|
| STRIPE_SECRET_KEY | sk_test_... または sk_live_... |
| STRIPE_WEBHOOK_SECRET | whsec_... |
| STRIPE_PRICE_PLUS3 | price_... |
| STRIPE_PRICE_PLUS6 | price_... |
| STRIPE_PRICE_MAX | price_... |
| LINE_CHANNEL_ACCESS_TOKEN | ... |
| APP_URL | https://<GitHubユーザー名>.github.io/<リポジトリ名> |

---

## 手順3: Edge Functionsデプロイ

```bash
# Supabase CLIインストール（未インストールの場合）
npm install -g supabase

# ログイン
supabase login

# プロジェクトリンク
supabase link --project-ref <your-project-ref>

# 全関数デプロイ
supabase functions deploy me
supabase functions deploy tasks
supabase functions deploy habits
supabase functions deploy journals
supabase functions deploy msc
supabase functions deploy missions
supabase functions deploy plans
supabase functions deploy billing
supabase functions deploy stripe-webhook
supabase functions deploy app-config
supabase functions deploy line-bot
```

---

## 手順4: フロントエンドの設定

`main/js/config.js` を開いて以下を差し替え:

```js
const SUPABASE_URL = "https://<your-project-ref>.supabase.co"; // ← 実際のURL
const SUPABASE_ANON_KEY = "<your-anon-key>";                   // ← 実際のキー

const LIFF_ID = ENV === 'DEV'
    ? "<DEV_LIFF_ID>"   // ← LINE Developers Console で作成
    : "<PROD_LIFF_ID>"; // ← LINE Developers Console で作成
```

---

## 手順5: LINE Developers設定

1. LINE Developers Console でLIFF appを2つ作成（DEV/PROD）
2. エンドポイントURL:
   - PROD: `https://<GitHubユーザー名>.github.io/<リポジトリ名>/main/`
   - DEV: `https://<ngrokのURL>/`
3. LINE BotのWebhook URL: `https://<project-ref>.supabase.co/functions/v1/line-bot`

---

## 手順6: Stripeの設定

1. Webhook endpoint追加:
   URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
   イベント: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
2. Webhook signing secretをSUPABASE_SECRETSに設定

---

## 手順7: GitHub Pagesデプロイ

```bash
cd ムキムキタスくん３
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<username>/<repo>.git
git push -u origin main
```

GitHub > Settings > Pages > Source: Deploy from branch > main > /main フォルダを指定

---

## ファイル構成

```
ムキムキタスくん３/
├── main/                     ← フロントエンド（GitHub Pages）
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── config.js         ← ★ SUPABASE_URL等を設定
│       ├── app.js
│       ├── api.js
│       ├── task.js
│       ├── habit.js
│       ├── journal.js
│       ├── msc.js
│       ├── modal.js
│       ├── developer.js
│       └── swipe.js
├── plans-page/               ← プラン説明ページ（別リポジトリ推奨）
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql  ← ★ Supabase SQL Editorで実行
│   └── functions/            ← Edge Functions（supabase functions deployで一括デプロイ）
│       ├── _shared/cors.ts
│       ├── me/
│       ├── tasks/
│       ├── habits/
│       ├── journals/
│       ├── msc/
│       ├── missions/
│       ├── plans/
│       ├── billing/
│       ├── stripe-webhook/
│       ├── app-config/
│       └── line-bot/
└── SETUP.md                  ← このファイル
```
