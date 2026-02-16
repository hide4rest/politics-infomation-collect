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
  | "計画・政策"
  | "国の法令・制度"
  | "補助金・交付金"
  | "県の施策"
  | "議会議事録";

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
  /** 行政側の想定答弁 */
  expectedAnswer?: string;
  /** 想定答弁を踏まえた再質問 */
  followUp?: string;
}

/** 質問生成時のカテゴリフィルタ */
export type QuestionCategory =
  | "子育て・教育"
  | "まちづくり・都市計画"
  | "財政・行財政改革"
  | "福祉・医療"
  | "防災・安全"
  | "環境・エネルギー"
  | "産業・経済"
  | "行政運営・DX";

/** ヒアリング項目（行政側へ確認する事項） */
export interface HearingItem {
  /** ヒアリング対象分野 */
  topic: string;
  /** ヒアリング先の部署名 */
  department: string;
  /** ヒアリング質問一覧 */
  questions: string[];
  /** 背景・意図 */
  background: string;
  /** 関連記事URL */
  relatedArticles: string[];
}

/** ヒアリングシート（一回分のヒアリング項目集） */
export interface HearingSheet {
  /** 作成日時 */
  createdAt: string;
  /** ヒアリング項目一覧 */
  items: HearingItem[];
}

/** ヒアリング回答（ユーザーが入力する行政側の回答） */
export interface HearingResponse {
  /** 対応するヒアリング項目のトピック */
  topic: string;
  /** 各質問に対する回答 */
  answers: {
    question: string;
    answer: string;
  }[];
  /** 自由記述メモ */
  notes?: string;
}

/** ヒアリング回答シート */
export interface HearingResponseSheet {
  /** 作成日時 */
  createdAt: string;
  /** 回答一覧 */
  responses: HearingResponse[];
}

/** 記事マスターストア（過去3年間の蓄積データ） */
export interface ArticleStore {
  /** 最終更新日時 */
  lastUpdated: string;
  /** 蓄積記事一覧 */
  articles: CollectedArticle[];
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
