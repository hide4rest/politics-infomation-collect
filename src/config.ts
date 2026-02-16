import path from "path";
import type { AppConfig, QuestionCategory, ScrapeTarget } from "./types";

/** デフォルト設定 */
export function loadConfig(): AppConfig {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY ?? "";
  if (!anthropicApiKey) {
    console.warn(
      "警告: ANTHROPIC_API_KEY が設定されていません。質問生成機能が利用できません。"
    );
    console.warn(
      "  .env ファイルに ANTHROPIC_API_KEY=sk-... を設定するか、環境変数として export してください。"
    );
  }

  return {
    anthropicApiKey,
    outputDir: process.env.OUTPUT_DIR ?? path.resolve(process.cwd(), "output"),
    dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), "data"),
    cronSchedule: process.env.CRON_SCHEDULE ?? "0 8 */14 * *", // 2週間に1度（8時）
    maxArticles: Number(process.env.MAX_ARTICLES) || 200,
  };
}

/** 海老名市公式サイトのベースURL */
export const EBINA_BASE_URL = "https://www.city.ebina.kanagawa.jp";

/** スクレイピング対象一覧 */
export const SCRAPE_TARGETS: ScrapeTarget[] = [
  {
    name: "新着更新情報",
    url: `${EBINA_BASE_URL}/newslist.html`,
    category: "新着情報",
    linkSelector: ".block-list a, .news-list a, .mod-list a, ul.list-news a, .p-newslist a, a[href*='/']",
    contentSelector: "#content, .main-content, #main, main, article, .mod-body",
  },
  {
    name: "財政情報",
    url: `${EBINA_BASE_URL}/shisei/zaisei/zaisei/index.html`,
    category: "財政・予算",
    linkSelector: ".block-list a, .mod-list a, a[href*='zaisei']",
    contentSelector: "#content, .main-content, #main, main, article, .mod-body",
  },
  {
    name: "予算状況",
    url: `${EBINA_BASE_URL}/shisei/zaisei/zaisei/1003917.html`,
    category: "財政・予算",
    linkSelector: ".block-list a, .mod-list a, a[href*='.pdf'], a[href*='zaisei']",
    contentSelector: "#content, .main-content, #main, main, article, .mod-body",
  },
  {
    name: "施政方針",
    url: `${EBINA_BASE_URL}/mayor/shoshin/1017655.html`,
    category: "施政方針",
    linkSelector: ".block-list a, .mod-list a",
    contentSelector: "#content, .main-content, #main, main, article, .mod-body",
  },
  {
    name: "計画・政策",
    url: `${EBINA_BASE_URL}/shisei/seisaku/sougou/1010554.html`,
    category: "計画・政策",
    linkSelector: ".block-list a, .mod-list a, a[href*='seisaku']",
    contentSelector: "#content, .main-content, #main, main, article, .mod-body",
  },
  {
    name: "市議会情報",
    url: `${EBINA_BASE_URL}/shisei/soshiki/soshiki/gikai/index.html`,
    category: "市議会",
    linkSelector: ".block-list a, .mod-list a, a[href*='gikai']",
    contentSelector: "#content, .main-content, #main, main, article, .mod-body",
  },
];

/** 国の行政情報スクレイピング対象 */
export const NATIONAL_SCRAPE_TARGETS: ScrapeTarget[] = [
  {
    name: "総務省 報道資料（地方行財政）",
    url: "https://www.soumu.go.jp/menu_news/s-news/index.html",
    category: "国の法令・制度",
    linkSelector: ".menu-news a, .news-list a, ul li a[href*='s-news'], #content a",
    contentSelector: "#content, .main-content, #main, main, article",
  },
  {
    name: "総務省 地方財政制度",
    url: "https://www.soumu.go.jp/iken/zaisei.html",
    category: "補助金・交付金",
    linkSelector: "#content a, .main-content a, a[href*='zaisei']",
    contentSelector: "#content, .main-content, #main, main, article",
  },
  {
    name: "こども家庭庁 報道発表",
    url: "https://www.cfa.go.jp/top/pressrelease",
    category: "国の法令・制度",
    linkSelector: "a[href*='pressrelease'], a[href*='policies'], .news-list a, main a",
    contentSelector: "main, #content, .main-content, article",
  },
  {
    name: "デジタル庁 新着情報",
    url: "https://www.digital.go.jp/news",
    category: "国の法令・制度",
    linkSelector: "a[href*='news'], a[href*='policies'], main a",
    contentSelector: "main, #content, .main-content, article",
  },
  {
    name: "地方創生（内閣府）",
    url: "https://www.chisou.go.jp/sousei/about/index.html",
    category: "補助金・交付金",
    linkSelector: "#content a, main a, a[href*='sousei']",
    contentSelector: "#content, .main-content, #main, main, article",
  },
];

/** 神奈川県の行政情報スクレイピング対象 */
export const PREFECTURAL_SCRAPE_TARGETS: ScrapeTarget[] = [
  {
    name: "神奈川県 記者発表資料",
    url: "https://www.pref.kanagawa.jp/osirase/list-1.html",
    category: "県の施策",
    linkSelector: ".news-list a, .mod-list a, #content a, main a",
    contentSelector: "#content, .main-content, #main, main, article",
  },
  {
    name: "神奈川県 補助金・助成金",
    url: "https://www.pref.kanagawa.jp/docs/r5k/cnt/f7565/index.html",
    category: "補助金・交付金",
    linkSelector: "#content a, .main-content a, main a, a[href*='docs']",
    contentSelector: "#content, .main-content, #main, main, article",
  },
  {
    name: "神奈川県 市町村向け情報",
    url: "https://www.pref.kanagawa.jp/docs/s3f/index.html",
    category: "県の施策",
    linkSelector: "#content a, .main-content a, main a",
    contentSelector: "#content, .main-content, #main, main, article",
  },
];

/** 市議会 議事録・会議録スクレイピング対象 */
export const MINUTES_SCRAPE_TARGETS: ScrapeTarget[] = [
  {
    name: "海老名市議会 会議録・議事録",
    url: `${EBINA_BASE_URL}/shisei/soshiki/soshiki/gikai/index.html`,
    category: "議会議事録",
    linkSelector: "a[href*='kaigi'], a[href*='giji'], a[href*='teirei'], a[href*='rinjikai'], a[href*='iinkai'], .block-list a, .mod-list a",
    contentSelector: "#content, .main-content, #main, main, article, .mod-body",
  },
  {
    name: "海老名市議会 定例会・臨時会",
    url: `${EBINA_BASE_URL}/shisei/soshiki/soshiki/gikai/index.html`,
    category: "議会議事録",
    linkSelector: "a[href*='teireikai'], a[href*='honkaigi'], a[href*='ippan'], .block-list a, .mod-list a",
    contentSelector: "#content, .main-content, #main, main, article, .mod-body",
  },
];

/** 全スクレイピング対象をまとめる */
export const ALL_SCRAPE_TARGETS: ScrapeTarget[] = [
  ...SCRAPE_TARGETS,
  ...NATIONAL_SCRAPE_TARGETS,
  ...PREFECTURAL_SCRAPE_TARGETS,
  ...MINUTES_SCRAPE_TARGETS,
];

/** 質問カテゴリ一覧 */
export const QUESTION_CATEGORIES: QuestionCategory[] = [
  "子育て・教育",
  "まちづくり・都市計画",
  "財政・行財政改革",
  "福祉・医療",
  "防災・安全",
  "環境・エネルギー",
  "産業・経済",
  "行政運営・DX",
];
