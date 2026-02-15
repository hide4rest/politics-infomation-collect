# 海老名市議会 一般質問生成ツール

神奈川県海老名市の公式サイトから行政情報を自動収集し、市議会定例会での一般質問の項目と詳細な質問内容を生成するCLIアプリケーションです。

## 機能

- **行政情報の自動収集**: 海老名市公式サイトから新着情報、財政情報、施政方針、市議会情報等をスクレイピング
- **一般質問の自動生成**: Claude APIを活用し、収集情報に基づいた具体的な一般質問を生成
- **定期実行**: cronスケジュールによる自動収集・生成
- **Markdown出力**: 議会質問として使いやすいMarkdown形式で出力

## 収集対象

| カテゴリ | 収集元 |
|---------|-------|
| 新着情報 | 海老名市公式サイト 新着更新情報 |
| 財政・予算 | 財政情報・予算状況ページ |
| 施政方針 | 市長施政方針ページ |
| 計画・政策 | 総合計画・政策ページ |
| 市議会 | 議会事務局ページ |

## セットアップ

```bash
# 依存パッケージのインストール
npm install

# 環境変数の設定
cp .env.example .env
# .env ファイルを編集して ANTHROPIC_API_KEY を設定

# ビルド
npm run build
```

## 使い方

### 行政情報の収集のみ

```bash
npm run collect
# または
node dist/index.js collect
```

### 一般質問の生成（収集済みデータから）

```bash
npm run generate
# または
node dist/index.js generate
```

### 収集から質問生成まで一括実行

```bash
node dist/index.js run
```

### 定期実行（デフォルト：毎朝8時）

```bash
npm run schedule
# または
node dist/index.js schedule
```

## 出力例

`output/` ディレクトリに以下のファイルが生成されます：

- `一般質問_YYYY-MM-DD_HH-MM-SS.md` — Markdown形式の質問案
- `questions_YYYY-MM-DD_HH-MM-SS.json` — JSON形式の質問データ

### 出力サンプル（Markdown）

```markdown
# 海老名市議会 一般質問（案）

## 1. 令和7年度予算における子育て支援施策について

### 背景・根拠
海老名市の令和7年度一般会計予算において...

### 質問項目

#### （1）保育施設の整備計画について

**質問内容：**
> 令和7年度予算における保育施設整備費の具体的な配分と、
> 待機児童解消に向けた目標数値をお聞かせください。
```

## 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|--------|------|-----------|------|
| `ANTHROPIC_API_KEY` | ○ | - | Anthropic APIキー |
| `OUTPUT_DIR` | - | `./output` | 出力ディレクトリ |
| `DATA_DIR` | - | `./data` | データ保存ディレクトリ |
| `CRON_SCHEDULE` | - | `0 8 * * *` | 定期実行スケジュール |
| `MAX_ARTICLES` | - | `50` | 最大収集記事数 |

## 技術スタック

- **TypeScript** / Node.js
- **Cheerio** — HTMLパース・スクレイピング
- **Axios** — HTTP通信
- **@anthropic-ai/sdk** — Claude API連携
- **Commander** — CLIフレームワーク
- **Cron** — 定期実行スケジューラ
