#!/usr/bin/env node

import { Command } from "commander";
import readline from "readline";
import { loadConfig, QUESTION_CATEGORIES } from "./config";
import { EbinaScraper } from "./scraper";
import { QuestionGenerator } from "./question-generator";
import { HearingGenerator } from "./hearing-generator";
import { Storage } from "./storage";
import { Scheduler } from "./scheduler";
import type { QuestionCategory } from "./types";

// .env ファイルがあれば読み込む（dotenvなしで簡易実装）
import fs from "fs";
import path from "path";

function loadEnvFile(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

/** カテゴリ選択のインタラクティブメニュー */
async function promptCategorySelection(): Promise<QuestionCategory | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log("\n質問のカテゴリを選択してください：\n");
    console.log("  0. すべてのカテゴリ（フィルタなし）");
    QUESTION_CATEGORIES.forEach((cat, i) => {
      console.log(`  ${i + 1}. ${cat}`);
    });
    console.log("");

    rl.question("番号を入力してください [0]: ", (answer) => {
      rl.close();
      const num = parseInt(answer.trim(), 10);
      if (num >= 1 && num <= QUESTION_CATEGORIES.length) {
        const selected = QUESTION_CATEGORIES[num - 1];
        console.log(`\n→「${selected}」を選択しました\n`);
        resolve(selected);
      } else {
        console.log("\n→ すべてのカテゴリで質問を生成します\n");
        resolve(null);
      }
    });
  });
}

loadEnvFile();

const program = new Command();

program
  .name("ebina-council")
  .description(
    "海老名市行政情報収集・議会一般質問生成ツール\n" +
      "神奈川県海老名市の公式サイト、国・県の行政情報、議会議事録から情報を収集し、\n" +
      "市議会での一般質問の項目と詳細な質問内容（想定答弁付き）を自動生成します。\n\n" +
      "【ワークフロー】\n" +
      "  1. collect  → 行政情報を収集（3年間蓄積・重複削除）\n" +
      "  2. hearing  → ヒアリング項目を生成\n" +
      "  3. （行政側へヒアリング実施、回答JSONを編集）\n" +
      "  4. refine   → ヒアリング回答を踏まえて一般質問を生成"
  )
  .version("3.0.0");

/** collect コマンド: 行政情報の収集（3年間蓄積） */
program
  .command("collect")
  .description("行政情報を収集し、マスターストアに蓄積する（3年間保持・重複削除）")
  .option("--local-only", "海老名市の情報のみ収集する（国・県・議事録をスキップ）")
  .action(async (options: { localOnly?: boolean }) => {
    const config = loadConfig();
    const scraper = new EbinaScraper(config.maxArticles);
    const storage = new Storage(config.dataDir, config.outputDir);

    console.log("=== 行政情報収集 ===\n");

    let articles;
    if (options.localOnly) {
      console.log("[モード] 海老名市の情報のみ収集\n");
      articles = await scraper.collectAll();
    } else {
      console.log("[モード] 全ソース収集（海老名市 + 国 + 県 + 議事録）\n");
      articles = await scraper.collectAllSources();
    }

    // マスターストアにマージ
    const result = storage.mergeAndSaveArticles(articles);

    // カテゴリ別の集計を表示
    const categoryCounts = new Map<string, number>();
    for (const a of articles) {
      categoryCounts.set(a.category, (categoryCounts.get(a.category) ?? 0) + 1);
    }
    console.log("\n--- 今回の収集結果 ---");
    for (const [cat, count] of categoryCounts) {
      console.log(`  ${cat}: ${count} 件`);
    }

    console.log(`\n--- マスターストア ---`);
    console.log(`  新規追加: ${result.newCount} 件`);
    console.log(`  期限切れ削除: ${result.prunedCount} 件`);
    console.log(`  合計蓄積: ${result.totalCount} 件`);
    console.log(`\n保存先: ${result.masterPath}`);
  });

/** hearing コマンド: ヒアリング項目の生成 */
program
  .command("hearing")
  .description("蓄積データからヒアリング項目を生成する（行政側への事前確認用）")
  .option("-f, --file <path>", "使用する記事データファイル（未指定でマスターストアを使用）")
  .option("-c, --category <category>", "カテゴリを指定（対話メニューをスキップ）")
  .option("--all", "全カテゴリで生成（対話メニューをスキップ）")
  .action(async (options: { file?: string; category?: string; all?: boolean }) => {
    const config = loadConfig();

    if (!config.anthropicApiKey) {
      console.error(
        "エラー: ANTHROPIC_API_KEY が設定されていません。\n" +
          ".env ファイルまたは環境変数で設定してください。"
      );
      process.exit(1);
    }

    const storage = new Storage(config.dataDir, config.outputDir);

    // 記事データの読み込み
    let articles;
    if (options.file) {
      const data = fs.readFileSync(options.file, "utf-8");
      articles = JSON.parse(data);
    } else {
      articles = storage.loadAllArticles();
    }

    if (!articles || articles.length === 0) {
      console.error(
        "エラー: 記事データがありません。先に collect コマンドを実行してください。"
      );
      process.exit(1);
    }

    // カテゴリ選択
    let category: QuestionCategory | null = null;
    if (options.category) {
      category = options.category as QuestionCategory;
    } else if (!options.all) {
      category = await promptCategorySelection();
    }

    console.log("=== ヒアリング項目生成 ===\n");
    console.log(`対象記事数: ${articles.length} 件（蓄積データ）`);
    if (category) {
      console.log(`カテゴリ: ${category}`);
    }
    console.log("");

    const generator = new HearingGenerator(config.anthropicApiKey);
    const sheet = await generator.generateHearingItems(articles, { category });

    const { mdPath, jsonPath } = storage.saveHearingSheet(sheet);

    // 回答テンプレートも生成
    const templatePath = storage.saveHearingResponseTemplate(sheet);

    console.log(`\nヒアリング項目生成完了: ${sheet.items.length} 項目`);
    console.log(`ヒアリングシート: ${mdPath}`);
    console.log(`回答テンプレート: ${templatePath}`);

    // 概要表示
    console.log("\n--- 生成されたヒアリング項目 ---\n");
    for (let i = 0; i < sheet.items.length; i++) {
      const item = sheet.items[i];
      console.log(`${i + 1}. ${item.topic}`);
      console.log(`   担当部署: ${item.department}`);
      for (const q of item.questions) {
        console.log(`   - ${q}`);
      }
      console.log("");
    }

    console.log("--- 次のステップ ---");
    console.log(`1. ヒアリングシート（${mdPath}）を参考に行政側へヒアリングを実施`);
    console.log(`2. 回答テンプレート（${templatePath}）の "answer" 欄に回答を入力`);
    console.log(`3. 「refine」コマンドで一般質問を生成`);
  });

/** refine コマンド: ヒアリング回答を踏まえて一般質問を生成 */
program
  .command("refine")
  .description("ヒアリング回答を踏まえて一般質問の詳細を生成する")
  .option("-r, --responses <path>", "ヒアリング回答ファイルのパス（未指定で最新を使用）")
  .option("-f, --file <path>", "使用する記事データファイル（未指定でマスターストアを使用）")
  .option("-c, --category <category>", "カテゴリを指定")
  .option("--all", "全カテゴリで生成（対話メニューをスキップ）")
  .action(
    async (options: {
      responses?: string;
      file?: string;
      category?: string;
      all?: boolean;
    }) => {
      const config = loadConfig();

      if (!config.anthropicApiKey) {
        console.error(
          "エラー: ANTHROPIC_API_KEY が設定されていません。\n" +
            ".env ファイルまたは環境変数で設定してください。"
        );
        process.exit(1);
      }

      const storage = new Storage(config.dataDir, config.outputDir);

      // ヒアリング回答の読み込み
      const hearingResponses = storage.loadHearingResponses(options.responses);
      if (!hearingResponses) {
        console.error(
          "エラー: ヒアリング回答が見つかりません。\n" +
            "hearing コマンドで生成された回答テンプレートに回答を入力してください。\n" +
            "または -r オプションで回答ファイルのパスを指定してください。"
        );
        process.exit(1);
      }

      // 回答が入力されているか確認
      const answeredCount = hearingResponses.responses.reduce(
        (sum, r) => sum + r.answers.filter((a) => a.answer.trim() !== "").length,
        0
      );
      const totalQuestions = hearingResponses.responses.reduce(
        (sum, r) => sum + r.answers.length,
        0
      );

      if (answeredCount === 0) {
        console.error(
          "エラー: ヒアリング回答がすべて空です。\n" +
            "回答テンプレートの \"answer\" 欄に回答を入力してください。"
        );
        process.exit(1);
      }

      // 記事データの読み込み
      let articles;
      if (options.file) {
        const data = fs.readFileSync(options.file, "utf-8");
        articles = JSON.parse(data);
      } else {
        articles = storage.loadAllArticles();
      }

      if (!articles || articles.length === 0) {
        console.error(
          "エラー: 記事データがありません。先に collect コマンドを実行してください。"
        );
        process.exit(1);
      }

      // カテゴリ選択
      let category: QuestionCategory | null = null;
      if (options.category) {
        category = options.category as QuestionCategory;
      } else if (!options.all) {
        category = await promptCategorySelection();
      }

      console.log("=== ヒアリング回答に基づく一般質問生成 ===\n");
      console.log(`対象記事数: ${articles.length} 件`);
      console.log(`ヒアリング回答: ${answeredCount}/${totalQuestions} 問回答済み`);
      if (category) {
        console.log(`カテゴリ: ${category}`);
      }
      console.log("");

      const generator = new QuestionGenerator(config.anthropicApiKey);
      const questions = await generator.generateFromHearing(
        articles,
        hearingResponses,
        { category }
      );

      const mdPath = storage.saveQuestionsAsMarkdown(questions);
      const jsonPath = storage.saveQuestionsAsJson(questions);

      console.log(`\n質問生成完了: ${questions.length} 項目`);
      console.log(`Markdown: ${mdPath}`);
      console.log(`JSON: ${jsonPath}`);

      // 結果の概要を表示
      console.log("\n--- 生成された質問項目 ---\n");
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`${i + 1}. ${q.mainTopic}`);
        for (const sub of q.subTopics) {
          console.log(`   - ${sub.title}`);
          if (sub.expectedAnswer) {
            console.log(`     [想定答弁あり]`);
          }
        }
      }
    }
  );

/** generate コマンド: 一般質問の生成（従来互換） */
program
  .command("generate")
  .description("収集済みの情報から一般質問を生成する（カテゴリ選択・想定答弁付き）")
  .option("-f, --file <path>", "使用する記事データファイル（未指定でマスターストアを使用）")
  .option("-c, --category <category>", "質問カテゴリを指定（対話メニューをスキップ）")
  .option("--all", "全カテゴリで生成（対話メニューをスキップ）")
  .action(async (options: { file?: string; category?: string; all?: boolean }) => {
    const config = loadConfig();

    if (!config.anthropicApiKey) {
      console.error(
        "エラー: ANTHROPIC_API_KEY が設定されていません。\n" +
          ".env ファイルまたは環境変数で設定してください。"
      );
      process.exit(1);
    }

    const storage = new Storage(config.dataDir, config.outputDir);

    // 記事データの読み込み（マスターストア優先）
    let articles;
    if (options.file) {
      const data = fs.readFileSync(options.file, "utf-8");
      articles = JSON.parse(data);
    } else {
      articles = storage.loadAllArticles();
    }

    if (!articles || articles.length === 0) {
      console.error(
        "エラー: 記事データがありません。先に collect コマンドを実行してください。"
      );
      process.exit(1);
    }

    // カテゴリ選択
    let category: QuestionCategory | null = null;
    if (options.category) {
      category = options.category as QuestionCategory;
    } else if (!options.all) {
      category = await promptCategorySelection();
    }

    console.log("=== 一般質問生成 ===\n");
    console.log(`対象記事数: ${articles.length} 件`);
    if (category) {
      console.log(`カテゴリ: ${category}`);
    }
    console.log("");

    const generator = new QuestionGenerator(config.anthropicApiKey);
    const questions = await generator.generateQuestions(articles, { category });

    const mdPath = storage.saveQuestionsAsMarkdown(questions);
    const jsonPath = storage.saveQuestionsAsJson(questions);

    console.log(`\n質問生成完了: ${questions.length} 項目`);
    console.log(`Markdown: ${mdPath}`);
    console.log(`JSON: ${jsonPath}`);

    // 結果の概要を表示
    console.log("\n--- 生成された質問項目 ---\n");
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      console.log(`${i + 1}. ${q.mainTopic}`);
      for (const sub of q.subTopics) {
        console.log(`   - ${sub.title}`);
        if (sub.expectedAnswer) {
          console.log(`     [想定答弁あり]`);
        }
      }
    }
  });

/** run コマンド: 収集から質問生成までを一括実行 */
program
  .command("run")
  .description("情報収集から質問生成まで一括実行する（カテゴリ選択・想定答弁付き）")
  .option("--local-only", "海老名市の情報のみ収集する")
  .option("-c, --category <category>", "質問カテゴリを指定")
  .option("--all", "全カテゴリで生成（対話メニューをスキップ）")
  .action(async (options: { localOnly?: boolean; category?: string; all?: boolean }) => {
    const config = loadConfig();
    const scraper = new EbinaScraper(config.maxArticles);
    const storage = new Storage(config.dataDir, config.outputDir);

    console.log("=== 行政情報収集・質問生成 一括実行 ===\n");

    // Step 1: 収集
    console.log("[Step 1] 行政情報の収集\n");
    let articles;
    if (options.localOnly) {
      articles = await scraper.collectAll();
    } else {
      articles = await scraper.collectAllSources();
    }

    // マスターストアにマージ
    const mergeResult = storage.mergeAndSaveArticles(articles);

    // カテゴリ別の集計を表示
    const categoryCounts = new Map<string, number>();
    for (const a of articles) {
      categoryCounts.set(a.category, (categoryCounts.get(a.category) ?? 0) + 1);
    }
    console.log("\n--- カテゴリ別集計 ---");
    for (const [cat, count] of categoryCounts) {
      console.log(`  ${cat}: ${count} 件`);
    }
    console.log(`\nマスターストア蓄積: ${mergeResult.totalCount} 件（新規: ${mergeResult.newCount} 件）`);

    // Step 2: 質問生成（マスターストアの全データを使用）
    if (config.anthropicApiKey) {
      // カテゴリ選択
      let category: QuestionCategory | null = null;
      if (options.category) {
        category = options.category as QuestionCategory;
      } else if (!options.all) {
        category = await promptCategorySelection();
      }

      console.log("\n[Step 2] 一般質問の生成\n");
      const allArticles = storage.loadAllArticles() ?? articles;
      const generator = new QuestionGenerator(config.anthropicApiKey);
      const questions = await generator.generateQuestions(allArticles, { category });

      const mdPath = storage.saveQuestionsAsMarkdown(questions);
      storage.saveQuestionsAsJson(questions);

      console.log(`\n=== 完了 ===`);
      console.log(`収集記事: ${articles.length} 件（今回）/ ${mergeResult.totalCount} 件（蓄積）`);
      console.log(`生成質問: ${questions.length} 項目`);
      if (category) {
        console.log(`カテゴリ: ${category}`);
      }
      console.log(`出力ファイル: ${mdPath}`);

      // 概要を表示
      console.log("\n--- 生成された質問項目 ---\n");
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`${i + 1}. ${q.mainTopic}`);
        for (const sub of q.subTopics) {
          console.log(`   - ${sub.title}`);
          if (sub.expectedAnswer) {
            console.log(`     [想定答弁あり]`);
          }
        }
      }
    } else {
      console.log("\n=== 収集完了 ===");
      console.log(`収集記事: ${articles.length} 件（今回）/ ${mergeResult.totalCount} 件（蓄積）`);
      console.log(
        "※ ANTHROPIC_API_KEY 未設定のため質問生成はスキップされました。"
      );
    }
  });

/** schedule コマンド: 定期実行 */
program
  .command("schedule")
  .description("定期的に情報収集と質問生成を実行する")
  .action(() => {
    const config = loadConfig();
    const scheduler = new Scheduler(config);
    scheduler.start();
  });

program.parse();
