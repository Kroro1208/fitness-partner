# Plan 生成 (経路 A) 設計書 (Plan 08)

> **ステータス**: 承認待ち
> **関連**: `2026-04-11-design-decisions.md` §2.1 経路 A, §2.2 AgentCore 構成, §3.5 Memory マッピング / `2026-04-19-onboarding-design.md` §未解決
> **前提 Plan**: Plan 01-07 完了済み (contracts / fitness-engine / AWS bootstrap / food-catalog ETL / CRUD Lambdas / Next.js / Onboarding)
> **メモ**: `tasks/memories/decisions.md` #plan08-scope #plan08-region #plan08-agentcore-minimal

---

## 目的

Onboarding 完了後の Review 画面「プランを作成する」CTA から、ユーザーの `UserProfile` をもとに **7 日間のミールプラン** を AgentCore Runtime + Strands Agents で生成し、DynamoDB に保存して Home 画面に Daily Summary / Macro Targets / 7-Day Meal Cards として描画するまでの end-to-end フローを構築する。

---

## スコープ

### 含む (Plan 08, スコープ A1)

- **AgentCore Runtime のセットアップ** (us-west-2, container image, IAM, Bedrock model invocation 権限)
- **Strands Agent (Python container)** の実装 (4 tools: `calculate_calories_macros` / `calculate_hydration` / `recommend_supplements` / `get_food_by_id`)。Meal plan の組み立ては orchestrator LLM が直接 structured output として返す
- **Adapter Lambda `generate-plan`** (ap-northeast-1) — API Gateway から AgentCore Runtime を cross-region invoke
- **新規 API Gateway ルート** `POST /users/me/plans/generate`
- **Pydantic 契約**: `MealItem` / `Meal` / `DayPlan` / `SnackSwap` / `GeneratedWeeklyPlan` (agent 出力) / `WeeklyPlan(GeneratedWeeklyPlan)` (永続化 + API 応答) / `SafePromptProfile` / `SafeAgentInput` / `CompleteProfileForPlan` (Adapter 入口 fail-fast parse) / `GeneratePlanRequest` / `GeneratePlanResponse`。`SupplementRecommendation` は **既存 `fitness_engine.supplement.SupplementRecommendation` を再利用** (新規定義しない)。**Strands は `GeneratedWeeklyPlan` を返し、Adapter が `plan_id` (uuid v4) + `generated_at` を付与して `WeeklyPlan` を組み立てて strict 検証後に DDB Put する** (責務分離)
- **既存 Lambda `fetch-weekly-plan`** の `WeeklyPlanRowSchema` を契約ベースに置換
- **Web 側 Review CTA** に Plan 生成呼び出しを差し込む
- **Home 画面の描画**: Daily Summary / Macro Targets / 7-Day Meal Cards (3 セクションのみ)
- **Plan 全 8 セクションを DDB に保存** (snack swaps / hydration / supplements / personal rules / timeline は描画しないが生成・保存する)

### 含まない (Plan 09 以降)

- Snack swaps / Hydration / Supplements / Personal Rules / Timeline の **UI 描画** (DDB には保存済み)
- Chat (SSE streaming, AI SDK `useChat`)
- Weekly review 事前生成 (EventBridge cron)
- AgentCore Memory (long-term, 行動パターン観測)
- AgentCore Identity (独自 IdP 統合)
- AgentCore Gateway (MCP 互換 Lambda 公開)
- AgentCore Evaluations (offline eval framework)
- Plan 生成の async 化 (15 秒以内に収まる前提)
- 食品キーワード検索 (FoodCatalog GSI が無いため。Plan 08 では `get_food_by_id` で system prompt に埋め込んだ著名 food_id への参照のみ。本格的なキーワード検索 / GSI / 形態素解析は Plan 09+)
- WeeklyCheckIn / 体重再入力フロー

---

## 確定済み意思決定

| 決定                                                 | 出典                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| Plan 08 のスコープを A1 に限定                       | `decisions.md` #plan08-scope                                         |
| AgentCore Runtime を us-west-2 にデプロイ            | `decisions.md` #plan08-region                                        |
| AgentCore Identity / Gateway は Plan 08 で導入しない | `decisions.md` #plan08-agentcore-minimal                             |
| デプロイ形態は AgentCore Runtime (案 1)              | 本ドキュメント §アーキテクチャ判断: なぜ AgentCore Runtime か (案 1) |

---

## アーキテクチャ判断: なぜ AgentCore Runtime か (案 1)

### 比較

| 案                              | デプロイ形態                      | 利点                                                                                                                                                 | 欠点                                                                                   |
| ------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **1. AgentCore Runtime** ★ 採用 | ECR push + InvokeAgentRuntime API | Plan 09+ で AgentCore Memory / Observability / Evaluations / Chat (SSE) を追加するとき同じ Runtime ARN を使い回せる。design-decisions.md §2.2 と整合 | CDK L2 未提供、L1 `CfnRuntime` + Custom Resource で書く必要あり                        |
| 2. Lambda で Strands を実行     | Lambda にパッケージ               | CDK L2 完結、デプロイ簡素                                                                                                                            | Chat (SSE) や 15 分超処理で詰む。AgentCore エコシステム使えず、Plan 09+ で全部やり直し |
| 3. ECS Fargate                  | 常時稼働 container                | 任意リージョン、SSE OK                                                                                                                               | 常時課金、AgentCore エコシステム使えず方針逸脱                                         |

### 採用理由

1. design-decisions.md §2.1 / §2.2 で「経路 A = AgentCore Runtime」と決定済み
2. L1 配管コストは 1 度だけで、Plan 09+ の Chat / Weekly review は同じ Runtime ARN を使い回せる
3. 案 2 は短期楽だが Chat 追加時に技術的負債化する

---

## アーキテクチャ全体図

```
[Browser]
  │ (1) POST /api/proxy/users/me/plans/generate (Review CTA)
  ▼
[Next.js Route Handler /api/proxy/[...path]] (既存、変更なし)
  │ (2) Cognito access_token を Authorization: Bearer に付与
  ▼
[API Gateway HTTP API @ ap-northeast-1] (既存)
  │ HttpJwtAuthorizer で Cognito JWT 検証
  │ JWT claims から user_id を取得
  │ 新規ルート: POST /users/me/plans/generate
  ▼
[Adapter Lambda generate-plan @ ap-northeast-1] (新規)
  │ - JWT claims の sub を user_id として取得
  │ - DDB から profile を取得 (同一リージョン)
  │ - profile.onboarding_stage === "complete" を検証
  │ - 既存 plan があり force_regenerate=false なら 200 で {plan_id, weekly_plan} を返す (idempotent)
  │ - **UserProfile → SafePromptProfile + SafeAgentInput に変換** (medical_*_note を除去、
  │   activity_level / avg_workout_minutes / fish_per_week 等の派生値を計算)
  │ - InvokeAgentRuntime API を IAM Sig v4 で叩く
  │     payload: { user_id, week_start, safe_prompt_profile, safe_agent_input }
  ▼ (cross-region, ~100ms RTT)
[AgentCore Runtime @ us-west-2] (新規)
  │ container image: python:3.11-slim + strands-agents + fitness_engine + boto3
  ▼
[Strands Agent (Python container)]
  │ tools (in-process, 4 個):
  │   - calculate_calories_macros  → fitness_engine 直 import (CalorieMacroInput をそのまま受ける)
  │   - calculate_hydration         → fitness_engine 直 import (HydrationInput をそのまま受ける)
  │   - recommend_supplements       → fitness_engine 直 import (SupplementInput をそのまま受ける)
  │   - get_food_by_id              → boto3 GetItem(pk=food#<id>, sk=meta) cross-region
  │ ▼ Bedrock Anthropic Claude (us-west-2)
  │ orchestrator LLM の structured output (Pydantic **GeneratedWeeklyPlan**) で組み立て、
  │ DDB には触らず {"generated_weekly_plan": GeneratedWeeklyPlan JSON} を return
  │ (plan_id / week_start / generated_at は含めない — adapter 責務)
  ▼
[Adapter Lambda]
  │ - レスポンスを GeneratedWeeklyPlanSchema.strict().parse() で検証 (失敗なら 502 invalid_plan_shape)
  │ - plan_id (uuid v4) + generated_at (ISO) を付与して WeeklyPlanSchema.strict().parse() で最終検証
  │ - 検証成功した WeeklyPlan を DDB PutItem (pk=user#<id>, sk=plan#<week_start>)
  │   - force_regenerate=false 時: ConditionExpression="attribute_not_exists(pk)"
  │   - ConditionalCheckFailedException → GetItem(ConsistentRead) で既存再読
  │ - 200 で GeneratePlanResponse { plan_id, week_start, generated_at, weekly_plan } を返す
  ▼
[Web]
  const { plan_id, weekly_plan } = await generatePlanDto({ weekStart })
  queryClient.setQueryData(["weekly-plan", weekStart], weeklyPlanToVM(weekly_plan))  // race 回避
  router.push("/home")  // 失敗時は router.push("/home?planError=1")
  ▼
[Home 画面]
  useWeeklyPlan(weekStart) は cache hit で即描画 (fetch しない)
  cache miss の場合のみ GET /api/proxy/users/me/plans/{weekStart} (ConsistentRead)
  → DailySummaryCard / MacroTargetsCard / SevenDayMealList を描画 (ViewModel)
  no-plan 状態 (404) は <PlanEmptyState /> で「プランを作成する」CTA
```

### 経路マッピング

| 通信      | 経路 | 実装                                                                                          |
| --------- | ---- | --------------------------------------------------------------------------------------------- |
| Plan 生成 | A    | Web → Route Handler (既存 proxy) → API Gateway → Adapter Lambda → AgentCore Runtime → Strands |
| Plan 取得 | B    | Web → Route Handler (既存 proxy) → API Gateway → fetch-weekly-plan Lambda → DDB (既存)        |

---

## データモデル (契約)

すべて Pydantic で定義 → `MODEL_REGISTRY` 登録 → JSON Schema → Zod 自動生成。Lambda 側は生成された Zod を import。

### 新規 1: `WeeklyPlan` ファミリ

`packages/contracts-py/src/fitness_contracts/models/plan/`

```py
# meal_item.py
class MealItem(BaseModel):
    food_id: str | None = None  # FoodCatalog の food_id (LLM 創作メニューは null)
    name: str = Field(..., min_length=1, max_length=120)
    grams: float = Field(..., gt=0, le=2000)
    calories_kcal: int = Field(..., ge=0, le=5000)
    protein_g: float = Field(..., ge=0, le=300)
    fat_g: float = Field(..., ge=0, le=300)
    carbs_g: float = Field(..., ge=0, le=600)

# meal.py
MealSlot = Literal["breakfast", "lunch", "dinner", "dessert"]
PrepTag = Literal["batch", "quick", "treat", "none"]

class Meal(BaseModel):
    slot: MealSlot
    title: str = Field(..., min_length=1, max_length=120)
    items: list[MealItem] = Field(..., min_length=1, max_length=10)
    total_calories_kcal: int
    total_protein_g: float
    total_fat_g: float
    total_carbs_g: float
    prep_tag: PrepTag | None = None
    notes: list[str] | None = None

# day_plan.py
class DayPlan(BaseModel):
    date: str  # ISO YYYY-MM-DD
    theme: str = Field(..., min_length=1, max_length=80)
    meals: list[Meal] = Field(..., min_length=3, max_length=4)
    daily_total_calories_kcal: int
    daily_total_protein_g: float
    daily_total_fat_g: float
    daily_total_carbs_g: float

# snack_swap.py
class SnackSwap(BaseModel):
    current_snack: str
    replacement: str
    calories_kcal: int
    why_it_works: str

# 注: SupplementRecommendation は既存の
#   fitness_contracts.models.fitness_engine.supplement.SupplementRecommendation
# をそのまま再利用する (schema_export.MODEL_REGISTRY に登録済み、line 61)。
# WeeklyPlan の supplement_recommendations フィールドはこの既存型を import して使う。

# weekly_plan.py
from fitness_contracts.models.fitness_engine.supplement import SupplementRecommendation

class WeeklyPlan(BaseModel):
    plan_id: str  # uuid v4
    week_start: str  # ISO 月曜
    generated_at: str  # ISO timestamp
    target_calories_kcal: int
    target_protein_g: float
    target_fat_g: float
    target_carbs_g: float
    days: list[DayPlan] = Field(..., min_length=7, max_length=7)
    weekly_notes: list[str]
    snack_swaps: list[SnackSwap]
    hydration_target_liters: float
    hydration_breakdown: list[str]
    supplement_recommendations: list[SupplementRecommendation]
    personal_rules: list[str] = Field(..., min_length=3, max_length=7)
    timeline_notes: list[str]
```

### 新規 2: `GeneratePlanRequest` / `GeneratePlanResponse`

`packages/contracts-py/src/fitness_contracts/models/plan/generate_plan.py`

```py
class GeneratePlanRequest(BaseModel):
    week_start: str  # ISO 月曜 (クライアントが計算して送る)
    force_regenerate: bool = False

class GeneratePlanResponse(BaseModel):
    plan_id: str
    week_start: str
    generated_at: str
    weekly_plan: WeeklyPlan  # race 回避: 生成直後に client が TanStack cache を初期化できる
```

### 新規 3: `SafePromptProfile` / `SafeAgentInput` (LLM 露出境界)

`packages/contracts-py/src/fitness_contracts/models/plan/agent_io.py`

LLM prompt に含めてよい情報と、決定論計算に必要な派生値を分離する。Adapter Lambda がこの 2 型を組み立てて AgentCore に渡す。

```py
class SafePromptProfile(BaseModel):
    """LLM prompt に露出してよいフィールドのみ。medical_*_note は含めない。"""
    name: str | None
    age: int
    sex: Literal["male", "female"]
    height_cm: float
    weight_kg: float
    goal_weight_kg: float | None
    goal_description: str | None
    desired_pace: Literal["steady", "aggressive"] | None
    favorite_meals: list[str]
    hated_foods: list[str]
    restrictions: list[str]  # アレルギー / 宗教食などの抽象ラベルのみ
    cooking_preference: str | None
    food_adventurousness: int | None
    current_snacks: list[str]
    snacking_reason: str | None
    snack_taste_preference: str | None
    late_night_snacking: bool | None
    eating_out_style: str | None
    budget_level: str | None
    meal_frequency_preference: int | None
    location_region: str | None
    kitchen_access: str | None
    convenience_store_usage: str | None
    # 抽象化された安全フラグだけ LLM に渡す (医療ノート本文は除外)
    avoid_alcohol: bool
    avoid_supplements_without_consultation: bool

class SafeAgentInput(BaseModel):
    """決定論 tool が必要とする派生値。Adapter Lambda で UserProfile から計算する。"""
    calorie_macro_input: CalorieMacroInput   # activity_level を派生済み
    hydration_input: HydrationInput           # avg_workout_minutes を派生済み
    supplement_input: SupplementInput         # fish_per_week / early_morning_training / low_sunlight_exposure を派生済み
```

### 新規 4: UserProfile → `SafePromptProfile` / `SafeAgentInput` の mapper 仕様

Adapter Lambda (`infra/lambdas/generate-plan/mappers.ts`) に実装。契約違反がない限り **決定論的に同じ入力 → 同じ出力**。

#### `activity_level` 派生

`UserProfile.workouts_per_week` + `job_type` から:

| workouts_per_week | job_type が manual_labour / outdoor | job_type がそれ以外 |
| ----------------- | ----------------------------------- | ------------------- |
| 0                 | `lightly_active`                    | `sedentary`         |
| 1-2               | `lightly_active`                    | `lightly_active`    |
| 3-4               | `very_active`                       | `moderately_active` |
| 5-6               | `very_active`                       | `very_active`       |
| 7+                | `extremely_active`                  | `extremely_active`  |

#### `avg_workout_minutes` 派生

- `UserProfile.workout_types` の長さと `workouts_per_week` から推定: 無指定時は 45 分。運動種別リストが空で `workouts_per_week >= 3` なら 30 分、`workout_types` に "weightlifting" / "筋トレ" を含み `workouts_per_week >= 3` なら 60 分
- 決定論表は `mappers.ts` 内のコメントで保持 (妥当性は別 Plan でチューニング)

#### `fish_per_week` / `early_morning_training` / `low_sunlight_exposure` 派生

- `fish_per_week`: MVP では常に `2` (中央値固定)。future: 食事ログから推定 (Plan 09+)
- `early_morning_training`: `workout_types` に "早朝" / "morning" を含むかで bool
- `low_sunlight_exposure`: **MVP は常に `false` を返す** (決定論的、location_region の正規化・緯度解決は Plan 08 スコープ外のため)。future (Plan 09+): `job_type == "desk"` かつ `location_region` が北日本のとき true を返す緯度計算ベースの判定に置き換える

#### `avoid_alcohol`

- `alcohol_per_week` が "none" / "0" なら true、その他 false

#### `avoid_supplements_without_consultation`

- `has_medical_condition == true` または `has_doctor_diet_restriction == true` なら true (ノート本文は渡さず bool フラグだけに変換)

### 新規 5: System prompt に埋め込む `FOOD_HINTS`

FoodCatalog には GSI が無く、keyword search は Plan 08 スコープ外 (`decisions.md` 参照)。そこで **system prompt に著名食品 (鶏むね肉 / 白米 / 納豆 等) の `food_id` ↔ 名称 ↔ 主要栄養素サマリを 50-100 件埋め込む**。LLM は `food_id` を選んで `get_food_by_id` tool で正確値を取得する。

- 生成元: `infra/agents/plan-generator/src/plan_generator/prompts/food_hints.py` (Python module として Strands container と同梱、他言語からは参照しない)。System prompt は `system.py` でこのモジュールを import して末尾に連結する。`contracts-py` / `contracts-ts` には **置かない** (単一言語 runtime 専用の固定データのため、契約共有層に載せる必要がない)
- 初期 list の選定: FCT2020 category 別に利用頻度の高い 50-100 件を手動選出 (Plan 08 のタスクの 1 つ)
- 拡張: Plan 09+ で GSI + keyword search に置き換え、system prompt には入れなくなる

### 変更

| ファイル                                                       | 変更内容                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts-py/src/fitness_contracts/schema_export.py` | `MODEL_REGISTRY` に **新規追加**: `MealItem` / `Meal` / `DayPlan` / `SnackSwap` / `GeneratedWeeklyPlan` / `WeeklyPlan` / `SafePromptProfile` / `SafeAgentInput` / `CompleteProfileForPlan` / `GeneratePlanRequest` / `GeneratePlanResponse`。**`SupplementRecommendation` は既存登録 (line 61) を再利用、追加しない** |
| `infra/lambdas/shared/db-schemas.ts`                           | `WeeklyPlanRowSchema` を `WeeklyPlanSchema` (生成 Zod) ベースに差し替え。`updated_at` 等の DB 専用 meta を `.extend()` で追加                                                                                                                                                                                         |
| `infra/lambdas/fetch-weekly-plan/index.ts`                     | parse 失敗時のログ・レスポンスは既存通り。型推論先が変わるだけ                                                                                                                                                                                                                                                        |

---

## コンポーネント設計

### A. Strands Agent (Python container)

`infra/agents/plan-generator/` を新規ディレクトリとして作成。

```
infra/agents/plan-generator/
├── Dockerfile
├── pyproject.toml          # strands-agents, fitness-engine, boto3, pydantic
├── src/plan_generator/
│   ├── __init__.py
│   ├── handler.py          # AgentCore Runtime entrypoint。SafePromptProfile + SafeAgentInput を受ける
│   ├── agent.py            # Strands Agent 定義 (4 tools, output_schema = GeneratedWeeklyPlan)
│   ├── tools/
│   │   ├── calorie_macro.py    # @tool: fitness_engine.calorie_macro.calculate_calories_and_macros を直呼び
│   │   ├── hydration.py        # @tool: fitness_engine.hydration.calculate_hydration_target を直呼び
│   │   ├── supplements.py      # @tool: fitness_engine.supplements.recommend_supplements を直呼び
│   │   └── get_food_by_id.py   # @tool: boto3 GetItem(pk=food#<id>, sk=meta)
│   └── prompts/
│       ├── system.py           # System prompt (orchestrator)
│       └── food_hints.py       # FOOD_HINTS 50-100 件 (food_id ↔ name_ja ↔ macro 概要)
└── tests/
    ├── test_tools_calorie_macro.py
    ├── test_tools_get_food_by_id.py
    ├── test_handler.py
    └── test_agent_e2e.py        # LLM mock + golden snapshot WeeklyPlan
```

**System Prompt 要旨**:

```
You are a personal fitness nutrition planner.
You will receive:
  - safe_prompt_profile: user preferences & abstract safety flags (no medical notes)
  - safe_agent_input: pre-derived inputs for deterministic tools

Produce a 7-day meal plan (WeeklyPlan structured output) that:
- aligns daily totals with target calories/macros (within ±10%)
- respects food preferences, restrictions, allergies, alcohol use
- distributes protein across meals (no single-meal >60% of daily protein)
- uses food_catalog (call get_food_by_id with food_ids from FOOD_HINTS) for accuracy
  where possible; LLM-invented dishes are allowed but must include grams/macros
- tags batch-cook-friendly meals with prep_tag="batch"
- includes 2 treat-like low-calorie meals per week (prep_tag="treat")

Tool calling order:
1. calculate_calories_macros (always first; pass safe_agent_input.calorie_macro_input)
2. calculate_hydration (parallel possible)
3. recommend_supplements (parallel possible; if avoid_supplements_without_consultation,
   you may still call but must add caution text)
4. For each day, brainstorm meal candidates referencing FOOD_HINTS;
   for each chosen FOOD_HINTS item, call get_food_by_id to fetch precise macros.
5. Return a single WeeklyPlan object as structured output.

NEVER include medical conditions, medications, or pregnancy status in any output.
The user has NOT shared those with you.

[FOOD_HINTS section appended at runtime: ~50-100 food_id ↔ name_ja ↔ macros]
```

**Tool 仕様**:

| Tool                        | 入力                | 出力                           | 実装                                                                                   |
| --------------------------- | ------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| `calculate_calories_macros` | `CalorieMacroInput` | `CalorieMacroResult`           | `fitness_engine.calorie_macro.calculate_calories_and_macros(input)` 直呼び             |
| `calculate_hydration`       | `HydrationInput`    | `HydrationResult`              | `fitness_engine.hydration.calculate_hydration_target(input)` 直呼び                    |
| `recommend_supplements`     | `SupplementInput`   | `SupplementRecommendationList` | `fitness_engine.supplements.recommend_supplements(input)` 直呼び                       |
| `get_food_by_id`            | `{ food_id: str }`  | `FoodItem \| None`             | boto3 `GetItem(Key={pk: f"food#{food_id}", sk: "meta"})` cross-region (ap-northeast-1) |

**Meal plan 組み立て**: 専用 tool は無し。orchestrator LLM が上記 4 tools の結果と `safe_prompt_profile` を踏まえて **structured output として `GeneratedWeeklyPlan` Pydantic 型を直接 return** する (`plan_id` / `week_start` / `generated_at` は含めない)。Strands の `Agent(output_schema=GeneratedWeeklyPlan)` 機能で Pydantic 適合を強制し、不適合なら Strands 側で 1 回 retry する。最終的に AgentCore Runtime のレスポンス body は `{"generated_weekly_plan": GeneratedWeeklyPlan JSON}` となる。**Adapter Lambda が `plan_id` (uuid v4) / `generated_at` (ISO) を付与して `WeeklyPlan` を組み立て、strict 検証してから DDB に書く**。

### B. Adapter Lambda `generate-plan` (ap-northeast-1)

`infra/lambdas/generate-plan/`

```
infra/lambdas/generate-plan/
├── index.ts
└── README.md
```

**責務**:

1. JWT claims から `user_id` を取得 (既存 `requireUserId` を再利用)
2. `requireJsonBody(event)` で body を取得し、`GeneratePlanRequestSchema.safeParse()` で検証
3. DDB から profile を取得 (`stripKeys` 経由で pk/sk を除去) → **`CompleteProfileForPlanSchema.safeParse()` で fail-fast parse**。失敗時: `onboarding_stage !== "complete"` なら 400 `{ error: "onboarding_incomplete" }`、それ以外は 400 `{ error: "incomplete_profile_fields" }`
4. 既存 plan を `pk=user#<id>, sk=plan#<week_start>` で `ConsistentRead` 確認 → あって `force_regenerate=false` なら既存 `{plan_id, week_start, generated_at, weekly_plan}` を 200 で返す (idempotent)
5. **UserProfile → `SafePromptProfile` + `SafeAgentInput` に変換** (`mappers.ts`)。medical\_\*\_note 除去、`activity_level` / `avg_workout_minutes` / 抽象 bool フラグ派生。`protein_gap_g` は Plan 08 で **0 固定** (whey 推奨抑止、Plan 09+ で meal 生成後の実測値に切替)
6. AgentCore `InvokeAgentRuntime` を `@aws-sdk/client-bedrock-agentcore` (us-west-2) で呼ぶ。Runtime ARN は **環境変数 `AGENTCORE_RUNTIME_ARN`** から読む (deploy-time 注入)
7. Strands のレスポンス (`{ "generated_weekly_plan": ... }`) を **`GeneratedWeeklyPlanSchema.strict().parse()`** で検証 (失敗なら 502 `invalid_plan_shape`)
8. `plan_id` (`crypto.randomUUID()`) + `generated_at` (`new Date().toISOString()`) を付与して **`WeeklyPlanSchema.strict().parse()`** で最終検証 (agent 出力と adapter 付与メタの両方を strict 検証することで shape drift を二重防御)
9. 検証成功した `WeeklyPlan` を **Adapter Lambda 自身が DDB PutItem** (`pk=user#<id>, sk=plan#<week_start>`)。
   - `force_regenerate=false`: conditional put (`ConditionExpression: "attribute_not_exists(pk)"`)。**`ConditionalCheckFailedException` を catch したら `GetItem(ConsistentRead: true)` で既存 item を読み直し、既存 `WeeklyPlan` + `plan_id` + `generated_at` を返す** (generated uuid は破棄)。これにより同時リクエストでも "最初に書けた plan_id" が全員に返る idempotency
   - `force_regenerate=true`: 無条件 PutItem で上書き
   - 非 conditional な Put 失敗 (throttle / 権限等): 502 `{ error: "persistence_failed" }`。`plan_id` は uuid v4 でサーバー生成のため **再試行で同一 `plan_id` 保証なし** (同一 plan_id 保証は "永続化成功後の idempotency" のみ)
10. `GeneratePlanResponse { plan_id, week_start, generated_at, weekly_plan }` を 200 で返す
11. timeout は **25 秒** (API GW 30 秒 - margin)、タイムアウト時は 504 `{ error: "generation_timeout" }`

**IAM 権限**:

- `bedrock-agentcore:InvokeAgentRuntime` on `arn:aws:bedrock-agentcore:us-west-2:<account>:runtime/<runtime-id>` (ARN は環境変数経由で渡された値、CDK で同等の値を IAM resource に展開)
- `dynamodb:GetItem` on FitnessTable (profile / plan 確認)
- `dynamodb:PutItem` on FitnessTable (plan 書き込み)
- **SSM への依存は無し** (§デプロイ手順で deploy-time 注入する)

### C. CDK Constructs (新規)

`infra/lib/constructs/plan-generator.ts`

```ts
export interface PlanGeneratorProps {
  readonly httpApi: HttpApi;
  readonly table: dynamodb.Table;
}

// AgentCoreRuntime construct (in PlanGeneratorStack, us-west-2):
//   - DockerImageAsset (directory=<repo root>, file=infra/agents/plan-generator/Dockerfile)
//     が ECR リポジトリ作成 + image build (linux/arm64) + push を自動実行
//   - AgentCore Runtime (CfnResource L1 "AWS::BedrockAgentCore::Runtime", imageUri=asset.imageUri)
//   - Execution role: bedrock:InvokeModel + cross-region DDB GetItem (pk=food#* only, read-only)
//
// GeneratePlanLambda construct (in FitnessStack, ap-northeast-1):
//   - NodejsFunction (environment: AGENTCORE_RUNTIME_ARN from -c context)
//   - IAM: bedrock-agentcore:InvokeAgentRuntime on the ARN, DDB GetItem/PutItem on FitnessTable
//     with dynamodb:LeadingKeys=["user#*"] condition (§セキュリティに従う最小権限)
//   - API Gateway route POST /users/me/plans/generate
```

**Cross-region 管理 / Runtime ARN 受け渡し**:

- `FitnessStack` (ap-northeast-1) に `GeneratePlanLambda` を追加 (既存)。**`agentcoreRuntimeArn` context は optional**。未指定時は `GeneratePlanLambda` を skip して FitnessStack の synth を通す (初回 `deploy:plan-generator` で FitnessStack も synth 対象になる制約への対応)
- 新規 `PlanGeneratorStack` を **us-west-2** にデプロイ。ECR / image build / image push は **CDK `DockerImageAsset` で一本化** (手動 `aws ecr create-repository` や `docker push` は不要)
- `infra/bin/app.ts` は 2 stack を別 region でインスタンス化。**cross-region token 参照は禁止**: `fitness_table_arn` は `-c fitnessTableName=<name>` から `arn:aws:dynamodb:ap-northeast-1:${account}:table/${name}` を文字列構築する
- **Runtime ARN は deploy-time `-c` 注入で受け渡す** (SSM 経由ではない):
  1. `cdk deploy PlanGeneratorStack --outputs-file cdk-outputs.json -c fitnessTableName=<name>` で AgentCore Runtime ARN を `CfnOutput` として吐く。FitnessStack も synth 対象だが `agentcoreRuntimeArn` context 未指定のため Adapter Lambda は skip される
  2. `node ./infra/scripts/extract-runtime-arn.mjs cdk-outputs.json` で ARN 抽出
  3. `cdk deploy FitnessStack -c agentcoreRuntimeArn=<arn> -c inviteCodesParameterName=...` で Adapter Lambda + route を追加
  4. CI では `pnpm deploy:plan08` で 2 段階を自動化
- **SSM Parameter は使わない**: cold-start で `GetParameter` 不要、Adapter の IAM に `ssm:GetParameter` 不要、deploy 順序が CI で明示される利点
- Runtime 更新時 (image 差し替え等) は `deploy:plan-generator` で DockerImageAsset が diff を検出して build + push + Runtime 更新を自動化する

### D. Web 側変更

| ファイル                                                            | 変更内容                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/web/src/lib/api/plans.ts` (新規)                          | `generatePlanDto()` / `fetchWeeklyPlanDto()` — 既存 `lib/api-client.ts` の `apiClient<T>(path, schema, options)` を再利用し、snake_case DTO を返す                                             |
| `packages/web/src/lib/plan/plan-mappers.ts` (新規)                  | DTO (snake_case) ↔ ViewModel (camelCase) 変換。`WeeklyPlanVM` / `DayPlanVM` / `MealVM` / `MealItemVM` 型を定義 (Plan 07 `profile-mappers.ts` と同パターン)                                     |
| `packages/web/src/hooks/use-plan.ts` (新規)                         | TanStack Query: `useGeneratePlan()` mutation (`onSuccess` で `setQueryData(["weekly-plan", weekStart], weeklyPlanToVM(data.weekly_plan))`), `useWeeklyPlan(weekStart)` query。ViewModel を返す |
| `packages/web/src/lib/date/week-start.ts` (新規)                    | 今日から月曜日を計算する純粋関数                                                                                                                                                               |
| `packages/web/src/app/onboarding/review/review-content.tsx` (変更)  | `patch({}, "complete") → router.push("/home")` の間に `await generate.mutateAsync({ weekStart })` を挟む。失敗時は `?planError=1`                                                              |
| `packages/web/src/app/(app)/home/page.tsx` (変更)                   | placeholder 撤去、`useWeeklyPlan(weekStart)` (ViewModel) で描画。404 → `<PlanEmptyState />`                                                                                                    |
| `packages/web/vitest.config.ts` (変更) + `vitest.setup.ts` (新規)   | DOM テスト用に `environment: "happy-dom"` + `@testing-library/jest-dom` setup 追加。`@testing-library/react` / `happy-dom` 依存を追加                                                          |
| `packages/web/src/components/domain/daily-summary-card.tsx` (新規)  | 今日の `DayPlan` から calories / macros の達成率を表示                                                                                                                                         |
| `packages/web/src/components/domain/macro-targets-card.tsx` (新規)  | `target_calories_kcal` / `target_*_g` を表示                                                                                                                                                   |
| `packages/web/src/components/domain/meal-card.tsx` (新規)           | 1 つの `Meal` を表示 (slot / title / items / totals)                                                                                                                                           |
| `packages/web/src/components/domain/seven-day-meal-list.tsx` (新規) | `WeeklyPlan.days` を縦リストで描画、各日が collapsible                                                                                                                                         |
| `packages/web/src/components/domain/plan-loading-state.tsx` (新規)  | 生成中の skeleton + 進捗メッセージ                                                                                                                                                             |
| `packages/web/src/components/domain/plan-error-banner.tsx` (新規)   | `?planError=1` 検出時の再試行 CTA                                                                                                                                                              |
| `packages/web/src/components/domain/plan-empty-state.tsx` (新規)    | **既存ユーザー (onboarding 完了済みだが plan 未生成) 向け**。「今週のプランがまだありません」+ `useGeneratePlan` を呼ぶ CTA + 生成中は `<PlanLoadingState />` 表示                             |
| `infra/lambdas/fetch-weekly-plan/index.ts` (変更)                   | `GetCommand` に `ConsistentRead: true` を追加 (生成直後の read-after-write race 対策)                                                                                                          |

---

## エラーハンドリング

### 失敗モードと対応

| 失敗モード                                                 | 検出箇所                                                                                                                               | 対応                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cognito JWT 失効                                           | API Gateway HttpJwtAuthorizer                                                                                                          | 401 を返す。Web 側は既存の refresh フローへ                                                                                                                                                                                                                                                                                                                                       |
| `onboarding_stage !== "complete"`                          | Adapter Lambda                                                                                                                         | 400 + `{ error: "onboarding_incomplete" }`                                                                                                                                                                                                                                                                                                                                        |
| AgentCore Runtime invoke timeout (25s)                     | Adapter Lambda                                                                                                                         | 504 + `{ error: "generation_timeout" }`。Web は再試行 CTA を表示                                                                                                                                                                                                                                                                                                                  |
| Strands Agent が GeneratedWeeklyPlan の Schema 違反 return | Adapter Lambda の `GeneratedWeeklyPlanSchema.strict().parse()` 失敗 (または plan_id 付与後の `WeeklyPlanSchema.strict().parse()` 失敗) | 502 + `{ error: "invalid_plan_shape" }`。**Adapter で検証してから DDB Put するため、壊れた plan は永続化されない**。CloudWatch にエラー詳細記録                                                                                                                                                                                                                                   |
| Bedrock model invocation 失敗 (rate limit / model error)   | Strands 内部例外                                                                                                                       | Strands の retry (2 回) → 失敗時は AgentCore Runtime が 5xx で return → Adapter Lambda が 502 で返す                                                                                                                                                                                                                                                                              |
| DDB write 失敗 (Adapter Lambda, 非 conditional)            | `PutItem` で `ConditionalCheckFailedException` **以外**の例外                                                                          | 502 + `{ error: "persistence_failed" }`。CloudWatch にエラー詳細記録。Plan は生成済みだが永続化されていない状態。**`plan_id` は uuid v4 でサーバー側生成のため、Web 側再試行では新しい `plan_id` が発行される** (同一 plan_id 保証は "永続化成功後の idempotency" のみ。"永続化失敗後の再試行" では保証しない)。Web は再試行 CTA を表示するがユーザーには新しい plan として見える |
| DDB write 条件違反 (同時リクエスト race)                   | `ConditionalCheckFailedException` (force_regenerate=false 時のみ)                                                                      | 続けて `GetItem(ConsistentRead: true)` で既存 item を読み直し、既存 `{plan_id, weekly_plan, generated_at}` を 200 で返す (step 8 の idempotent path)                                                                                                                                                                                                                              |
| `get_food_by_id` の DDB read エラー (cross-region)         | Strands 内 tool                                                                                                                        | tool 内で `None` return + ログ記録。LLM はその food_id を諦めて別 FOOD_HINTS 候補か LLM 創作メニューに fallback                                                                                                                                                                                                                                                                   |
| 生成直後の Home 遷移時に plan が読めない                   | Web 側 `useWeeklyPlan` cache miss                                                                                                      | **mutation の `onSuccess` で `queryClient.setQueryData` 済みのため通常発生しない**。万一 cache が無いケースでは `fetch-weekly-plan` の `ConsistentRead: true` で eventually consistent の race を回避                                                                                                                                                                             |
| クライアント側 fetch エラー                                | `useGeneratePlan` mutation                                                                                                             | TanStack Query が再試行 (1 回)。最終失敗時は Home に `?planError=1` で遷移し再試行 CTA                                                                                                                                                                                                                                                                                            |

### Idempotency

- Plan 生成は `pk=user#<id>, sk=plan#<week_start>` がユニーク。同じ week_start で 2 回呼んでも `force_regenerate=false` なら最初の plan_id を返す (Adapter Lambda で先に GetItem して判定)
- Web 側の Review CTA は double-click ガード (mutation 中は disabled)

### 観測

- Adapter Lambda: CloudWatch に `{ user_id, week_start, latency_ms, status }` を JSON で出力
- AgentCore Runtime: AgentCore Observability (built-in) で trace 記録 — Plan 09 で本格活用
- LLM token 使用量: AgentCore container 内で `console.log` (Plan 09 で CloudWatch metrics に集約)

---

## テスト戦略

### Unit テスト

| 対象                                      | テストファイル                                                   | 内容                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pydantic 契約                             | `packages/contracts-py/tests/test_weekly_plan.py`                | 必須フィールド / range / enum 検証                                                                                                                                                                                                                                                                |
| Strands tool: `calculate_calories_macros` | `infra/agents/plan-generator/tests/test_tools_calorie_macro.py`  | 既存 fitness_engine のラッパーが正しく値を return                                                                                                                                                                                                                                                 |
| Strands tool: `get_food_by_id`            | `infra/agents/plan-generator/tests/test_tools_get_food_by_id.py` | moto で DDB mock、`pk=food#<id>, sk=meta` GetItem 動作 / no-item で None return                                                                                                                                                                                                                   |
| Strands handler                           | `infra/agents/plan-generator/tests/test_handler.py`              | SafePromptProfile + SafeAgentInput 受領、`{"generated_weekly_plan": ...}` 形式で return、agent 出力に `plan_id` が含まれない (adapter 責務)                                                                                                                                                       |
| Strands agent e2e (wiring)                | `infra/agents/plan-generator/tests/test_agent_e2e.py`            | BedrockModel invocation だけ mock。`build_agent()` が 4 tools を wire し `output_schema=GeneratedWeeklyPlan` を設定することを検証、system prompt 必須キーワード確認、実 agent 経由で handler が GeneratedWeeklyPlan を parse できることを確認                                                     |
| Adapter Lambda mappers                    | `infra/test/lambdas/generate-plan/mappers.test.ts`               | UserProfile → SafePromptProfile (medical\_\*\_note 除去) / SafeAgentInput (activity_level / avg_workout_minutes / fish_per_week 派生表) の decision table                                                                                                                                         |
| Adapter Lambda handler                    | `infra/test/lambdas/generate-plan/index.test.ts`                 | JWT / Zod / `CompleteProfileForPlanSchema` fail-fast / idempotency (既存 plan 返却) / timeout / AgentCore mock / `GeneratedWeeklyPlanSchema.strict().parse()` 失敗時の 502 / `WeeklyPlanSchema.strict().parse()` 失敗時の 502 / `ConditionalCheckFailedException` 再読経路 / DDB Put 失敗時の 502 |
| `useGeneratePlan` hook                    | `packages/web/src/hooks/use-plan.test.tsx`                       | mutation success / error / loading / `onSuccess` で `setQueryData` が呼ばれる                                                                                                                                                                                                                     |
| `useWeeklyPlan` 404 → empty state         | `packages/web/src/hooks/use-plan.test.tsx`                       | 404 を `null` data として扱い `<PlanEmptyState />` が render される                                                                                                                                                                                                                               |
| `week-start` 純粋関数                     | `packages/web/src/lib/date/week-start.test.ts`                   | decision table                                                                                                                                                                                                                                                                                    |
| Home page rendering                       | `packages/web/src/app/(app)/home/page.test.tsx`                  | `useWeeklyPlan` mock で plan あり / plan なし (PlanEmptyState) / loading / error 各状態                                                                                                                                                                                                           |
| `fetch-weekly-plan` ConsistentRead        | `infra/test/lambdas/fetch-weekly-plan.test.ts` (既存)            | `GetCommand` 引数に `ConsistentRead: true` が含まれる回帰テストを追加                                                                                                                                                                                                                             |

### Integration テスト

| テスト                            | 内容                                                                                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strands Agent E2E (LLM mock)      | `infra/agents/plan-generator/tests/test_agent_e2e.py` — Bedrock を mock し、固定 profile から golden snapshot WeeklyPlan を生成。Schema 適合 + 主要不変条件 (daily totals が ±10% 以内 / protein 分散) を assert |
| Adapter Lambda → AgentCore (real) | 手動検証手順を README に記載 (CI では実行しない、コスト理由)                                                                                                                                                     |

### E2E テスト

- 既存 repo に Playwright 未セットアップ。Plan 08 でも E2E は導入しない (Plan 07 と同方針)
- 手動検証チェックリストを `infra/agents/plan-generator/README.md` に記載

### Equivalence テスト

- 既存の `fitness_engine.onboarding_safety` ↔ TS 実装の equivalence パターンを踏襲する必要は **なし** (Plan 08 では Strands tool は Python のみで TS 実装を持たない)

---

## デプロイ手順 (運用)

1. `pnpm contracts:generate` → JSON Schema → Zod 自動生成 (既存 root script)
2. `pnpm --filter infra test -- --run` で infra の型 / snapshot が通ることを確認
3. 既存 FitnessStack の TableName を取得: `export FITNESS_TABLE_NAME=$(aws cloudformation describe-stacks --stack-name FitnessStack --region ap-northeast-1 --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text)`
4. **`cdk deploy PlanGeneratorStack`** (us-west-2) — CDK `DockerImageAsset` が image build (linux/arm64) + ECR 作成 + push + AgentCore Runtime 作成をアトミックに実行
   - `pnpm --filter infra deploy:plan-generator` (内部で `cdk deploy PlanGeneratorStack --outputs-file cdk-outputs.json -c fitnessTableName=$FITNESS_TABLE_NAME`)
   - この時点で **FitnessStack も synth 対象になる**が、`agentcoreRuntimeArn` context 未指定のため Adapter Lambda が skip されて synth は通る
5. **Runtime ARN 抽出**: `node ./infra/scripts/extract-runtime-arn.mjs cdk-outputs.json`
6. **`cdk deploy FitnessStack`** (ap-northeast-1) — Runtime ARN を `-c` で注入して Adapter Lambda + route を追加
   - `pnpm --filter infra deploy:fitness-with-arn` (内部で `cdk deploy FitnessStack -c agentcoreRuntimeArn=$(...) -c inviteCodesParameterName=$INVITE_CODES_PARAMETER_NAME`)
   - CDK が Adapter Lambda の `environment.AGENTCORE_RUNTIME_ARN` + IAM `bedrock-agentcore:InvokeAgentRuntime` resource に ARN を展開
7. Web は `vercel deploy --prod` (既存)

CI 化時は step 4-6 を `pnpm deploy:plan08` でまとめる (新規 root script)。**手動 `aws ecr create-repository` や `docker buildx build && docker push` は不要** (CDK `DockerImageAsset` が全て担う)。Runtime の image を更新したい場合 (例: Strands Agent のコード変更) は同じ `deploy:plan-generator` で DockerImageAsset が diff を検出して自動再 build + push する。**SSM Parameter は使わないため `ssm:GetParameter` 権限は Adapter Lambda に不要**。詳細は `infra/agents/plan-generator/README.md` 参照。

---

## セキュリティ

- AgentCore container の IAM role は **最小権限**:
  - `dynamodb:GetItem` on FitnessTable, condition: `dynamodb:LeadingKeys` で `food#*` のみ許可 (food catalog read)
  - `bedrock:InvokeModel` on Claude model ARN のみ
  - **Profile / Plan の DDB アクセスは持たない** (Adapter Lambda が profile を payload で渡し、plan は Adapter が write するため)
- Adapter Lambda の IAM role:
  - `bedrock-agentcore:InvokeAgentRuntime` on Plan Generator runtime ARN (env var で注入された値)
  - `dynamodb:GetItem` on FitnessTable (profile / plan 確認), condition: `dynamodb:LeadingKeys` で `user#*` のみ
  - `dynamodb:PutItem` on FitnessTable, condition: `dynamodb:LeadingKeys` で `user#*` のみ (sk=plan#\* は application-level で保証)
- AgentCore container 内で `safe_prompt_profile` / `safe_agent_input` を **CloudWatch にフル出力しない** (PII)。エラー時のみ `user_id` と shape (キー一覧) のみ
- **医療情報フィルタの実装境界**:
  - **Adapter Lambda の `mappers.ts` が `UserProfile` → `SafePromptProfile` 変換時に、`medical_condition_note` / `medication_note` を暗黙にドロップ**
  - `has_medical_condition` / `has_doctor_diet_restriction` の 2 つの bool は `avoid_supplements_without_consultation: true` という抽象 1 フラグに集約してから渡す
  - `is_pregnant_or_breastfeeding` の本人は Onboarding Safety で blocked stage に入るため、Adapter は `onboarding_stage === "complete"` を検証することで間接的にこの値が false であることを保証する
  - Strands Agent / LLM prompt には医療ノート文字列も具体的フラグも渡らない

---

## ロールアウト

Plan 08 は **新規機能のみ**で既存ユーザーへの破壊的変更なし:

- 既存の `WeeklyPlanRowSchema` は contract ベースに置換するが、現状 DDB に WeeklyPlan データは存在しない (placeholder schema のため空テーブル)
- **Onboarding 完了済みだが plan 未生成の既存ユーザー** は Home の `useWeeklyPlan` が 404 を受けて `null` data になる。`<PlanEmptyState />` (Web 変更一覧に追加済み) が「今週のプランがまだありません」+ 「プランを作成する」CTA を表示し、CTA で `useGeneratePlan` を呼ぶ。生成中は `<PlanLoadingState />` を表示し、成功すれば `setQueryData` で即描画。失敗時は `<PlanErrorBanner />` で再試行
- 既存ユーザーが onboarding 中の状態で Plan 08 をリリースしても、Review CTA フローが新規生成を担うので影響なし
- `fetch-weekly-plan` への `ConsistentRead: true` 追加は read レイテンシが微増するが、新規ユーザーの初回 plan 取得 race を防ぐため必須

Feature flag は **使わない** (新規機能、既存挙動を変えない、Vercel Flags の導入コストに見合わない)。

---

## 未解決 (Plan 09 以降)

`tasks/memories/context-log.md` 「Plan 09 へ持ち越す事項」を参照。要約:

- Snack swaps / Hydration / Supplements / Personal Rules / Timeline の **UI 描画** (DDB には保存済み)
- Chat (SSE streaming, AI SDK `useChat`)
- Weekly review 事前生成 (EventBridge cron)
- AgentCore Memory (long-term, 行動パターン観測)
- AgentCore Identity (独自 IdP 統合)
- AgentCore Gateway (MCP 互換 Lambda 公開)
- AgentCore Evaluations (offline eval framework)
- 食品キーワード検索の本格化 (FoodCatalog GSI 追加 + 形態素解析。Plan 08 では `get_food_by_id` + system prompt の FOOD_HINTS 50-100 件で代替)
- `activity_level` 派生ロジックの本格チューニング
- WeeklyCheckIn / 体重再入力フロー
- Plan 生成の async 化 (15 秒超対応)
- Playwright E2E のセットアップ

---

## レビュー対応履歴

### 2026-04-20: 初版レビュー (9 件) への対応

| #   | 重要度 | 指摘                                                                  | 対応                                                                                                                                                                                                                                                                  |
| --- | ------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High   | 医療情報を LLM に渡さない方針と、フル profile 受け渡しが矛盾          | `SafePromptProfile` / `SafeAgentInput` を新設し、Adapter Lambda の `mappers.ts` で `medical_*_note` を暗黙ドロップ + 抽象 bool フラグに集約。AgentCore に渡すペイロードを 2 型に分離                                                                                  |
| 2   | High   | UserProfile → fitness_engine 各 Input の mapper 仕様が抜け            | `mappers.ts` に `activity_level` / `avg_workout_minutes` / `fish_per_week` / `early_morning_training` / `low_sunlight_exposure` の派生表を仕様として明記                                                                                                              |
| 3   | High   | search_food が `name`(誤) / GSI 不在 / Scan を pk で絞れない誤認      | `search_food` を **削除**し `get_food_by_id` (`pk=food#<id>, sk=meta` の GetItem) に変更。LLM への食品候補提示は system prompt 末尾に **FOOD_HINTS 50-100 件**を埋め込む方式に。キーワード検索は Plan 09+ に持ち越し                                                  |
| 4   | High   | 生成直後の Home 遷移で 404 race                                       | (a) Adapter Lambda レスポンスに `weekly_plan` 本体を含める, (b) Web mutation `onSuccess` で `setQueryData` で TanStack キャッシュ初期化, (c) `fetch-weekly-plan` に `ConsistentRead: true` 追加 (二重防御)                                                            |
| 5   | Medium | Runtime ARN 受け渡し未完成                                            | **deploy-time injection** に確定 (SSM 撤回)。`cdk deploy PlanGeneratorStack --outputs-file` → `extract-runtime-arn.mjs` → `cdk deploy FitnessStack -c agentcoreRuntimeArn=...`。Adapter Lambda は `process.env.AGENTCORE_RUNTIME_ARN` を読む。`ssm:GetParameter` 不要 |
| 6   | Medium | tool 構成が文書内で食い違い                                           | tools を 4 個 (`generate_meal_plan` 削除) に統一。Strands handler は orchestrator LLM の structured output (`Agent(output_schema=WeeklyPlan)`) で WeeklyPlan を直 return する設計に統一                                                                               |
| 7   | Medium | WeeklyPlan の Schema 違反を Adapter で検出できない                    | Strands は **DDB Put せず WeeklyPlan を return**。Adapter が `WeeklyPlanSchema.strict().parse()` で検証してから DDB PutItem。`GeneratePlanResponse` に `weekly_plan: WeeklyPlan` を追加 (race 回避と検出点の両方を兼ねる)                                             |
| 8   | Medium | `SupplementRecommendation` 名前衝突                                   | 新規定義を撤回し、既存 `fitness_engine.supplement.SupplementRecommendation` (MODEL_REGISTRY 登録済み) を再利用。WeeklyPlan は import で参照                                                                                                                           |
| 9   | Medium | 既存ユーザー (onboarding 完了 + plan 未生成) の no-plan state UI 抜け | Web 変更一覧に `<PlanEmptyState />` 追加。`useWeeklyPlan` 404 → `null` data → `<PlanEmptyState />` で「プランを作成する」CTA。ロールアウト節にも動線を明記                                                                                                            |

### 2026-04-20: 2 回目レビュー (5 件) への対応

| #   | 重要度 | 指摘                                                                                               | 対応                                                                                                                                                                                                                                        |
| --- | ------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | High   | idempotency が成立していない (ConditionalCheckFailed 後の再読・persistence_failed の plan_id 誤解) | step 8 に **`ConditionalCheckFailedException` 時の `GetItem(ConsistentRead)` 再読パス** を明記、成功した plan_id を返す動線を追加。`persistence_failed` は「**uuid v4 はサーバー生成のため再試行で同一 plan_id 保証なし**」とエラー表に明記 |
| 11  | Medium | fitness_engine 関数名が実装とズレ                                                                  | `calculate` → `calculate_calories_and_macros` / `recommend` → `recommend_supplements` に修正 (ディレクトリ構成コメントと tool 表の両方)                                                                                                     |
| 12  | Medium | FOOD_HINTS の source of truth が contracts-py (.ts) と infra 両方で二重化                          | `infra/agents/plan-generator/src/plan_generator/prompts/food_hints.py` 一本に統一。contracts-py には置かない (単一言語 runtime 専用の固定データ、契約共有層に載せる必要がない)                                                              |
| 13  | Low    | CDK construct コメントが stale (container に write 権限を書いてしまっている)                       | 「cross-region DDB **read-only** (FoodCatalog GetItem のみ)。Profile / Plan は Adapter 責務」に修正                                                                                                                                         |
| 14  | Low    | MODEL_REGISTRY 追記表が "SupplementRecommendation 追加" と読めて既存重複                           | 「新規追加」リストから `SupplementRecommendation` を除外し、「**既存登録 (line 61) を再利用、追加しない**」と明記。代わりに `SafePromptProfile` / `SafeAgentInput` の追加を明記                                                             |
| 15  | Medium | `low_sunlight_exposure` の派生仕様が自己矛盾 ("desk + 北日本" と "MVP 固定 false" の両方を記述)    | **MVP は常に `false` 固定** に一本化。future (Plan 09+) の緯度計算ベース判定は別文で Plan 09+ スコープとして分離                                                                                                                            |

### 2026-04-20: 3 回目レビュー (4 件) への対応 — spec ↔ plan 整合化

| #   | 重要度 | 指摘                                                                                                                                | 対応                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25  | High   | spec が旧版 (WeeklyPlan 単一契約 + Strands が WeeklyPlan を return) のまま、plan が spec を上書き                                   | **spec の契約一覧 / アーキテクチャ全体図 / Adapter 責務 / エラー表 / テスト表 / Cross-region 管理 / デプロイ手順 / Web 変更表を plan と整合させた**。`GeneratedWeeklyPlan` と `WeeklyPlan` の分離、`CompleteProfileForPlan` 入口、`generated_weekly_plan` レスポンスキー、`DockerImageAsset` 一本化、手動 ECR push 廃止、router.push は `?planError=1` のみ使用を反映 |
| 26  | High   | FitnessStack の `agentcoreRuntimeArn` 必須化 + `bin/app.ts` が両 stack 常時 instantiate → `deploy:plan-generator` の synth が落ちる | FitnessStack の `agentcoreRuntimeArn` context を **optional** に変更。未指定時は `GeneratePlanLambda` を skip して synth を通す。初回 `deploy:plan-generator` も FitnessStack が synth 対象になる制約を spec でも明記                                                                                                                                                 |
| 27  | Medium | Web テスト計画が `@testing-library/react` / jsdom 未導入のまま書かれている                                                          | 依存追加 (`@testing-library/react@^16` / `@testing-library/jest-dom@^6` / `happy-dom@^15`) + `vitest.config.ts` の `environment: "happy-dom"` + `vitest.setup.ts` を Web 変更一覧に追加                                                                                                                                                                               |
| 28  | Medium | `test_agent_e2e.py` が `_AGENT` 全体 MagicMock で C9 と同等、agent.py / prompt / tool wiring を拾えない                             | BedrockModel invocation レイヤーだけ mock して `build_agent()` / `system.py` / 4 tools / `output_schema=GeneratedWeeklyPlan` の実配線を通すテストに昇格 (plan Task C10 で具体コードを定義)                                                                                                                                                                            |
