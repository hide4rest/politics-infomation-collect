import Anthropic from "@anthropic-ai/sdk";
import type {
  CollectedArticle,
  GeneratedQuestion,
  QuestionCategory,
  HearingResponseSheet,
} from "./types";

/** 質問生成オプション */
export interface GenerateOptions {
  /** 質問カテゴリのフィルタ（未指定で全カテゴリ） */
  category?: QuestionCategory | null;
  /** 一般質問を行う定例会の日付（例: "2026-06-15", "令和8年6月定例会"） */
  sessionDate?: string | null;
}

/** ヒアリング回答を踏まえた質問生成オプション */
export interface RefineOptions {
  /** 質問カテゴリのフィルタ */
  category?: QuestionCategory | null;
  /** 一般質問を行う定例会の日付 */
  sessionDate?: string | null;
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
    const sessionDate = options?.sessionDate ?? null;
    if (category) {
      console.log(`[質問生成] カテゴリ「${category}」で絞り込み`);
    }
    if (sessionDate) {
      console.log(`[質問生成] 定例会予定: ${sessionDate}`);
    }

    console.log("[質問生成] Claude APIに分析を依頼中...");

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
  private buildPrompt(summaryText: string, category: QuestionCategory | null, sessionDate: string | null): string {
    const categoryInstruction = category
      ? `\n\n## カテゴリ指定\n\n「${category}」の分野に焦点を当てた質問を3〜5つ生成してください。\n他の分野の情報も背景や根拠として活用して構いませんが、質問の主題は「${category}」に関連するものにしてください。\n`
      : "";

    const sessionInstruction = sessionDate
      ? `\n\n## 一般質問の予定\n\n一般質問は **${sessionDate}** に行う予定です。\nこの日程を踏まえ、以下の点を考慮して質問を作成してください：\n- 定例会の時期に即したタイムリーなテーマ（例：6月定例会なら新年度施策の進捗、12月定例会なら次年度予算への要望）\n- その時期に施行・適用される国や県の新制度があれば優先的に取り上げる\n- 季節的に市民の関心が高まるテーマ（防災：台風シーズン前、教育：入学シーズン前など）\n- 大項目の表現に「${sessionDate}」の定例会であることを反映する（例：「令和○年○月定例会」）\n`
      : "";

    return `あなたは神奈川県海老名市の市議会議員の政策秘書です。
以下に海老名市公式サイト、国の省庁、神奈川県、および市議会の議事録・会議録から収集した行政情報があります。
この情報を総合的に分析し、市議会定例会での一般質問の項目と詳細な質問内容を作成してください。

## 分析対象の行政情報

${summaryText}
${categoryInstruction}${sessionInstruction}
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

  /** ヒアリング回答を踏まえて詳細な一般質問を生成 */
  async generateFromHearing(
    articles: CollectedArticle[],
    hearingResponses: HearingResponseSheet,
    options?: RefineOptions
  ): Promise<GeneratedQuestion[]> {
    if (hearingResponses.responses.length === 0) {
      console.warn("ヒアリング回答がありません。");
      return [];
    }

    const categorized = this.categorizeArticles(articles);
    const summaryText = this.buildArticleSummary(categorized);
    const hearingText = this.buildHearingResponseSummary(hearingResponses);

    const category = options?.category ?? null;
    const sessionDate = options?.sessionDate ?? null;
    if (category) {
      console.log(`[質問生成（ヒアリング踏まえ）] カテゴリ「${category}」で絞り込み`);
    }
    if (sessionDate) {
      console.log(`[質問生成（ヒアリング踏まえ）] 定例会予定: ${sessionDate}`);
    }

    console.log("[質問生成] ヒアリング回答を踏まえて Claude APIに分析を依頼中...");

    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 16000,
      messages: [
        {
          role: "user",
          content: this.buildRefinePrompt(summaryText, hearingText, category, sessionDate),
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("予期しないレスポンス形式です");
    }

    return this.parseResponse(content.text, articles);
  }

  /** ヒアリング回答をテキスト形式にまとめる */
  private buildHearingResponseSummary(
    sheet: HearingResponseSheet
  ): string {
    const parts: string[] = [];
    for (const resp of sheet.responses) {
      parts.push(`\n## ${resp.topic}`);
      for (const qa of resp.answers) {
        parts.push(`\n**Q:** ${qa.question}`);
        parts.push(`**A:** ${qa.answer || "（未回答）"}`);
      }
      if (resp.notes) {
        parts.push(`\n**メモ:** ${resp.notes}`);
      }
    }
    return parts.join("\n");
  }

  /** ヒアリング回答ベースの質問生成プロンプト */
  private buildRefinePrompt(
    summaryText: string,
    hearingText: string,
    category: QuestionCategory | null,
    sessionDate: string | null
  ): string {
    const categoryInstruction = category
      ? `\n\n## カテゴリ指定\n\n「${category}」の分野に焦点を当てた質問を3〜5つ生成してください。\n`
      : "";

    const sessionInstruction = sessionDate
      ? `\n\n## 一般質問の予定\n\n一般質問は **${sessionDate}** に行う予定です。\nこの日程を踏まえ、以下の点を考慮して質問を作成してください：\n- 定例会の時期に即したタイムリーなテーマ\n- その時期に施行・適用される国や県の新制度があれば優先的に取り上げる\n- 季節的に市民の関心が高まるテーマ\n- 大項目の表現に定例会の時期を反映する\n- ヒアリングで得た情報の中で、定例会時点で特に旬となるものを重視する\n`
      : "";

    return `あなたは神奈川県海老名市の市議会議員の政策秘書です。

一般質問の擦り合わせ期間に行政側へヒアリングを行い、各担当部署から回答を得ました。
以下に、（1）収集した行政情報と（2）ヒアリングで得た回答があります。

これらの情報を総合的に分析し、**ヒアリング回答を踏まえた詳細な一般質問**を作成してください。
ヒアリングで判明した事実・数値・スケジュール等を積極的に質問に反映してください。

## 収集した行政情報

${summaryText}

## ヒアリング回答

${hearingText}
${categoryInstruction}${sessionInstruction}
## 出力要件

以下のJSON形式で、3〜5つの一般質問を生成してください。
ヒアリング回答から得られた具体的な情報（数値、スケジュール、方針等）を質問内容に織り込み、
行政の答弁がより具体的なものになるよう、踏み込んだ質問にしてください。

\`\`\`json
[
  {
    "mainTopic": "大項目",
    "background": "質問の背景と根拠（ヒアリングで判明した事実を含めること）",
    "relatedArticles": ["関連記事のURL1"],
    "subTopics": [
      {
        "title": "小項目タイトル",
        "detailedQuestion": "詳細な質問内容（ヒアリングで得た情報を踏まえ、さらに踏み込んだ内容にすること）",
        "expectedAnswer": "行政側の想定答弁（ヒアリング回答の内容を踏まえた現実的な答弁）",
        "followUp": "想定答弁を踏まえた再質問（ヒアリングで曖昧だった部分や深掘りすべき点を突く）"
      }
    ]
  }
]
\`\`\`

## 質問作成のガイドライン

1. **ヒアリング結果の活用**: ヒアリングで得た具体的な数値・事実・方針を質問の中で引用・言及する
2. **深掘り**: ヒアリングで回答が曖昧だった部分、具体性が不足した部分を議場で改めて問う
3. **整合性の確認**: ヒアリング回答と公開情報（収集記事）との間に矛盾や齟齬があれば、それを指摘する質問を含める
4. **建設的な提案**: 行政の取り組みを評価しつつ、改善や発展の提案を含める
5. **市民目線**: 市民生活への具体的な影響を質問に含める
6. **形式**: 議場での一般質問として適切な敬体（です・ます調）で記述する
7. **想定答弁の精度**: ヒアリング結果を踏まえ、行政が実際に答弁しそうな内容をリアルに記述する
8. **再質問の戦略**: ヒアリングで得た情報をベースに、答弁の曖昧さを突く効果的な再質問を設計する

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
