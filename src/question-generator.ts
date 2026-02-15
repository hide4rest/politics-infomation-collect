import Anthropic from "@anthropic-ai/sdk";
import type { CollectedArticle, GeneratedQuestion } from "./types";

/** Claude APIを使って収集情報から議会一般質問を生成するモジュール */
export class QuestionGenerator {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /** 収集記事群から一般質問を生成 */
  async generateQuestions(
    articles: CollectedArticle[]
  ): Promise<GeneratedQuestion[]> {
    if (articles.length === 0) {
      console.warn("収集記事がありません。質問を生成できません。");
      return [];
    }

    // 記事をカテゴリ別に整理
    const categorized = this.categorizeArticles(articles);
    const summaryText = this.buildArticleSummary(categorized);

    console.log("[質問生成] Claude APIに分析を依頼中...");

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: this.buildPrompt(summaryText),
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("予期しないレスポンス形式です");
    }

    return this.parseResponse(content.text, articles);
  }

  /** カテゴリ別に記事を整理 */
  private categorizeArticles(
    articles: CollectedArticle[]
  ): Map<string, CollectedArticle[]> {
    const map = new Map<string, CollectedArticle[]>();
    for (const article of articles) {
      const list = map.get(article.category) ?? [];
      list.push(article);
      map.set(article.category, list);
    }
    return map;
  }

  /** 記事サマリーテキストを構築 */
  private buildArticleSummary(
    categorized: Map<string, CollectedArticle[]>
  ): string {
    const parts: string[] = [];
    for (const [category, articles] of categorized) {
      parts.push(`\n## ${category}`);
      for (const article of articles) {
        const contentPreview = article.content.slice(0, 800);
        parts.push(`\n### ${article.title}\nURL: ${article.url}\n${contentPreview}`);
      }
    }
    return parts.join("\n");
  }

  /** プロンプトを構築 */
  private buildPrompt(summaryText: string): string {
    return `あなたは神奈川県海老名市の市議会議員の政策秘書です。
以下に海老名市公式サイトから収集した最新の行政情報があります。
この情報を分析し、市議会定例会での一般質問の項目と詳細な質問内容を作成してください。

## 分析対象の行政情報

${summaryText}

## 出力要件

以下のJSON形式で、3〜5つの一般質問を生成してください。
各質問は市民生活に直結する重要なテーマを選び、具体的なデータや事実に基づいた質問にしてください。

\`\`\`json
[
  {
    "mainTopic": "大項目（例：令和7年度予算における子育て支援施策について）",
    "background": "質問の背景と根拠（収集した情報に基づく具体的な事実を含めること）",
    "relatedArticles": ["関連記事のURL1", "関連記事のURL2"],
    "subTopics": [
      {
        "title": "小項目タイトル",
        "detailedQuestion": "詳細な質問内容（議場で読み上げる形式で、具体的な数字やデータへの言及を含むこと）",
        "followUp": "想定される答弁に対する再質問（任意）"
      }
    ]
  }
]
\`\`\`

## 質問作成のガイドライン

1. **具体性**: 抽象的な質問ではなく、具体的な施策・数字・期限に言及する
2. **市民目線**: 市民生活への影響を中心に据える
3. **建設的**: 批判だけでなく、代替案や改善提案を含める
4. **根拠**: 収集した情報を根拠として明示する
5. **多角的**: 財政、福祉、教育、都市計画、防災など多様な分野をカバーする
6. **形式**: 議場での一般質問として適切な敬体（です・ます調）で記述する

JSON形式のみを出力してください。`;
  }

  /** APIレスポンスをパース */
  private parseResponse(
    text: string,
    articles: CollectedArticle[]
  ): GeneratedQuestion[] {
    // JSONブロックを抽出
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("JSONの抽出に失敗しました。生テキストで出力します。");
      return [
        {
          mainTopic: "生成結果",
          background: text,
          relatedArticles: [],
          subTopics: [
            {
              title: "分析結果",
              detailedQuestion: text,
            },
          ],
        },
      ];
    }

    try {
      const jsonStr = jsonMatch[1] ?? jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        throw new Error("配列ではありません");
      }
      return parsed as GeneratedQuestion[];
    } catch (e) {
      console.error("JSONパースエラー:", e);
      return [
        {
          mainTopic: "生成結果（パースエラー）",
          background: "APIレスポンスのパースに失敗しました",
          relatedArticles: [],
          subTopics: [
            {
              title: "生テキスト",
              detailedQuestion: text,
            },
          ],
        },
      ];
    }
  }
}
