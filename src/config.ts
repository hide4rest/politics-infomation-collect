import path from "path";
import type { AppConfig, ScrapeTarget } from "./types";

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
    cronSchedule: process.env.CRON_SCHEDULE ?? "0 8 * * *", // 毎朝8時
    maxArticles: Number(process.env.MAX_ARTICLES) || 50,
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
