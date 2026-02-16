import { CronJob } from "cron";
import { EbinaScraper } from "./scraper";
import { QuestionGenerator } from "./question-generator";
import { Storage } from "./storage";
import type { AppConfig } from "./types";

/** 定期実行スケジューラ */
export class Scheduler {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  /** cron スケジュールで定期実行を開始 */
  start(): void {
    console.log(
      `[スケジューラ] 定期収集を開始します（スケジュール: ${this.config.cronSchedule}）`
    );
    console.log("[スケジューラ] Ctrl+C で停止できます。\n");

    const job = new CronJob(
      this.config.cronSchedule,
      async () => {
        console.log(
          `\n[スケジューラ] 実行開始: ${new Date().toLocaleString("ja-JP")}`
        );
        try {
          await this.runCycle();
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`[スケジューラ] エラー: ${msg}`);
        }
      },
      null,
      true,
      "Asia/Tokyo"
    );

    job.start();
    console.log(
      `[スケジューラ] 次回実行予定: ${job.nextDate().toISO()}`
    );
  }

  /** 1サイクルの収集・生成を実行 */
  async runCycle(): Promise<void> {
    const scraper = new EbinaScraper(this.config.maxArticles);
    const storage = new Storage(this.config.dataDir, this.config.outputDir);

    // 情報収集（全ソース：海老名市 + 国 + 県 + 議事録）
    const articles = await scraper.collectAllSources();
    storage.saveArticles(articles);

    // 質問生成（APIキーがある場合のみ）
    if (this.config.anthropicApiKey) {
      const generator = new QuestionGenerator(this.config.anthropicApiKey);
      const questions = await generator.generateQuestions(articles);
      storage.saveQuestionsAsMarkdown(questions);
      storage.saveQuestionsAsJson(questions);
    } else {
      console.log(
        "[スケジューラ] ANTHROPIC_API_KEY 未設定のため質問生成をスキップしました。"
      );
    }

    console.log("[スケジューラ] サイクル完了\n");
  }
}
