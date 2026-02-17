import Anthropic from "@anthropic-ai/sdk";
import type {
  CollectedArticle,
  HearingItem,
  HearingSheet,
  QuestionCategory,
} from "./types";

/** ヒアリング項目生成オプション */
export interface HearingGenerateOptions {
  category?: QuestionCategory | null;
  /** 一般質問を行う定例会の日付（例: "2026-06-15", "令和8年6月定例会"） */
  sessionDate?: string | null;
}

/** Claude APIを使って収集情報からヒアリング項目を生成するモジュール */
export class HearingGenerator {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /** 収集記事群からヒアリング項目を生成 */
  async generateHearingItems(
    articles: CollectedArticle[],
    options?: HearingGenerateOptions
  ): Promise<HearingSheet> {
    if (articles.length === 0) {
      console.warn("収集記事がありません。ヒアリング項目を生成できません。");
      return { createdAt: new Date().toISOString(), items: [] };
    }

    const categorized = this.categorizeArticles(articles);
    const summaryText = this.buildArticleSummary(categorized);

    const category = options?.category ?? null;
    const sessionDate = options?.sessionDate ?? null;
    if (category) {
      console.log(`[ヒアリング生成] カテゴリ「${category}」で絞り込み`);
    }
    if (sessionDate) {
      console.log(`[ヒアリング生成] 定例会予定: ${sessionDate}`);
    }

    console.log("[ヒアリング生成] Claude APIに分析を依頼中...");

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 12000,
      messages: [
        {
          role: "user",
          content: this.buildPrompt(summaryText, category, sessionDate),
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("予期しないレスポンス形式です");
    }

    const items = this.parseResponse(content.text);
    return {
      createdAt: new Date().toISOString(),
      items,
    };
  }

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

  private buildArticleSummary(
    categorized: Map<string, CollectedArticle[]>
  ): string {
    const parts: string[] = [];
    for (const [category, articles] of categorized) {
      parts.push(`\n## ${category}`);
      for (const article of articles) {
        const contentPreview = article.content.slice(0, 800);
        parts.push(
          `\n### ${article.title}\nURL: ${article.url}\n${contentPreview}`
        );
      }
    }
    return parts.join("\n");
  }

  private buildPrompt(
    summaryText: string,
    category: QuestionCategory | null,
    sessionDate: string | null
  ): string {
    const categoryInstruction = category
      ? `\n\n## カテゴリ指定\n\n「${category}」の分野に焦点を当てたヒアリング項目を生成してください。\n他の分野の情報も背景として活用して構いませんが、ヒアリングの主題は「${category}」に関連するものにしてください。\n`
      : "";

    const sessionInstruction = sessionDate
      ? `\n\n## 一般質問の予定\n\n一般質問は **${sessionDate}** に行う予定です。\nこの日程を踏まえ、以下の点を考慮してヒアリング項目を作成してください：\n- 定例会の時期に合った旬のテーマ（予算審議時期なら予算関連、年度末なら進捗確認など）\n- 定例会までのスケジュールを意識した、実現可能なヒアリング内容\n- その時期に市民の関心が高まるであろう季節的・時事的なテーマ\n- 本日（${new Date().toLocaleDateString("ja-JP")}）から定例会までの準備期間を考慮した段取り\n- 9月定例会の場合は**決算審査（前年度決算の認定）**も行われるため、前年度の事業実績・執行率・不用額・成果指標の達成状況について行政に確認すべき事項を重点的に含めること\n`
      : "";

    return `あなたは神奈川県海老名市の市議会議員の政策秘書です。
以下に海老名市公式サイト、国の省庁、神奈川県、および市議会の議事録・会議録から収集した行政情報があります。

市議会定例会での一般質問に向けて、**擦り合わせ期間中に行政側（各担当部署）へ行うヒアリングの項目**を作成してください。
ヒアリングとは、一般質問の準備段階として議員が行政の担当部署と事前にやり取りし、事実確認や現状把握を行うプロセスです。

## 分析対象の行政情報

${summaryText}
${categoryInstruction}${sessionInstruction}
## 出力要件

以下のJSON形式で、5〜8つのヒアリング項目を生成してください。
各項目には、ヒアリング先の担当部署名、背景・意図、具体的な質問を含めてください。

\`\`\`json
[
  {
    "topic": "ヒアリング対象分野（例：令和7年度の子育て支援施策の方向性について）",
    "department": "担当部署名（例：子育て支援課）",
    "questions": [
      "具体的なヒアリング質問1（例：来年度の待機児童対策として新たに計画している施策はありますか？）",
      "具体的なヒアリング質問2（例：国のこども家庭庁の新規補助金について、市として申請の予定はありますか？）",
      "具体的なヒアリング質問3"
    ],
    "background": "このヒアリングを行う背景と意図（収集した情報に基づく具体的な事実を含めること）",
    "relatedArticles": ["関連記事のURL1", "関連記事のURL2"]
  }
]
\`\`\`

## ヒアリング項目作成のガイドライン

1. **事実確認を重視**: 行政側に確認すべき数値・進捗状況・スケジュールなど、客観的な情報を引き出す質問にする
2. **具体性**: 「〜についてどうお考えですか」のような曖昧な質問ではなく、「〜の件数は」「〜の予算額は」「〜の進捗状況は」など具体的に聞く
3. **国・県の動向との連携**: 国や県の新制度・補助金について、市の対応方針を確認する質問を含める
4. **市民目線**: 市民生活への影響を把握できる質問を含める
5. **建設的**: ヒアリングの目的は行政と対立することではなく、事実を正確に把握し、より良い質問を構築すること
6. **部署の特定**: 各項目に対してヒアリングすべき具体的な担当部署名を記載する
7. **議事録の活用**: 過去の議会質問・答弁がある場合、その後の進捗を確認する質問を含める
8. **多角的**: 複数の分野・部署にまたがるヒアリング項目とする

JSON形式のみを出力してください。`;
  }

  private parseResponse(text: string): HearingItem[] {
    const jsonMatch =
      text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("JSONの抽出に失敗しました。");
      return [];
    }

    try {
      const jsonStr = jsonMatch[1] ?? jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      if (!Array.isArray(parsed)) {
        throw new Error("配列ではありません");
      }
      return parsed as HearingItem[];
    } catch (e) {
      console.error("JSONパースエラー:", e);
      return [];
    }
  }
}
