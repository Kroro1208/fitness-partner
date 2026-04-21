# Plan 生成 (経路 A) Implementation Plan (Plan 08)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Onboarding 完了後の Review CTA から AgentCore Runtime + Strands Agents で 7 日間ミールプランを生成し、DynamoDB に保存して Home 画面に Daily Summary / Macro Targets / 7-Day Meal Cards を描画するまでの end-to-end フローを完成させる。Snack swaps / Hydration / Supplements / Personal Rules / Timeline は生成・保存のみ実施し、UI 描画は Plan 09+ に委ねる。

**Architecture:** contracts-py に `GeneratedWeeklyPlan` (agent 出力) と `WeeklyPlan` (永続化 + API 応答) を分離して定義し、`MODEL_REGISTRY` に登録、JSON Schema → Zod 自動生成。Strands Agent は `GeneratedWeeklyPlan` を structured output として返し、Adapter Lambda が `plan_id` (uuid v4) / `generated_at` を付与して `WeeklyPlan` を組み立て、strict 検証してから DDB に idempotent PutItem する。CDK は `DockerImageAsset` で ECR 管理 + image build + push を 1 コマンドに統合し、PlanGeneratorStack (us-west-2) と FitnessStack (ap-northeast-1) は cross-region token 参照せず、context (`-c fitnessTableName` / `-c agentcoreRuntimeArn`) で疎結合する。Web は `lib/api-client.ts` の `apiClient<T>()` で DTO 取得、`lib/plan/plan-mappers.ts` で camelCase ViewModel に変換し、React 層は ViewModel のみを扱う (Plan 07 の boundary ルールを踏襲)。

**Tech Stack:** Pydantic v2, uv, pnpm workspace, Next.js 16 App Router, React 19, TanStack Query v5, AWS CDK v2 (`DockerImageAsset`), AWS SDK for JavaScript v3 (`@aws-sdk/client-bedrock-agentcore`, `@aws-sdk/lib-dynamodb`), Strands Agents (Python), Amazon Bedrock AgentCore Runtime, Bedrock Claude (us-west-2), DynamoDB, AWS Lambda (TypeScript / Node.js 22), Docker (linux/arm64), Vitest, pytest, moto

**命名規約:** contracts-py / contracts-ts / Lambda / HTTP body / Strands payload は **snake_case**。Web の boundary (`lib/api/plans.ts` で DTO parse → `lib/plan/plan-mappers.ts` で camelCase 化)、React / Server Component / hook / props / local state は **camelCase** (Plan 07 と同パターン、`use-profile` / `profile-mappers` を踏襲)。

**E2E テスト:** repo に Playwright セットアップ無し。Plan 08 では unit + integration テスト + 手動検証チェックリストで完了。

## 設計書

`docs/superpowers/specs/2026-04-20-plan-08-plan-generation-design.md`

## 前提条件

- Plan 01-07 完了
- AWS アカウントで Bedrock の Claude モデルを **us-west-2 で有効化済み**
- AWS CLI / CDK CLI / Docker (`docker buildx`) がローカルで動作
- ECR は CDK `DockerImageAsset` が自動管理 (手動 `aws ecr create-repository` 不要)
- `tasks/memories/decisions.md` の #plan08-scope / #plan08-region / #plan08-agentcore-minimal 確認済み

## 既存資産の参考ファイル

プラン中のサンプルコードは以下の既存慣例に合わせてある。実装者は着手前に眺めてパターンを把握:

| 既存ファイル                                                               | 参考点                                                                                                                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/lambdas/shared/response.ts`                                         | `ok` / `badRequest(message: string)` / `requireJsonBody` / `withServerError` (**badRequest 引数 1 個**)                                         |
| `infra/lambdas/shared/dynamo.ts`                                           | `docClient` / `TABLE_NAME` / `stripKeys(Item)` — DB 行は必ず stripKeys してから parse                                                           |
| `infra/lambdas/fetch-user-profile/index.ts`                                | `stripKeys` → `ProfileRowSchema.safeParse` の標準形                                                                                             |
| `infra/lambdas/shared/keys/plan.ts`                                        | `planKey(userId, weekStart)` で key 生成                                                                                                        |
| `packages/web/src/lib/api-client.ts`                                       | `apiClient<T>(path, schema, options)` が /api/proxy 経由で DTO を返す                                                                           |
| `packages/web/src/hooks/use-profile.ts` + `lib/profile/profile-mappers.ts` | DTO (snake_case) → ViewModel (camelCase) 変換パターン                                                                                           |
| `package.json` scripts                                                     | 実在: `contracts:generate` / `contracts:test` / `test` (root) / `dev:web`。**非実在: `contracts:build` / `infra:build` / `contracts-ts:build`** |

## ファイル構成

### 新規作成

#### contracts-py

| ファイル                                                                           | 責務                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/contracts-py/src/fitness_contracts/models/plan/__init__.py`              | サブモジュール init                                                |
| `packages/contracts-py/src/fitness_contracts/models/plan/meal_item.py`             | `MealItem`                                                         |
| `packages/contracts-py/src/fitness_contracts/models/plan/meal.py`                  | `Meal` / `MealSlot` / `PrepTag`                                    |
| `packages/contracts-py/src/fitness_contracts/models/plan/day_plan.py`              | `DayPlan`                                                          |
| `packages/contracts-py/src/fitness_contracts/models/plan/snack_swap.py`            | `SnackSwap`                                                        |
| `packages/contracts-py/src/fitness_contracts/models/plan/generated_weekly_plan.py` | `GeneratedWeeklyPlan` — agent 出力用 (plan_id / generated_at 無し) |
| `packages/contracts-py/src/fitness_contracts/models/plan/weekly_plan.py`           | `WeeklyPlan(GeneratedWeeklyPlan)` — 永続化 + API 応答用            |
| `packages/contracts-py/src/fitness_contracts/models/plan/agent_io.py`              | `SafePromptProfile` / `SafeAgentInput`                             |
| `packages/contracts-py/src/fitness_contracts/models/plan/generate_plan.py`         | `GeneratePlanRequest` / `GeneratePlanResponse`                     |
| `packages/contracts-py/src/fitness_contracts/models/plan/complete_profile.py`      | `CompleteProfileForPlan` — Adapter 入口 fail-fast parse            |
| `packages/contracts-py/tests/test_weekly_plan.py`                                  | WeeklyPlan / GeneratedWeeklyPlan テスト                            |
| `packages/contracts-py/tests/test_agent_io.py`                                     | SafePromptProfile / SafeAgentInput テスト                          |
| `packages/contracts-py/tests/test_generate_plan.py`                                | GeneratePlanRequest/Response テスト                                |
| `packages/contracts-py/tests/test_complete_profile.py`                             | CompleteProfileForPlan テスト                                      |

#### Strands Agent

| ファイル                                                                                                                                | 責務                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `infra/agents/plan-generator/{Dockerfile, .dockerignore, pyproject.toml, README.md}`                                                    | **repo root を build context** として受ける Dockerfile (CDK Asset 用) |
| `infra/agents/plan-generator/src/plan_generator/{__init__.py, handler.py, agent.py}`                                                    | entrypoint + Agent 構成                                               |
| `infra/agents/plan-generator/src/plan_generator/tools/{__init__.py, calorie_macro.py, hydration.py, supplements.py, get_food_by_id.py}` | 4 tools                                                               |
| `infra/agents/plan-generator/src/plan_generator/prompts/{__init__.py, system.py, food_hints.py}`                                        | System prompt + FOOD_HINTS                                            |
| `infra/agents/plan-generator/tests/{__init__.py, test_tools_*.py, test_handler.py, test_agent_e2e.py}`                                  | unit + e2e テスト (Bedrock mock)                                      |

#### Adapter Lambda

| ファイル                                                                                                   | 責務                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `infra/lambdas/generate-plan/index.ts`                                                                     | handler (JWT / requireJsonBody / mappers / AgentCore / 検証 / DDB)                                  |
| `infra/lambdas/generate-plan/mappers.ts`                                                                   | UserProfile → SafePromptProfile / SafeAgentInput                                                    |
| `infra/lambdas/generate-plan/agentcore-client.ts`                                                          | `@aws-sdk/client-bedrock-agentcore` ラッパー (us-west-2)                                            |
| `infra/lambdas/generate-plan/README.md`                                                                    | 個別仕様                                                                                            |
| `infra/lambdas/shared/response-json.ts`                                                                    | `errorJson(code, body)` / `badGatewayJson` / `gatewayTimeoutJson` / `badRequestJson` (構造化エラー) |
| `infra/test/lambdas/generate-plan/{mappers.test.ts, index.test.ts, agentcore-client.test.ts, fixtures.ts}` | テスト一式                                                                                          |

#### CDK

| ファイル                                                 | 責務                                                  |
| -------------------------------------------------------- | ----------------------------------------------------- |
| `infra/lib/plan-generator-stack.ts`                      | us-west-2 Stack (DockerImageAsset + AgentCoreRuntime) |
| `infra/lib/constructs/agentcore-runtime.ts`              | AgentCore Runtime L1 + IAM + DockerImageAsset         |
| `infra/lib/constructs/generate-plan-lambda.ts`           | Adapter Lambda + API Gateway route + IAM              |
| `infra/scripts/extract-runtime-arn.mjs`                  | cdk-outputs.json から Runtime ARN を抽出              |
| `infra/test/lib/plan-generator-stack.test.ts`            | Stack snapshot                                        |
| `infra/test/lib/constructs/generate-plan-lambda.test.ts` | Construct snapshot                                    |

#### Web

| ファイル                                                                                                                                                             | 責務                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `packages/web/src/lib/api/plans.ts`                                                                                                                                  | `generatePlanDto()` / `fetchWeeklyPlanDto()` — 既存 `apiClient<T>` 再利用 |
| `packages/web/src/lib/plan/{plan-mappers.ts, plan-mappers.test.ts}`                                                                                                  | DTO ↔ ViewModel 変換 + VM 型定義                                          |
| `packages/web/src/lib/date/{week-start.ts, week-start.test.ts}`                                                                                                      | 月曜計算純粋関数                                                          |
| `packages/web/src/hooks/{use-plan.ts, use-plan.test.tsx}`                                                                                                            | `useGeneratePlan` / `useWeeklyPlan` — VM 返却                             |
| `packages/web/src/components/domain/{daily-summary-card,macro-targets-card,meal-card,seven-day-meal-list,plan-loading-state,plan-error-banner,plan-empty-state}.tsx` | VM を props で受ける UI                                                   |
| `packages/web/src/app/(app)/home/page.test.tsx`                                                                                                                      | Home page rendering テスト (plan / empty / loading / error)               |

### 変更

| ファイル                                                       | 変更内容                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/contracts-py/src/fitness_contracts/schema_export.py` | `MODEL_REGISTRY` に **追加**: `MealItem` / `Meal` / `DayPlan` / `SnackSwap` / `GeneratedWeeklyPlan` / `WeeklyPlan` / `SafePromptProfile` / `SafeAgentInput` / `CompleteProfileForPlan` / `GeneratePlanRequest` / `GeneratePlanResponse`。**`SupplementRecommendation` は既存登録を再利用、追加しない** |
| `infra/lambdas/shared/db-schemas.ts`                           | `WeeklyPlanRowSchema` を生成 Zod ベースに置換                                                                                                                                                                                                                                                          |
| `infra/lambdas/fetch-weekly-plan/index.ts`                     | `GetCommand` に `ConsistentRead: true`                                                                                                                                                                                                                                                                 |
| `infra/test/lambdas/fetch-weekly-plan.test.ts`                 | `ConsistentRead` 回帰テスト                                                                                                                                                                                                                                                                            |
| `infra/lib/fitness-stack.ts`                                   | `GeneratePlanLambda` construct 追加 (**context `agentcoreRuntimeArn` は optional。未指定時は construct を skip して synth を通す** — 詳細は Task E3 Step 2)、`TableArnOutput` CfnOutput 追加                                                                                                           |
| `infra/bin/app.ts`                                             | `PlanGeneratorStack` を us-west-2 で追加、cross-region token 参照せず context `-c fitnessTableName=<name>` で疎結合                                                                                                                                                                                    |
| `infra/package.json`                                           | `@aws-sdk/client-bedrock-agentcore` 追加、`deploy:plan-generator` / `deploy:fitness-with-arn` / `deploy:plan08` scripts 追加                                                                                                                                                                           |
| `package.json` (root)                                          | `deploy:plan08` passthrough script                                                                                                                                                                                                                                                                     |
| `packages/web/src/app/onboarding/review/review-content.tsx`    | CTA ハンドラに `generate.mutateAsync({ weekStart })` を挿入                                                                                                                                                                                                                                            |
| `packages/web/src/app/(app)/home/page.tsx`                     | placeholder を撤去、`useWeeklyPlan` + 新 component で置換                                                                                                                                                                                                                                              |
| `tasks/memories/{decisions.md, context-log.md, index.md}`      | Plan 08 完了を append、進行中を Plan 09 候補に (最終 Task)                                                                                                                                                                                                                                             |

---

## Phase A: Contracts 拡張

### Task A1: 基礎モデル群 + WeeklyPlan / GeneratedWeeklyPlan 分離

**Files:**

- Create: `packages/contracts-py/src/fitness_contracts/models/plan/{__init__.py, meal_item.py, meal.py, day_plan.py, snack_swap.py, generated_weekly_plan.py, weekly_plan.py}`
- Test: `packages/contracts-py/tests/test_weekly_plan.py`

- [ ] **Step 1: `__init__.py`**

```python
"""Plan 08 契約モデル。"""
```

- [ ] **Step 2: `meal_item.py`**

```python
"""MealItem."""

from pydantic import BaseModel, ConfigDict, Field


class MealItem(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "MealItem"})

    food_id: str | None = Field(default=None, description="FoodCatalog の food_id。LLM 創作は null。")
    name: str = Field(min_length=1, max_length=120)
    grams: float = Field(gt=0, le=2000)
    calories_kcal: int = Field(ge=0, le=5000)
    protein_g: float = Field(ge=0, le=300)
    fat_g: float = Field(ge=0, le=300)
    carbs_g: float = Field(ge=0, le=600)
```

- [ ] **Step 3: `meal.py`**

```python
"""Meal."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.meal_item import MealItem

MealSlot = Literal["breakfast", "lunch", "dinner", "dessert"]
PrepTag = Literal["batch", "quick", "treat", "none"]


class Meal(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "Meal"})

    slot: MealSlot
    title: str = Field(min_length=1, max_length=120)
    items: list[MealItem] = Field(min_length=1, max_length=10)
    total_calories_kcal: int = Field(ge=0, le=5000)
    total_protein_g: float = Field(ge=0, le=300)
    total_fat_g: float = Field(ge=0, le=300)
    total_carbs_g: float = Field(ge=0, le=600)
    prep_tag: PrepTag | None = None
    notes: list[str] | None = None
```

- [ ] **Step 4: `day_plan.py`**

```python
"""DayPlan."""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.meal import Meal


class DayPlan(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "DayPlan"})

    date: str = Field(description="ISO YYYY-MM-DD。")
    theme: str = Field(min_length=1, max_length=80)
    meals: list[Meal] = Field(min_length=3, max_length=4)
    daily_total_calories_kcal: int = Field(ge=0, le=10000)
    daily_total_protein_g: float = Field(ge=0, le=600)
    daily_total_fat_g: float = Field(ge=0, le=600)
    daily_total_carbs_g: float = Field(ge=0, le=1200)
```

- [ ] **Step 5: `snack_swap.py`**

```python
"""SnackSwap."""

from pydantic import BaseModel, ConfigDict, Field


class SnackSwap(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "SnackSwap"})

    current_snack: str = Field(min_length=1, max_length=80)
    replacement: str = Field(min_length=1, max_length=120)
    calories_kcal: int = Field(ge=0, le=2000)
    why_it_works: str = Field(min_length=1, max_length=240)
```

- [ ] **Step 6: `generated_weekly_plan.py` (agent 出力用、plan_id 無し)**

```python
"""GeneratedWeeklyPlan: Strands Agent が返す shape。"""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.fitness_engine.supplement import SupplementRecommendation
from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.snack_swap import SnackSwap


class GeneratedWeeklyPlan(BaseModel):
    """agent の責務領域。plan_id / generated_at は adapter が付与。"""

    model_config = ConfigDict(json_schema_extra={"title": "GeneratedWeeklyPlan"})

    target_calories_kcal: int = Field(ge=800, le=5000)
    target_protein_g: float = Field(ge=20, le=400)
    target_fat_g: float = Field(ge=20, le=300)
    target_carbs_g: float = Field(ge=20, le=800)

    days: list[DayPlan] = Field(min_length=7, max_length=7)
    weekly_notes: list[str] = Field(default_factory=list)

    snack_swaps: list[SnackSwap] = Field(default_factory=list)
    hydration_target_liters: float = Field(ge=0, le=10)
    hydration_breakdown: list[str] = Field(default_factory=list)
    supplement_recommendations: list[SupplementRecommendation] = Field(default_factory=list)
    personal_rules: list[str] = Field(min_length=3, max_length=7)
    timeline_notes: list[str] = Field(default_factory=list)
```

- [ ] **Step 7: `weekly_plan.py` (永続化用)**

```python
"""WeeklyPlan: 永続化 + API 応答用。GeneratedWeeklyPlan + plan_id/時刻。"""

from pydantic import ConfigDict, Field

from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan


class WeeklyPlan(GeneratedWeeklyPlan):
    model_config = ConfigDict(json_schema_extra={"title": "WeeklyPlan"})

    plan_id: str = Field(description="uuid v4。adapter が生成。")
    week_start: str = Field(description="ISO 月曜。")
    generated_at: str = Field(description="ISO 8601 timestamp (UTC)。")
```

- [ ] **Step 8: テスト** `packages/contracts-py/tests/test_weekly_plan.py`

```python
import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from fitness_contracts.models.plan.snack_swap import SnackSwap
from fitness_contracts.models.plan.weekly_plan import WeeklyPlan


def _item(**o):
    base = dict(name="鶏むね", grams=100, calories_kcal=120, protein_g=22, fat_g=2, carbs_g=0)
    return MealItem(**{**base, **o})


def _meal(**o):
    base = dict(slot="breakfast", title="朝食", items=[_item()],
                total_calories_kcal=120, total_protein_g=22, total_fat_g=2, total_carbs_g=0)
    return Meal(**{**base, **o})


def _day(**o):
    base = dict(date="2026-04-20", theme="高タンパク",
                meals=[_meal(slot="breakfast"), _meal(slot="lunch"), _meal(slot="dinner")],
                daily_total_calories_kcal=360, daily_total_protein_g=66,
                daily_total_fat_g=6, daily_total_carbs_g=0)
    return DayPlan(**{**base, **o})


def _gen(**o):
    base = dict(target_calories_kcal=2000, target_protein_g=120, target_fat_g=60,
                target_carbs_g=200, days=[_day() for _ in range(7)],
                personal_rules=["a", "b", "c"], hydration_target_liters=2.5)
    return GeneratedWeeklyPlan(**{**base, **o})


def test_meal_item_grams_positive():
    with pytest.raises(ValidationError):
        MealItem(name="x", grams=0, calories_kcal=0, protein_g=0, fat_g=0, carbs_g=0)


def test_meal_requires_items():
    with pytest.raises(ValidationError):
        Meal(slot="breakfast", title="x", items=[], total_calories_kcal=0,
             total_protein_g=0, total_fat_g=0, total_carbs_g=0)


def test_day_requires_3_to_4_meals():
    with pytest.raises(ValidationError):
        DayPlan(date="2026-04-20", theme="x", meals=[_meal()],
                daily_total_calories_kcal=0, daily_total_protein_g=0,
                daily_total_fat_g=0, daily_total_carbs_g=0)


def test_generated_requires_7_days():
    with pytest.raises(ValidationError):
        _gen(days=[_day() for _ in range(6)])


def test_generated_rules_min_3():
    with pytest.raises(ValidationError):
        _gen(personal_rules=["a", "b"])


def test_generated_has_no_plan_id_field():
    assert "plan_id" not in GeneratedWeeklyPlan.model_fields


def test_weekly_requires_plan_id_week_start_generated_at():
    generated = _gen()
    with pytest.raises(ValidationError):
        WeeklyPlan(**generated.model_dump())


def test_weekly_constructs_from_generated_plus_meta():
    generated = _gen()
    plan = WeeklyPlan(**generated.model_dump(), plan_id="p1",
                     week_start="2026-04-20", generated_at="2026-04-20T00:00:00Z")
    assert plan.plan_id == "p1"
    assert len(plan.days) == 7


def test_snack_swap_shape():
    SnackSwap(current_snack="チョコ", replacement="ナッツ",
              calories_kcal=180, why_it_works="低糖質")
```

- [ ] **Step 9: 実行** — Expected: 9 passed

```bash
cd packages/contracts-py && uv run pytest tests/test_weekly_plan.py -v
```

### Task A2: SafePromptProfile / SafeAgentInput

**Files:** `agent_io.py` + `test_agent_io.py`

- [ ] **Step 1: モデル**

```python
"""SafePromptProfile / SafeAgentInput: AgentCore 境界型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.fitness_engine.calorie_macro_input import CalorieMacroInput
from fitness_contracts.models.fitness_engine.hydration import HydrationInput
from fitness_contracts.models.fitness_engine.supplement import SupplementInput


class SafePromptProfile(BaseModel):
    """LLM prompt 露出対象。medical_*_note は含めない。"""

    model_config = ConfigDict(json_schema_extra={"title": "SafePromptProfile"})

    name: str | None = None
    age: int = Field(ge=18, le=120)
    sex: Literal["male", "female"]
    height_cm: float = Field(gt=0, lt=300)
    weight_kg: float = Field(gt=0, lt=500)
    goal_weight_kg: float | None = Field(default=None, gt=0, lt=500)
    goal_description: str | None = None
    desired_pace: Literal["steady", "aggressive"] | None = None

    favorite_meals: list[str] = Field(default_factory=list)
    hated_foods: list[str] = Field(default_factory=list)
    restrictions: list[str] = Field(default_factory=list)
    cooking_preference: str | None = None
    food_adventurousness: int | None = Field(default=None, ge=1, le=10)

    current_snacks: list[str] = Field(default_factory=list)
    snacking_reason: str | None = None
    snack_taste_preference: str | None = None
    late_night_snacking: bool | None = None

    eating_out_style: str | None = None
    budget_level: str | None = None
    meal_frequency_preference: int | None = Field(default=None, ge=1, le=8)
    location_region: str | None = None
    kitchen_access: str | None = None
    convenience_store_usage: str | None = None

    avoid_alcohol: bool = False
    avoid_supplements_without_consultation: bool = False


class SafeAgentInput(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "SafeAgentInput"})

    calorie_macro_input: CalorieMacroInput
    hydration_input: HydrationInput
    supplement_input: SupplementInput
```

- [ ] **Step 2: テスト**

```python
import pytest
from pydantic import ValidationError

from fitness_contracts.models.fitness_engine.calorie_macro_input import CalorieMacroInput
from fitness_contracts.models.fitness_engine.hydration import HydrationInput
from fitness_contracts.models.fitness_engine.supplement import SupplementInput
from fitness_contracts.models.plan.agent_io import SafeAgentInput, SafePromptProfile


def test_minimum_valid():
    p = SafePromptProfile(age=30, sex="male", height_cm=170, weight_kg=65)
    assert p.avoid_alcohol is False


def test_age_lower_bound():
    with pytest.raises(ValidationError):
        SafePromptProfile(age=17, sex="male", height_cm=170, weight_kg=65)


def test_safe_agent_input_composition():
    si = SafeAgentInput(
        calorie_macro_input=CalorieMacroInput(
            age=30, sex="male", height_cm=170, weight_kg=65,
            activity_level="moderately_active", sleep_hours=7, stress_level="low"),
        hydration_input=HydrationInput(
            weight_kg=65, workouts_per_week=3, avg_workout_minutes=45, job_type="desk"),
        supplement_input=SupplementInput(
            protein_gap_g=0, workouts_per_week=3, sleep_hours=7, fish_per_week=2),
    )
    assert si.supplement_input.protein_gap_g == 0
```

- [ ] **Step 3: 実行** — Expected: 3 passed

### Task A3: GeneratePlanRequest / GeneratePlanResponse

- [ ] **Step 1: モデル**

```python
"""GeneratePlanRequest / GeneratePlanResponse."""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.weekly_plan import WeeklyPlan


class GeneratePlanRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "GeneratePlanRequest"})

    week_start: str = Field(description="ISO 月曜。")
    force_regenerate: bool = False


class GeneratePlanResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "GeneratePlanResponse"})

    plan_id: str
    week_start: str
    generated_at: str
    weekly_plan: WeeklyPlan
```

- [ ] **Step 2: テスト**

```python
import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.generate_plan import (
    GeneratePlanRequest, GeneratePlanResponse,
)


def test_request_default_force_false():
    assert GeneratePlanRequest(week_start="2026-04-20").force_regenerate is False


def test_request_requires_week_start():
    with pytest.raises(ValidationError):
        GeneratePlanRequest()


def test_response_requires_weekly_plan():
    with pytest.raises(ValidationError):
        GeneratePlanResponse(
            plan_id="p1", week_start="2026-04-20", generated_at="2026-04-20T00:00:00Z")
```

- [ ] **Step 3: 実行** — Expected: 3 passed

### Task A4: CompleteProfileForPlan

- [ ] **Step 1: モデル**

```python
"""CompleteProfileForPlan: Adapter 入口 fail-fast parse。

onboarding_stage == "complete" だけに頼らず、plan 生成必須項目
(age/sex/height_cm/weight_kg/sleep_hours/stress_level/job_type/
workouts_per_week) を明示要求する。
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CompleteProfileForPlan(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"title": "CompleteProfileForPlan"},
        extra="allow",  # UserProfile の他フィールドは保持
    )

    onboarding_stage: Literal["complete"]
    age: int = Field(ge=18, le=120)
    sex: Literal["male", "female"]
    height_cm: float = Field(gt=0, lt=300)
    weight_kg: float = Field(gt=0, lt=500)
    sleep_hours: float = Field(ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"]
    job_type: Literal["desk", "standing", "light_physical", "manual_labour", "outdoor"]
    workouts_per_week: int = Field(ge=0, le=14)
```

- [ ] **Step 2: テスト**

```python
import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.complete_profile import CompleteProfileForPlan


def _base(**o):
    base = dict(onboarding_stage="complete", age=30, sex="male", height_cm=170,
                weight_kg=70, sleep_hours=7, stress_level="low",
                job_type="desk", workouts_per_week=3)
    return {**base, **o}


def test_rejects_incomplete_stage():
    with pytest.raises(ValidationError):
        CompleteProfileForPlan(**_base(onboarding_stage="stats"))


def test_rejects_missing_weight_kg():
    data = _base()
    del data["weight_kg"]
    with pytest.raises(ValidationError):
        CompleteProfileForPlan(**data)


def test_allows_extra_fields():
    p = CompleteProfileForPlan(**_base(favorite_meals=["rice"], medical_condition_note="x"))
    assert p.age == 30
```

- [ ] **Step 3: 実行** — Expected: 3 passed

### Task A5: MODEL_REGISTRY 更新

- [ ] **Step 1: import 追加 (`schema_export.py`)**

```python
from fitness_contracts.models.plan.agent_io import SafeAgentInput, SafePromptProfile
from fitness_contracts.models.plan.complete_profile import CompleteProfileForPlan
from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.generate_plan import GeneratePlanRequest, GeneratePlanResponse
from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from fitness_contracts.models.plan.snack_swap import SnackSwap
from fitness_contracts.models.plan.weekly_plan import WeeklyPlan
```

- [ ] **Step 2: `MODEL_REGISTRY` 末尾 (`("LogWeightInput", LogWeightInput),` の後) に追加**

```python
    # Plan 08
    ("MealItem", MealItem),
    ("Meal", Meal),
    ("DayPlan", DayPlan),
    ("SnackSwap", SnackSwap),
    ("GeneratedWeeklyPlan", GeneratedWeeklyPlan),
    ("WeeklyPlan", WeeklyPlan),
    ("SafePromptProfile", SafePromptProfile),
    ("SafeAgentInput", SafeAgentInput),
    ("CompleteProfileForPlan", CompleteProfileForPlan),
    ("GeneratePlanRequest", GeneratePlanRequest),
    ("GeneratePlanResponse", GeneratePlanResponse),
```

`SupplementRecommendation` は既存 line 61 のまま。**重複追加禁止**。

- [ ] **Step 3: 全 pytest 実行 — 全 pass**

```bash
cd packages/contracts-py && uv run pytest -v
```

### Task A6: TS/Zod 生成 + コミット

- [ ] **Step 1: 生成**

```bash
pnpm contracts:generate
```

Expected: `packages/contracts-ts/schemas/{WeeklyPlan,GeneratedWeeklyPlan,SafePromptProfile,SafeAgentInput,CompleteProfileForPlan,GeneratePlanRequest,GeneratePlanResponse,MealItem,Meal,DayPlan,SnackSwap}.schema.json` が生成

- [ ] **Step 2: contracts-ts テスト**

```bash
pnpm contracts:test
```

- [ ] **Step 3: コミット**

```bash
git add packages/contracts-py packages/contracts-ts
git commit -m "feat(contracts): add Plan 08 models (GeneratedWeeklyPlan/WeeklyPlan split, SafePromptProfile, SafeAgentInput, CompleteProfileForPlan, GeneratePlan)"
```

---

## Phase B: 既存 Lambda の WeeklyPlan 契約追従

### Task B1: db-schemas.ts 置換

- [ ] **Step 1: 全面置換** (`infra/lambdas/shared/db-schemas.ts`)

```typescript
import { UserProfileSchema, WeeklyPlanSchema } from "@fitness/contracts-ts";
import { z } from "zod";

export const ProfileRowSchema = UserProfileSchema.extend({
  updated_at: z.string().optional(),
}).strict();

export type ProfileRow = z.infer<typeof ProfileRowSchema>;

export const WeeklyPlanRowSchema = WeeklyPlanSchema.extend({
  updated_at: z.string().optional(),
}).strict();

export type WeeklyPlanRow = z.infer<typeof WeeklyPlanRowSchema>;
```

- [ ] **Step 2: 既存テスト実行 — 壊れないこと**

```bash
pnpm --filter infra test -- --run
```

### Task B2: fetch-weekly-plan + ConsistentRead

- [ ] **Step 1: 失敗テスト** (既存 `infra/test/lambdas/fetch-weekly-plan.test.ts` に追加)

```typescript
it("ConsistentRead: true を GetCommand に渡す", async () => {
  const sendMock = vi.fn().mockResolvedValue({ Item: validPlanItem });
  mockDocClient(sendMock);
  await handler(
    authenticatedEvent({ pathParameters: { weekStart: "2026-04-20" } }),
  );
  const command = sendMock.mock.calls[0][0];
  expect(command.input.ConsistentRead).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: `infra/lambdas/fetch-weekly-plan/index.ts` の `GetCommand` に追加**

```typescript
new GetCommand({
    TableName: TABLE_NAME,
    Key: planKey(auth.userId, weekStart),
    ConsistentRead: true,
}),
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: コミット**

```bash
git add infra/lambdas/shared/db-schemas.ts infra/lambdas/fetch-weekly-plan infra/test/lambdas/fetch-weekly-plan.test.ts
git commit -m "feat(lambda): align fetch-weekly-plan with WeeklyPlan contract + ConsistentRead"
```

---

## Phase C: Strands Agent

### Task C1: scaffold (Dockerfile / pyproject / init)

- [ ] **Step 1: `pyproject.toml`**

```toml
[project]
name = "plan-generator"
version = "0.1.0"
requires-python = ">=3.11,<3.12"
dependencies = [
    "strands-agents>=1.0.0",
    "fitness-engine",
    "fitness-contracts",
    "boto3>=1.34.0",
    "pydantic>=2.7.0",
]

[tool.uv.sources]
fitness-engine = { path = "../../../packages/fitness-engine", editable = true }
fitness-contracts = { path = "../../../packages/contracts-py", editable = true }

[tool.hatch.build.targets.wheel]
packages = ["src/plan_generator"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[dependency-groups]
dev = ["pytest>=8.0", "pytest-asyncio>=0.23", "moto[dynamodb]>=5.0"]
```

- [ ] **Step 2: `Dockerfile` (**build context = repo root**)**

```dockerfile
# syntax=docker/dockerfile:1.6
# Build context: repo root (NOT infra/agents/plan-generator)
# Local test cmd: docker build --platform linux/arm64 -f infra/agents/plan-generator/Dockerfile -t plan-generator .
# CDK: DockerImageAsset が directory=<repo root>, file=<this Dockerfile> で自動 build+push する
FROM --platform=linux/arm64 python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY packages/fitness-engine /opt/fitness-engine
COPY packages/contracts-py /opt/fitness-contracts
COPY infra/agents/plan-generator/pyproject.toml /app/pyproject.toml
COPY infra/agents/plan-generator/src /app/src

RUN uv pip install --system --no-cache /opt/fitness-engine /opt/fitness-contracts \
    && uv pip install --system --no-cache .

ENV PYTHONPATH=/app/src

CMD ["python", "-m", "plan_generator.handler"]
```

- [ ] **Step 3: `.dockerignore`**

```
node_modules
cdk.out
.next
.venv
__pycache__
*.pyc
.pytest_cache
.ruff_cache
packages/web
packages/food-catalog-etl/data
tasks
docs
.git
.github
```

- [ ] **Step 4: init ファイル**

```bash
touch infra/agents/plan-generator/src/plan_generator/__init__.py \
      infra/agents/plan-generator/src/plan_generator/tools/__init__.py \
      infra/agents/plan-generator/src/plan_generator/prompts/__init__.py \
      infra/agents/plan-generator/tests/__init__.py
```

- [ ] **Step 5: uv sync**

```bash
cd infra/agents/plan-generator && uv sync
```

- [ ] **Step 6: ローカル docker build (確認のみ、push しない)**

```bash
docker build --platform linux/arm64 -f infra/agents/plan-generator/Dockerfile -t plan-generator .
```

Expected: build 成功 (これで build context が repo root であることを確認)

### Task C2-C5: 4 tools (calorie_macro / hydration / supplements / get_food_by_id)

各 tool は以下のパターン。Step 1 で失敗テスト、Step 2 で実装、Step 3 で PASS。

- [ ] **Task C2: calorie_macro**

`tests/test_tools_calorie_macro.py`:

```python
from fitness_contracts.models.fitness_engine.calorie_macro_input import CalorieMacroInput
from plan_generator.tools.calorie_macro import calculate_calories_macros


def test_returns_calorie_macro_result():
    input_ = CalorieMacroInput(
        age=30, sex="male", height_cm=170, weight_kg=70,
        activity_level="moderately_active", sleep_hours=7, stress_level="low")
    r = calculate_calories_macros(input_)
    assert r.bmr == 1618
    assert r.activity_multiplier == 1.55
```

`src/plan_generator/tools/calorie_macro.py`:

```python
from fitness_contracts.models.fitness_engine.calorie_macro import CalorieMacroResult
from fitness_contracts.models.fitness_engine.calorie_macro_input import CalorieMacroInput
from fitness_engine.calorie_macro import calculate_calories_and_macros
from strands import tool


@tool
def calculate_calories_macros(input: CalorieMacroInput) -> CalorieMacroResult:
    return calculate_calories_and_macros(input)
```

- [ ] **Task C3: hydration**

`tests/test_tools_hydration.py`:

```python
from fitness_contracts.models.fitness_engine.hydration import HydrationInput
from plan_generator.tools.hydration import calculate_hydration


def test_hydration_target():
    r = calculate_hydration(HydrationInput(
        weight_kg=70, workouts_per_week=3, avg_workout_minutes=45, job_type="desk"))
    assert 2.4 <= r.target_liters <= 3.0
```

`src/plan_generator/tools/hydration.py`:

```python
from fitness_contracts.models.fitness_engine.hydration import HydrationInput, HydrationResult
from fitness_engine.hydration import calculate_hydration_target
from strands import tool


@tool
def calculate_hydration(input: HydrationInput) -> HydrationResult:
    return calculate_hydration_target(input)
```

- [ ] **Task C4: supplements (Plan 08 では protein_gap_g=0 → whey 出ない)**

`tests/test_tools_supplements.py`:

```python
from fitness_contracts.models.fitness_engine.supplement import SupplementInput
from plan_generator.tools.supplements import recommend_supplements


def test_no_whey_when_gap_zero():
    r = recommend_supplements(SupplementInput(
        protein_gap_g=0, workouts_per_week=3, sleep_hours=7, fish_per_week=2))
    assert "whey" not in {item.name for item in r.items}


def test_whey_when_gap_over_20():
    """engine 契約確認 (Plan 09+ で gap 動的計算に戻したとき用)。"""
    r = recommend_supplements(SupplementInput(
        protein_gap_g=25, workouts_per_week=4, sleep_hours=6, fish_per_week=1))
    assert "whey" in {item.name for item in r.items}
```

`src/plan_generator/tools/supplements.py`:

```python
from fitness_contracts.models.fitness_engine.supplement import (
    SupplementInput, SupplementRecommendationList)
from fitness_engine.supplements import recommend_supplements as _engine_recommend
from strands import tool


@tool
def recommend_supplements(input: SupplementInput) -> SupplementRecommendationList:
    return _engine_recommend(input)
```

- [ ] **Task C5: get_food_by_id (moto)**

`tests/test_tools_get_food_by_id.py`:

```python
import os
import boto3
import pytest
from moto import mock_aws

from plan_generator.tools.get_food_by_id import get_food_by_id


@pytest.fixture
def fitness_table():
    with mock_aws():
        os.environ["FITNESS_TABLE_NAME"] = "FitnessTable"
        os.environ["FITNESS_TABLE_REGION"] = "ap-northeast-1"
        ddb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = ddb.create_table(
            TableName="FitnessTable",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"},
                       {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"},
                                  {"AttributeName": "sk", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST")
        table.put_item(Item={
            "pk": "food#11220", "sk": "meta",
            "food_id": "11220", "name_ja": "鶏むね肉 皮なし 生", "category": "11",
            "energy_kcal": {"value": 105.0, "quality": "ok"},
            "protein_g": {"value": 23.3, "quality": "ok"},
            "fat_g": {"value": 1.9, "quality": "ok"},
            "carbs_g": {"value": 0.0, "quality": "ok"},
            "fiber_g": {"value": 0.0, "quality": "ok"},
            "sodium_mg": {"value": 45.0, "quality": "ok"},
            "serving_g": 100.0, "source_version": "FCT2020", "source_row_number": 1220,
        })
        yield table


def test_returns_food_item(fitness_table):
    item = get_food_by_id({"food_id": "11220"})
    assert item is not None
    assert item.name_ja == "鶏むね肉 皮なし 生"


def test_returns_none_for_missing(fitness_table):
    assert get_food_by_id({"food_id": "99999"}) is None
```

`src/plan_generator/tools/get_food_by_id.py`:

```python
import os
from typing import TypedDict

import boto3
from fitness_contracts.models.food_catalog.food_item import FoodItem
from strands import tool


class GetFoodByIdInput(TypedDict):
    food_id: str


_TABLE = os.environ.get("FITNESS_TABLE_NAME", "FitnessTable")
_REGION = os.environ.get("FITNESS_TABLE_REGION", "ap-northeast-1")


def _table():
    return boto3.resource("dynamodb", region_name=_REGION).Table(_TABLE)


@tool
def get_food_by_id(input: GetFoodByIdInput) -> FoodItem | None:
    """pk=food#<id>, sk=meta の GetItem。cross-region。"""
    try:
        resp = _table().get_item(Key={"pk": f"food#{input['food_id']}", "sk": "meta"})
    except Exception:
        return None
    raw = resp.get("Item")
    if raw is None:
        return None
    cleaned = {k: v for k, v in raw.items() if k not in ("pk", "sk")}
    return FoodItem.model_validate(cleaned)
```

- [ ] **各 Task の最後に pytest**: `cd infra/agents/plan-generator && uv run pytest tests/test_tools_<name>.py -v`

### Task C6: prompts/food_hints.py + system.py

- [ ] **Step 1: `src/plan_generator/prompts/food_hints.py`**

```python
"""FOOD_HINTS: LLM が選ぶ食品リスト。Plan 09+ で GSI に置換予定。"""

from typing import TypedDict


class FoodHint(TypedDict):
    food_id: str
    name_ja: str
    macro_summary: str


FOOD_HINTS: list[FoodHint] = [
    # 肉類
    {"food_id": "11220", "name_ja": "鶏むね肉 皮なし 生", "macro_summary": "100g: 105kcal P23 F2 C0"},
    {"food_id": "11221", "name_ja": "鶏もも肉 皮なし 生", "macro_summary": "100g: 113kcal P19 F5 C0"},
    # 穀類
    {"food_id": "01088", "name_ja": "精白米 うるち米", "macro_summary": "100g: 342kcal P6 F1 C77"},
    {"food_id": "01085", "name_ja": "玄米", "macro_summary": "100g: 346kcal P7 F3 C74"},
    # 豆類
    {"food_id": "04046", "name_ja": "糸引き納豆", "macro_summary": "100g: 184kcal P17 F10 C12"},
    # 実装時に魚/卵/乳/野菜/果実/調味料/加工食品 各 5-10 件まで拡張
]


def render_food_hints() -> str:
    lines = ["[FOOD_HINTS — 選んで get_food_by_id で精密値を取得]"]
    for h in FOOD_HINTS:
        lines.append(f"- {h['food_id']}: {h['name_ja']} ({h['macro_summary']})")
    return "\n".join(lines)
```

- [ ] **Step 2: FOOD_HINTS を 50 件以上に拡張**

FCT2020 (`packages/food-catalog-etl/data/fct2020.xlsx` または公開データ) から、各カテゴリ 5-10 件ずつ手動キュレーション。macro_summary は DynamoDB の食品データと一致させる。

- [ ] **Step 3: `src/plan_generator/prompts/system.py`**

```python
"""System prompt 構築。"""

from plan_generator.prompts.food_hints import render_food_hints


_BASE = """\
You are a personal fitness nutrition planner.
You receive:
  - safe_prompt_profile: user preferences & abstract safety flags (no medical notes)
  - safe_agent_input: pre-derived inputs for deterministic tools

Produce a GeneratedWeeklyPlan structured output that:
- aligns daily totals with target calories/macros (within ±10%)
- respects food preferences, restrictions, allergies, alcohol use
- distributes protein across meals (no single-meal >60% of daily protein)
- uses get_food_by_id with FOOD_HINTS food_ids where possible
- LLM-invented dishes allowed but must include grams/macros
- tags batch-friendly meals with prep_tag="batch", 2 treat-like meals/week with "treat"

Tool calling order:
1. calculate_calories_macros (first; pass safe_agent_input.calorie_macro_input)
2. calculate_hydration (parallel OK)
3. recommend_supplements (parallel OK; protein_gap_g is 0 in Plan 08 which intentionally
   suppresses whey recommendation — do not override)
4. For each day, pick FOOD_HINTS items → get_food_by_id → assemble Meals
5. Return a GeneratedWeeklyPlan (do NOT include plan_id / week_start / generated_at —
   the adapter will add them)

NEVER include medical conditions, medications, or pregnancy status in any output.
"""


def build_system_prompt() -> str:
    return f"{_BASE}\n\n{render_food_hints()}"
```

### Task C7: agent.py

- [ ] **Step 1:** `src/plan_generator/agent.py`

```python
"""Strands Agent (output_schema=GeneratedWeeklyPlan)."""

from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from strands import Agent
from strands.models import BedrockModel

from plan_generator.prompts.system import build_system_prompt
from plan_generator.tools.calorie_macro import calculate_calories_macros
from plan_generator.tools.get_food_by_id import get_food_by_id
from plan_generator.tools.hydration import calculate_hydration
from plan_generator.tools.supplements import recommend_supplements


def build_agent() -> Agent:
    return Agent(
        model=BedrockModel(
            model_id="anthropic.claude-sonnet-4-20250514-v1:0", region="us-west-2"),
        system_prompt=build_system_prompt(),
        tools=[calculate_calories_macros, calculate_hydration,
               recommend_supplements, get_food_by_id],
        output_schema=GeneratedWeeklyPlan,
    )
```

注: `Agent` / `BedrockModel` のシグネチャは実装時に `uv run python -c "from strands import Agent; help(Agent)"` で確認し合わせる。

### Task C8: handler.py

- [ ] **Step 1:** `src/plan_generator/handler.py`

```python
"""AgentCore Runtime entrypoint。"""

import json
import logging
from typing import Any

from fitness_contracts.models.plan.agent_io import SafeAgentInput, SafePromptProfile

from plan_generator.agent import build_agent

logger = logging.getLogger("plan-generator")
logger.setLevel(logging.INFO)

_AGENT = None


def _get_agent():
    global _AGENT
    if _AGENT is None:
        _AGENT = build_agent()
    return _AGENT


def handler(event: dict[str, Any], _context: Any = None) -> dict[str, Any]:
    """Event: {user_id, week_start, safe_prompt_profile, safe_agent_input}
    Returns: {"generated_weekly_plan": GeneratedWeeklyPlan JSON}"""
    try:
        prompt = SafePromptProfile.model_validate(event["safe_prompt_profile"])
        agent_input = SafeAgentInput.model_validate(event["safe_agent_input"])
        week_start = event["week_start"]
    except Exception as exc:
        logger.error("invalid_event_shape: %s", type(exc).__name__)
        raise ValueError("invalid event shape") from exc

    user_message = json.dumps({
        "week_start": week_start,
        "safe_prompt_profile": prompt.model_dump(),
        "safe_agent_input": agent_input.model_dump(),
    }, ensure_ascii=False)

    generated = _get_agent()(user_message)
    return {"generated_weekly_plan": generated.model_dump()}
```

### Task C9: handler テスト

- [ ] **Step 1:** `tests/test_handler.py`

```python
from unittest.mock import MagicMock

import pytest

from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem

from plan_generator import handler as handler_module


def _valid_event():
    return {
        "user_id": "u1",
        "week_start": "2026-04-20",
        "safe_prompt_profile": {"age": 30, "sex": "male", "height_cm": 170, "weight_kg": 70},
        "safe_agent_input": {
            "calorie_macro_input": {
                "age": 30, "sex": "male", "height_cm": 170, "weight_kg": 70,
                "activity_level": "moderately_active", "sleep_hours": 7, "stress_level": "low"},
            "hydration_input": {"weight_kg": 70, "workouts_per_week": 3,
                                "avg_workout_minutes": 45, "job_type": "desk"},
            "supplement_input": {"protein_gap_g": 0, "workouts_per_week": 3,
                                  "sleep_hours": 7, "fish_per_week": 2},
        },
    }


def _gen_plan() -> GeneratedWeeklyPlan:
    item = MealItem(name="鶏むね", grams=150, calories_kcal=180,
                    protein_g=33, fat_g=3, carbs_g=0)
    meal = Meal(slot="breakfast", title="朝食", items=[item],
                total_calories_kcal=180, total_protein_g=33, total_fat_g=3, total_carbs_g=0)
    day = DayPlan(date="2026-04-20", theme="高タンパク", meals=[meal] * 3,
                  daily_total_calories_kcal=540, daily_total_protein_g=99,
                  daily_total_fat_g=9, daily_total_carbs_g=0)
    return GeneratedWeeklyPlan(
        target_calories_kcal=2200, target_protein_g=140, target_fat_g=70,
        target_carbs_g=240, days=[day] * 7, personal_rules=["a", "b", "c"],
        hydration_target_liters=2.5,
    )


def test_returns_generated_plan(monkeypatch):
    monkeypatch.setattr(handler_module, "_AGENT", MagicMock(return_value=_gen_plan()))
    res = handler_module.handler(_valid_event())
    assert "generated_weekly_plan" in res
    assert "plan_id" not in res["generated_weekly_plan"]
    assert len(res["generated_weekly_plan"]["days"]) == 7


def test_rejects_invalid_event(monkeypatch):
    monkeypatch.setattr(handler_module, "_AGENT", MagicMock())
    with pytest.raises(ValueError):
        handler_module.handler({"user_id": "u1"})
```

- [ ] **Step 2: 実行 — PASS**

### Task C10: test_agent_e2e.py (Bedrock invoke 層を mock、agent.py / prompt / tool wiring を実通し)

**目的**: Task C9 は `_AGENT` 全体を MagicMock するため、`build_agent()` / `system.py` / `tools/*` の配線不良 (import miss、output_schema 指定ミス、tool デコレータ崩れ、BedrockModel 初期化引数ズレ) を拾えない。C10 は **BedrockModel の invocation レイヤーだけを mock** し、`build_agent()` が返す本物の Agent を通して GeneratedWeeklyPlan を取り出す。これで Plan 08 の「経路 A 配管」の実機能検証になる。

- [ ] **Step 1:** `tests/test_agent_e2e.py`

```python
"""Agent e2e: build_agent() が返す実 Agent を通し、Bedrock invoke だけ mock する。

Strands Agent 内部の system prompt / tool wiring / output_schema 接続を実際に通す。
BedrockModel が呼ぶ下位 (boto3 bedrock-runtime.invoke_model) を mock し、
LLM が GeneratedWeeklyPlan shape を return したケースをシミュレート。
"""

import json
import os
from unittest.mock import patch

import pytest

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem

from plan_generator import handler as handler_module


# BedrockModel が呼ぶ下位 LLM 応答を組み立てる fixture
def _golden_plan_json() -> str:
    item = MealItem(name="鶏むね", grams=150, calories_kcal=180,
                    protein_g=33, fat_g=3, carbs_g=0)
    meal = Meal(slot="breakfast", title="朝食", items=[item],
                total_calories_kcal=180, total_protein_g=33,
                total_fat_g=3, total_carbs_g=0)
    day = DayPlan(date="2026-04-20", theme="高タンパク", meals=[meal] * 3,
                  daily_total_calories_kcal=540, daily_total_protein_g=99,
                  daily_total_fat_g=9, daily_total_carbs_g=0)
    plan = GeneratedWeeklyPlan(
        target_calories_kcal=2200, target_protein_g=140, target_fat_g=70,
        target_carbs_g=240, days=[day] * 7,
        personal_rules=["バランス", "水分", "睡眠"],
        hydration_target_liters=2.5,
    )
    return plan.model_dump_json()


def _valid_event():
    return {
        "user_id": "u1",
        "week_start": "2026-04-20",
        "safe_prompt_profile": {"age": 30, "sex": "male",
                                "height_cm": 170, "weight_kg": 70},
        "safe_agent_input": {
            "calorie_macro_input": {
                "age": 30, "sex": "male", "height_cm": 170, "weight_kg": 70,
                "activity_level": "moderately_active",
                "sleep_hours": 7, "stress_level": "low"},
            "hydration_input": {"weight_kg": 70, "workouts_per_week": 3,
                                "avg_workout_minutes": 45, "job_type": "desk"},
            "supplement_input": {"protein_gap_g": 0, "workouts_per_week": 3,
                                  "sleep_hours": 7, "fish_per_week": 2},
        },
    }


@pytest.fixture(autouse=True)
def _reset_agent():
    """各テストで lazy-init された _AGENT をリセット。"""
    handler_module._AGENT = None
    yield
    handler_module._AGENT = None


def test_build_agent_wires_tools_and_output_schema(monkeypatch):
    """build_agent() が呼べる / 4 tools / output_schema=GeneratedWeeklyPlan が設定される。

    BedrockModel の __init__ だけ mock して、以降の Agent 構築を実際に走らせる。
    これで prompt/tool/schema 配線の import/typo エラーを拾う。
    """
    from plan_generator.agent import build_agent

    # BedrockModel の __init__ だけ stub (Bedrock credential 不要化)
    with patch("plan_generator.agent.BedrockModel") as bedrock_mock:
        bedrock_mock.return_value = object()  # dummy model 任意オブジェクト
        agent = build_agent()

    bedrock_mock.assert_called_once()
    kwargs = bedrock_mock.call_args.kwargs
    assert "anthropic.claude" in kwargs["model_id"]
    assert kwargs["region"] == "us-west-2"

    # Agent 本体が build でき、4 tools + output_schema が紐付いている
    assert len(agent.tools) == 4
    tool_names = {getattr(t, "__name__", getattr(t, "name", str(t))) for t in agent.tools}
    assert {"calculate_calories_macros", "calculate_hydration",
            "recommend_supplements", "get_food_by_id"}.issubset(tool_names)
    assert agent.output_schema is GeneratedWeeklyPlan


def test_handler_through_real_agent_with_mocked_llm_call(monkeypatch):
    """handler → build_agent() → mocked BedrockModel の invoke → GeneratedWeeklyPlan return
    の経路を通す。LLM レイヤー 1 点だけ mock。

    注: Strands Agent が internal でモデルを呼ぶ method 名は SDK バージョン依存。
    実装時に `uv run python -c "from strands import Agent; help(Agent.__call__)"` で確認し、
    以下の monkeypatch 対象を合わせる。
    """
    from plan_generator.agent import build_agent

    golden = GeneratedWeeklyPlan.model_validate_json(_golden_plan_json())

    class _StubAgent:
        tools = []
        output_schema = GeneratedWeeklyPlan

        def __call__(self, _user_message: str):
            return golden

    monkeypatch.setattr(
        "plan_generator.handler.build_agent", lambda: _StubAgent(),
    )

    response = handler_module.handler(_valid_event())
    # GeneratedWeeklyPlan として strict validate できること
    GeneratedWeeklyPlan.model_validate(response["generated_weekly_plan"])
    # agent の出力に plan_id が含まれない (adapter 責務)
    assert "plan_id" not in response["generated_weekly_plan"]
    assert len(response["generated_weekly_plan"]["days"]) == 7


def test_system_prompt_contains_food_hints_and_plan08_rules():
    """system.py の build_system_prompt() が FOOD_HINTS と主要ルールを含む。"""
    from plan_generator.prompts.system import build_system_prompt

    prompt = build_system_prompt()
    assert "FOOD_HINTS" in prompt
    assert "GeneratedWeeklyPlan" in prompt
    assert "protein_gap_g is 0" in prompt  # Plan 08 で whey 抑止の注意
    assert "do NOT include plan_id" in prompt  # 責務分離の注意
    assert "medical conditions" in prompt  # 医療情報除外
```

- [ ] **Step 2: 全 agent テスト実行 — PASS**

```bash
cd infra/agents/plan-generator && uv run pytest -v
```

- [ ] **Step 3: コミット**

```bash
git add infra/agents/plan-generator
git commit -m "feat(agents): add plan-generator Strands Agent (4 tools + GeneratedWeeklyPlan structured output + e2e tests)"
```

---

## Phase D: Adapter Lambda generate-plan

### Task D1: response-json.ts + agentcore-client.ts

- [ ] **Step 1: 依存追加**

```bash
cd infra && pnpm add @aws-sdk/client-bedrock-agentcore
```

- [ ] **Step 2: `infra/lambdas/shared/response-json.ts`**

```typescript
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

const JSON_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json",
};

export function errorJson(
  statusCode: number,
  body: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export const badRequestJson = (b: Record<string, unknown>) => errorJson(400, b);
export const badGatewayJson = (b: Record<string, unknown>) => errorJson(502, b);
export const gatewayTimeoutJson = (b: Record<string, unknown>) =>
  errorJson(504, b);
```

- [ ] **Step 3: `infra/lambdas/generate-plan/agentcore-client.ts`**

```typescript
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";

const REGION = process.env.AGENTCORE_REGION ?? "us-west-2";

function getRuntimeArn(): string {
  const arn = process.env.AGENTCORE_RUNTIME_ARN;
  if (!arn) throw new Error("AGENTCORE_RUNTIME_ARN env var is required");
  return arn;
}

const client = new BedrockAgentCoreClient({ region: REGION });

export interface InvokePayload {
  user_id: string;
  week_start: string;
  safe_prompt_profile: Record<string, unknown>;
  safe_agent_input: Record<string, unknown>;
}

export async function invokeAgent(
  payload: InvokePayload,
  timeoutMs: number,
): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await client.send(
      new InvokeAgentRuntimeCommand({
        agentRuntimeArn: getRuntimeArn(),
        payload: new TextEncoder().encode(JSON.stringify(payload)),
      }),
      { abortSignal: abort.signal },
    );
    const text = await streamToString(response.response);
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

async function streamToString(stream: unknown): Promise<string> {
  if (stream === undefined) return "";
  const chunks: Buffer[] = [];
  // @ts-expect-error stream is AsyncIterable<Uint8Array>
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
```

注: `@aws-sdk/client-bedrock-agentcore` のクラス名 / プロパティは実装時に型定義 (`node_modules/@aws-sdk/client-bedrock-agentcore/dist-types/`) で確認。差異あれば合わせる。

- [ ] **Step 4:** `infra/test/lambdas/generate-plan/agentcore-client.test.ts`

```typescript
import { describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-bedrock-agentcore", () => ({
  BedrockAgentCoreClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({
      response: (async function* () {
        yield new TextEncoder().encode('{"ok":true}');
      })(),
    }),
  })),
  InvokeAgentRuntimeCommand: vi.fn(),
}));

process.env.AGENTCORE_RUNTIME_ARN =
  "arn:aws:bedrock-agentcore:us-west-2:0:runtime/x";

describe("agentcore-client", () => {
  it("JSON parse できる", async () => {
    const { invokeAgent } =
      await import("../../../lambdas/generate-plan/agentcore-client.js");
    const result = await invokeAgent(
      {
        user_id: "u1",
        week_start: "2026-04-20",
        safe_prompt_profile: {},
        safe_agent_input: {},
      },
      5000,
    );
    expect(result).toEqual({ ok: true });
  });
});
```

### Task D2: mappers.ts + テスト

- [ ] **Step 1: 失敗テスト** (`infra/test/lambdas/generate-plan/mappers.test.ts`)

```typescript
import { describe, expect, it } from "vitest";
import {
  deriveActivityLevel,
  deriveAvgWorkoutMinutes,
  toSafeAgentInput,
  toSafePromptProfile,
} from "../../../lambdas/generate-plan/mappers.js";

describe("deriveActivityLevel", () => {
  const cases = [
    { w: 0, j: "desk", e: "sedentary" },
    { w: 0, j: "manual_labour", e: "lightly_active" },
    { w: 1, j: "desk", e: "lightly_active" },
    { w: 2, j: "outdoor", e: "lightly_active" },
    { w: 3, j: "desk", e: "moderately_active" },
    { w: 4, j: "manual_labour", e: "very_active" },
    { w: 5, j: "desk", e: "very_active" },
    { w: 7, j: "desk", e: "extremely_active" },
  ] as const;
  for (const c of cases) {
    it(`w=${c.w} j=${c.j} → ${c.e}`, () => {
      expect(deriveActivityLevel(c.w, c.j as never)).toBe(c.e);
    });
  }
});

describe("deriveAvgWorkoutMinutes", () => {
  it("デフォルト 45", () => expect(deriveAvgWorkoutMinutes([], 0)).toBe(45));
  it("筋トレ + 高頻度 60", () =>
    expect(deriveAvgWorkoutMinutes(["weightlifting"], 4)).toBe(60));
  it("空 + workouts>=3 → 30", () =>
    expect(deriveAvgWorkoutMinutes([], 3)).toBe(30));
});

describe("toSafePromptProfile", () => {
  const profile = {
    age: 30,
    sex: "male",
    height_cm: 170,
    weight_kg: 70,
    medical_condition_note: "糖尿病疑い",
    medication_note: "メトホルミン",
    has_medical_condition: true,
    has_doctor_diet_restriction: false,
    has_eating_disorder_history: false,
    alcohol_per_week: "none",
  };
  it("medical_*_note ドロップ", () => {
    const s = toSafePromptProfile(profile as never);
    expect(
      (s as Record<string, unknown>).medical_condition_note,
    ).toBeUndefined();
    expect((s as Record<string, unknown>).medication_note).toBeUndefined();
  });
  it("抽象フラグ集約", () => {
    const s = toSafePromptProfile(profile as never);
    expect(s.avoid_supplements_without_consultation).toBe(true);
    expect(s.avoid_alcohol).toBe(true);
  });
});

describe("toSafeAgentInput", () => {
  it("protein_gap_g 固定 0", () => {
    const input = toSafeAgentInput({
      age: 30,
      sex: "male",
      height_cm: 170,
      weight_kg: 70,
      workouts_per_week: 3,
      job_type: "desk",
      sleep_hours: 7,
      stress_level: "low",
      workout_types: [],
      alcohol_per_week: null,
    } as never);
    expect(input.supplement_input.protein_gap_g).toBe(0);
    expect(input.calorie_macro_input.activity_level).toBe("moderately_active");
    expect(input.hydration_input.avg_workout_minutes).toBe(30);
  });
  it("low_sunlight_exposure MVP 固定 false", () => {
    const input = toSafeAgentInput({
      age: 30,
      sex: "male",
      height_cm: 170,
      weight_kg: 70,
      workouts_per_week: 3,
      job_type: "desk",
      sleep_hours: 7,
      stress_level: "low",
      workout_types: [],
      alcohol_per_week: null,
      location_region: "北海道",
    } as never);
    expect(input.supplement_input.low_sunlight_exposure).toBe(false);
  });
});
```

- [ ] **Step 2:** `infra/lambdas/generate-plan/mappers.ts`

```typescript
import type {
  CompleteProfileForPlan,
  SafeAgentInput,
  SafePromptProfile,
} from "@fitness/contracts-ts";

type JobType =
  | "desk"
  | "standing"
  | "light_physical"
  | "manual_labour"
  | "outdoor";
type ActivityLevel =
  | "sedentary"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "extremely_active";

const HEAVY: ReadonlySet<JobType> = new Set(["manual_labour", "outdoor"]);

export function deriveActivityLevel(
  workoutsPerWeek: number,
  jobType: JobType,
): ActivityLevel {
  const heavy = HEAVY.has(jobType);
  if (workoutsPerWeek === 0) return heavy ? "lightly_active" : "sedentary";
  if (workoutsPerWeek <= 2) return "lightly_active";
  if (workoutsPerWeek <= 4) return heavy ? "very_active" : "moderately_active";
  if (workoutsPerWeek <= 6) return "very_active";
  return "extremely_active";
}

export function deriveAvgWorkoutMinutes(
  workoutTypes: readonly string[],
  workoutsPerWeek: number,
): number {
  const tokens = workoutTypes.map((t) => t.toLowerCase());
  const isLifting = tokens.some(
    (t) => t.includes("weight") || t.includes("筋トレ"),
  );
  if (isLifting && workoutsPerWeek >= 3) return 60;
  if (workoutTypes.length === 0 && workoutsPerWeek >= 3) return 30;
  return 45;
}

function deriveEarlyMorning(workoutTypes: readonly string[]): boolean {
  const t = workoutTypes.map((x) => x.toLowerCase());
  return t.some((x) => x.includes("早朝") || x.includes("morning"));
}

const SAFE_PROMPT_KEYS = [
  "name",
  "age",
  "sex",
  "height_cm",
  "weight_kg",
  "goal_weight_kg",
  "goal_description",
  "desired_pace",
  "favorite_meals",
  "hated_foods",
  "restrictions",
  "cooking_preference",
  "food_adventurousness",
  "current_snacks",
  "snacking_reason",
  "snack_taste_preference",
  "late_night_snacking",
  "eating_out_style",
  "budget_level",
  "meal_frequency_preference",
  "location_region",
  "kitchen_access",
  "convenience_store_usage",
] as const;

type Profile = CompleteProfileForPlan & Record<string, unknown>;

export function toSafePromptProfile(profile: Profile): SafePromptProfile {
  const base: Record<string, unknown> = {};
  for (const k of SAFE_PROMPT_KEYS) {
    const v = profile[k];
    if (v !== null && v !== undefined) base[k] = v;
  }
  const avoidAlcohol =
    profile.alcohol_per_week === "none" || profile.alcohol_per_week === "0";
  const avoidSupplements =
    Boolean(profile.has_medical_condition) ||
    Boolean(profile.has_doctor_diet_restriction);
  return {
    ...base,
    age: profile.age,
    sex: profile.sex,
    height_cm: profile.height_cm,
    weight_kg: profile.weight_kg,
    favorite_meals: (profile.favorite_meals as string[] | undefined) ?? [],
    hated_foods: (profile.hated_foods as string[] | undefined) ?? [],
    restrictions: (profile.restrictions as string[] | undefined) ?? [],
    current_snacks: (profile.current_snacks as string[] | undefined) ?? [],
    avoid_alcohol: avoidAlcohol,
    avoid_supplements_without_consultation: avoidSupplements,
  } as SafePromptProfile;
}

export function toSafeAgentInput(profile: Profile): SafeAgentInput {
  const workoutTypes = (profile.workout_types as string[] | undefined) ?? [];
  const activityLevel = deriveActivityLevel(
    profile.workouts_per_week,
    profile.job_type,
  );
  const avgMin = deriveAvgWorkoutMinutes(
    workoutTypes,
    profile.workouts_per_week,
  );
  return {
    calorie_macro_input: {
      age: profile.age,
      sex: profile.sex,
      height_cm: profile.height_cm,
      weight_kg: profile.weight_kg,
      activity_level: activityLevel,
      sleep_hours: profile.sleep_hours,
      stress_level: profile.stress_level,
    },
    hydration_input: {
      weight_kg: profile.weight_kg,
      workouts_per_week: profile.workouts_per_week,
      avg_workout_minutes: avgMin,
      job_type: profile.job_type,
    },
    supplement_input: {
      // Plan 08: meal 生成前に実 gap を測れないため 0 固定 (whey 抑止)。
      // Plan 09+ で meal 生成後の実測 gap に切替。
      protein_gap_g: 0,
      workouts_per_week: profile.workouts_per_week,
      sleep_hours: profile.sleep_hours,
      fish_per_week: 2,
      early_morning_training: deriveEarlyMorning(workoutTypes),
      low_sunlight_exposure: false, // MVP 固定
    },
  };
}
```

- [ ] **Step 3: 実行 — PASS**

### Task D3: index.ts (handler)

- [ ] **Step 1:** `infra/test/lambdas/generate-plan/fixtures.ts`

```typescript
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

export const completeProfileItem = {
  pk: "user#u1",
  sk: "profile",
  onboarding_stage: "complete",
  age: 30,
  sex: "male",
  height_cm: 170,
  weight_kg: 70,
  job_type: "desk",
  workouts_per_week: 3,
  workout_types: [],
  sleep_hours: 7,
  stress_level: "low",
  favorite_meals: [],
  hated_foods: [],
  restrictions: [],
  current_snacks: [],
  alcohol_per_week: null,
};

export function makeAuthEvent(
  overrides: Partial<APIGatewayProxyEventV2WithJWTAuthorizer> = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    requestContext: { authorizer: { jwt: { claims: { sub: "u1" } } } } as never,
    body: "{}",
    isBase64Encoded: false,
    headers: { "content-type": "application/json" },
    ...overrides,
  } as APIGatewayProxyEventV2WithJWTAuthorizer;
}

export function makeGeneratedPlan(overrides: Record<string, unknown> = {}) {
  const item = {
    food_id: null,
    name: "鶏むね",
    grams: 150,
    calories_kcal: 180,
    protein_g: 33,
    fat_g: 3,
    carbs_g: 0,
  };
  const meal = {
    slot: "breakfast",
    title: "朝食",
    items: [item],
    total_calories_kcal: 180,
    total_protein_g: 33,
    total_fat_g: 3,
    total_carbs_g: 0,
  };
  const day = {
    date: "2026-04-20",
    theme: "高タンパク",
    meals: [meal, { ...meal, slot: "lunch" }, { ...meal, slot: "dinner" }],
    daily_total_calories_kcal: 540,
    daily_total_protein_g: 99,
    daily_total_fat_g: 9,
    daily_total_carbs_g: 0,
  };
  return {
    target_calories_kcal: 2200,
    target_protein_g: 140,
    target_fat_g: 70,
    target_carbs_g: 240,
    days: Array.from({ length: 7 }, (_, i) => ({
      ...day,
      date: `2026-04-${String(20 + i).padStart(2, "0")}`,
    })),
    weekly_notes: [],
    snack_swaps: [],
    hydration_target_liters: 2.5,
    hydration_breakdown: [],
    supplement_recommendations: [],
    personal_rules: ["a", "b", "c"],
    timeline_notes: [],
    ...overrides,
  };
}
```

- [ ] **Step 2: 失敗テスト** (`index.test.ts`)

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
vi.mock("@aws-sdk/lib-dynamodb", async () => {
  const actual = await vi.importActual<typeof import("@aws-sdk/lib-dynamodb")>(
    "@aws-sdk/lib-dynamodb",
  );
  return {
    ...actual,
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
  };
});
const mockInvoke = vi.fn();
vi.mock("../../../lambdas/generate-plan/agentcore-client.js", () => ({
  invokeAgent: mockInvoke,
}));

process.env.TABLE_NAME = "FitnessTable";
process.env.AGENTCORE_RUNTIME_ARN =
  "arn:aws:bedrock-agentcore:us-west-2:0:runtime/x";

import { handler } from "../../../lambdas/generate-plan/index.js";
import {
  completeProfileItem,
  makeAuthEvent,
  makeGeneratedPlan,
} from "./fixtures.js";

beforeEach(() => {
  mockSend.mockReset();
  mockInvoke.mockReset();
});

describe("generate-plan handler", () => {
  it("onboarding 未完了で 400", async () => {
    mockSend.mockResolvedValueOnce({
      Item: { ...completeProfileItem, onboarding_stage: "stats" },
    });
    const res = await handler(
      makeAuthEvent({
        body: JSON.stringify({ week_start: "2026-04-20" }),
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!).error).toBe("onboarding_incomplete");
  });

  it("既存 plan あり force=false → 既存返却", async () => {
    const existing = {
      ...makeGeneratedPlan(),
      plan_id: "old-id",
      week_start: "2026-04-20",
      generated_at: "2026-04-19T00:00:00Z",
    };
    mockSend
      .mockResolvedValueOnce({ Item: completeProfileItem })
      .mockResolvedValueOnce({
        Item: { ...existing, pk: "user#u1", sk: "plan#2026-04-20" },
      });
    const res = await handler(
      makeAuthEvent({
        body: JSON.stringify({ week_start: "2026-04-20" }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).plan_id).toBe("old-id");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("正常系: AgentCore → Put → 200", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: completeProfileItem })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    mockInvoke.mockResolvedValueOnce({
      generated_weekly_plan: makeGeneratedPlan(),
    });
    const res = await handler(
      makeAuthEvent({
        body: JSON.stringify({ week_start: "2026-04-20" }),
      }),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!);
    expect(body.weekly_plan.days).toHaveLength(7);
    expect(body.plan_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("GeneratedWeeklyPlan schema 違反で 502", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: completeProfileItem })
      .mockResolvedValueOnce({});
    mockInvoke.mockResolvedValueOnce({ generated_weekly_plan: { days: [] } });
    const res = await handler(
      makeAuthEvent({
        body: JSON.stringify({ week_start: "2026-04-20" }),
      }),
    );
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body!).error).toBe("invalid_plan_shape");
  });

  it("ConditionalCheckFailed → 既存再読して 200", async () => {
    const existing = {
      ...makeGeneratedPlan(),
      plan_id: "raced-id",
      week_start: "2026-04-20",
      generated_at: "2026-04-19T00:00:00Z",
    };
    mockSend
      .mockResolvedValueOnce({ Item: completeProfileItem })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error("ccf"), {
          name: "ConditionalCheckFailedException",
        }),
      )
      .mockResolvedValueOnce({
        Item: { ...existing, pk: "user#u1", sk: "plan#2026-04-20" },
      });
    mockInvoke.mockResolvedValueOnce({
      generated_weekly_plan: makeGeneratedPlan(),
    });
    const res = await handler(
      makeAuthEvent({
        body: JSON.stringify({ week_start: "2026-04-20" }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!).plan_id).toBe("raced-id");
  });

  it("Put 非 conditional 失敗で 502 persistence_failed", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: completeProfileItem })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("DDB throttled"));
    mockInvoke.mockResolvedValueOnce({
      generated_weekly_plan: makeGeneratedPlan(),
    });
    const res = await handler(
      makeAuthEvent({
        body: JSON.stringify({ week_start: "2026-04-20" }),
      }),
    );
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body!).error).toBe("persistence_failed");
  });

  it("AgentCore timeout で 504", async () => {
    mockSend
      .mockResolvedValueOnce({ Item: completeProfileItem })
      .mockResolvedValueOnce({});
    mockInvoke.mockRejectedValueOnce(
      Object.assign(new Error("aborted"), { name: "AbortError" }),
    );
    const res = await handler(
      makeAuthEvent({
        body: JSON.stringify({ week_start: "2026-04-20" }),
      }),
    );
    expect(res.statusCode).toBe(504);
    expect(JSON.parse(res.body!).error).toBe("generation_timeout");
  });
});
```

- [ ] **Step 3:** `infra/lambdas/generate-plan/index.ts`

```typescript
import { randomUUID } from "node:crypto";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  CompleteProfileForPlanSchema,
  GeneratePlanRequestSchema,
  GeneratedWeeklyPlanSchema,
  WeeklyPlanSchema,
} from "@fitness/contracts-ts";
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { z } from "zod";
import { requireUserId } from "../shared/auth";
import { WeeklyPlanRowSchema } from "../shared/db-schemas";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { planKey } from "../shared/keys/plan";
import {
  badRequest,
  ok,
  requireJsonBody,
  withServerError,
} from "../shared/response";
import {
  badGatewayJson,
  badRequestJson,
  gatewayTimeoutJson,
} from "../shared/response-json";
import { invokeAgent } from "./agentcore-client";
import { toSafeAgentInput, toSafePromptProfile } from "./mappers";

const TIMEOUT_MS = 25_000;

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
  const auth = requireUserId(event);
  if (!auth.ok) return auth.response;

  const parsedBody = requireJsonBody(event);
  if (!parsedBody.ok) return parsedBody.response;
  const req = GeneratePlanRequestSchema.safeParse(parsedBody.body);
  if (!req.success) return badRequest("invalid request body");
  const { week_start, force_regenerate } = req.data;

  return withServerError("generatePlan", async () => {
    // 1. profile 取得 + fail-fast parse
    const profileResp = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { pk: `user#${auth.userId}`, sk: "profile" },
        ConsistentRead: true,
      }),
    );
    if (!profileResp.Item) return badRequest("profile not found");

    const stripped = stripKeys(profileResp.Item);
    const profileParse = CompleteProfileForPlanSchema.safeParse(stripped);
    if (!profileParse.success) {
      if (
        (stripped as Record<string, unknown>).onboarding_stage !== "complete"
      ) {
        return badRequestJson({ error: "onboarding_incomplete" });
      }
      return badRequestJson({ error: "incomplete_profile_fields" });
    }
    const profile = profileParse.data;

    // 2. idempotent 既存確認
    if (!force_regenerate) {
      const existing = await readExistingPlan(auth.userId, week_start);
      if (existing !== null) return ok(existing);
    }

    // 3. AgentCore invoke
    let agentResponse: unknown;
    try {
      agentResponse = await invokeAgent(
        {
          user_id: auth.userId,
          week_start,
          safe_prompt_profile: toSafePromptProfile(profile) as Record<
            string,
            unknown
          >,
          safe_agent_input: toSafeAgentInput(profile) as Record<
            string,
            unknown
          >,
        },
        TIMEOUT_MS,
      );
    } catch (err) {
      const e = err as { name?: string };
      if (e.name === "AbortError" || e.name === "TimeoutError") {
        return gatewayTimeoutJson({ error: "generation_timeout" });
      }
      console.error("agentcore invoke failed", { name: e.name });
      return badGatewayJson({ error: "agentcore_failed" });
    }

    // 4. GeneratedWeeklyPlan strict → WeeklyPlan 組み立て
    const wrap = z
      .object({ generated_weekly_plan: z.unknown() })
      .safeParse(agentResponse);
    if (!wrap.success) return badGatewayJson({ error: "invalid_plan_shape" });

    const genParse = GeneratedWeeklyPlanSchema.strict().safeParse(
      wrap.data.generated_weekly_plan,
    );
    if (!genParse.success) {
      console.error("invalid generated plan", {
        issues: genParse.error.issues,
      });
      return badGatewayJson({ error: "invalid_plan_shape" });
    }

    const planId = randomUUID();
    const generatedAt = new Date().toISOString();
    const planParse = WeeklyPlanSchema.strict().safeParse({
      ...genParse.data,
      plan_id: planId,
      week_start,
      generated_at: generatedAt,
    });
    if (!planParse.success)
      return badGatewayJson({ error: "invalid_plan_shape" });
    const weeklyPlan = planParse.data;

    // 5. conditional Put → race 時は既存再読
    try {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...planKey(auth.userId, week_start),
            ...weeklyPlan,
            updated_at: generatedAt,
          },
          ...(force_regenerate
            ? {}
            : { ConditionExpression: "attribute_not_exists(pk)" }),
        }),
      );
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        const existing = await readExistingPlan(auth.userId, week_start);
        if (existing !== null) return ok(existing);
        return badGatewayJson({ error: "race_recovery_failed" });
      }
      console.error("ddb put failed", err);
      return badGatewayJson({ error: "persistence_failed" });
    }

    return ok({
      plan_id: weeklyPlan.plan_id,
      week_start: weeklyPlan.week_start,
      generated_at: weeklyPlan.generated_at,
      weekly_plan: weeklyPlan,
    });
  });
}

async function readExistingPlan(
  userId: string,
  weekStart: string,
): Promise<{
  plan_id: string;
  week_start: string;
  generated_at: string;
  weekly_plan: unknown;
} | null> {
  const resp = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: planKey(userId, weekStart),
      ConsistentRead: true,
    }),
  );
  if (!resp.Item) return null;
  const parse = WeeklyPlanRowSchema.safeParse(stripKeys(resp.Item));
  if (!parse.success) return null;
  const p = parse.data;
  return {
    plan_id: p.plan_id,
    week_start: p.week_start,
    generated_at: p.generated_at,
    weekly_plan: p,
  };
}
```

- [ ] **Step 4: 実行 — 全 PASS**

```bash
pnpm --filter infra test -- --run generate-plan
```

- [ ] **Step 5: コミット**

```bash
git add infra/lambdas/generate-plan infra/lambdas/shared/response-json.ts infra/test/lambdas/generate-plan
git commit -m "feat(lambda): add generate-plan adapter (CompleteProfileForPlan + GeneratedWeeklyPlan pipeline)"
```

---

## Phase E: CDK 配管

### Task E1: AgentCoreRuntime construct (DockerImageAsset)

- [ ] **Step 1:** `infra/lib/constructs/agentcore-runtime.ts`

```typescript
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface AgentCoreRuntimeProps {
  readonly fitnessTableArn: string;
}

export class AgentCoreRuntime extends Construct {
  public readonly runtimeArn: string;

  constructor(scope: Construct, id: string, props: AgentCoreRuntimeProps) {
    super(scope, id);

    // build context = repo root
    const image = new DockerImageAsset(this, "Image", {
      directory: path.join(__dirname, "../../.."),
      file: "infra/agents/plan-generator/Dockerfile",
      platform: Platform.LINUX_ARM64,
      exclude: [
        "node_modules",
        "cdk.out",
        ".next",
        ".venv",
        "**/__pycache__",
        "packages/web",
      ],
    });

    const role = new iam.Role(this, "RuntimeRole", {
      assumedBy: new iam.ServicePrincipal("bedrock-agentcore.amazonaws.com"),
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/anthropic.claude-*`,
        ],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem"],
        resources: [props.fitnessTableArn],
        conditions: {
          "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["food#*"] },
        },
      }),
    );

    // AgentCore Runtime は L2 未提供、CfnResource L1 で定義
    const runtime = new cdk.CfnResource(this, "Runtime", {
      type: "AWS::BedrockAgentCore::Runtime",
      properties: {
        Name: `${cdk.Stack.of(this).stackName}-runtime`,
        ContainerImage: image.imageUri,
        ExecutionRoleArn: role.roleArn,
      },
    });

    this.runtimeArn = cdk.Token.asString(runtime.getAtt("RuntimeArn"));

    new cdk.CfnOutput(this, "RuntimeArnOutput", {
      value: this.runtimeArn,
      description: "AgentCore Runtime ARN",
    });
  }
}
```

注: `AWS::BedrockAgentCore::Runtime` プロパティ名は実装時に AWS CloudFormation ドキュメントで確認。もし公式 CFN resource として未提供の場合は、AWS SDK を呼ぶ Custom Resource (Lambda-backed) で代替する。

- [ ] **Step 2:** `infra/lib/plan-generator-stack.ts`

```typescript
import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { AgentCoreRuntime } from "./constructs/agentcore-runtime";

export interface PlanGeneratorStackProps extends cdk.StackProps {
  readonly fitnessTableArn: string;
}

export class PlanGeneratorStack extends cdk.Stack {
  public readonly runtimeArn: string;
  constructor(scope: Construct, id: string, props: PlanGeneratorStackProps) {
    super(scope, id, props);
    const runtime = new AgentCoreRuntime(this, "PlanGenerator", {
      fitnessTableArn: props.fitnessTableArn,
    });
    this.runtimeArn = runtime.runtimeArn;
  }
}
```

- [ ] **Step 3:** `infra/test/lib/plan-generator-stack.test.ts`

```typescript
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { PlanGeneratorStack } from "../../lib/plan-generator-stack";

describe("PlanGeneratorStack", () => {
  it("Runtime + IAM を含む", () => {
    const app = new App();
    const stack = new PlanGeneratorStack(app, "Test", {
      env: { region: "us-west-2", account: "111111111111" },
      fitnessTableArn:
        "arn:aws:dynamodb:ap-northeast-1:111111111111:table/FitnessTable",
    });
    const t = Template.fromStack(stack);
    t.hasResourceProperties("AWS::IAM::Role", {
      AssumeRolePolicyDocument: expect.objectContaining({
        Statement: [
          expect.objectContaining({
            Principal: { Service: "bedrock-agentcore.amazonaws.com" },
          }),
        ],
      }),
    } as never);
  });

  it("container IAM が food#* LeadingKeys で read-only に絞られる", () => {
    const app = new App();
    const stack = new PlanGeneratorStack(app, "Test", {
      env: { region: "us-west-2", account: "111111111111" },
      fitnessTableArn:
        "arn:aws:dynamodb:ap-northeast-1:111111111111:table/FitnessTable",
    });
    const t = Template.fromStack(stack);
    // GetItem のみ、LeadingKeys=food#*、PutItem は含まれない
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: expect.objectContaining({
        Statement: expect.arrayContaining([
          expect.objectContaining({
            Action: "dynamodb:GetItem",
            Condition: expect.objectContaining({
              "ForAllValues:StringLike": expect.objectContaining({
                "dynamodb:LeadingKeys": ["food#*"],
              }),
            }),
          }),
        ]),
      }),
    } as never);
    // PutItem が container policy に含まれていないこと
    const policies = t.findResources("AWS::IAM::Policy");
    for (const p of Object.values(policies)) {
      const statements = (
        p as { Properties: { PolicyDocument: { Statement: unknown[] } } }
      ).Properties.PolicyDocument.Statement;
      for (const stmt of statements) {
        const s = stmt as { Action?: string | string[] };
        const actions = Array.isArray(s.Action) ? s.Action : [s.Action ?? ""];
        if (actions.includes("dynamodb:PutItem")) {
          throw new Error("container IAM must not include PutItem");
        }
      }
    }
  });
});
```

### Task E2: extract-runtime-arn.mjs

- [ ] **Step 1:** `infra/scripts/extract-runtime-arn.mjs`

```javascript
#!/usr/bin/env node
import { readFileSync } from "node:fs";

const p = process.argv[2];
if (!p) {
  console.error("Usage: extract-runtime-arn.mjs <outputs.json>");
  process.exit(2);
}
const outputs = JSON.parse(readFileSync(p, "utf8"));
const stack = outputs.PlanGeneratorStack;
if (!stack) {
  console.error("PlanGeneratorStack not found");
  process.exit(1);
}
const arn = Object.entries(stack).find(([k]) =>
  k.includes("RuntimeArnOutput"),
)?.[1];
if (!arn) {
  console.error("RuntimeArnOutput not found");
  process.exit(1);
}
process.stdout.write(arn);
```

- [ ] **Step 2: 実行権限**

```bash
chmod +x infra/scripts/extract-runtime-arn.mjs
```

### Task E3: GeneratePlanLambda construct + FitnessStack 統合

- [ ] **Step 1:** `infra/lib/constructs/generate-plan-lambda.ts`

```typescript
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { HttpMethod, type HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export interface GeneratePlanLambdaProps {
  readonly httpApi: HttpApi;
  readonly table: dynamodb.Table;
  readonly agentcoreRuntimeArn: string;
}

export class GeneratePlanLambda extends Construct {
  constructor(scope: Construct, id: string, props: GeneratePlanLambdaProps) {
    super(scope, id);

    const fn = new lambda_nodejs.NodejsFunction(this, "Fn", {
      entry: path.join(__dirname, "../../lambdas/generate-plan/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(28),
      memorySize: 512,
      environment: {
        TABLE_NAME: props.table.tableName,
        AGENTCORE_RUNTIME_ARN: props.agentcoreRuntimeArn,
        AGENTCORE_REGION: "us-west-2",
      },
    });

    // 最小権限: spec §セキュリティに従い dynamodb:LeadingKeys=user#* 条件を付与。
    // grantReadWriteData は table 全体へ GetItem/PutItem を許してしまうため使わない。
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
        resources: [props.table.tableArn],
        conditions: {
          "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["user#*"] },
        },
      }),
    );
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock-agentcore:InvokeAgentRuntime"],
        resources: [props.agentcoreRuntimeArn],
      }),
    );

    props.httpApi.addRoutes({
      path: "/users/me/plans/generate",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("Integration", fn),
    });
  }
}
```

- [ ] **Step 2:** `infra/lib/fitness-stack.ts` を変更

ファイル上部に import:

```typescript
import { GeneratePlanLambda } from "./constructs/generate-plan-lambda";
```

constructor 末尾に追加。**`agentcoreRuntimeArn` context は optional** にし、未指定時は `GeneratePlanLambda` を作らない。初回 `pnpm deploy:plan-generator` も synth 時に FitnessStack が走る (同一 app 内) ため、ARN 未確定時に synth が落ちないようにするのが必須:

```typescript
const rawAgentcoreArn = this.node.tryGetContext("agentcoreRuntimeArn");
const agentcoreRuntimeArn =
  typeof rawAgentcoreArn === "string" && rawAgentcoreArn.length > 0
    ? rawAgentcoreArn
    : null;

if (agentcoreRuntimeArn !== null) {
  new GeneratePlanLambda(this, "GeneratePlanLambda", {
    httpApi: api.httpApi,
    table: database.table,
    agentcoreRuntimeArn,
  });
} else {
  cdk.Annotations.of(this).addInfo(
    "agentcoreRuntimeArn context not set — skipping GeneratePlanLambda. " +
      "Re-deploy with `-c agentcoreRuntimeArn=<arn>` after PlanGeneratorStack.",
  );
}

new cdk.CfnOutput(this, "TableArnOutput", {
  value: database.table.tableArn,
  description: "FitnessTable ARN",
});
```

第 1 段 (`pnpm deploy:plan-generator`) では FitnessStack が synth されるが GeneratePlanLambda が skip される。第 2 段 (`pnpm deploy:fitness-with-arn`) で ARN が注入され Lambda + ルートが追加される。

- [ ] **Step 3:** `infra/bin/app.ts` を更新

```typescript
#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { FitnessStack } from "../lib/fitness-stack";
import { PlanGeneratorStack } from "../lib/plan-generator-stack";

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
if (!account) throw new Error("CDK_DEFAULT_ACCOUNT env var required");

new FitnessStack(app, "FitnessStack", {
  env: { region: "ap-northeast-1", account },
});

// cross-region token 参照を避けるため、FitnessTable 名は context 経由
const fitnessTableName =
  app.node.tryGetContext("fitnessTableName") ?? "FitnessTable";
const fitnessTableArn = `arn:aws:dynamodb:ap-northeast-1:${account}:table/${fitnessTableName}`;

new PlanGeneratorStack(app, "PlanGeneratorStack", {
  env: { region: "us-west-2", account },
  fitnessTableArn,
});
```

- [ ] **Step 4:** `infra/test/lib/constructs/generate-plan-lambda.test.ts`

```typescript
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { describe, expect, it } from "vitest";
import { GeneratePlanLambda } from "../../../lib/constructs/generate-plan-lambda";

describe("GeneratePlanLambda", () => {
  it("Lambda + IAM + Route", () => {
    const app = new App();
    const stack = new Stack(app, "T", {
      env: { region: "ap-northeast-1", account: "1" },
    });
    const httpApi = new HttpApi(stack, "Api");
    const table = new dynamodb.Table(stack, "Tbl", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
    });
    new GeneratePlanLambda(stack, "GP", {
      httpApi,
      table,
      agentcoreRuntimeArn: "arn:aws:bedrock-agentcore:us-west-2:1:runtime/x",
    });
    const t = Template.fromStack(stack);
    t.resourceCountIs("AWS::Lambda::Function", 1);
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: expect.objectContaining({
        Statement: expect.arrayContaining([
          expect.objectContaining({
            Action: "bedrock-agentcore:InvokeAgentRuntime",
          }),
          // DDB 最小権限: user#* LeadingKeys 条件が付いていること
          expect.objectContaining({
            Action: expect.arrayContaining([
              "dynamodb:GetItem",
              "dynamodb:PutItem",
            ]),
            Condition: expect.objectContaining({
              "ForAllValues:StringLike": expect.objectContaining({
                "dynamodb:LeadingKeys": ["user#*"],
              }),
            }),
          }),
        ]),
      }),
    } as never);
  });
});
```

### Task E4: package.json scripts

- [ ] **Step 1:** `infra/package.json` scripts に追加

```json
"deploy:plan-generator": "cdk deploy PlanGeneratorStack --outputs-file cdk-outputs.json -c fitnessTableName=${FITNESS_TABLE_NAME}",
"deploy:fitness-with-arn": "cdk deploy FitnessStack -c inviteCodesParameterName=${INVITE_CODES_PARAMETER_NAME} -c agentcoreRuntimeArn=$(node ./scripts/extract-runtime-arn.mjs cdk-outputs.json)",
"deploy:plan08": "pnpm deploy:plan-generator && pnpm deploy:fitness-with-arn"
```

- [ ] **Step 2:** root `package.json` scripts に追加

```json
"deploy:plan08": "pnpm --filter infra deploy:plan08"
```

- [ ] **Step 3: テスト**

```bash
pnpm --filter infra test -- --run
pnpm contracts:test
```

- [ ] **Step 4: コミット**

```bash
git add infra/lib infra/bin infra/scripts infra/test/lib infra/package.json package.json
git commit -m "feat(infra): add PlanGeneratorStack + GeneratePlanLambda (DockerImageAsset, context ARN)"
```

---

## Phase F: Web 側変更

### Task F0: テスト依存追加 + happy-dom 環境設定 (DOM テストの前提整備)

現行 `packages/web/vitest.config.ts` は `environment: "node"` で、`@testing-library/react` も未導入。Plan 08 では hooks / components / page の DOM テストが増えるので、先に依存と環境を整える。

**Files:**

- Modify: `packages/web/package.json`
- Modify: `packages/web/vitest.config.ts`
- Create: `packages/web/vitest.setup.ts`

- [ ] **Step 1: dev deps 追加**

```bash
pnpm --filter @fitness/web add -D \
  @testing-library/react@^16 \
  @testing-library/jest-dom@^6 \
  happy-dom@^15
```

(既存 `@testing-library/react` が Plan 06/07 で導入されている可能性あり。`packages/web/package.json` を確認し、入っているものは skip。)

- [ ] **Step 2: setup ファイル**

`packages/web/vitest.setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: vitest.config.ts を更新 (happy-dom + setup)**

```typescript
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "__tests__/**/*.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./src/test/stubs/server-only.ts"),
    },
  },
});
```

- [ ] **Step 4: 既存テストが壊れていないことを確認**

```bash
pnpm --filter @fitness/web test -- --run
```

Expected: 0 regression。既存テストが node 専用 API に依存していて落ちる場合は個別テストで `// @vitest-environment node` directive を付与する。

- [ ] **Step 5: コミット**

```bash
git add packages/web/package.json packages/web/vitest.config.ts packages/web/vitest.setup.ts pnpm-lock.yaml
git commit -m "chore(web): add @testing-library/react + happy-dom for Plan 08 DOM tests"
```

### Task F1: week-start + plans.ts (既存 apiClient 再利用)

- [ ] **Step 1:** `packages/web/src/lib/date/week-start.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { weekStartOf } from "./week-start";

describe("weekStartOf", () => {
  it("月曜はそのまま", () =>
    expect(weekStartOf(new Date("2026-04-20T10:00:00+09:00"))).toBe(
      "2026-04-20",
    ));
  it("水曜は前の月曜", () =>
    expect(weekStartOf(new Date("2026-04-22T10:00:00+09:00"))).toBe(
      "2026-04-20",
    ));
  it("日曜は前の月曜", () =>
    expect(weekStartOf(new Date("2026-04-26T10:00:00+09:00"))).toBe(
      "2026-04-20",
    ));
});
```

- [ ] **Step 2:** `packages/web/src/lib/date/week-start.ts`

```typescript
export function weekStartOf(date: Date): string {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
```

- [ ] **Step 3:** `packages/web/src/lib/api/plans.ts`

```typescript
import {
  GeneratePlanRequestSchema,
  GeneratePlanResponseSchema,
  WeeklyPlanSchema,
} from "@fitness/contracts-ts";
import { z } from "zod";

import { apiClient, ApiError } from "@/lib/api-client";

export async function generatePlanDto(input: {
  weekStart: string;
  forceRegenerate?: boolean;
}) {
  const body = GeneratePlanRequestSchema.parse({
    week_start: input.weekStart,
    force_regenerate: input.forceRegenerate ?? false,
  });
  return apiClient("users/me/plans/generate", GeneratePlanResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const WeeklyPlanEnvelope = z.object({ plan: WeeklyPlanSchema });

export async function fetchWeeklyPlanDto(weekStart: string) {
  try {
    const env = await apiClient(
      `users/me/plans/${encodeURIComponent(weekStart)}`,
      WeeklyPlanEnvelope,
    );
    return env.plan;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
```

- [ ] **Step 4: 実行** — `pnpm --filter @fitness/web test -- --run src/lib/date/week-start`

### Task F2: plan-mappers.ts (DTO ↔ ViewModel)

- [ ] **Step 1:** `packages/web/src/lib/plan/plan-mappers.ts`

```typescript
import type {
  WeeklyPlan,
  Meal,
  DayPlan,
  MealItem,
} from "@fitness/contracts-ts";

export interface MealItemVM {
  foodId: string | null;
  name: string;
  grams: number;
  caloriesKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface MealVM {
  slot: "breakfast" | "lunch" | "dinner" | "dessert";
  title: string;
  items: MealItemVM[];
  totalCaloriesKcal: number;
  totalProteinG: number;
  totalFatG: number;
  totalCarbsG: number;
  prepTag: "batch" | "quick" | "treat" | "none" | null;
}

export interface DayPlanVM {
  date: string;
  theme: string;
  meals: MealVM[];
  dailyTotalCaloriesKcal: number;
  dailyTotalProteinG: number;
  dailyTotalFatG: number;
  dailyTotalCarbsG: number;
}

export interface WeeklyPlanVM {
  planId: string;
  weekStart: string;
  generatedAt: string;
  targetCaloriesKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
  days: DayPlanVM[];
}

const mealItemToVM = (i: MealItem): MealItemVM => ({
  foodId: i.food_id ?? null,
  name: i.name,
  grams: i.grams,
  caloriesKcal: i.calories_kcal,
  proteinG: i.protein_g,
  fatG: i.fat_g,
  carbsG: i.carbs_g,
});

const mealToVM = (m: Meal): MealVM => ({
  slot: m.slot,
  title: m.title,
  items: m.items.map(mealItemToVM),
  totalCaloriesKcal: m.total_calories_kcal,
  totalProteinG: m.total_protein_g,
  totalFatG: m.total_fat_g,
  totalCarbsG: m.total_carbs_g,
  prepTag: m.prep_tag ?? null,
});

const dayToVM = (d: DayPlan): DayPlanVM => ({
  date: d.date,
  theme: d.theme,
  meals: d.meals.map(mealToVM),
  dailyTotalCaloriesKcal: d.daily_total_calories_kcal,
  dailyTotalProteinG: d.daily_total_protein_g,
  dailyTotalFatG: d.daily_total_fat_g,
  dailyTotalCarbsG: d.daily_total_carbs_g,
});

export function weeklyPlanToVM(p: WeeklyPlan): WeeklyPlanVM {
  return {
    planId: p.plan_id,
    weekStart: p.week_start,
    generatedAt: p.generated_at,
    targetCaloriesKcal: p.target_calories_kcal,
    targetProteinG: p.target_protein_g,
    targetFatG: p.target_fat_g,
    targetCarbsG: p.target_carbs_g,
    days: p.days.map(dayToVM),
  };
}
```

- [ ] **Step 2:** `packages/web/src/lib/plan/plan-mappers.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { weeklyPlanToVM } from "./plan-mappers";

describe("weeklyPlanToVM", () => {
  it("snake_case → camelCase", () => {
    const dto = {
      plan_id: "p1",
      week_start: "2026-04-20",
      generated_at: "2026-04-20T00:00:00Z",
      target_calories_kcal: 2000,
      target_protein_g: 120,
      target_fat_g: 60,
      target_carbs_g: 200,
      days: [],
      weekly_notes: [],
      snack_swaps: [],
      hydration_target_liters: 2.5,
      hydration_breakdown: [],
      supplement_recommendations: [],
      personal_rules: ["a", "b", "c"],
      timeline_notes: [],
    };
    const vm = weeklyPlanToVM(dto as never);
    expect(vm.planId).toBe("p1");
    expect(vm.targetCaloriesKcal).toBe(2000);
    expect(vm.days).toHaveLength(0);
  });
});
```

- [ ] **Step 3: 実行 — PASS**

### Task F3: use-plan hook (VM を返す)

- [ ] **Step 1:** `packages/web/src/hooks/use-plan.ts`

```typescript
"use client";

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { fetchWeeklyPlanDto, generatePlanDto } from "@/lib/api/plans";
import { weeklyPlanToVM, type WeeklyPlanVM } from "@/lib/plan/plan-mappers";

function planQueryOptions(weekStart: string) {
  return queryOptions({
    queryKey: ["weekly-plan", weekStart] as const,
    queryFn: async (): Promise<WeeklyPlanVM | null> => {
      const dto = await fetchWeeklyPlanDto(weekStart);
      return dto === null ? null : weeklyPlanToVM(dto);
    },
    staleTime: 60_000,
  });
}

export function useWeeklyPlan(weekStart: string) {
  return useQuery(planQueryOptions(weekStart));
}

export function useGeneratePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: generatePlanDto,
    onSuccess: (data) => {
      qc.setQueryData(
        planQueryOptions(data.week_start).queryKey,
        weeklyPlanToVM(data.weekly_plan),
      );
    },
  });
}
```

- [ ] **Step 2:** `packages/web/src/hooks/use-plan.test.tsx`

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/plans", () => ({
	generatePlanDto: vi.fn(async () => ({
		plan_id: "p1", week_start: "2026-04-20",
		generated_at: "2026-04-20T00:00:00Z",
		weekly_plan: {
			plan_id: "p1", week_start: "2026-04-20",
			generated_at: "2026-04-20T00:00:00Z",
			target_calories_kcal: 2000, target_protein_g: 120,
			target_fat_g: 60, target_carbs_g: 200,
			days: [], weekly_notes: [], snack_swaps: [],
			hydration_target_liters: 2.5, hydration_breakdown: [],
			supplement_recommendations: [], personal_rules: ["a", "b", "c"],
			timeline_notes: [],
		},
	})),
	fetchWeeklyPlanDto: vi.fn(async () => null),
}));

import { useGeneratePlan, useWeeklyPlan } from "./use-plan";

const wrapper = (qc: QueryClient) => ({ children }: { children: ReactNode }) =>
	<QueryClientProvider client={qc}>{children}</QueryClientProvider>;

describe("useGeneratePlan + useWeeklyPlan", () => {
	it("mutation 後 useWeeklyPlan が VM を即返す", async () => {
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const { result: gen } = renderHook(() => useGeneratePlan(), { wrapper: wrapper(qc) });
		await gen.current.mutateAsync({ weekStart: "2026-04-20" });
		const { result: read } = renderHook(() => useWeeklyPlan("2026-04-20"),
			{ wrapper: wrapper(qc) });
		await waitFor(() => expect(read.current.data).not.toBeUndefined());
		expect(read.current.data).toMatchObject({ planId: "p1", targetCaloriesKcal: 2000 });
	});
	it("404 → null", async () => {
		const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		const { result } = renderHook(() => useWeeklyPlan("2026-04-20"),
			{ wrapper: wrapper(qc) });
		await waitFor(() => expect(result.current.isFetched).toBe(true));
		expect(result.current.data).toBeNull();
	});
});
```

- [ ] **Step 3: 実行 — PASS**

### Task F4: ドメインコンポーネント (VM props)

- [ ] **Step 1: meal-card.tsx**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MealVM } from "@/lib/plan/plan-mappers";

const SLOT_LABEL = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  dessert: "デザート",
} as const;

export function MealCard({ meal }: { meal: MealVM }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {SLOT_LABEL[meal.slot]} — {meal.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <ul className="space-y-1">
          {meal.items.map((item, i) => (
            <li key={i} className="flex justify-between">
              <span>
                {item.name}{" "}
                <span className="text-neutral-500">({item.grams}g)</span>
              </span>
              <span className="text-neutral-600">{item.caloriesKcal}kcal</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t pt-2 text-neutral-700">
          <span>合計</span>
          <span>
            {meal.totalCaloriesKcal}kcal / P{meal.totalProteinG.toFixed(0)} F
            {meal.totalFatG.toFixed(0)} C{meal.totalCarbsG.toFixed(0)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: macro-targets-card.tsx**

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WeeklyPlanVM } from "@/lib/plan/plan-mappers";

export function MacroTargetsCard({ plan }: { plan: WeeklyPlanVM }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>1 日の目標</CardTitle>
        <CardDescription>あなたに合わせた calorie / macro 目標</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-4 gap-2 text-center">
        <Stat label="kcal" value={plan.targetCaloriesKcal} />
        <Stat label="P (g)" value={plan.targetProteinG} />
        <Stat label="F (g)" value={plan.targetFatG} />
        <Stat label="C (g)" value={plan.targetCarbsG} />
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-neutral-50 p-2">
      <div className="text-lg font-semibold">{Math.round(value)}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
```

- [ ] **Step 3: daily-summary-card.tsx**

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DayPlanVM, WeeklyPlanVM } from "@/lib/plan/plan-mappers";

export function DailySummaryCard({
  day,
  plan,
}: {
  day: DayPlanVM;
  plan: WeeklyPlanVM;
}) {
  const pct = Math.round(
    (day.dailyTotalCaloriesKcal / plan.targetCaloriesKcal) * 100,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>今日のサマリー</CardTitle>
        <CardDescription>
          {day.date} — {day.theme}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        <div>
          {day.dailyTotalCaloriesKcal} / {plan.targetCaloriesKcal} kcal{" "}
          <span className="text-neutral-500">({pct}%)</span>
        </div>
        <div className="text-neutral-600">
          P{day.dailyTotalProteinG.toFixed(0)} F{day.dailyTotalFatG.toFixed(0)}{" "}
          C{day.dailyTotalCarbsG.toFixed(0)}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: seven-day-meal-list.tsx**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DayPlanVM } from "@/lib/plan/plan-mappers";
import { MealCard } from "./meal-card";

export function SevenDayMealList({ days }: { days: DayPlanVM[] }) {
  const [openIdx, setOpenIdx] = useState(0);
  return (
    <div className="space-y-2">
      {days.map((day, i) => (
        <div key={day.date} className="rounded border">
          <Button
            variant="ghost"
            className="w-full justify-between"
            onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
          >
            <span>
              {day.date} — {day.theme}
            </span>
            <span>{openIdx === i ? "−" : "+"}</span>
          </Button>
          {openIdx === i && (
            <div className="space-y-2 p-2">
              {day.meals.map((meal, j) => (
                <MealCard key={j} meal={meal} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Task F5: 状態コンポーネント (Loading / Error / Empty)

- [ ] **Step 1: plan-loading-state.tsx**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function PlanLoadingState({ message }: { message?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <p className="text-sm text-neutral-600">
        {message ?? "あなた専用のプランを作成しています…"}
      </p>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
```

- [ ] **Step 2: plan-error-banner.tsx**

```tsx
"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function PlanErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>プラン生成に失敗しました</AlertTitle>
      <AlertDescription>時間をおいて再度お試しください。</AlertDescription>
      <Button variant="outline" className="mt-2" onClick={onRetry}>
        再試行する
      </Button>
    </Alert>
  );
}
```

- [ ] **Step 3: plan-empty-state.tsx**

```tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { useGeneratePlan } from "@/hooks/use-plan";
import { PlanLoadingState } from "./plan-loading-state";
import { PlanErrorBanner } from "./plan-error-banner";

export function PlanEmptyState({ weekStart }: { weekStart: string }) {
  const gen = useGeneratePlan();
  if (gen.isPending) return <PlanLoadingState />;
  if (gen.isError)
    return <PlanErrorBanner onRetry={() => gen.mutate({ weekStart })} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>今週のプランがまだありません</CardTitle>
        <CardDescription>
          あなたに合わせた 7 日間プランを作成します。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => gen.mutate({ weekStart })}>
          プランを作成する
        </Button>
      </CardContent>
    </Card>
  );
}
```

### Task F6: Review CTA + Home page + Home page テスト

- [ ] **Step 1: Review CTA に generate 挿入**

`packages/web/src/app/onboarding/review/review-content.tsx` の「プランを作成する」ハンドラで `patch({}, "complete")` と `router.push("/home")` の間に挿入:

```typescript
import { useGeneratePlan } from "@/hooks/use-plan";
import { weekStartOf } from "@/lib/date/week-start";

// コンポーネント内
const generate = useGeneratePlan();

// ハンドラ内
await patch({}, "complete");
try {
  await generate.mutateAsync({ weekStart: weekStartOf(new Date()) });
  router.push("/home");
} catch (err) {
  console.error("plan generation failed", err);
  router.push("/home?planError=1");
}
```

CTA ボタンの disabled / ラベルを `generate.isPending` と連動。

- [ ] **Step 2: Home page 全面書き換え**

`packages/web/src/app/(app)/home/page.tsx`:

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { DailySummaryCard } from "@/components/domain/daily-summary-card";
import { MacroTargetsCard } from "@/components/domain/macro-targets-card";
import { PlanEmptyState } from "@/components/domain/plan-empty-state";
import { PlanErrorBanner } from "@/components/domain/plan-error-banner";
import { PlanLoadingState } from "@/components/domain/plan-loading-state";
import { SevenDayMealList } from "@/components/domain/seven-day-meal-list";
import { useGeneratePlan, useWeeklyPlan } from "@/hooks/use-plan";
import { weekStartOf } from "@/lib/date/week-start";

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function HomePage() {
  const search = useSearchParams();
  const planError = search.get("planError") === "1";
  const weekStart = useMemo(() => weekStartOf(new Date()), []);
  const { data: plan, isLoading, isError } = useWeeklyPlan(weekStart);
  const generate = useGeneratePlan();

  if (planError && !plan)
    return <PlanErrorBanner onRetry={() => generate.mutate({ weekStart })} />;
  if (isLoading) return <PlanLoadingState />;
  if (isError)
    return <PlanErrorBanner onRetry={() => generate.mutate({ weekStart })} />;
  if (!plan) return <PlanEmptyState weekStart={weekStart} />;

  const today = plan.days.find((d) => d.date === todayString()) ?? plan.days[0];
  return (
    <div className="space-y-4">
      <MacroTargetsCard plan={plan} />
      <DailySummaryCard day={today} plan={plan} />
      <SevenDayMealList days={plan.days} />
    </div>
  );
}
```

- [ ] **Step 3:** `packages/web/src/app/(app)/home/page.test.tsx`

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams(""),
}));
const mockUseWeeklyPlan = vi.fn();
const mockUseGeneratePlan = vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false }));
vi.mock("@/hooks/use-plan", () => ({
	useWeeklyPlan: (...args: unknown[]) => mockUseWeeklyPlan(...args),
	useGeneratePlan: () => mockUseGeneratePlan(),
}));

import HomePage from "./page";

const wrapper = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("HomePage", () => {
	it("plan なし → PlanEmptyState", () => {
		mockUseWeeklyPlan.mockReturnValue({ data: null, isLoading: false, isError: false });
		render(<HomePage />, { wrapper });
		expect(screen.getByText(/プランがまだありません/)).toBeInTheDocument();
	});
	it("loading → skeleton", () => {
		mockUseWeeklyPlan.mockReturnValue({ data: undefined, isLoading: true, isError: false });
		render(<HomePage />, { wrapper });
		expect(screen.getByText(/作成しています/)).toBeInTheDocument();
	});
	it("error → PlanErrorBanner", () => {
		mockUseWeeklyPlan.mockReturnValue({ data: undefined, isLoading: false, isError: true });
		render(<HomePage />, { wrapper });
		expect(screen.getByText(/再試行する/)).toBeInTheDocument();
	});
	it("plan あり → Macro + DailySummary が表示", () => {
		const plan = {
			planId: "p1", weekStart: "2026-04-20",
			generatedAt: "2026-04-20T00:00:00Z",
			targetCaloriesKcal: 2000, targetProteinG: 120,
			targetFatG: 60, targetCarbsG: 200,
			days: [{
				date: "2026-04-20", theme: "テスト", meals: [],
				dailyTotalCaloriesKcal: 1500, dailyTotalProteinG: 90,
				dailyTotalFatG: 50, dailyTotalCarbsG: 150,
			}],
		};
		mockUseWeeklyPlan.mockReturnValue({ data: plan, isLoading: false, isError: false });
		render(<HomePage />, { wrapper });
		expect(screen.getByText(/1 日の目標/)).toBeInTheDocument();
		expect(screen.getByText(/今日のサマリー/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 4: 実行 — 全 PASS**

```bash
pnpm --filter @fitness/web test -- --run
```

- [ ] **Step 5: コミット**

```bash
git add packages/web/src
git commit -m "feat(web): add Plan 08 mappers/hooks/components/home with ViewModel boundary"
```

---

## Phase G: Deploy + 統合検証

### Task G1: FitnessTable 名を取得

```bash
export FITNESS_TABLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name FitnessStack --region ap-northeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" --output text)
echo "TableName: $FITNESS_TABLE_NAME"
```

### Task G2: PlanGeneratorStack deploy (CDK が image build+push+runtime 作成)

```bash
cd infra && pnpm deploy:plan-generator
```

Expected: Docker build (linux/arm64) → ECR 自動作成 → push → AgentCore Runtime 作成まで完了。`cdk-outputs.json` に `PlanGeneratorStack.PlanGeneratorRuntimeArnOutput*` が出る

```bash
node ./scripts/extract-runtime-arn.mjs cdk-outputs.json
```

Expected: `arn:aws:bedrock-agentcore:us-west-2:...`

### Task G3: FitnessStack 再 deploy (ARN 注入)

```bash
export INVITE_CODES_PARAMETER_NAME=/path/to/invite-codes
cd infra && pnpm deploy:fitness-with-arn
```

Expected: `generate-plan` Lambda + 新ルート `POST /users/me/plans/generate` が追加される

### Task G4: end-to-end 手動検証

- [ ] web 起動: `pnpm dev:web`
- [ ] 新規 signup → invite code → Onboarding 7 画面完了
- [ ] 「プランを作成する」押下 → ボタン disabled + 生成中表示
- [ ] 5-15 秒後に `/home` 遷移、`MacroTargetsCard` / `DailySummaryCard` / `SevenDayMealList` が表示
- [ ] 7 日展開し各 3-4 食表示
- [ ] CloudWatch Logs で `generate-plan` Lambda の正常ログ
- [ ] DDB の `pk=user#<id>, sk=plan#<week_start>` を console 確認、**`supplement_recommendations` に `whey` 含まれない** (protein_gap_g=0 の副作用確認)
- [ ] 同 week_start で再生成 → AgentCore 呼ばれず既存 plan_id が返る (CloudWatch で確認)
- [ ] DDB から plan 手動削除 → `/home` で `<PlanEmptyState />` から再生成
- [ ] `?planError=1` で `<PlanErrorBanner />` 表示
- [ ] 結果を `infra/agents/plan-generator/README.md` の「初回検証ログ」に記録

### Task G5: memo 更新

- [ ] `tasks/memories/decisions.md` に append:

```markdown
## <実施日>: Plan 08 完了 {#plan08-complete}

- **タグ**: #plan08 #agentcore #strands #completion
- **ステータス**: active
- **関連**: decisions.md#plan08-scope, context-log.md
- **決定**: 本番稼働。Snack swaps 以下 UI は Plan 09+ 持ち越し
- **根拠**: 設計書 §レビュー対応履歴 15 件 + 実装計画 9 件 + 1 件を全反映
```

- [ ] `tasks/memories/context-log.md` の「進行中タスク」を Plan 09 候補に書き換え
- [ ] `tasks/memories/index.md` に `#plan08 #completion` 行を追加

---

## 完了条件

- [ ] Phase A-G の全 Task を完了
- [ ] 全 unit / integration テスト (contracts-py / infra / web / plan-generator) が pass
- [ ] Task G4 手動検証チェックリスト全項目 pass
- [ ] CloudWatch Logs に `generate-plan` Lambda の正常 invocation ログがある
- [ ] DynamoDB に WeeklyPlan が永続化、同 week_start で再生成が idempotent
- [ ] 既存 onboarding / profile / auth フローが壊れていない
- [ ] spec の「含まない」項目 (Snack swaps UI / Chat / Weekly review / AgentCore Memory / Identity / Gateway / Evaluations / async 化 / キーワード検索 / WeeklyCheckIn) が Task に含まれず (Plan 09+ 委譲)

---

## レビュー対応履歴

### 2026-04-20: 2 回目レビュー (9 件) への対応

| #   | 重要度 | 指摘                                                                                | 対応                                                                                                                                                                       |
| --- | ------ | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | High   | Dockerfile の `COPY ../../../packages/...` が build context 外                      | Dockerfile を **repo root を context として要求**する形に修正。CDK `DockerImageAsset` (`directory=<repo root>`, `file=<Dockerfile>`) で自動化                              |
| 17  | High   | CDK と手動で ECR 二重所有                                                           | `DockerImageAsset` に一本化。手動 `aws ecr create-repository` を手順から削除                                                                                               |
| 18  | High   | cross-region table ARN の token 参照                                                | `bin/app.ts` で context `-c fitnessTableName=<name>` から ARN を構築。FitnessStack ↔ PlanGeneratorStack の token 参照を排除                                                |
| 19  | High   | WeeklyPlan の責務境界矛盾 (agent は plan_id 無しで返すのに strict 必須)             | `GeneratedWeeklyPlan` と `WeeklyPlan(GeneratedWeeklyPlan)` を **Pydantic で分離**。Adapter が `plan_id` / `generated_at` を付与して `WeeklyPlanSchema.strict()` で検証     |
| 20  | High   | `protein_gap_g = 30` 固定で whey 常時推奨                                           | Mapper で **`protein_gap_g: 0` 固定** に変更し、system prompt + tool テストで「Plan 08 では whey 推奨が出ない」ことを保証。Plan 09+ で meal 生成後の実測 gap に移行        |
| 21  | High   | Adapter が `stripKeys` 未使用 / `badRequest` 2 引数などの慣例逸脱                   | `stripKeys` 経由の parse に統一、`requireJsonBody` 使用、構造化エラー用に `response-json.ts` 新設 (`badRequestJson` / `badGatewayJson` / `gatewayTimeoutJson`)             |
| 22  | Medium | Web 側 React 層まで snake_case 侵入                                                 | `lib/plan/plan-mappers.ts` 新設で DTO→ViewModel 変換を boundary で実施。components / hooks / page は camelCase VM のみ扱う (Plan 07 `profile-mappers` と同パターン)        |
| 23  | Medium | `plans.ts` が `readJsonResponseBody` / `toResponseErrorBody` 直接呼びで helper 誤用 | 既存 `lib/api-client.ts` の `apiClient<T>(path, schema, options)` 再利用に統一                                                                                             |
| 24  | Medium | `test_agent_e2e.py` / `home/page.test.tsx` 欠落、存在しない pnpm scripts 参照       | Task C10 で `test_agent_e2e.py` / Task F6 Step 3 で `home/page.test.tsx` を追加。scripts は実在する `contracts:generate` / `contracts:test` / `--filter infra test` に修正 |

### 既存対応 (設計書側 15 件)

設計書 §レビュー対応履歴に記録済み (初版 9 件 + 2 回目 5 件 + `low_sunlight_exposure` 1 件)。

### 2026-04-20: 3 回目レビュー (4 件) への対応

| #   | 重要度 | 指摘                                                                                                    | 対応                                                                                                                                                                                                   |
| --- | ------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 25  | High   | spec が plan に追従していない (旧版 WeeklyPlan 単一契約のまま)                                          | **設計書を plan と整合させた** (設計書 §レビュー対応履歴 #25 参照)。`GeneratedWeeklyPlan` 分離 / `CompleteProfileForPlan` / `DockerImageAsset` / 手動 ECR push 廃止 / router `?planError=1` 統一を反映 |
| 26  | High   | FitnessStack の `agentcoreRuntimeArn` 必須化で `deploy:plan-generator` の synth が落ちる                | FitnessStack の context を **optional** に変更 (Task E3 Step 2 コード更新)。未指定時は `GeneratePlanLambda` を skip して synth を通す                                                                  |
| 27  | Medium | Web DOM テストの依存 (`@testing-library/react` / `happy-dom` / setup) が導入タスクに欠落                | **Task F0 を追加** (Phase F 冒頭)。依存追加 + `vitest.setup.ts` + `vitest.config.ts` の environment を happy-dom に変更する 5 ステップを明記                                                           |
| 28  | Medium | `test_agent_e2e.py` が `_AGENT` 全体 MagicMock で C9 と同等、agent.py / prompt / tool wiring を拾えない | **Task C10 を本物の e2e に昇格**。`BedrockModel` だけ stub して `build_agent()` を実行、4 tools + `output_schema=GeneratedWeeklyPlan` + system prompt の実配線を通すテスト 3 本に差し替え              |
