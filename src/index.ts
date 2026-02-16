#!/usr/bin/env node

import { Command } from "commander";
import readline from "readline";
import { loadConfig, QUESTION_CATEGORIES } from "./config";
import { EbinaScraper } from "./scraper";
import { QuestionGenerator } from "./question-generator";
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
      "市議会での一般質問の項目と詳細な質問内容（想定答弁付き）を自動生成します。"
  )
  .version("2.0.0");

/** collect コマンド: 行政情報の収集 */
program
  .command("collect")
  .description("海老名市・国・県の行政情報および議会議事録を収集する")
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

    const filePath = storage.saveArticles(articles);

    // カテゴリ別の集計を表示
    const categoryCounts = new Map<string, number>();
    for (const a of articles) {
      categoryCounts.set(a.category, (categoryCounts.get(a.category) ?? 0) + 1);
    }
    console.log("\n--- カテゴリ別集計 ---");
    for (const [cat, count] of categoryCounts) {
      console.log(`  ${cat}: ${count} 件`);
    }

    console.log(`\n収集完了: ${articles.length} 件`);
    console.log(`保存先: ${filePath}`);
  });

/** generate コマンド: 一般質問の生成 */
program
  .command("generate")
  .description("収集済みの情報から一般質問を生成する（カテゴリ選択・想定答弁付き）")
  .option("-f, --file <path>", "使用する記事データファイル（未指定で最新を使用）")
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

    // 記事データの読み込み
    let articles;
    if (options.file) {
      const data = fs.readFileSync(options.file, "utf-8");
      articles = JSON.parse(data);
    } else {
      articles = storage.loadLatestArticles();
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
    storage.saveArticles(articles);

    // カテゴリ別の集計を表示
    const categoryCounts = new Map<string, number>();
    for (const a of articles) {
      categoryCounts.set(a.category, (categoryCounts.get(a.category) ?? 0) + 1);
    }
    console.log("\n--- カテゴリ別集計 ---");
    for (const [cat, count] of categoryCounts) {
      console.log(`  ${cat}: ${count} 件`);
    }

    // Step 2: 質問生成
    if (config.anthropicApiKey) {
      // カテゴリ選択
      let category: QuestionCategory | null = null;
      if (options.category) {
        category = options.category as QuestionCategory;
      } else if (!options.all) {
        category = await promptCategorySelection();
      }

      console.log("\n[Step 2] 一般質問の生成\n");
      const generator = new QuestionGenerator(config.anthropicApiKey);
      const questions = await generator.generateQuestions(articles, { category });

      const mdPath = storage.saveQuestionsAsMarkdown(questions);
      storage.saveQuestionsAsJson(questions);

      console.log(`\n=== 完了 ===`);
      console.log(`収集記事: ${articles.length} 件`);
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
      console.log(`収集記事: ${articles.length} 件`);
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
