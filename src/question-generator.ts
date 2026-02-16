import Anthropic from "@anthropic-ai/sdk";
import type { CollectedArticle, GeneratedQuestion, QuestionCategory } from "./types";

/** 質問生成オプション */
export interface GenerateOptions {
  /** 質問カテゴリのフィルタ（未指定で全カテゴリ） */
  category?: QuestionCategory | null;
}

/** Claude APIを使って収集情報から議会一般質問を生成するモジュール */
export class QuestionGenerator {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /** 収集記事群から一般質問を生成 */
  async generateQuestions(
    articles: CollectedArticle[],
    options?: GenerateOptions
  ): Promise<GeneratedQuestion[]> {
    if (articles.length === 0) {
      console.warn("収集記事がありません。質問を生成できません。");
      return [];
    }

    // 記事をカテゴリ別に整理
    const categorized = this.categorizeArticles(articles);
    const summaryText = this.buildArticleSummary(categorized);

    const category = options?.category ?? null;
    if (category) {
      console.log(`[質問生成] カテゴリ「${category}」で絞り込み`);
    }

    console.log("[質問生成] Claude APIに分析を依頼中...");

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 12000,
      messages: [
        {
          role: "user",
          content: this.buildPrompt(summaryText, category),
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
  private buildPrompt(summaryText: string, category: QuestionCategory | null): string {
    const categoryInstruction = category
      ? `\n\n## カテゴリ指定\n\n「${category}」の分野に焦点を当てた質問を3〜5つ生成してください。\n他の分野の情報も背景や根拠として活用して構いませんが、質問の主題は「${category}」に関連するものにしてください。\n`
      : "";

    return `あなたは神奈川県海老名市の市議会議員の政策秘書です。
以下に海老名市公式サイト、国の省庁、神奈川県、および市議会の議事録・会議録から収集した行政情報があります。
この情報を総合的に分析し、市議会定例会での一般質問の項目と詳細な質問内容を作成してください。

## 分析対象の行政情報

${summaryText}
${categoryInstruction}
## 出力要件

以下のJSON形式で、3〜5つの一般質問を生成してください。
各質問は市民生活に直結する重要なテーマを選び、具体的なデータや事実に基づいた質問にしてください。
**各小項目には、行政側（市長または担当部長）の想定答弁も必ず記述してください。**

\`\`\`json
[
  {
    "mainTopic": "大項目（例：令和7年度予算における子育て支援施策について）",
    "background": "質問の背景と根拠（収集した情報に基づく具体的な事実を含めること。国や県の動向・補助金情報があれば積極的に活用すること）",
    "relatedArticles": ["関連記事のURL1", "関連記事のURL2"],
    "subTopics": [
      {
        "title": "小項目タイトル",
        "detailedQuestion": "詳細な質問内容（議場で読み上げる形式で、具体的な数字やデータへの言及を含むこと）",
        "expectedAnswer": "行政側の想定答弁（市長または担当部長が答弁する形式で記述。海老名市の既存施策や一般的な行政対応を踏まえ、具体的な施策名・数値・スケジュールに言及した現実的な答弁とすること）",
        "followUp": "想定答弁を踏まえた再質問（想定答弁の不十分な点や深掘りすべき点を突く質問）"
      }
    ]
  }
]
\`\`\`

## 質問作成のガイドライン

1. **具体性**: 抽象的な質問ではなく、具体的な施策・数字・期限に言及する
2. **市民目線**: 市民生活への影響を中心に据える
3. **建設的**: 批判だけでなく、代替案や改善提案を含める
4. **根拠**: 収集した情報を根拠として明示する。特に国の法令改正や補助金制度の変更は積極的に活用する
5. **多角的**: 財政、福祉、教育、都市計画、防災など多様な分野をカバーする
6. **形式**: 議場での一般質問として適切な敬体（です・ます調）で記述する
7. **想定答弁**: 各質問に対する行政側の想定答弁を、市長または担当部長の答弁形式で記述する。海老名市の既存施策や一般的な行政対応を踏まえた現実的な答弁とすること
8. **再質問の戦略**: 想定答弁を踏まえ、答弁の曖昧な部分や具体性が不足する部分を突く効果的な再質問を設計する
9. **議事録の活用**: 議会議事録・会議録のデータがある場合は、過去の質問と重複しないよう配慮し、過去の答弁で示された方針のフォローアップや進捗確認を質問に含める
10. **国・県の動向活用**: 国の新規法令、交付金、補助金の情報がある場合は、海老名市への影響や活用方針を問う質問を積極的に含める

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
