# 設計決定事項: docs/ 内の矛盾点解消

- **作成日**: 2026-04-11
- **対象**: `docs/architecture.md`, `docs/ui-architecture.md`, `docs/skill-stack.md`, `docs/reference.md`
- **目的**: 既存の設計ドキュメント間で発見された矛盾点・曖昧点を整理し、実装着手前に必要な決定を確定する
- **ステータス**: 承認済み（2026-04-11 ユーザー承認）

---

## 0. 背景

`docs/` 配下の 4 ファイル（計約 3000 行）をレビューした結果、実装を開始すると詰まる矛盾・曖昧点が 13 件見つかった。本ドキュメントはこれらを重要度別に整理し、各論点の決定事項を記録する。

本ドキュメントは既存ドキュメントを上書きせず、**決定の単独記録** として残す。既存ドキュメントへの反映は別ステップ（後述「7. 既存ドキュメントへの反映指示」）で行う。

---

## 1. 用語の整理

| 用語                      | 定義                                                      |
| ------------------------- | --------------------------------------------------------- |
| **Strands Agents**        | AWS 公式 Python SDK。エージェント実装レイヤー             |
| **AgentCore Runtime**     | Strands Agents を実行する AWS マネージドランタイム        |
| **AgentCore Gateway**     | Lambda ツールをエージェントに公開する MCP 互換レイヤー    |
| **AgentCore Memory**      | 長期/短期記憶のマネージド層。semantic retrieval 向け      |
| **AgentCore Identity**    | エージェント側のユーザーコンテキスト管理。外部 IdP を統合 |
| **AgentCore Evaluations** | Offline 評価フレームワーク。golden dataset + LLM-as-judge |
| **BFF**                   | Next.js Route Handlers が担うバックエンド層               |
| **FCT2020**               | 文部科学省「食品成分表 2020(八訂)」                       |

---

## 2. Critical 決定事項

### 2.1 Runtime 境界 — Hybrid アーキテクチャ

**問題**: `skill-stack.md` は Strands Agents (Python) + Lambda を前提とする一方、`architecture.md` は TypeScript interface で型・関数シグネチャを定義しており、実装言語と実行場所が不明確だった。

**決定**:

```
Next.js (TS, BFF/auth)
  │
  ├── cookie session → Cognito (user auth)
  │
  ├── 経路 A: Agent reasoning が必要な呼出
  │    └─ API Gateway ──JWT──→ AgentCore Runtime
  │                             │
  │                             ├─ AgentCore Identity (JWT 検証 + user context)
  │                             │
  │                             └─ Strands Agents (Python, Orchestrator)
  │                                │
  │                                ├─ in-process tools (純粋計算)
  │                                │  ├─ calculateCaloriesAndMacros
  │                                │  ├─ calculateHydrationTarget
  │                                │  ├─ recommendSupplements
  │                                │  └─ evaluateSafety (ルールベース)
  │                                │
  │                                ├─ AgentCore Memory (行動パターン観測)
  │                                │
  │                                └─ AgentCore Gateway ──→ Lambda tools (I/O 重)
  │                                                         ├─ generateMealPlan
  │                                                         └─ suggestSnackSwaps
  │
  ├── 経路 B: 単純 CRUD（Agent 不要）
  │    └─ API Gateway ──JWT──→ Lambda (直接)
  │                             ├─ fetchUserProfile / updateUserProfile
  │                             ├─ logMeal
  │                             ├─ logWeight
  │                             └─ fetchWeeklyPlan (cached)
  │
  └── 経路 C: 自社 AWS backend を経由しない（外部 SaaS 直接）
       └─ Next.js Route Handler ──HTTPS──→ Anthropic API (外部 SaaS)
          └─ Coach prompt 生成 (onboarding 画面遷移ごと)

EventBridge (cron) ──→ Lambda ──invoke──→ AgentCore Runtime (週次レビュー事前生成)
```

**経路ルール**:

- **自社 AWS backend（AgentCore Runtime / Lambda）への呼出は、必ず API Gateway を経由する**。Lambda Function URL の直接呼出は禁止
- 外部 SaaS（Anthropic, PostHog 等）への呼出はこのルールの対象外。Route Handler から直接 HTTPS で呼んでよい

| ユースケース                                                | 経路  | 呼出先                                                             |
| ----------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| Chat (streaming) / Plan 生成 / Weekly review                | **A** | API Gateway → AgentCore Runtime → Strands                          |
| UserProfile 取得/更新、Meal/Weight log、Plan キャッシュ取得 | **B** | API Gateway → Lambda (Strands を経由しない)                        |
| Coach prompt 生成 (onboarding)                              | **C** | Route Handler → Anthropic API 直接 (外部 SaaS、AWS backend 非経由) |

**判断基準**:

- LLM 推論 + 会話文脈 + ツール呼出が必要 → **経路 A**
- 単純な read/write のみ、LLM 不要 → **経路 B**
- 軽量 LLM 呼出のみ、AgentCore の会話文脈・DB アクセスが不要 → **経路 C**（API Key は環境変数で Route Handler にのみ注入）

**判断ルール**:

- **I/O なしの純粋関数** → Strands Agents プロセス内 Python tool
- **DB / 外部 API アクセスあり** → Lambda tool via AgentCore Gateway
- **長期記憶** → AgentCore Memory（自前 DB に二重管理しない）
- **認証・セッション** → Next.js BFF + Cognito

**契約 (DTO) の single source of truth**: **Pydantic v2 モデル**

**生成パイプライン**:

1. Pydantic v2 モデルで定義 — Python 側の唯一の真実。共有パッケージ `packages/contracts-py/` に配置
2. `model.model_json_schema()` を CI で実行し、全モデルの JSON Schema を `contracts/schemas/*.json` に出力
3. **TypeScript 型**: `json-schema-to-typescript` で `contracts/schemas/*.json` → `packages/contracts-ts/types/*.d.ts` を生成
4. **Zod スキーマ**: `json-schema-to-zod` で同 JSON Schema → `packages/contracts-ts/schemas/*.ts` を生成。Next.js BFF の runtime 入出力検証に使用
5. Python 側 (Strands/Lambda) は Pydantic モデルを直接 import

**Note**: `openapi-typescript` は OpenAPI 3.x 入力専用で、本パイプラインでは使わない。OpenAPI spec をエンドポイント層で別途自動生成して API クライアント生成に使う場合のみ、後日導入を検討する。

`architecture.md` の TypeScript interface は実装言語ではなく「契約仕様」として読み替える。

---

### 2.2 Onboarding 実装形態 — Structured flow + LLM-generated coach copy

**問題**: `ui-architecture.md` は固定フォーム画面（Safety→Stats→...）を記述する一方、`architecture.md` の Orchestrator/Intake Collector は LLM による動的質問を前提としていた。

**決定**:

- **順序・必須項目・入力 UI は固定** — `NumberField`, `ChoiceChips`, `SegmentedControl` 等を使う
- **各画面上部の Coach prompt は LLM 動的生成** — 直前セクションの回答を受けてパーソナライズ
- **各画面に optional な free-text 欄** — LLM が自然文を parse して UserProfile を補完
- **Safety 画面は LLM parse 無効** — 医療境界は決定的ルールのみ
- **Review 画面** — Strands Agents が入力網羅を検証してから Plan 生成へ進む

**実装メモ**:

- Coach prompt 生成は Next.js BFF → 軽量 LLM (Claude Haiku 等) を呼ぶ。Strands Agents は onboarding 画面遷移では起動しない
- Free-text parse は次画面遷移時の非同期裏タスクとして実行し UX をブロックしない
- 既に入力済みの構造化データは onboarding context に引き継ぎ、プロンプト生成時に渡す

---

### 2.3 MVP Phase 分け — 軽量週次チェックインを Phase 1 に追加

**問題**: `architecture.md 21章` は MVP に「週次チェックイン」を含むが、`ui-architecture.md 24章 Phase 1` は Progress/Weekly Review を外していた。さらに UI 仕様には体重入力画面が欠落していた。

**決定**:

**Phase 1 に追加する要素**（最小実装）:

1. **WeeklyCheckInScreen** — 1 画面、Home または通知から起動
   - 今週の記録サマリー（記録食事数、protein 達成率、water 達成率）
   - LLM 生成の 3-5 行レビュー（良かった点 + 改善 1 点）
   - 「来週も続ける」CTA
   - **体重グラフなし / チャートなし**
2. **週次レビュー通知** — EventBridge cron → in-app バッジまたは push（通知設定画面は Phase 2）
3. **体重入力モーダル** — Home Quick Actions または Profile から開く簡易入力、継続性要求なし

**Phase 2 に残すもの**:

- Progress ページ全体（体重グラフ・多指標・期間切替）
- 通知設定画面
- Shopping support

**`ui-architecture.md 24章 Phase 1` の更新指示**:

- 「Weekly Check-in (lightweight)」を追加
- 「Weight logging (optional modal)」を追加

---

## 3. Important 決定事項

### 3.1 認証ストーリー

**決定**: Cognito と AgentCore Identity は **補完関係**。両方使う。

| レイヤー               | 役割                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| **Cognito**            | user auth (signup, login, MFA, password reset, JWT 発行)                 |
| **Next.js BFF**        | HttpOnly cookie でセッション管理、JWT を AgentCore へ中継                |
| **AgentCore Identity** | JWT 検証 + agent 側の user context + Memory スコープ + tool 呼出 binding |

Cognito 単独だと agent 側の scoping が手動になる。AgentCore Identity 単独だと user-facing 画面の auth フロー実装が必要になる。両方採用が正解。

---

### 3.2 DB 選択 — DynamoDB single-table design

**決定**: **DynamoDB** を主 DB として採用。分析は S3 export + Athena で batch 処理。

**根拠**:

- アクセスパターンが user-scoped（`pk = user#<id>`, `sk = plan#2026-04-11` 等）で single-table に素直にはまる
- Lambda からの接続プール問題なし
- 週次集計は日次 export → Athena で十分
- Aurora Serverless v2 は idle コスト + RDS Proxy の運用負荷があり MVP には過剰

**テーブル構造の基本案**:

| pk            | sk                     | 用途                                  |
| ------------- | ---------------------- | ------------------------------------- |
| `user#<id>`   | `profile`              | UserProfile                           |
| `user#<id>`   | `plan#<weekStart>`     | WeeklyPlan                            |
| `user#<id>`   | `meal#<date>#<mealId>` | MealLog                               |
| `user#<id>`   | `weight#<date>`        | WeightLog                             |
| `user#<id>`   | `medical`              | Medical flags (Safety Guard 専用読取) |
| `food#<id>`   | `meta`                 | FoodCatalog item                      |
| `recipe#<id>` | `meta`                 | RecipeTemplate                        |

GSI は `sk` ベースの timeline クエリ用に追加予定（MVP では不要の可能性大、実装時判断）。

---

### 3.3 Food/Nutrition DB のソース

**決定**: **文部科学省「食品成分表 2020(八訂)」(FCT2020)** を基盤とし、recipe template は **手動キュレーション** で作成。

**理由**:

- 公開・無償・日本語・原典として信頼性最高
- 約 2500 品目の生鮮食品・調味料・基本食材を網羅
- MVP は減量向け家庭料理 + 簡易調理の範囲で十分
- 商用 API（Nutritionix 等）は契約・レート制限・月額料金の負担がある

**データ取得手順**（実装時）:

1. FCT2020 CSV を公式サイトからダウンロード
2. ETL スクリプトで DynamoDB `FoodCatalog` に投入
3. recipe template を 100-200 件手動で作成し `RecipeTemplate` に投入
4. recipe → FCT2020 food_id 参照でマクロ計算

**Phase 2 に延期**:

- コンビニ商品データ（3 社 API 連携または手動スクレイプ）
- ユーザー投稿食品

---

### 3.4 Agent ↔ UI 通信プロトコル

**決定**: **REST をメイン、Chat のみ SSE streaming**。経路は 2.1 の経路 A/B/C ルールに従う。

| エンドポイント           | プロトコル   | 経路 | 実装                                                                                      |
| ------------------------ | ------------ | ---- | ----------------------------------------------------------------------------------------- |
| Onboarding 入力送信      | REST POST    | B    | Next.js Route Handler → API Gateway → Lambda (updateUserProfile)                          |
| Coach prompt 生成        | REST POST    | C    | Next.js Route Handler → Anthropic API 直接 (外部 SaaS、自社 AWS backend 非経由)           |
| UserProfile 取得/更新    | REST GET/PUT | B    | Next.js Route Handler → API Gateway → Lambda                                              |
| Plan 取得                | REST GET     | B    | Next.js Route Handler → API Gateway → Lambda (cached WeeklyPlan)                          |
| Plan 生成                | REST POST    | A    | Next.js Route Handler → API Gateway → AgentCore Runtime（10 秒超過時は非同期化を再検討）  |
| Chat メッセージ          | **SSE**      | A    | Vercel AI SDK `useChat` → Next.js Route Handler (proxy) → API Gateway → AgentCore Runtime |
| Weekly check-in 取得     | REST GET     | B    | Next.js Route Handler → API Gateway → Lambda（事前生成結果を読み出し）                    |
| Weekly check-in 事前生成 | N/A          | cron | EventBridge → Lambda → API Gateway → AgentCore Runtime (server-to-server)                 |

**除外**:

- WebSocket（双方向リアルタイムが不要）
- tRPC（Pydantic 契約との整合を優先）
- Lambda Function URL 直接呼出（全て API Gateway 経由で統一）
- TanStack AI / Code Mode（Code Mode は TS 生成 sandbox 実行が前提だが、本 agent は Python/Strands で実装し、math は既に純粋関数に逃がしているため利得なし。Phase 2+ で TS-only 軽量 agent が必要になった場合の再検討候補として Section 8 に記録）

---

#### 3.4.1 フロントエンド AI SDK

**決定**: **Vercel AI SDK v6**（`ai` + `@ai-sdk/react`）を採用する。

**使い分け**:

| 用途                           | パッケージ / API                                                  | 経路 |
| ------------------------------ | ----------------------------------------------------------------- | ---- |
| Chat 画面の streaming          | `@ai-sdk/react` の `useChat` + `DefaultChatTransport`             | A    |
| Coach prompt 生成 (onboarding) | `ai` パッケージの `generateText`（server-only, Route Handler 内） | C    |
| Weekly check-in レビュー生成   | Lambda 内のため AI SDK 非使用（Strands + Anthropic Python SDK）   | cron |

**Route Handler は adapter として機能する**:

AgentCore Runtime の response 形式は Vercel AI SDK の UIMessageStream と直接互換ではない。そのため Next.js Route Handler (`/api/chat`) が **変換 adapter** を担う。

```
[Client]
  @ai-sdk/react: useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' })
  })

[/api/chat Route Handler — adapter]
  1. Cognito JWT をリクエストから取り出す
  2. API Gateway → AgentCore Runtime に SSE 接続
  3. Strands からの response chunk を受信
  4. createUIMessageStream() で AI SDK 互換形式に再構成
  5. toUIMessageStreamResponse() で Client に返す
```

**Provider 選択**:

- **MVP**: Anthropic を直接指定（`@ai-sdk/anthropic`）
- **Phase 2**: Vercel AI Gateway 経由（`provider/model` 文字列指定）に切り替えてフェイルオーバー・observability・コスト管理を追加

**重要な注意**:

- Chat 以外の LLM 呼出（Coach prompt 生成）は **経路 C** で、Route Handler 内から直接 `generateText` を呼ぶ。AgentCore Runtime を経由しない
- Vercel AI SDK は Next.js 側のみで使用。Strands Agents (Python) 側の LLM 呼出は Anthropic Python SDK または Strands 内蔵の model provider を使う

---

### 3.5 AgentCore Memory と 16章 メモリ設計のマッピング

**source of truth の原則**: 構造化データと Memory を**同じ項目で二重管理しない**。役割を明確に分ける。

- **DynamoDB** = ユーザーが UI（onboarding / Profile 画面 / Settings）で**明示的に入力・編集する構造化データ**。編集 UI がある全ての項目はここが唯一の真実。
- **AgentCore Memory** = 会話から agent が**推論・観測する行動パターンや非構造化事実**。UI で直接編集できず、chat 会話の副産物として蓄積される。

これにより双方向同期が不要になり、更新のたびの同期ズレが発生しない。

**決定（項目別マッピング）**:

| データ                                                                                                           | 保存先                            | 書き込み元                                            |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------- |
| UserProfile 構造化データ全般（年齢・身長・体重・目標）                                                           | **DynamoDB**                      | Onboarding / Profile 画面（構造化入力）               |
| `favoriteMeals` / `hatedFoods` / `restrictions` / `cookingPreference` / `snackTastePreference` 等 明示入力の嗜好 | **DynamoDB (UserProfile)**        | Onboarding (ChoiceChips/MultiTagInput) / Profile 画面 |
| WeeklyPlan / MealLog / WeightLog                                                                                 | **DynamoDB**                      | Plan 生成 Lambda / ログ記録 API                       |
| 医療情報（疾患・服薬・既往）                                                                                     | **DynamoDB (scoped)**             | Onboarding Safety 画面のみ                            |
| 「夕食後に甘いものを欲しがる傾向」等の**行動パターン観測**                                                       | **AgentCore Memory (long-term)**  | Chat 会話から agent が推論・記録                      |
| 「特定の曜日に外食率が高い」等の**生活リズム観測**                                                               | **AgentCore Memory (long-term)**  | Chat / WeeklyReview から agent が記録                 |
| 「このルールは続きやすかった」等の**継続成功パターン**                                                           | **AgentCore Memory (long-term)**  | WeeklyReview の結果から agent が記録                  |
| セッション内の会話履歴（short-term）                                                                             | **AgentCore Memory (short-term)** | AgentCore Runtime が自動管理                          |

**重要な制約**:

1. **医療情報は AgentCore Memory に入れない** — LLM が chat で意図せず言及するリスク。DynamoDB の保護 attribute に限定し、Python の Safety Guard モジュールだけが読む
2. **UI で編集できる項目は必ず DynamoDB が source** — Memory に同じ項目を書いてはいけない
3. **agent は DynamoDB からは構造化データを取得し、Memory からは行動パターンを検索する** — 両者を混ぜない

---

### 3.6 単位系切替

**決定**: **MVP は cm/kg 固定。単位切替機能は Phase 2 に延期**

- 日本在住主想定なので lb/ft ユーザーは少ない
- 内部型 `heightCm` / `weightKg` は変更せず
- `ui-architecture.md 13章 Settings` の「単位設定」項目を Phase 2 表記に変更
- Phase 2 で実装する場合は「内部は SI 固定 / 表示のみ locale 変換」方式を採る（内部型を変えない）

---

## 4. Minor 決定事項

### 4.1 評価指標と AgentCore Evaluations の紐付け

**決定**: 指標を 3 層に分け、それぞれの計測手段を明確化する。

| 層                              | 指標例                                                 | 計測手段                                                    |
| ------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| **Offline eval (決定論)**       | カロリー計算一致率、マクロ計算一致率、危険ケース遮断率 | AgentCore Evaluations + golden dataset JSON + CI 回帰テスト |
| **Offline eval (LLM-as-judge)** | 食事制約反映率、不足情報追加質問精度、説教臭さの少なさ | AgentCore Evaluations + rubric + judge LLM 自動採点         |
| **Product analytics**           | 7 日継続率、4 週継続率、食事ログ入力率、再訪率         | PostHog（後述 4.4 参照）                                    |

`architecture.md 18章` の評価データセット案（正常系 / 注意系 / block 系）を AgentCore Evaluations の YAML に落とす。

---

### 4.2 UI コンポーネント構成 — shadcn/ui + domain 2 層

**決定**: 2 層構造で再定義する。

```
components/
├── ui/          ← shadcn/ui primitives（shadcn CLI で管理、手動編集禁止）
│   ├── button.tsx, input.tsx, card.tsx, dialog.tsx, tabs.tsx, progress.tsx, ...
└── domain/      ← ui-architecture.md 17章の独自コンポーネント
    ├── MealCard.tsx            (Card + Badge + Button)
    ├── CoachInsightCard.tsx    (Card + Icon + 独自背景)
    ├── CoachPromptCard.tsx     (Card + Avatar + streaming text)
    ├── ProgressRing.tsx        (独自 SVG 実装)
    ├── BottomTabBar.tsx        (独自、shadcn 非対応)
    ├── SwapModal.tsx           (Dialog + MealCard list)
    ├── DailySummaryCard.tsx    (Card + 数値表示 3 種)
    ├── ActionChecklistCard.tsx (Card + Checkbox list)
    ├── WeeklyCheckInScreen.tsx (Card 複合)
    ├── CautionBanner.tsx       (Alert)
    ├── DangerNoticeCard.tsx    (Card + warning palette)
    └── ...
```

**ルール**:

- `components/ui/` は shadcn CLI で追加・更新する。手動編集しない
- `components/domain/` は全て shadcn primitives の composition として実装する
- shadcn に無い部品（BottomTabBar, ProgressRing 等）のみ独自実装する

---

### 4.3 料金/課金モデル

**決定**: **MVP は invite-only ベータ、完全無料。課金設計は使用量データ観測後に決定する**

**MVP の制約**:

- waitlist または招待コード方式でサインアップを制御（Cognito の pre-signup Lambda trigger で招待コード検証）
- 新規登録を定期的に停止/再開できる運用スイッチを BFF 側に用意（環境変数 or DynamoDB 設定レコード）
- LLM 呼出回数 / user / 月 を上限付きにする（例: Plan 生成 4 回、Chat 100 メッセ）。上限チェックは Next.js BFF と Lambda tool で共通の DynamoDB カウンタを参照して強制

**Phase 2 以降**: subscription を軸に検討。想定価格帯 月 $9-15。

---

### 4.4 分析イベント送信先

**決定**: **PostHog (cloud EU または self-hosted)**

**理由**:

- 無料枠 100 万 events/月で MVP に十分
- Product analytics UI が retention/funnel 分析に特化（Amplitude 並）
- Session replay 同梱（onboarding 離脱の原因調査に強い）
- Open source + self-host オプションで将来のデータ主権確保
- Next.js SDK 公式、React Server Components 対応

`ui-architecture.md 23章` のイベント命名（`onboarding_started`, `home_viewed`, ...）をそのまま PostHog に送信する。

**除外**:

- Amplitude（session replay 別料金）
- Vercel Analytics（web analytics 寄り）
- CloudWatch/Athena（UI が貧弱）
- Mixpanel（無料枠が小さい）

---

## 5. 決定事項サマリー表

| #   | 区分      | 論点              | 決定                                                                                                              |
| --- | --------- | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Critical  | Runtime 境界      | Hybrid: 純粋計算 = in-process Python / I/O = Lambda via Gateway / 契約 = Pydantic                                 |
| 2   | Critical  | Onboarding 形態   | 固定ステップ UI + LLM 生成 Coach prompt + free-text 補完 / Safety は決定的                                        |
| 3   | Critical  | MVP Phase         | Phase 1 に軽量 WeeklyCheckInScreen + 体重入力モーダル + 週次通知を追加                                            |
| 4   | Important | 認証              | Cognito (user auth) + AgentCore Identity (agent scope) の補完構成                                                 |
| 5   | Important | DB 選択           | DynamoDB single-table + S3 export + Athena                                                                        |
| 6   | Important | Food DB           | FCT2020 基盤 + 手動 recipe template、コンビニは Phase 2                                                           |
| 7   | Important | 通信プロトコル    | REST + Chat のみ SSE (Vercel AI SDK)                                                                              |
| 8   | Important | Memory マッピング | 明示入力嗜好 + 構造化 = DynamoDB (source of truth) / 行動パターン観測 = AgentCore Memory / 医療 = DynamoDB scoped |
| 9   | Important | 単位系            | MVP は cm/kg 固定、切替は Phase 2                                                                                 |
| 10  | Minor     | 評価指標          | Offline = AgentCore Evaluations / Product = PostHog                                                               |
| 11  | Minor     | UI コンポーネント | `components/ui/` (shadcn) + `components/domain/` の 2 層                                                          |
| 12  | Minor     | 料金モデル        | MVP は invite-only 無料、課金は Phase 2 以降                                                                      |
| 13  | Minor     | 分析送信先        | PostHog                                                                                                           |

---

## 6. 本決定の影響で変わる既存ドキュメントの箇所

### `docs/architecture.md`

- **0 章 概要**: TypeScript interface は実装言語ではなく「契約仕様」である旨を明記
- **8 章 システムアーキテクチャ図**: Strands Agents / AgentCore Gateway / Lambda 分割を追記
- **9 章 コンポーネント設計**: 各サブモジュールが Python in-process か Lambda tool かを明記
- **16 章 メモリ設計**: AgentCore Memory / DynamoDB のマッピングを追記
- **17-18 章 評価**: AgentCore Evaluations と PostHog の担当を明示
- **21 章 MVP 範囲**: 軽量週次チェックインの範囲を明記

### `docs/ui-architecture.md`

- **5 章 ルーティング**: `/auth/signin`, `/auth/signup`, `/weekly-check-in` を追加
- **8 章 Home**: 体重入力モーダルへの Quick Action を追加
- **11 章**: 「Progress ページは Phase 2」を明記、WeeklyCheckInScreen を独立セクションとして新設
- **13 章 Settings**: 「単位設定」を Phase 2 表記に変更
- **17 章 コンポーネント**: `components/ui/` + `components/domain/` の 2 層構造を明記
- **24 章 Phase 分け**: Phase 1 に「Weekly Check-in (lightweight)」「Weight logging modal」を追加
- **25 章 推奨技術**: Pydantic 契約との型同期方針を追記

### `docs/skill-stack.md`

- **技術スタック表**: 「PostgreSQL or DynamoDB」→「DynamoDB」に確定
- **Cognito / AgentCore Identity**: 役割分担を明記
- **Food DB**: FCT2020 を採用と明記
- **PostHog**: Product analytics として追加
- **Pydantic**: 契約の source of truth として追加

### `docs/reference.md`

- FCT2020 ダウンロード先を追加
- PostHog ドキュメント URL を追加
- Vercel AI SDK / shadcn ドキュメント URL を追加

---

## 7. 次のアクション

1. ユーザーが本ドキュメントをレビューし承認する（承認後、冒頭ステータスを「承認済み」に更新）
2. 実装計画を作成する。以下のいずれかを使用する:
   - Claude Code: `superpowers:writing-plans` スキル、または `/plan` コマンド、または `/octo:plan` コマンド
   - Codex CLI: `codex "Create an implementation plan based on docs/superpowers/specs/2026-04-11-design-decisions.md"` を実行
   - 手動: 本 spec を入力として、フェーズ別タスクリストを別ドキュメント `docs/superpowers/plans/2026-04-11-implementation-plan.md` に作成
3. 実装計画に既存ドキュメントへの反映タスク（本 spec Section 6 の内容）を含める

---

## 8. 未解決（本 spec の範囲外）

以下は本レビューでは範囲外としたが、実装計画作成時または Phase 2 以降に再度検討する:

- エラーリカバリー戦略（Lambda 障害時のフォールバック）
- マルチリージョン / DR 方針
- データ削除・エクスポート（GDPR 相当）の具体手順
- A/B テスト基盤（PostHog Feature Flags を使うか）
- Observability（AgentCore Observability と CloudWatch の責務分離）
- CI/CD パイプライン（GitHub Actions / AWS CodePipeline）
- Infrastructure as Code（CDK / Terraform / SAM）
- ステージング環境の構成
- **TanStack AI / Code Mode**（TS-only 軽量 agent が必要になった場合の再検討候補。現状は Python/Strands + Vercel AI SDK で十分。参考: https://tanstack.com/blog/tanstack-ai-code-mode ）
- **Vercel AI Gateway** 導入（MVP は Anthropic 直接、Phase 2+ でフェイルオーバー・observability・コスト管理の価値が上回った時点で切替）
