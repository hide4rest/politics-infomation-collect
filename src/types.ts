/** 収集した行政情報の型定義 */
export interface CollectedArticle {
  /** 記事タイトル */
  title: string;
  /** 記事URL */
  url: string;
  /** 記事の概要・本文 */
  content: string;
  /** カテゴリ */
  category: ArticleCategory;
  /** 収集日時 */
  collectedAt: string;
  /** 公開日（取得できた場合） */
  publishedAt?: string;
}

export type ArticleCategory =
  | "新着情報"
  | "プレスリリース"
  | "財政・予算"
  | "施政方針"
  | "市議会"
  | "パブリックコメント"
  | "計画・政策";

/** スクレイピング対象の定義 */
export interface ScrapeTarget {
  /** 対象名 */
  name: string;
  /** URL */
  url: string;
  /** カテゴリ */
  category: ArticleCategory;
  /** リンク抽出のCSSセレクタ */
  linkSelector: string;
  /** コンテンツ領域のCSSセレクタ */
  contentSelector: string;
}

/** 生成された一般質問 */
export interface GeneratedQuestion {
  /** 質問の大項目 */
  mainTopic: string;
  /** 質問の小項目一覧 */
  subTopics: SubTopic[];
  /** 質問の背景・根拠 */
  background: string;
  /** 関連する収集記事 */
  relatedArticles: string[];
}

export interface SubTopic {
  /** 小項目タイトル */
  title: string;
  /** 詳細な質問内容 */
  detailedQuestion: string;
  /** 想定される答弁への再質問 */
  followUp?: string;
}

/** アプリケーション設定 */
export interface AppConfig {
  /** Anthropic API Key */
  anthropicApiKey: string;
  /** 出力ディレクトリ */
  outputDir: string;
  /** データ保存ディレクトリ */
  dataDir: string;
  /** スクレイピング間隔（cron式） */
  cronSchedule: string;
  /** 最大収集記事数 */
  maxArticles: number;
}
