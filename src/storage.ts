import fs from "fs";
import path from "path";
import type { CollectedArticle, GeneratedQuestion } from "./types";

/** データの永続化を管理するモジュール */
export class Storage {
  private dataDir: string;
  private outputDir: string;

  constructor(dataDir: string, outputDir: string) {
    this.dataDir = dataDir;
    this.outputDir = outputDir;
    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  /** 収集記事をJSONファイルに保存 */
  saveArticles(articles: CollectedArticle[]): string {
    const timestamp = this.getTimestamp();
    const filePath = path.join(this.dataDir, `articles_${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(articles, null, 2), "utf-8");
    console.log(`記事データを保存: ${filePath}`);
    return filePath;
  }

  /** 最新の収集記事を読み込む */
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
