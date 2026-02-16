import fs from "fs";
import path from "path";
import type {
  CollectedArticle,
  GeneratedQuestion,
  ArticleStore,
  HearingSheet,
  HearingItem,
  HearingResponseSheet,
  HearingResponse,
} from "./types";

/** データの永続化を管理するモジュール */
export class Storage {
  private dataDir: string;
  private outputDir: string;

  /** マスター記事ストアのファイル名 */
  private static readonly MASTER_STORE_FILE = "master_articles.json";

  /** データ保持期間（3年 = 約1095日） */
  private static readonly RETENTION_DAYS = 365 * 3;

  constructor(dataDir: string, outputDir: string) {
    this.dataDir = dataDir;
    this.outputDir = outputDir;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  // ============================================================
  // 記事データ（マスターストア：3年間蓄積・重複削除）
  // ============================================================

  /** マスターストアを読み込む */
  loadMasterArticles(): ArticleStore | null {
    const filePath = path.join(this.dataDir, Storage.MASTER_STORE_FILE);
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as ArticleStore;
  }

  /**
   * 新規収集記事をマスターストアにマージして保存する
   * - URL重複を削除
   * - 3年以上前の記事を除去
   * - 個別のスナップショットも従来通り保存
   */
  mergeAndSaveArticles(newArticles: CollectedArticle[]): {
    masterPath: string;
    snapshotPath: string;
    totalCount: number;
    newCount: number;
    prunedCount: number;
  } {
    // 従来通りスナップショット保存
    const snapshotPath = this.saveArticles(newArticles);

    // マスターストアの読み込み
    const existing = this.loadMasterArticles();
    const existingArticles = existing?.articles ?? [];

    // 既存URLのセット
    const existingUrls = new Set(existingArticles.map((a) => a.url));

    // 新規記事のうち未登録のものだけ追加
    const genuinelyNew = newArticles.filter((a) => !existingUrls.has(a.url));

    // マージ
    const merged = [...existingArticles, ...genuinelyNew];

    // 3年以上前の記事を除去
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - Storage.RETENTION_DAYS);
    const cutoffISO = cutoffDate.toISOString();

    const pruned = merged.filter((a) => a.collectedAt >= cutoffISO);
    const prunedCount = merged.length - pruned.length;

    // マスターストアに保存
    const store: ArticleStore = {
      lastUpdated: new Date().toISOString(),
      articles: pruned,
    };
    const masterPath = path.join(this.dataDir, Storage.MASTER_STORE_FILE);
    fs.writeFileSync(masterPath, JSON.stringify(store, null, 2), "utf-8");
    console.log(`マスターストアを更新: ${masterPath}`);

    return {
      masterPath,
      snapshotPath,
      totalCount: pruned.length,
      newCount: genuinelyNew.length,
      prunedCount,
    };
  }

  /** マスターストアから全記事を取得（generateコマンド向け） */
  loadAllArticles(): CollectedArticle[] | null {
    // マスターストアがあればそちらを優先
    const master = this.loadMasterArticles();
    if (master && master.articles.length > 0) {
      return master.articles;
    }
    // フォールバック: 従来形式の最新スナップショット
    return this.loadLatestArticles();
  }

  /** 収集記事をJSONファイルに保存（スナップショット） */
  saveArticles(articles: CollectedArticle[]): string {
    const timestamp = this.getTimestamp();
    const filePath = path.join(this.dataDir, `articles_${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(articles, null, 2), "utf-8");
    console.log(`記事データを保存: ${filePath}`);
    return filePath;
  }

  /** 最新の収集記事を読み込む（従来互換） */
  loadLatestArticles(): CollectedArticle[] | null {
    const files = fs
      .readdirSync(this.dataDir)
      .filter((f) => f.startsWith("articles_") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const filePath = path.join(this.dataDir, files[0]);
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as CollectedArticle[];
  }

  // ============================================================
  // ヒアリング項目
  // ============================================================

  /** ヒアリングシートを保存 */
  saveHearingSheet(sheet: HearingSheet): { mdPath: string; jsonPath: string } {
    const timestamp = this.getTimestamp();

    // JSON保存
    const jsonPath = path.join(
      this.outputDir,
      `hearing_${timestamp}.json`
    );
    fs.writeFileSync(jsonPath, JSON.stringify(sheet, null, 2), "utf-8");

    // Markdown保存
    const mdPath = path.join(
      this.outputDir,
      `ヒアリング項目_${timestamp}.md`
    );
    const markdown = this.formatHearingSheetAsMarkdown(sheet);
    fs.writeFileSync(mdPath, markdown, "utf-8");

    console.log(`ヒアリングシートを保存: ${mdPath}`);
    return { mdPath, jsonPath };
  }

  /** 最新のヒアリングシートを読み込む */
  loadLatestHearingSheet(): HearingSheet | null {
    const files = fs
      .readdirSync(this.outputDir)
      .filter((f) => f.startsWith("hearing_") && f.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const filePath = path.join(this.outputDir, files[0]);
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as HearingSheet;
  }

  /** ヒアリングシートをMarkdown形式にフォーマット */
  private formatHearingSheetAsMarkdown(sheet: HearingSheet): string {
    const lines: string[] = [];

    lines.push("# 一般質問 ヒアリング項目");
    lines.push("");
    lines.push(`作成日: ${new Date().toLocaleDateString("ja-JP")}`);
    lines.push("");
    lines.push(
      "以下の項目について、各担当部署へヒアリングを行い、回答を記入してください。"
    );
    lines.push("");
    lines.push("---");
    lines.push("");

    for (let i = 0; i < sheet.items.length; i++) {
      const item = sheet.items[i];
      lines.push(`## ${i + 1}. ${item.topic}`);
      lines.push("");
      lines.push(`**ヒアリング先:** ${item.department}`);
      lines.push("");
      lines.push("### 背景・意図");
      lines.push("");
      lines.push(item.background);
      lines.push("");

      if (item.relatedArticles.length > 0) {
        lines.push("### 参考資料");
        lines.push("");
        for (const url of item.relatedArticles) {
          lines.push(`- ${url}`);
        }
        lines.push("");
      }

      lines.push("### ヒアリング質問");
      lines.push("");
      for (let j = 0; j < item.questions.length; j++) {
        lines.push(`${j + 1}. ${item.questions[j]}`);
        lines.push("");
        lines.push("   **回答:** ＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿");
        lines.push("");
      }

      lines.push("### メモ・補足");
      lines.push("");
      lines.push("＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿＿");
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  // ============================================================
  // ヒアリング回答
  // ============================================================

  /** ヒアリング回答テンプレートを生成・保存 */
  saveHearingResponseTemplate(sheet: HearingSheet): string {
    const timestamp = this.getTimestamp();
    const filePath = path.join(
      this.dataDir,
      `hearing_responses_${timestamp}.json`
    );

    const responseSheet: HearingResponseSheet = {
      createdAt: new Date().toISOString(),
      responses: sheet.items.map((item) => ({
        topic: item.topic,
        answers: item.questions.map((q) => ({
          question: q,
          answer: "",
        })),
        notes: "",
      })),
    };

    fs.writeFileSync(
      filePath,
      JSON.stringify(responseSheet, null, 2),
      "utf-8"
    );
    console.log(`ヒアリング回答テンプレートを保存: ${filePath}`);
    return filePath;
  }

  /** ヒアリング回答を読み込む */
  loadHearingResponses(filePath?: string): HearingResponseSheet | null {
    if (filePath) {
      if (!fs.existsSync(filePath)) return null;
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as HearingResponseSheet;
    }

    // 最新の回答ファイルを探す
    const files = fs
      .readdirSync(this.dataDir)
      .filter(
        (f) => f.startsWith("hearing_responses_") && f.endsWith(".json")
      )
      .sort()
      .reverse();

    if (files.length === 0) return null;

    const fp = path.join(this.dataDir, files[0]);
    const data = fs.readFileSync(fp, "utf-8");
    return JSON.parse(data) as HearingResponseSheet;
  }

  // ============================================================
  // 一般質問出力（既存機能）
  // ============================================================

  /** 生成した質問をMarkdown形式で保存 */
  saveQuestionsAsMarkdown(questions: GeneratedQuestion[]): string {
    const timestamp = this.getTimestamp();
    const filePath = path.join(
      this.outputDir,
      `一般質問_${timestamp}.md`
    );
    const markdown = this.formatQuestionsAsMarkdown(questions);
    fs.writeFileSync(filePath, markdown, "utf-8");
    console.log(`質問を保存: ${filePath}`);
    return filePath;
  }

  /** 質問をMarkdown形式にフォーマット */
  private formatQuestionsAsMarkdown(questions: GeneratedQuestion[]): string {
    const lines: string[] = [];

    lines.push("# 海老名市議会 一般質問（案）");
    lines.push("");
    lines.push(`作成日: ${new Date().toLocaleDateString("ja-JP")}`);
    lines.push("");
    lines.push("---");
    lines.push("");

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      lines.push(`## ${i + 1}. ${q.mainTopic}`);
      lines.push("");
      lines.push("### 背景・根拠");
      lines.push("");
      lines.push(q.background);
      lines.push("");

      if (q.relatedArticles.length > 0) {
        lines.push("### 参考資料");
        lines.push("");
        for (const url of q.relatedArticles) {
          lines.push(`- ${url}`);
        }
        lines.push("");
      }

      lines.push("### 質問項目");
      lines.push("");

      for (let j = 0; j < q.subTopics.length; j++) {
        const sub = q.subTopics[j];
        lines.push(`#### （${j + 1}）${sub.title}`);
        lines.push("");
        lines.push("**質問内容：**");
        lines.push("");
        lines.push(`> ${sub.detailedQuestion}`);
        lines.push("");

        if (sub.expectedAnswer) {
          lines.push("**想定答弁：**");
          lines.push("");
          lines.push(`> ${sub.expectedAnswer}`);
          lines.push("");
        }

        if (sub.followUp) {
          lines.push("**再質問（想定答弁を踏まえて）：**");
          lines.push("");
          lines.push(`> ${sub.followUp}`);
          lines.push("");
        }
      }

      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

  /** 生成した質問をJSONでも保存 */
  saveQuestionsAsJson(questions: GeneratedQuestion[]): string {
    const timestamp = this.getTimestamp();
    const filePath = path.join(
      this.outputDir,
      `questions_${timestamp}.json`
    );
    fs.writeFileSync(filePath, JSON.stringify(questions, null, 2), "utf-8");
    return filePath;
  }

  private getTimestamp(): string {
    const now = new Date();
    return now
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);
  }
}
