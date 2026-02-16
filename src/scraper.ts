import axios, { type AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { SCRAPE_TARGETS, ALL_SCRAPE_TARGETS } from "./config";
import type { CollectedArticle, ScrapeTarget } from "./types";

/** 行政サイトからの情報収集モジュール */
export class EbinaScraper {
  private client: AxiosInstance;
  private maxArticles: number;

  constructor(maxArticles: number = 50) {
    this.maxArticles = maxArticles;
    this.client = axios.create({
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
      },
    });
  }

  /** 海老名市の情報のみ収集（従来互換） */
  async collectAll(): Promise<CollectedArticle[]> {
    return this.collectFromTargets(SCRAPE_TARGETS);
  }

  /** 全ソース（国・県・議事録含む）から情報を収集 */
  async collectAllSources(): Promise<CollectedArticle[]> {
    return this.collectFromTargets(ALL_SCRAPE_TARGETS);
  }

  /** 指定されたターゲットから情報を収集 */
  async collectFromTargets(targets: ScrapeTarget[]): Promise<CollectedArticle[]> {
    const allArticles: CollectedArticle[] = [];

    for (const target of targets) {
      console.log(`[収集中] ${target.name}: ${target.url}`);
      try {
        const articles = await this.scrapeTarget(target);
        allArticles.push(...articles);
        console.log(`  -> ${articles.length} 件の情報を取得`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`  -> エラー: ${msg}`);
      }
      // サーバー負荷軽減のため待機
      await this.sleep(2000);
    }

    // 重複除去
    const unique = this.deduplicateArticles(allArticles);
    console.log(
      `\n合計: ${unique.length} 件の情報を収集（重複除去後）`
    );
    return unique.slice(0, this.maxArticles);
  }

  /** 個別ページのスクレイピング */
  private async scrapeTarget(target: ScrapeTarget): Promise<CollectedArticle[]> {
    const articles: CollectedArticle[] = [];

    // まずリストページ自体のコンテンツを取得
    const pageContent = await this.fetchPageContent(target.url, target.contentSelector);
    if (pageContent) {
      articles.push({
        title: target.name,
        url: target.url,
        content: pageContent,
        category: target.category,
        collectedAt: new Date().toISOString(),
      });
    }

    // リンクを抽出して個別ページも巡回
    const allowedDomain = this.extractOrigin(target.url);
    const links = await this.extractLinks(target.url, target.linkSelector, allowedDomain);
    const targetLinks = links.slice(0, 10); // 各カテゴリ最大10リンク

    for (const link of targetLinks) {
      try {
        // PDF リンクはスキップ
        if (link.url.endsWith(".pdf")) {
          articles.push({
            title: link.title || "PDF文書",
            url: link.url,
            content: `[PDF文書] ${link.title}`,
            category: target.category,
            collectedAt: new Date().toISOString(),
          });
          continue;
        }

        const content = await this.fetchPageContent(
          link.url,
          target.contentSelector
        );
        if (content) {
          articles.push({
            title: link.title || "無題",
            url: link.url,
            content,
            category: target.category,
            collectedAt: new Date().toISOString(),
          });
        }
        await this.sleep(1500);
      } catch {
        // 個別ページのエラーはスキップ
      }
    }

    return articles;
  }

  /** ページのメインコンテンツを取得 */
  private async fetchPageContent(
    url: string,
    contentSelector: string
  ): Promise<string | null> {
    try {
      const response = await this.client.get(url);
      const $ = cheerio.load(response.data);

      // 不要な要素を除去
      $("script, style, nav, header, footer, .breadcrumb, .pagetop").remove();

      // コンテンツセレクタの候補を順に試す
      const selectors = contentSelector.split(",").map((s) => s.trim());
      for (const selector of selectors) {
        const el = $(selector);
        if (el.length > 0) {
          const text = el.text().replace(/\s+/g, " ").trim();
          if (text.length > 50) {
            return text.slice(0, 5000); // 最大5000文字
          }
        }
      }

      // フォールバック: bodyのテキスト
      const bodyText = $("body").text().replace(/\s+/g, " ").trim();
      return bodyText.length > 50 ? bodyText.slice(0, 5000) : null;
    } catch {
      return null;
    }
  }

  /** ページからリンクを抽出 */
  private async extractLinks(
    url: string,
    linkSelector: string,
    allowedDomain: string
  ): Promise<Array<{ title: string; url: string }>> {
    try {
      const response = await this.client.get(url);
      const $ = cheerio.load(response.data);
      const links: Array<{ title: string; url: string }> = [];
      const seen = new Set<string>();

      const selectors = linkSelector.split(",").map((s) => s.trim());
      for (const selector of selectors) {
        $(selector).each((_, el) => {
          const href = $(el).attr("href");
          const title = $(el).text().trim();
          if (!href || !title || title.length < 3) return;

          const absoluteUrl = this.resolveUrl(href, url);
          if (!absoluteUrl) return;
          if (!absoluteUrl.startsWith(allowedDomain)) return;
          if (seen.has(absoluteUrl)) return;

          seen.add(absoluteUrl);
          links.push({ title, url: absoluteUrl });
        });
      }

      return links;
    } catch {
      return [];
    }
  }

  /** URLからオリジン（ドメイン部分）を抽出 */
  private extractOrigin(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  }

  /** 相対URLを絶対URLに変換 */
  private resolveUrl(href: string, baseUrl: string): string | null {
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return null;
    }
  }

  /** 記事の重複を除去 */
  private deduplicateArticles(articles: CollectedArticle[]): CollectedArticle[] {
    const seen = new Set<string>();
    return articles.filter((a) => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
