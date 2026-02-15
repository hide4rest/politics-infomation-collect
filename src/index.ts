#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config";
import { EbinaScraper } from "./scraper";
import { QuestionGenerator } from "./question-generator";
import { Storage } from "./storage";
import { Scheduler } from "./scheduler";

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

loadEnvFile();

const program = new Command();

program
  .name("ebina-council")
  .description(
    "海老名市行政情報収集・議会一般質問生成ツール\n" +
      "神奈川県海老名市の公式サイトから行政情報を収集し、\n" +
      "市議会での一般質問の項目と詳細な質問内容を自動生成します。"
  )
  .version("1.0.0");

/** collect コマンド: 行政情報の収集 */
program
  .command("collect")
  .description("海老名市公式サイトから行政情報を収集する")
  .action(async () => {
    const config = loadConfig();
    const scraper = new EbinaScraper(config.maxArticles);
    const storage = new Storage(config.dataDir, config.outputDir);

    console.log("=== 海老名市 行政情報収集 ===\n");

    const articles = await scraper.collectAll();
    const filePath = storage.saveArticles(articles);

    console.log(`\n収集完了: ${articles.length} 件`);
    console.log(`保存先: ${filePath}`);
  });

/** generate コマンド: 一般質問の生成 */
program
  .command("generate")
  .description("収集済みの情報から一般質問を生成する")
  .option("-f, --file <path>", "使用する記事データファイル（未指定で最新を使用）")
  .action(async (options: { file?: string }) => {
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

    console.log("=== 一般質問生成 ===\n");
    console.log(`対象記事数: ${articles.length} 件\n`);

    const generator = new QuestionGenerator(config.anthropicApiKey);
    const questions = await generator.generateQuestions(articles);

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
      }
    }
  });

/** run コマンド: 収集から質問生成までを一括実行 */
program
  .command("run")
  .description("情報収集から質問生成まで一括実行する")
  .action(async () => {
    const config = loadConfig();
    const scraper = new EbinaScraper(config.maxArticles);
    const storage = new Storage(config.dataDir, config.outputDir);

    console.log("=== 海老名市 行政情報収集・質問生成 一括実行 ===\n");

    // Step 1: 収集
    console.log("[Step 1] 行政情報の収集\n");
    const articles = await scraper.collectAll();
    storage.saveArticles(articles);

    // Step 2: 質問生成
    if (config.anthropicApiKey) {
      console.log("\n[Step 2] 一般質問の生成\n");
      const generator = new QuestionGenerator(config.anthropicApiKey);
      const questions = await generator.generateQuestions(articles);

      const mdPath = storage.saveQuestionsAsMarkdown(questions);
      storage.saveQuestionsAsJson(questions);

      console.log(`\n=== 完了 ===`);
      console.log(`収集記事: ${articles.length} 件`);
      console.log(`生成質問: ${questions.length} 項目`);
      console.log(`出力ファイル: ${mdPath}`);

      // 概要を表示
      console.log("\n--- 生成された質問項目 ---\n");
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`${i + 1}. ${q.mainTopic}`);
        for (const sub of q.subTopics) {
          console.log(`   - ${sub.title}`);
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
