# keyword-search-is-all-you-need-2

> 生成日時: 2026/4/14 15:57:21
> 総スライド数: 9枚
> モデル: models/gemini-3-flash-preview
> 解析モード: W-Logic (テキスト+画像) + Code Execution (Agentic Vision)

## 概要

ご提示いただいたスライド情報に基づき、プレゼンテーションの要約を4文で作成しました。

本発表は、ベクトルデータベースを使用しない「エージェントによるキーワード検索」が、従来のRAG（検索拡張生成）の90%以上の性能を達成できることを実証しています。提案手法は、ReActベースのロジックに基づきLinuxシェルツール（rgaやPDFGrep等）を駆使して動的に文書を探索することで、システム構築の複雑さやコストという課題を解決します。性能評価では主要データセットでRAGの約88%〜95%の精度を維持し、特にFinanceBenchにおいては従来手法を上回る正確性を記録しました。結論として、エージェントによるキーワード検索は、リアルタイム性と簡便さを備えたRAGに代わる強力な選択肢となり得ることが示されています。

---

## スライド 1: Keyword search is all you need: Achieving RAG-Level Performance without vector databases using agentic tool use

### 内容

# Keyword search is all you need: Achieving RAG-Level Performance without vector databases using agentic tool use

## 著者情報

- **著者**: Shreyas Subramanian _1, Adewale Akinfaderin _, Yanyan Zhang _, Ishan Singh _, Chris Pecora, Mani Khanuja, Sandeep Singh, Maira Ladeira Tanke
- **所属**: Amazon Web Services (410 Terry Avenue North, Seattle, WA 98109)
- **連絡先**: subshrey@amazon.com
- **注釈**: \* 印の著者は同等の貢献（Equal contribution）

## 概要 (Abstract)

Retrieval-Augmented Generation (RAG) は正確な回答生成に有効だが、検索品質への依存、統合の複雑さ、コストといった課題がある。本研究では、ベクトルデータベースやセマンティック検索が、単純な「エージェントによる文書内キーワード検索」に対してどれほどの付加価値を持つかを検証した。

- **主な結果**: エージェント型フレームワーク内でのツールベースのキーワード検索は、従来のRAGシステムの**90%以上のパフォーマンス指標**を達成可能。
- **利点**: 実装が容易、コスト効率が高い、ナレッジベースの頻繁な更新が必要なシナリオに特に有用。

## はじめに (Introduction)

- LLMの急速な進歩により、テキスト生成やQAシステムが革新されたが、事実の正確性（ハルシネーションの抑制）が課題となっている。
- RAGは外部データベースと統合することで回答を事実に即したものにするが、検索メカニズムの統合や維持に課題がある。
- 代替案として、検索エンジンやAPIを動的に使用する「ツール拡張型LLMエージェント」が登場している。
- 本研究の目的：従来のRAGシステムとツール拡張型LLMエージェントの体系的な比較を行い、検索メカニズムと回答品質のトレードオフを明らかにする。

## 関連研究 (Related Work)

- RAGは精度と信頼性を向上させるための重要なアプローチとして定着している（以下、次ページへ続く）。

---

_Copyright © 2025, Association for the Advancement of Artificial Intelligence (www.aaai.org)._

### 要点

- ベクトルデータベースを使用しない「エージェントによるキーワード検索」でも、従来のRAGの90%以上の性能を達成できることを実証。
- 従来のRAGが抱える「統合の複雑さ」や「コスト」という課題に対するシンプルな解決策を提示。
- 頻繁に更新されるナレッジベースを扱う場合に、キーワード検索ベースのエージェントが特に有効である。
- LLM-as-a-Judgeを用いた体系的な評価フレームワークにより、RAGとエージェント型アプローチを比較。

### ビジュアル要素

- 標準的な学術論文（AAAI 2025）の2カラムレイアウト。
- タイトル、著者名、所属が中央揃えで上部に配置。
- 「Abstract」「Introduction」「Related Work」が太字のセクション見出しとして構造化されている。
- 左下には著者貢献に関する注釈と、AAAIの著作権情報が記載されたフッターがある。

### スピーカーノート

> このスライド（論文の表紙）では、RAGの常識を覆す「ベクトルDBなしでも十分な性能が出る」という主要な主張を強調してください。特に、Amazon Web Servicesの研究チームによる発表であること、そしてエージェントがツールとしてキーワード検索を使うだけで、従来の複雑なRAGシステムの9割以上の精度を出せるという具体的な数値を伝えるのがポイントです。コストと運用の簡素化が最大のメリットであることを付け加えてください。

---

## スライド 2: RAGとツール拡張型LLMの比較分析および研究手法

### 内容

## 概要

本スライド（論文の1ページ）では、大規模言語モデル（LLM）の信頼性を向上させるための2つの主要なアプローチ、**検索拡張生成（RAG）**と**ツール拡張型LLM（Tool-augmented LLMs）**について、その特徴、利点、課題、および本研究の評価手法を詳述している。

---

## 1. 検索拡張生成 (Retrieval-Augmented Generation: RAG)

- **基本機能**: 外部知識ベースから取得したドキュメントに回答を接地（Grounding）させることで、LLMのハルシネーションを抑制し、事実の一貫性を向上させる。
- **技術的知見**:
  - 密（Dense）および疎（Sparse）な検索技術を組み合わせたハイブリッド検索が、ドキュメント検索の品質において優れた性能を発揮する。
  - 検索されたパッセージの品質は、生成される回答の正確性と直接的に相関する（Fusion-in-Decoderアプローチなど）。

## 2. ツール拡張型LLM (Tool-augmented LLMs)

- **特徴**: 検索エンジン、API、専門データベースなどの外部ツールと統合し、動的な情報アクセスを可能にするRAGの代替案。
- **利点**:
  - **リアルタイム性**: 静的な知識ベースとは異なり、頻繁に更新される情報（Webナビゲーション、科学研究など）に対して高い精度を維持できる。
  - **柔軟性**: 複数のツールを連鎖（Chaining）させることで、複雑な推論タスクを実行可能。
  - **低コスト**: 大規模なベクトルデータベースの維持が不要なため、リソース制約のあるアプリケーションに適している。

## 3. 比較分析と評価の現状

- **評価のギャップ**: 実際のドキュメント形式（PDF、Webページ、構造化DB）を反映した標準的なベンチマークデータセットが不足している。
- **運用のトレードオフ**:
  - **RAG**: 知識ベースの維持・更新に多大なリソースが必要。
  - **ツール拡張型**: 外部サービスへの依存による信頼性の問題や、ネットワーク遅延（レイテンシ）のリスクがある。

## 4. 研究手法 (Methodology)

- **実験構成**: 基準となる「ベースライン・ベクトルデータベースRAG」を構築し、提案手法である「エージェンティック・キーワード検索アプローチ」の有効性を比較する。
- **評価指標**: RAGAS Pythonライブラリを使用し、LLM-as-a-Judgeメトリクスによって多角的に評価を行う。
- **リソース**: 関連コードはGitHubリポジトリで公開されている。

### 要点

- RAGは外部知識の参照によりハルシネーションを劇的に削減する。
- ツール拡張型LLMは、リアルタイムデータへのアクセスとマルチターン対話においてRAGより優位性がある。
- 多様なドキュメント形式に対応した標準的な評価フレームワークの欠如が現在の課題である。
- RAGは維持コストが高く、ツール拡張型は外部依存性と遅延が課題となるトレードオフが存在する。
- 本研究ではRAGASメトリクスを用いて、ベースラインRAGと提案するキーワード検索エージェントを比較する。

### ビジュアル要素

- 学術論文形式の2段組みレイアウト（左カラム：RAGとツール拡張型の導入、右カラム：比較分析、運用上の考慮事項、手法セクション）。
- 「Methodology」という明確なセクション見出しによる構造化。
- 多数の学術的引用（Guu et al. 2020, Lewis et al. 2020等）が含まれており、情報の信頼性を担保している。

### スピーカーノート

> このスライドでは、RAGとツール拡張型LLMの技術的な違いを明確にすることが重要です。特に、静的な知識ベースに頼るRAGの限界と、動的なツール利用がもたらす柔軟性の対比を強調してください。また、後半の『Methodology』セクションは、本研究がどのようにこれらの手法を公平に評価しようとしているか（RAGASの利用など）を説明する導入となります。

---

## スライド 3: Agentic Document QnA vs Baseline RAG: Methodology and Experiments

### 内容

# Agentic Document QnA vs Baseline RAG: Methodology and Experiments

## 1. Pipeline Comparison (Figure 1)

Figure 1 illustrates the structural differences between a traditional RAG pipeline and the proposed agentic search methodology.

- **RAG Pipeline (Red Arrows):**
  - Flow: User Query → Retrieve chunks (from Knowledge base) → Generate answer → Final Output.
  - Mechanism: Relies on pre-embedded document chunks stored in a vector database (Knowledge base).
- **Agent-based Pipeline (Blue Arrows):**
  - Flow: User Query → Agent (LLM) → Terminal (Execution of Linux commands) → Source documents → Agent → Final Output.
  - Mechanism: The agent dynamically interacts with raw source documents using tools like `pdfgrep`, `rga`, or other shell commands to find context.

## 2. Algorithm 1: Agentic Document-based Question Answering

This pseudocode defines the iterative search process of the agent:

1. **Initialization:** Set iteration $t = 0$. Print metadata of all files using `pdfmetadata.sh`.
2. **Loop:** While $t < t_{max}$:
   - Observe the previous state.
   - Generate a Linux command (e.g., `rga`, `pdfgrep`).
   - Execute the command in the shell.
   - **Decision Logic:**
     - If additional context is found: Update the answer.
     - If the final answer is found: Stop searching.
     - Otherwise: Continue searching.
3. **Output:** Return the Final answer.

## 3. Datasets

The study uses a diverse corpus from Llamahub to ensure reproducibility and cover various real-world challenges:

- **PaulGrahamEssay:** Complex argumentative structures.
- **Llama2:** Technical architecture and training methodology.
- **HistoryOfAlexnet:** Impact of CNNs.
- **BlockchainSolana:** Technical documentation and whitepapers.
- **LLM:** Comprehensive survey paper.
- **FinanceBench:** Publicly-traded company filings (10Ks, 10Qs, etc.) from 2015-2023.

## 4. Experiment 1: Baseline RAG Implementation

- **Platform:** Amazon Bedrock (fully-managed).
- **Embedding Model:** Titan Text Embedding Model V2 (1024-dimensional).
- **Strategy:** Fixed 300 token chunking with 20% overlap.
- **Vector Store:** OpenSearch serverless index.
- **Retrieval:** Max 5 chunks.
- **Generation:** Anthropic Claude 3 Sonnet (200K context window, temperature 0.001).

## 5. Experiment 2: Agentic Search Framework

- **Platform:** Amazon Bedrock with Langchain framework.
- **LLM:** Anthropic Claude 3 Sonnet.
- **Reasoning Model:** Standard ReAct (Reasoning and Acting) model.

### 要点

- RAGは事前に埋め込まれたベクトル検索に依存するが、Agentic approachはターミナルコマンド（rga, pdfgrep等）を用いて動的にソースファイルを探索する。
- Algorithm 1は、メタデータの取得から始まり、最大イテレーション数に達するか回答が見つかるまでループするReActベースのロジックを採用している。
- 実験には、技術文書、エッセイ、財務書類（FinanceBench）など、複雑さの異なる多様なデータセットが使用されている。
- ベースラインRAGはAmazon Bedrock、Titan Embedding、OpenSearch、Claude 3 Sonnetで構成されている。

### ビジュアル要素

- Figure 1: RAG（赤）とAgent（青）の対比フロー図。Agent側にはロボットのアイコンとターミナルのアイコンが描かれ、直接Source documentsにアクセスする様子が示されている。
- Algorithm 1: 15行の擬似コード。入力（Query）、パラメータ（Folder, Max iterations）、出力（Final answer）が定義されている。
- テキストレイアウト: 2カラム構成の学術論文形式。左側にアルゴリズムとデータセットの説明、右側にデータセットの続きと実験設定（Experiment 1 & 2）が配置されている。

### スピーカーノート

> このスライドでは、提案するエージェント手法と従来のRAGの構造的な違い、および評価のための実験設定を説明します。Figure 1に注目してください。RAGが固定されたベクトルDB（Knowledge base）に依存するのに対し、エージェントはターミナルを介して直接ソースドキュメントを『検索』します。アルゴリズム1は、このエージェントがどのように試行錯誤して回答に辿り着くかのロジックを示しています。実験では、Claude 3 Sonnetを共通のLLMとして使用し、公平な比較を行っています。

---

## スライド 4: エージェントのオーケストレーション、評価手法、および結果の分析

### 内容

## エージェントのオーケストレーション (Agent Orchestration)

エージェントの動作は、すべての実験において温度設定（temperature）を **0.001** に固定して制御されています。クエリの初期理解に基づき、以下のステップを含むコンテキスト固有の検索戦略を採用します。

- **初期分析**: フォルダ内の利用可能なドキュメントのメタデータ分析から開始。
- **動的検索**: 広範なキーワード検索、または特定の正規表現（regex）パターンを用いたターゲット検索を動的に決定。
- **コンテキスト拡張とエラー処理**: 逐次的なコンテキスト拡張、追加のキーワード検索、およびエラー発生時の自動リトライ（検索パターンの修正を含む）を実行。
- **Linuxシェルの活用**: `LangChain`の実験的シェルツールを介してLinuxシェルコマンドを実行し、ディープ検索を実現。

### 実行可能な主要コマンド

- **PDF Metadata Tool**: ディレクトリおよび個々のファイルのメタデータを出力。
- **RipGrep-All (rga)**: 正規表現ベースのパターンマッチングおよびマルチキーワード検索。
- **PDFGrep**: PDF特有の検索機能、ページ範囲指定、再帰的ディレクトリ検索を提供。

## 評価手法 (Evaluation Methodology)

ベースラインとなるRAG（Retrieval-Augmented Generation）アプローチと比較するため、**RAGAS評価フレームワーク**を使用。以下の主要メトリクスで評価を行います。

- **Faithfulness (忠実性)**: 生成された回答と、根拠として使用されたコンテキストとの間の事実的一貫性を測定。
- **Context Recall (コンテキスト再現率)**: クエリへの回答に関連するすべてのチャンクがどの程度取得されたかを測定。
- **Answer Correctness (回答の正確性)**: 生成された回答と正解（Ground Truth）との事実的な正確性を測定。

※ FinanceBenchデータセットについては、表構造の複雑さを考慮し「Answer Correctness」のみを評価対象としています。

## 結果 (Results)

キーワード検索エージェントは、ベクトルデータベースによるセマンティック検索を使用していないにもかかわらず、RAGベースラインに対して極めて競争力のあるパフォーマンスを示しました。

- **全体的な達成率 (平均)**:
  - Faithfulness: **94.52%**
  - Context Recall: **88.05%**
  - Answer Correctness: **91.48%**
- **特筆すべき成果**:
  - **BlockchainSolanaデータセット**: 再現率と正確性においてRAGの99%以上の性能を達成。
  - **FinanceBench (複雑な文書)**: 従来のRAG（24.24%）に対し、エージェント（**30.40%**）と約6ポイントの改善を達成。動的な検索とコマンド操作の有効性が示されました。

### 要点

- エージェントはLinuxシェルツール（rga, PDFGrep等）を駆使して動的にドキュメントを検索する。
- ベクトルDBを使わないキーワードベースのエージェントながら、RAGベースラインの約9割以上の性能を維持している。
- 複雑な構造を持つFinanceBenchにおいては、従来のRAGを上回る精度（+6%）を記録した。
- コンテキストの理解とエラーハンドリングによる逐次的な検索プロセスが、高い精度の鍵となっている。

### ビジュアル要素

- 2カラム構成の学術論文スタイルのレイアウト。
- 「Evaluation Methodology」および「Results」のセクション見出しによる構造化。
- エージェントが実行するコマンドや評価指標が箇条書きで整理されており、視認性が高い。
- 図表（Table 1, Figure 2等）への言及があり、詳細な数値データがテキスト内で解説されている。

### スピーカーノート

> このスライドでは、提案するキーワード検索エージェントの具体的な仕組みと、その評価結果について説明します。特筆すべきは、ベクトル検索に頼らずとも、Linux標準の検索ツールをエージェントに操作させることで、従来のRAGに匹敵、あるいは複雑な財務書類においてはそれを凌駕する精度を出せている点です。これは、検索に失敗した際のリトライや、メタデータ分析に基づく戦略の変更といった『動的なオーケストレーション』が功を奏していることを示唆しています。

---

## スライド 5: Agentic Keyword Search vs. RAG: 性能評価と結論

### 内容

# Agentic Keyword Search vs. RAG: 性能評価と結論

## 1. 定量的評価 (Table 1)

様々なデータセットにおいて、提案手法（Agent）と従来のRAGのメトリクスを比較した結果、AgentはRAGの性能の約90%以上を達成している。

| Dataset Name           | Faithfulness (Agent/RAG) | Context Recall (Agent/RAG) | Answer Correctness (Agent/RAG) |
| :--------------------- | :----------------------: | :------------------------: | :----------------------------: |
| PaulGrahamEssay        | 0.8662 / 0.9056 (95.65%) |  0.7527 / 0.8583 (87.70%)  |    0.5808 / 0.7268 (79.91%)    |
| Llama2Paper            | 0.7252 / 0.8199 (88.45%) |  0.6148 / 0.8713 (70.56%)  |    0.5823 / 0.6661 (87.42%)    |
| HistoryOfAlexnet       | 0.7280 / 0.7657 (95.08%) |  0.6968 / 0.8330 (83.65%)  |    0.6406 / 0.7073 (90.57%)    |
| BlockchainSolana       | 0.8122 / 0.8627 (94.15%) |  0.7422 / 0.7450 (99.62%)  |    0.5870 / 0.5872 (99.97%)    |
| LLM Survey paper       | 0.8061 / 0.8121 (99.26%) |  0.6355 / 0.6438 (98.71%)  |    0.5123 / 0.5148 (99.51%)    |
| **Average Attainment** |       **94.52 %**        |        **88.05 %**         |          **91.48 %**           |

## 2. FinanceBenchにおける比較 (Table 2)

FinanceBenchデータセットのサブセットを用いた回答正確性の比較では、Agentが従来のRAGを上回る結果となった。

- **Traditional RAG**: 24.24%
- **Agent (3 run Average)**: 32.71%
- **Agent (Run 4)\***: 39.64% (\*公開停止ファイルをデータセットから除外した試行)

## 3. Claude Computer Useとの比較

Anthropic Claude 3.5 Sonnet v2の「Computer Use」機能を用いたエージェントとの比較を実施。

- **動作**: FirefoxでPDFを開き、`Ctrl + F`で検索、スクリーンショットを撮影して回答するワークフロー。
- **結果**: 精度は同等だが、提案手法（Agentic Keyword Search）の方がセットアップが遥かにシンプルで再現性が高い。

## 4. 結論 (Conclusion)

- **主要な成果**: キーワード検索ツールを備えたLLMエージェントは、ベクトルデータベースを維持することなく、従来のRAGの90%以上の性能を達成可能。
- **利点**: 情報が急速に更新される環境や、リソース制約がある場合に堅牢な代替手段となる。
- **制限事項**: 大規模ドキュメントでの性能低下、マルチメディア対応の制限、コンテキストウィンドウの制約、文脈のニュアンス把握の限界（反復的な推論で一部緩和可能）。

### 要点

- 提案手法（Agent）は、5つの主要データセットにおいてRAGの性能の約88%〜95%を達成。
- FinanceBenchでは、Agent（32.71%）が従来のRAG（24.24%）の回答正確性を上回った。
- ClaudeのComputer Use機能と比較して、同等の精度を保ちつつ、よりシンプルで再現性の高い実装であることを確認。
- ベクトルDB不要のRAG代替手法として、特に情報の更新が激しいシナリオで有効。

### ビジュアル要素

- Table 1: AgentとRAGの3つの指標（Faithfulness, Context Recall, Answer Correctness）を5つのデータセットで詳細に比較した表。最終行に平均達成率（Attainment %）を記載。
- Table 2: FinanceBenchにおける回答正確性の比較表。AgentがRAGを凌駕していることを示している。
- Figure 2: BlockchainSolanaとLLM Survey Paperの2つのデータセットにおける、Agent（青）とRAG（オレンジ）の性能を比較したレーダーチャート。3つの指標がほぼ重なっており、性能が肉薄していることを視覚的に示している。

### スピーカーノート

> このスライドでは、提案手法の評価結果と結論を述べています。まずTable 1をご覧ください。AgentはRAGに対して平均90%前後の性能を達成しており、特にLLM Survey paperなどではほぼ同等のスコアです。Table 2のFinanceBenchでは、むしろAgentの方が高い正確性を示しました。また、最新のClaude Computer Use機能とも比較しましたが、精度は同等ながら、我々の手法の方がシンプルで実用的です。結論として、ベクトルDBを構築・維持するコストをかけずに、既存のツールとLLMの推論能力だけで十分なRAG性能が得られることが実証されました。ただし、非常に長い文書やマルチメディアへの対応にはまだ課題が残っています。

---

## スライド 6: References and Future Work

### 内容

## Conclusion and Future Work

...struggles with ambiguous queries and lacks long-term knowledge retention. Furthermore, privacy protections and ethical implications of automated retrieval systems require further investigation, including the implementation of appropriate guardrails such as data access controls and content filtering. Future research will focus on developing more automated, generalizable search strategies that can be useful across document types.

## References

- **Alom, M. Z. et al. (2018).** The history began from alexnet: A comprehensive survey on deep learning approaches. _arXiv preprint arXiv:1803.01164_.
- **Anthropic. (2024).** Introducing Computer Use, a New Claude 3.5 Sonnet, and Claude 3.5 Haiku. Accessed: 2024-11-02.
- **Bender, E. M. et al. (2021).** On the dangers of stochastic parrots: Can language models be too big? _Proceedings of the 2021 ACM conference on fairness, accountability, and transparency_, 610–623.
- **Brown, T. et al. (2020).** Language models are few-shot learners. _Advances in Neural Information Processing Systems_, 33.
- **Chen, J. et al. (2024a).** Benchmarking large language models in retrieval-augmented generation. _Proceedings of the AAAI Conference on Artificial Intelligence_, volume 38, 17754–17762.
- **Chen, Y. et al. (2024b).** Re-Invoke: Tool Invocation Rewriting for Zero-Shot Tool Retrieval. _Findings of the Association for Computational Linguistics: EMNLP 2024_, 4705–4726.
- **Dam, S. K. et al. (2024).** A complete survey on llm-based ai chatbots. _arXiv preprint arXiv:2406.16937_.
- **Es, S. et al. (2023).** Ragas: Automated evaluation of retrieval augmented generation. _arXiv preprint arXiv:2309.15217_.
- **Fan, W. et al. (2024).** A survey on rag meeting llms: Towards retrieval-augmented large language models. _Proceedings of the 30th ACM SIGKDD Conference on Knowledge Discovery and Data Mining_, 6491–6501.
- **Gao, T. et al. (2023a).** Enabling Large Language Models to Generate Text with Citations. _Proceedings of the 2023 Conference on Empirical Methods in Natural Language Processing_, 6465–6488.
- **Gao, Y. et al. (2023b).** Retrieval-augmented generation for large language models: A survey. _arXiv preprint arXiv:2312.10997_.
- **Guo, Z. et al. (2023).** Evaluating large language models: A comprehensive survey. _arXiv preprint arXiv:2310.19736_.
- **Gur, I. et al. (2023).** A real-world webagent with planning, long context understanding, and program synthesis. _arXiv preprint arXiv:2307.12856_.
- **Guu, K. et al. (2020).** Retrieval augmented language model pre-training. _International conference on machine learning_, 3929–3938. PMLR.
- **Hadi, M. U. et al. (2023).** A survey on large language models: Applications, challenges, limitations, and practical usage. _Authorea Preprints_.
- **Hambarde, K. A.; and Proenca, H. (2023).** Information retrieval: recent advances and beyond. _IEEE Access_.
- **Hong, S. et al. (2024).** Data interpreter: An llm agent for data science. _arXiv preprint arXiv:2402.18679_.
- **Hu, S. et al. (2024a).** The Dawn of GUI Agent: A Preliminary Case Study with Claude 3.5 Computer Use. _arXiv:2411.10323_.
- **Hu, X. et al. (2024b).** RefChecker: Reference-based Fine-grained Hallucination Checker and Benchmark for Large Language Models. _arXiv preprint arXiv:2405.14486_.
- **Inaba, T. et al. (2023).** MultiTool-CoT: GPT-3 Can Use Multiple External Tools with Chain of Thought Prompting. _Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics_, 1522–1532.
- **Islam, P. et al. (2023).** Financebench: A new benchmark for financial question answering. _arXiv preprint arXiv:2311.11944_.
- **Izacard, G.; and Grave, E. (2021).** Leveraging Passage Retrieval with Generative Models for Open Domain Question Answering. _Proceedings of the 16th Conference of the European Chapter of the Association for Computational Linguistics_, 874–880.
- **Joshi, M. et al. (2017).** TriviaQA: A Large Scale Distantly Supervised Challenge Dataset for Reading Comprehension. _Proceedings of the 55th Annual Meeting of the Association for Computational Linguistics_, 1601–1611.
- **Kamradt, G. (2023).** LLMTest-NeedleInAHaystack: Doing Simple Retrieval from LLM Models. https://github.com/gkamradt/LLMTest-NeedleInAHaystack.
- **Kumar, V. et al. (2023).** Large-Language-Models (LLM)-Based AI Chatbots: Architecture, In-Depth Analysis and Their Performance Evaluation. _International Conference on Recent Trends in Image Processing and Pattern Recognition_, 237–249. Springer.

### 要点

- 現在のシステムの課題として、曖昧なクエリへの対応、長期的な知識保持の欠如、プライバシー保護、倫理的影響が挙げられている。
- データアクセス制御やコンテンツフィルタリングなどのガードレールの実装が必要である。
- 今後の研究方向として、文書タイプを問わず利用可能な、より自動化され汎用性の高い検索戦略の開発が示唆されている。
- LLM、RAG（検索拡張生成）、AIエージェント、評価ベンチマークに関する広範な参考文献リストが提供されている。

### ビジュアル要素

- 学術論文スタイルの2カラム（2段組み）レイアウト。
- 中央揃えの「References」見出し。
- アルファベット順に並べられた参考文献リスト。
- セリフ体フォントを使用した、標準的な学術誌のフォーマット。

### スピーカーノート

> このスライドでは、本研究のまとめと今後の課題、そして引用文献を示しています。現在のRAGシステムやLLMエージェントが抱える「曖昧な質問への弱さ」や「プライバシー・倫理面でのガードレール」の必要性を強調し、次世代の自動化された検索戦略の重要性を説いています。また、提示している参考文献は、AlexNetから最新のClaude 3.5、RAGのサーベイ論文、FinanceBenchなどのベンチマークまで網羅しており、本発表の技術的根拠を支えるものです。

---

## スライド 7: References (参考文献)

### 内容

## 参考文献一覧

本スライドは、プレゼンテーション内で引用された主要な文献のリストである。内容は2カラム構成で、アルファベット順に並んでいる。

### 文献リスト（左カラム）

- **Kwiatkowski, T., et al. (2019).** Natural questions: a benchmark for question answering research. _Transactions of the Association for Computational Linguistics_.
- **Lála, J., et al. (2023).** Paperqa: Retrieval-augmented generative agent for scientific research. _arXiv preprint_.
- **Lewis, P., et al. (2020).** Retrieval-augmented generation for knowledge-intensive nlp tasks. _NeurIPS_.
- **Li, X., et al. (2021).** From bitcoin to solana–innovating blockchain towards enterprise applications. _International Conference on Blockchain_.
- **Liu, Y., et al. (2019).** RoBERTa: A robustly optimized BERT pretraining approach. _arXiv preprint_.
- **Llamahub (2024).** LlamaHub. https://llamahub.ai/.
- **Mialon, G., et al. (2023).** Augmented language models: a survey. _arXiv preprint_.
- **OpenAI (2025).** Introducing Operator. _OpenAI_.
- **Pang, R. Y., et al. (2022).** QuALITY: Question Answering with Long Input Texts, Yes! _NAACL-HLT_.
- **Parisi, A., et al. (2022).** Talm: Tool augmented language models. _arXiv preprint_.
- **Prince, M. H., et al. (2024).** Opportunities for retrieval and tool augmented large language models in scientific facilities. _npj Computational Materials_.
- **Qu, C., et al. (2024).** Tool Learning with Large Language Models: A Survey. _arXiv preprint_.
- **Raffel, C., et al. (2020).** Exploring the limits of transfer learning with a unified text-to-text transformer. _JMLR_.
- **Rakin, S., et al. (2024).** Leveraging the Domain Adaptation of Retrieval Augmented Generation Models for Question Answering and Reducing Hallucination. _arXiv preprint_.

### 文献リスト（右カラム）

- **Touvron, H., et al. (2023).** Llama 2: Open foundation and fine-tuned chat models. _arXiv preprint_.
- **van Schaik, T. A., & Pugh, B. (2024).** A field guide to automatic evaluation of llm-generated summaries. _SIGIR_.
- **Vaswani, A., et al. (2017).** Attention is all you need. _NeurIPS_.
- **Wang, C., et al. (2023a).** Survey on factuality in large language models: Knowledge, retrieval and domain-specificity. _arXiv preprint_.
- **Wang, G., et al. (2023b).** Voyager: An open-ended embodied agent with large language models. _arXiv preprint_.
- **Wu, Q., et al. (2024).** ToolPlanner: A Tool Augmented LLM for Multi Granularity Instructions with Path Planning and Feedback. _EMNLP_.
- **Xu, B., et al. (2023).** Gentopia.AI: A Collaborative Platform for Tool-Augmented LLMs. _EMNLP System Demonstrations_.
- **Xu, P., et al. (2022).** Megatron-LM: Training multi-billion parameter language models using model parallelism. _arXiv preprint_.
- **Xu, Y., et al. (2024).** Face4RAG: Factual Consistency Evaluation for Retrieval Augmented Generation in Chinese. _SIGKDD_.
- **Yang, Z., et al. (2018).** HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering. _EMNLP_.
- **Yao, S., et al. (2022).** React: Synergizing reasoning and acting in language models. _arXiv preprint_.
- **Yu, T., et al. (2024).** In defense of rag in the era of long-context language models. _arXiv preprint_.
- **Yuan, S., et al. (2024).** Easytool: Enhancing llm-based agents with concise tool instruction. _arXiv preprint_.

### 要点

- RAG（検索拡張生成）に関する重要論文（Lewis et al. 2020, Yu et al. 2024等）を網羅
- ツール利用型LLM（Tool-augmented LLMs）やエージェントに関する最新文献（ReAct, Voyager, ToolPlanner等）が含まれる
- Transformer（Attention is all you need）やLlama 2、RoBERTaなどの基盤モデルの論文も参照
- 2024年〜2025年の非常に新しい発表（OpenAI Operator 2025等）までカバーされている

### ビジュアル要素

- 2カラムのテキストレイアウト
- セリフ体フォントを使用したアカデミックなスタイル
- 図表はなく、文字情報のみで構成されたリファレンススライド

### スピーカーノート

> このスライドは、本発表の根拠となる主要な文献リストです。特にRAGの有効性や、LLMによるツール操作（Tool-use）、エージェント化に関する最新の研究成果を幅広く引用しています。詳細な出典を確認したい場合は、こちらのリストをご参照ください。

---

## スライド 8: Appendix: Agent Terminal Tool Instructions & Example Run

### 内容

# Appendix

## References (Continued)

- **Zhao, S. et al. (2024a)**: "Retrieval Augmented Generation (RAG) and Beyond: A Comprehensive Survey on How to Make your LLMs use External Data More Wisely." _arXiv preprint arXiv:2409.14924_.
- **Zhao, W. X. et al. (2024b)**: "Dense text retrieval based on pretrained language models: A survey." _ACM Transactions on Information Systems_, 42(4): 1–60.
- **Zhao, Y. et al. (2024c)**: "Felm: Benchmarking factuality evaluation of large language models." _Advances in Neural Information Processing Systems_, 36.

## Agent terminal tool instructions

We use the standard zero-shot agent template from **LangChain**, providing a detailed description of the following tools accessible via the terminal:

### 1. terminal

Run shell commands on this Linux machine to search information in the `files/` folder. The commands to use are:

#### `pdfmetadata.sh`

- **Requirement**: YOU MUST first print details of PDF files in the `files/` folder (ALWAYS start with this without any changes).
- **Command**: `sh pdfmetadata.sh`
- **Purpose**: Provides file-level metadata useful for narrowing down the search before using `rga` or `pdfgrep`.

#### `rga`

- **Description**: A command-line tool to search through files via keyword searches and regex patterns.
- **Usage**:
  - Search term in specific file: `rga 'searchterm\w*' ./files/filename.pdf`
  - Multiple keywords across multiple files: `rga 'keyword1|keyword2|keyword3' ./files/`
  - Case insensitive: Use `-i`.

#### `pdfgrep`

- **Description**: Specifically for searching within PDFs. Useful for page ranges.
- **Usage**:
  - Search folder with page range: `pdfgrep -inrP --page-range 1-4 '(keyword1|keyword2)' ./files/` (Note: `-i` case insensitive, `-n` page numbers, `-r` recursive, `-P` perl regex).
  - Search specific file patterns: `pdfgrep -r --include "foo*.pdf" pattern`

### Other tips:

- If a complex query fails, try a series of simpler queries.
- **Context**: ALWAYS try to return larger context with `-C 5` to get 2 or more lines around the match.
- **Workflow**: Remember to run `sh pdfmetadata.sh` first to understand the file structure.
- **Action Format**: Action should always be "terminal" and action input is the full command.

## Example detailed agent run

Table 3 (referenced) shows a partial run of the agent's execution. The process follows these steps:

1. **Metadata Discovery**: Uses `pdfmetadata` to see available files.
2. **Broad Search**: Uses `rga` to find content related to "Hyperledger fabric".
3. **Deep Dive**: Uses `pdfgrep` on specific pages to extract the exact context required for the final answer.

---

_Footnote: Source code available at [https://github.com/amazon-science/aws-research-science/tree/main/ShellAgent](https://github.com/amazon-science/aws-research-science/tree/main/ShellAgent)_

### 要点

- LangChainのzero-shotエージェントを使用し、Linuxターミナル経由でローカルファイルを操作する仕組みを解説している。
- 検索ツールとして `rga` (ripgrep-all) と `pdfgrep` を使い分けている。
- エージェントの基本動作フロー：メタデータ確認 → 広域検索 → 特定ページの深掘り。
- 精度向上のためのTips（コンテキスト `-C 5` の付与や、失敗時のクエリ簡略化）が明文化されている。

### ビジュアル要素

- 2カラム構成の学術論文スタイルレイアウト。
- ツール説明部分には行番号（1〜40）が付与されており、プロンプトエンジニアリングにおける指示の構造化を示唆している。
- コマンドやファイル名は等幅フォント（Monospace）で記述され、視覚的に区別されている。
- 右下にGitHubリポジトリへのリンクを含む脚注がある。

### スピーカーノート

> このスライドは、提案手法であるエージェントが実際にどのようにターミナルツールを使いこなすかの詳細なプロンプト（指示書）とワークフローを説明しています。特に、最初にメタデータを確認させるという制約を設けることで、エージェントが闇雲に検索するのを防ぎ、効率的な情報抽出を実現している点がポイントです。GitHubで公開されているコードと合わせて参照することで、実装の再現性が担保されています。

---

## スライド 9: スライド 9

### 内容

```json
{
  "title": "Computer Use Agent Interactions",
  "content": "# Computer Use Agent Interactions\n\nこのスライドは、Computer Useエージェントがコマンドラインツールや直接的なファイル操作を用いて、PDFドキュメントから情報を抽出・検証する能力を、具体的な対話例（Table 3およびTable 4）を通して示しています。ベクトルデータベースに依存せず、動的にツールを使い分ける点が特徴です。\n\n## Table 3: キーワード検索ツールを用いたエージェントの実行プロセス（部分）\n\nHyperledger Fabricに関する質問に対し、エージェントが思考し、ツールを実行して回答を導き出すプロセスが示されています。\n\n| ステップ (Step) | エージェントの観察・行動 (Agent observation) |\n| :--- | :--- |\n| **Question** | Hyperledger Fabricの3つの主要コンポーネントと、それぞれの役割は何か？ |\n| **Action input** | `sh pdfmetadata.sh` |\n| **Observation** | `./files/Blockchain-Solana.pdf` などのメタデータを出力。 |\n| **Thought** | メタデータには直接的な回答がないため、`rga` や `pdfgrep` を使用して「Hyperledger Fabric components」などのフレーズを検索する必要があると判断。 |\n| **Action input** | `rga -i 'hyperledger fabric components \| fabric architecture' ./files/` |\n| **Observation** | `BlockchainSolana.pdf` の14ページと15ページにアーキテクチャ図（Fig. 9）があることを発見。 |\n| **Action input** | `pdfgrep -inrP --page-range 14-16 '(component \| architecture)' ./files/BlockchainSolana.pdf -C 5` |\n| **Final Answer** | **Hyperledger Fabricの3つの主要コンポーネント:**<br>1. **Membership**: 識別サービスを提供し、ノードのシステムアクセスを許可する。<br>2. **Blockchain**: 分散レジャーのコンセンサスサービスを提供。<br>3. **Chaincode**: ブロックチェーンネットワーク上で実行されるプログラム（スマートコントラクト）。 |\n\n---\n\n## Table 4: Computer Useエージェントのクエリ例 - Part 1 (American Express 2022年財務諸表)\n\nAmerican Expressの2022年財務諸表に関する質問に対し、エージェントが回答（Output）とその根拠となる文脈（Context）を提示しています。\n\n### クエリ 1: 登録済み負債証券について\n- **Question**: 2022年時点で、American Expressの名義で国内証券取引所に登録されている負債証券（debt securities）はどれか？\n- **Output**: 2022年時点で、ニューヨーク証券取引所にシンボル「AXP」で登録されているのは普通株式（1株あたり額面0.20ドル）のみ。国内証券取引所に登録されている負債証券はない。\n- **Context**: 会社側は「Section 12(b)に基づき登録された証券」として普通株式のみを明記している。多額の負債証券を発行しているが、それらは上場されていない。格付け（Moody's, S&P, Fitch）は維持しているが、主にプライベート/機関投資家向けチャネルで発行されている。\n\n### クエリ 2: 主要な事業地域について\n- **Question**: 2022年時点で、American Expressが主に事業を展開している地域はどこか？\n- **Output**: 米国を中心にグローバルに展開。2022年の純収益の約78%が米国、22%が国際業務から。米国以外では、英国、日本、EU、オーストラリア、カナダ、メキシコでの存在感が大きい。\n- **Context**: ネットワークパートナーシップを通じて約103の国・地域で事業を展開。地域構造は、米国、EMEA（欧州・中東・アフリカ）、APAC（アジア太平洋・豪州・NZ）、LACC（中南米・カナダ・カリブ海）に分かれている。国際業務はInternational Card Services (ICS) セグメントを通じて管理されている。",
  "keyPoints": [
    "エージェントは、メタデータ確認、全文検索(rga)、特定箇所の抽出(pdfgrep)といったツールを段階的に使い分ける能力を持つ",
    "ベクトルDBを使わずに、生のPDFファイルから直接、正確な数値や固有名詞、文脈を抽出できる",
    "回答だけでなく、その根拠となる詳細な「Context（文脈）」を提示することで、信頼性を担保している",
    "American Expressの事例では、財務諸表の注釈やセグメント情報まで深く読み取っている"
  ],
  "visualElements": [
    "2カラム構成の学術論文スタイルのレイアウト",
    "左カラム：エージェントの思考プロセスを時系列で示すTable 3",
    "右カラム：特定の質問に対する最終的な回答と文脈をまとめたTable 4",
    "等幅フォントを用いたコマンドライン入力（Action input）の強調"
  ],
  "speakerNotes": "このスライドでは、Computer Useエージェントが実際にどのように「考えて」ツールを動かしているかを示しています。左側のTable 3に注目してください。最初はメタデータを確認し、そこに必要な情報がないと分かると、即座に全文検索ツールに切り替えています。これは人間が資料を探すプロセスを模倣しています。右側のTable 4は、その結果として得られる回答の質を示しています。単に「はい/いいえ」で答えるのではなく、なぜその結論に至ったのか、財務諸表のどのセクションに基づいているのかという背景（Context）まで詳細に説明できています。これにより、複雑な財務分析においてもAIが実用的なアシスタントになり得ることを証明しています。"
}
```

---
