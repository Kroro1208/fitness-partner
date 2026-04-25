# Plan 画面完全実装 + Meal Swap Implementation Plan (Plan 09)

> **For agentic workers:** Recommended — use `superpowers:subagent-driven-development` (fresh subagent per task + review) or `superpowers:executing-plans` (inline batch) when available. これらの skill がない環境では、Phase 順に 1 Task ずつ TDD で進めて各 Task 末尾の commit を行う普通の手運用で問題ない。Steps は checkbox (`- [ ]`) で tracking。

**Goal:** Plan 08 で DDB に保存済みの 5 セクション (snack swaps / hydration / supplements / personal rules / timeline) を Home / Plan 画面に描画し、AgentCore Runtime 経由の Meal swap (候補 3 件生成 → 選択 → plan 更新) を proposal + revision ベースの optimistic concurrency で実装する。

**Architecture:** `WeeklyPlan` に `revision: int` を新規追加。candidates 時に proposal を DDB (`sk=swap_proposal#<uuid>`, TTL 10 分) に保存し、apply は `{proposal_id, chosen_index}` だけ受けて server が proposal.candidates から chosen_meal を取り出す。DDB PutItem の `ConditionExpression: "plan_id = :x AND revision = :r"` で atomic 排他、one-shot 性は revision monotonicity で担保 (DeleteItem 失敗時も再 apply が 409 になる)。Strands Agent は既存 plan-generator container に handler 追加で拡張。

**Tech Stack:** Pydantic v2, uv, pnpm workspace, Next.js 16 App Router, React 19, TanStack Query v5, AWS CDK v2, AWS SDK for JavaScript v3 (`@aws-sdk/client-bedrock-agentcore`, `@aws-sdk/lib-dynamodb`), Strands Agents (Python), Amazon Bedrock AgentCore Runtime, DynamoDB, AWS Lambda (TypeScript / Node.js 22), Vitest, pytest, moto

**命名規約:** contracts-py / contracts-ts / Lambda / HTTP body / Strands payload は **snake_case**。Web の boundary (`lib/api/plans.ts` で DTO parse → `lib/plan/plan-mappers.ts` で camelCase 化) 以降は **camelCase** (Plan 07/08 と同パターン)。

**E2E テスト:** repo に Playwright 未セットアップ方針は継続。Plan 09 では unit + integration テスト + 手動検証チェックリストで完了。

## 設計書

`docs/superpowers/specs/2026-04-24-plan-09-meal-swap-design.md`

## 前提条件

- Plan 01-08 のコード実装が完了していること (Plan 08 の Phase A-F まで)
- AWS アカウントで Bedrock の Claude モデルを **us-west-2 で有効化済み**
- AWS CLI / CDK CLI / Docker (`docker buildx`) がローカルで動作
- `packages/contracts-py` / `infra/agents/plan-generator` / `packages/web` / `infra/` の monorepo 構成を把握
- Plan 08 spec (`docs/superpowers/specs/2026-04-20-plan-08-plan-generation-design.md`) の配管 (cross-region invoke / DockerImageAsset / SafePromptProfile mapper) を参照できる状態
- **Phase G の deploy 手順の前提**: 本 Plan は Plan 08 + Plan 09 を同時に deploy する運用を前提とする。AWS 上に既存 stack が無い状態から始める場合でも Phase G2 の「FitnessStack 先行 deploy」を実行してから G3 以降に進む (詳細は Phase G2 で解説)。**Plan 08 単独の先行 deploy は禁止** (WeeklyPlan.revision field が無い item が DDB に入ると Plan 09 の strict parse が落ちるため)

## 既存資産の参考ファイル

| 既存ファイル | 参考点 |
|---|---|
| `infra/lambdas/generate-plan/index.ts` | JWT / Zod / DDB / AgentCore 呼出の標準形。本 Plan の `swap-meal` Lambda はここを踏襲 |
| `infra/lambdas/generate-plan/mappers.ts` | `SafePromptProfile` 生成。swap-meal から import 共有 |
| `infra/lambdas/generate-plan/agentcore-client.ts` | `BedrockAgentCoreClient` + `InvokeAgentRuntimeCommand` のラッパー。swap-meal 用も同じ pattern |
| `infra/lambdas/shared/response.ts` | `ok` / `badRequest(message)` / `requireJsonBody` / `withServerError` |
| `infra/lambdas/shared/response-json.ts` | `errorJson(code, body)` / `badGatewayJson` / `gatewayTimeoutJson` / `badRequestJson` (Plan 08 で追加) |
| `infra/lambdas/shared/dynamo.ts` | `docClient` / `TABLE_NAME` / `stripKeys(Item)` |
| `infra/lambdas/shared/keys/plan.ts` | `planKey(userId, weekStart)` |
| `infra/agents/plan-generator/src/plan_generator/handler.py` | `build_agent` + structured output の entrypoint pattern |
| `infra/agents/plan-generator/src/plan_generator/agent.py` | Strands Agent 構築 |
| `infra/agents/plan-generator/src/plan_generator/prompts/system.py` | plan 生成用 system prompt。FOOD_HINTS 連結の参考 |
| `infra/lib/constructs/generate-plan-lambda.ts` | CDK construct pattern (env / IAM / API Gateway route) |
| `packages/web/src/lib/api-client.ts` | `apiClient<T>(path, schema, options)` |
| `packages/web/src/hooks/use-plan.ts` | `useGeneratePlan` / `useWeeklyPlan` の pattern |
| `packages/web/src/lib/plan/plan-mappers.ts` | DTO → VM 変換の既存実装。本 Plan で 5 セクション + revision を追加 |
| `packages/web/src/components/domain/meal-card.tsx` | 本 Plan で `onSwap` prop を追加 |
| `packages/web/src/components/domain/seven-day-meal-list.tsx` | 本 Plan で `onSwap(date, slot)` prop を追加 |

---

## ファイル構成

### 新規作成

#### contracts-py

| ファイル | 責務 |
|---|---|
| `packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_context.py` | `DailyMacroContext` / `MealSwapContext` |
| `packages/contracts-py/src/fitness_contracts/models/plan/generated_meal_swap.py` | `GeneratedMealSwapCandidates` |
| `packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_api.py` | `MealSwapCandidatesRequest/Response` / `MealSwapApplyRequest/Response` |
| `packages/contracts-py/tests/test_day_plan_slot_uniqueness.py` | slot 一意性 validator テスト |
| `packages/contracts-py/tests/test_weekly_plan_revision.py` | revision field テスト |
| `packages/contracts-py/tests/test_meal_swap_context.py` | MealSwapContext / DailyMacroContext テスト |
| `packages/contracts-py/tests/test_generated_meal_swap.py` | GeneratedMealSwapCandidates テスト |
| `packages/contracts-py/tests/test_meal_swap_api.py` | Swap API Request/Response テスト |

#### Strands Agent 拡張

| ファイル | 責務 |
|---|---|
| `infra/agents/plan-generator/src/plan_generator/prompts/system_swap.py` | Meal swap 用 system prompt + FOOD_HINTS 連結 |
| `infra/agents/plan-generator/tests/test_agent_swap_e2e.py` | Bedrock mock + swap agent wiring e2e |
| `infra/agents/plan-generator/tests/test_prompts_system_swap.py` | swap system prompt の不変検査 |

#### Adapter Lambda `swap-meal`

| ファイル | 責務 |
|---|---|
| `infra/lambdas/swap-meal/index.ts` | mode 分岐 handler (candidates / apply) |
| `infra/lambdas/swap-meal/swap-mappers.ts` | `DailyMacroContext` 算出 / `recalcDailyTotals` / proposal item 構築 |
| `infra/lambdas/swap-meal/agentcore-client.ts` | `InvokeAgentRuntime` ラッパー (generate-plan と同 pattern) |
| `infra/lambdas/swap-meal/README.md` | 個別仕様 + 手動検証チェックリスト |
| `infra/test/lambdas/swap-meal/index.test.ts` | handler テスト (candidates / apply / security / concurrency) |
| `infra/test/lambdas/swap-meal/mappers.test.ts` | 純粋関数テスト |
| `infra/test/lambdas/swap-meal/agentcore-client.test.ts` | client テスト |
| `infra/test/lambdas/swap-meal/fixtures.ts` | 共通 fixture (profile / plan / proposal) |

#### CDK

| ファイル | 責務 |
|---|---|
| `infra/lib/constructs/swap-meal-lambda.ts` | SwapMealLambda construct (Lambda + 2 route + IAM) |
| `infra/test/lib/constructs/swap-meal-lambda.test.ts` | Construct snapshot テスト |

#### Web

| ファイル | 責務 |
|---|---|
| `packages/web/src/hooks/use-meal-swap.ts` | `useSwapCandidates` / `useSwapApply` mutation |
| `packages/web/src/hooks/use-meal-swap.test.tsx` | hook テスト |
| `packages/web/src/lib/plan/plan-mutations.ts` | `replaceDayInPlan(plan, updatedDay, revision): WeeklyPlanVM` 純粋関数 |
| `packages/web/src/lib/plan/plan-mutations.test.ts` | 純粋関数テスト |
| `packages/web/src/components/domain/meal-swap-modal.tsx` | 候補 3 件表示 + CTA |
| `packages/web/src/components/domain/meal-swap-modal.test.tsx` | modal テスト |
| `packages/web/src/components/domain/week-selector.tsx` | 週ナビゲーション (本 Plan では今週のみ有効) |
| `packages/web/src/components/domain/daily-tabs.tsx` | 横スクロール日付タブ + URL query 同期 |
| `packages/web/src/components/domain/daily-tabs.test.tsx` | daily-tabs テスト |
| `packages/web/src/components/domain/daily-detail.tsx` | theme + daily totals + 4 meal card 描画 |
| `packages/web/src/components/domain/snack-swaps-card.tsx` | SnackSwap list 表示 |
| `packages/web/src/components/domain/hydration-card.tsx` | hydration target + breakdown 表示 |
| `packages/web/src/components/domain/supplements-card.tsx` | Supplement list 表示 |
| `packages/web/src/components/domain/personal-rules-card.tsx` | rules numbered list |
| `packages/web/src/components/domain/timeline-card.tsx` | timeline 箇条書き |
| `packages/web/src/app/(app)/plan/plan-content.tsx` | Plan 画面 Client Component (WeekSelector + DailyTabs + DailyDetail + MealSwapModal) |
| `packages/web/src/app/(app)/plan/plan-content.test.tsx` | 統合テスト |

### 変更

| ファイル | 変更内容 |
|---|---|
| `packages/contracts-py/src/fitness_contracts/models/plan/weekly_plan.py` | `revision: int = Field(..., ge=0)` 追加 |
| `packages/contracts-py/src/fitness_contracts/models/plan/day_plan.py` | `model_validator(mode="after")` で slot 一意性を強制 |
| `packages/contracts-py/src/fitness_contracts/schema_export.py` | MODEL_REGISTRY に新規 7 契約追加 |
| `infra/agents/plan-generator/src/plan_generator/handler.py` | action 分岐追加、`handle_swap_candidates` 新設 |
| `infra/agents/plan-generator/src/plan_generator/agent.py` | `build_swap_agent()` 追加 |
| `infra/agents/plan-generator/tests/test_handler.py` | action 分岐テスト追加 |
| `infra/lambdas/generate-plan/index.ts` | 新規 plan の PutItem 時に `revision: 0` 付与 |
| `infra/test/lambdas/generate-plan/index.test.ts` | revision=0 回帰テスト追加 |
| `infra/lib/fitness-stack.ts` | `SwapMealLambda` construct 追加 (agentcoreRuntimeArn 未指定時は skip) |
| `infra/lib/constructs/database.ts` (or `fitness-stack.ts`) | FitnessTable の TTL 属性を `ttl` に指定して有効化 |
| `packages/web/src/lib/plan/plan-mappers.ts` | 5 セクション VM + revision 追加、`weeklyPlanToVM` 拡張 |
| `packages/web/src/lib/plan/plan-mappers.test.ts` | 5 セクション + revision 検証追加 |
| `packages/web/src/lib/api/plans.ts` | `swapCandidatesDto` / `swapApplyDto` 追加 |
| `packages/web/src/components/domain/meal-card.tsx` | `onSwap?: () => void` prop 追加 |
| `packages/web/src/components/domain/seven-day-meal-list.tsx` | `onSwap?: (date, slot) => void` prop 追加 |
| `packages/web/src/app/(app)/home/home-content.tsx` | 5 セクション Card 追加 + swap 導線接続 |
| `packages/web/src/app/(app)/home/home-content.test.tsx` | 5 セクション + swap フロー統合テスト追加 |
| `packages/web/src/app/(app)/plan/page.tsx` | placeholder 撤去、`plan-content.tsx` 呼出に置換 |
| `infra/package.json` | `deploy:plan09` script 追加 |
| `package.json` (root) | `deploy:plan09` passthrough script 追加 |
| `tasks/memories/{decisions.md, context-log.md, MEMORY.md (if any)}` | Plan 09 完了を append |

---

## Phase A: 契約拡張

本 Phase は Pydantic モデル追加と `MODEL_REGISTRY` 登録、TS/Zod 自動生成まで。

### Task A1: `DayPlan.meals` slot 一意性 validator

**Files:**
- Modify: `packages/contracts-py/src/fitness_contracts/models/plan/day_plan.py`
- Test: `packages/contracts-py/tests/test_day_plan_slot_uniqueness.py`

- [ ] **Step 1: 失敗テストを書く**

```python
# packages/contracts-py/tests/test_day_plan_slot_uniqueness.py
"""DayPlan.meals の slot 一意性 validator テスト。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem


def _meal(slot: str, title: str) -> Meal:
    return Meal(
        slot=slot,
        title=title,
        items=[
            MealItem(
                food_id=None,
                name="dummy",
                grams=100,
                calories_kcal=200,
                protein_g=10,
                fat_g=5,
                carbs_g=20,
            )
        ],
        total_calories_kcal=200,
        total_protein_g=10,
        total_fat_g=5,
        total_carbs_g=20,
        prep_tag=None,
        notes=None,
    )


def test_day_plan_rejects_duplicate_slots():
    with pytest.raises(ValidationError) as ei:
        DayPlan(
            date="2026-04-27",
            theme="test",
            meals=[
                _meal("breakfast", "a"),
                _meal("breakfast", "b"),  # dup
                _meal("dinner", "c"),
            ],
            daily_total_calories_kcal=600,
            daily_total_protein_g=30,
            daily_total_fat_g=15,
            daily_total_carbs_g=60,
        )
    assert "unique slots" in str(ei.value)


def test_day_plan_accepts_unique_slots():
    day = DayPlan(
        date="2026-04-27",
        theme="test",
        meals=[
            _meal("breakfast", "a"),
            _meal("lunch", "b"),
            _meal("dinner", "c"),
        ],
        daily_total_calories_kcal=600,
        daily_total_protein_g=30,
        daily_total_fat_g=15,
        daily_total_carbs_g=60,
    )
    assert len(day.meals) == 3
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_day_plan_slot_uniqueness.py -v`
Expected: FAIL (validator 未実装のため duplicate が通る)

- [ ] **Step 3: 実装**

`packages/contracts-py/src/fitness_contracts/models/plan/day_plan.py` に `model_validator` を追加:

```python
from pydantic import BaseModel, ConfigDict, Field, model_validator

from fitness_contracts.models.plan.meal import Meal


class DayPlan(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "DayPlan"})

    date: str
    theme: str = Field(..., min_length=1, max_length=80)
    meals: list[Meal] = Field(..., min_length=3, max_length=4)
    daily_total_calories_kcal: int
    daily_total_protein_g: float
    daily_total_fat_g: float
    daily_total_carbs_g: float

    @model_validator(mode="after")
    def _enforce_unique_slots(self) -> "DayPlan":
        slots = [m.slot for m in self.meals]
        if len(slots) \!= len(set(slots)):
            raise ValueError(
                f"DayPlan.meals must have unique slots, got {slots}"
            )
        return self
```

(既存 field 名・型は維持。validator のみ追加)

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_day_plan_slot_uniqueness.py -v`
Expected: 2 passed

- [ ] **Step 5: 全 contracts テストで regression がないこと**

Run: `cd packages/contracts-py && uv run pytest -v`
Expected: all green (Plan 08 の既存 test_weekly_plan も pass)

- [ ] **Step 6: commit**

```bash
git add packages/contracts-py/src/fitness_contracts/models/plan/day_plan.py \
        packages/contracts-py/tests/test_day_plan_slot_uniqueness.py
git commit -m "feat(contracts): enforce unique slots in DayPlan.meals"
```

---

### Task A2: `WeeklyPlan.revision` field 追加

**Files:**
- Modify: `packages/contracts-py/src/fitness_contracts/models/plan/weekly_plan.py`
- Test: `packages/contracts-py/tests/test_weekly_plan_revision.py`

- [ ] **Step 1: 失敗テストを書く**

```python
# packages/contracts-py/tests/test_weekly_plan_revision.py
"""WeeklyPlan.revision field のテスト。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.weekly_plan import WeeklyPlan

# 既存 test_weekly_plan.py の fixture を再利用できない場合はここで最小 valid plan を作る
from tests.fixtures.plan_fixtures import minimal_valid_weekly_plan_dict


def test_weekly_plan_requires_revision():
    d = minimal_valid_weekly_plan_dict()
    d.pop("revision", None)
    with pytest.raises(ValidationError) as ei:
        WeeklyPlan(**d)
    assert "revision" in str(ei.value)


def test_weekly_plan_revision_ge_zero():
    d = minimal_valid_weekly_plan_dict()
    d["revision"] = -1
    with pytest.raises(ValidationError):
        WeeklyPlan(**d)


def test_weekly_plan_accepts_revision_zero():
    d = minimal_valid_weekly_plan_dict()
    d["revision"] = 0
    plan = WeeklyPlan(**d)
    assert plan.revision == 0


def test_weekly_plan_accepts_revision_positive():
    d = minimal_valid_weekly_plan_dict()
    d["revision"] = 42
    plan = WeeklyPlan(**d)
    assert plan.revision == 42
```

fixture `minimal_valid_weekly_plan_dict` を `packages/contracts-py/tests/fixtures/plan_fixtures.py` (新規) に用意:

```python
# packages/contracts-py/tests/fixtures/plan_fixtures.py
"""Plan モデル用の共通 fixture。"""

from typing import Any


def _day(date: str) -> dict[str, Any]:
    meal_b = {
        "slot": "breakfast",
        "title": "朝食",
        "items": [{
            "food_id": None, "name": "dummy",
            "grams": 100, "calories_kcal": 400,
            "protein_g": 20, "fat_g": 10, "carbs_g": 50,
        }],
        "total_calories_kcal": 400,
        "total_protein_g": 20,
        "total_fat_g": 10,
        "total_carbs_g": 50,
        "prep_tag": None,
        "notes": None,
    }
    meal_l = {**meal_b, "slot": "lunch", "title": "昼食"}
    meal_d = {**meal_b, "slot": "dinner", "title": "夕食"}
    return {
        "date": date,
        "theme": "テスト日",
        "meals": [meal_b, meal_l, meal_d],
        "daily_total_calories_kcal": 1200,
        "daily_total_protein_g": 60,
        "daily_total_fat_g": 30,
        "daily_total_carbs_g": 150,
    }


def minimal_valid_weekly_plan_dict() -> dict[str, Any]:
    return {
        "plan_id": "00000000-0000-0000-0000-000000000001",
        "week_start": "2026-04-27",
        "generated_at": "2026-04-24T10:00:00Z",
        "revision": 0,
        "target_calories_kcal": 8400,
        "target_protein_g": 420.0,
        "target_fat_g": 210.0,
        "target_carbs_g": 1050.0,
        "days": [
            _day("2026-04-27"), _day("2026-04-28"), _day("2026-04-29"),
            _day("2026-04-30"), _day("2026-05-01"), _day("2026-05-02"),
            _day("2026-05-03"),
        ],
        "weekly_notes": ["note"],
        "snack_swaps": [],
        "hydration_target_liters": 2.5,
        "hydration_breakdown": ["起床時 500ml"],
        "supplement_recommendations": [],
        "personal_rules": ["ルール1", "ルール2", "ルール3"],
        "timeline_notes": ["朝食は 8:00"],
    }
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_weekly_plan_revision.py -v`
Expected: FAIL (`revision` field 未定義)

- [ ] **Step 3: 実装**

`packages/contracts-py/src/fitness_contracts/models/plan/weekly_plan.py` の `WeeklyPlan` に `revision` field を追加。既存 field の順序は維持しつつ `generated_at` の直後に挿入:

```python
class WeeklyPlan(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "WeeklyPlan"})

    plan_id: str
    week_start: str
    generated_at: str
    revision: int = Field(..., ge=0)  # 新規追加 (optimistic concurrency token)
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

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_weekly_plan_revision.py -v`
Expected: 4 passed

- [ ] **Step 5: 既存 test_weekly_plan.py が revision なしで落ちることを確認し修正**

Run: `cd packages/contracts-py && uv run pytest tests/test_weekly_plan.py -v`
Expected: 既存の valid plan fixture が revision=0 を持っていないなら FAIL

既存 fixture / assertion に `revision=0` を追加する (既存 test の意味を変えない最小変更)。

- [ ] **Step 6: 全 contracts テスト再実行**

Run: `cd packages/contracts-py && uv run pytest -v`
Expected: all green

- [ ] **Step 7: commit**

```bash
git add packages/contracts-py/src/fitness_contracts/models/plan/weekly_plan.py \
        packages/contracts-py/tests/test_weekly_plan_revision.py \
        packages/contracts-py/tests/test_weekly_plan.py \
        packages/contracts-py/tests/fixtures/
git commit -m "feat(contracts): add revision field to WeeklyPlan for optimistic concurrency"
```

---

### Task A3: `MealSwapContext` / `DailyMacroContext`

**Files:**
- Create: `packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_context.py`
- Test: `packages/contracts-py/tests/test_meal_swap_context.py`

- [ ] **Step 1: 失敗テストを書く**

```python
# packages/contracts-py/tests/test_meal_swap_context.py
"""MealSwapContext / DailyMacroContext のテスト。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from fitness_contracts.models.plan.meal_swap_context import (
    DailyMacroContext,
    MealSwapContext,
)
from fitness_contracts.models.plan.agent_io import SafePromptProfile


def _target_meal() -> Meal:
    return Meal(
        slot="breakfast",
        title="卵かけご飯",
        items=[MealItem(
            food_id=None, name="米", grams=150,
            calories_kcal=252, protein_g=4, fat_g=0.5, carbs_g=55,
        )],
        total_calories_kcal=252, total_protein_g=4,
        total_fat_g=0.5, total_carbs_g=55,
        prep_tag=None, notes=None,
    )


def _safe_profile() -> SafePromptProfile:
    # 最小 valid な SafePromptProfile。field は既存契約に合わせる
    return SafePromptProfile(
        name=None, age=30, sex="male",
        height_cm=170, weight_kg=70,
        goal_weight_kg=65, goal_description=None,
        desired_pace="steady",
        favorite_meals=[], hated_foods=[], restrictions=[],
        cooking_preference=None, food_adventurousness=None,
        current_snacks=[], snacking_reason=None,
        snack_taste_preference=None, late_night_snacking=None,
        eating_out_style=None, budget_level=None,
        meal_frequency_preference=None, location_region=None,
        kitchen_access=None, convenience_store_usage=None,
        avoid_alcohol=True, avoid_supplements_without_consultation=False,
    )


def test_daily_macro_context_requires_original_day_totals():
    with pytest.raises(ValidationError):
        DailyMacroContext(
            date="2026-04-27",
            # original_day_total_* 欠落
            other_meals_total_calories_kcal=800,
            other_meals_total_protein_g=40,
            other_meals_total_fat_g=20,
            other_meals_total_carbs_g=100,
        )


def test_daily_macro_context_happy_path():
    ctx = DailyMacroContext(
        date="2026-04-27",
        original_day_total_calories_kcal=2000,
        original_day_total_protein_g=120,
        original_day_total_fat_g=60,
        original_day_total_carbs_g=220,
        other_meals_total_calories_kcal=1500,
        other_meals_total_protein_g=90,
        other_meals_total_fat_g=45,
        other_meals_total_carbs_g=170,
    )
    assert ctx.original_day_total_calories_kcal == 2000


def test_meal_swap_context_composes_all_fields():
    ctx = MealSwapContext(
        safe_prompt_profile=_safe_profile(),
        target_meal=_target_meal(),
        daily_context=DailyMacroContext(
            date="2026-04-27",
            original_day_total_calories_kcal=2000,
            original_day_total_protein_g=120,
            original_day_total_fat_g=60,
            original_day_total_carbs_g=220,
            other_meals_total_calories_kcal=1500,
            other_meals_total_protein_g=90,
            other_meals_total_fat_g=45,
            other_meals_total_carbs_g=170,
        ),
    )
    assert ctx.target_meal.slot == "breakfast"
    assert ctx.daily_context.date == "2026-04-27"
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_meal_swap_context.py -v`
Expected: FAIL (ImportError — モジュール未作成)

- [ ] **Step 3: 実装**

```python
# packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_context.py
"""MealSwapContext: Adapter Lambda → Strands の境界 payload。"""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.agent_io import SafePromptProfile
from fitness_contracts.models.plan.meal import Meal


class DailyMacroContext(BaseModel):
    """対象日の配分と他 meal の合計マクロ。plan.target_*/7 は使わず、
    plan.days[i].daily_total_* を基準にすることで alcohol day / treat day の
    日次配分を swap 後も維持する。"""

    model_config = ConfigDict(json_schema_extra={"title": "DailyMacroContext"})

    date: str
    original_day_total_calories_kcal: int = Field(..., ge=0)
    original_day_total_protein_g: float = Field(..., ge=0)
    original_day_total_fat_g: float = Field(..., ge=0)
    original_day_total_carbs_g: float = Field(..., ge=0)
    other_meals_total_calories_kcal: int = Field(..., ge=0)
    other_meals_total_protein_g: float = Field(..., ge=0)
    other_meals_total_fat_g: float = Field(..., ge=0)
    other_meals_total_carbs_g: float = Field(..., ge=0)


class MealSwapContext(BaseModel):
    """Meal swap candidates 生成のため Strands Agent に渡す payload。
    medical_*_note は SafePromptProfile 段階で既に除去されている。"""

    model_config = ConfigDict(json_schema_extra={"title": "MealSwapContext"})

    safe_prompt_profile: SafePromptProfile
    target_meal: Meal
    daily_context: DailyMacroContext
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_meal_swap_context.py -v`
Expected: 3 passed

- [ ] **Step 5: commit**

```bash
git add packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_context.py \
        packages/contracts-py/tests/test_meal_swap_context.py
git commit -m "feat(contracts): add MealSwapContext and DailyMacroContext"
```

---

### Task A4: `GeneratedMealSwapCandidates`

**Files:**
- Create: `packages/contracts-py/src/fitness_contracts/models/plan/generated_meal_swap.py`
- Test: `packages/contracts-py/tests/test_generated_meal_swap.py`

- [ ] **Step 1: 失敗テストを書く**

```python
# packages/contracts-py/tests/test_generated_meal_swap.py
"""GeneratedMealSwapCandidates のテスト (agent 出力境界)。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.generated_meal_swap import (
    GeneratedMealSwapCandidates,
)
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem


def _meal(slot: str, title: str) -> Meal:
    return Meal(
        slot=slot, title=title,
        items=[MealItem(
            food_id=None, name="x", grams=100,
            calories_kcal=300, protein_g=20, fat_g=10, carbs_g=30,
        )],
        total_calories_kcal=300, total_protein_g=20,
        total_fat_g=10, total_carbs_g=30,
        prep_tag=None, notes=None,
    )


def test_requires_exactly_three_candidates():
    with pytest.raises(ValidationError):
        GeneratedMealSwapCandidates(candidates=[_meal("breakfast", "a")])
    with pytest.raises(ValidationError):
        GeneratedMealSwapCandidates(candidates=[
            _meal("breakfast", "a"),
            _meal("breakfast", "b"),
            _meal("breakfast", "c"),
            _meal("breakfast", "d"),
        ])


def test_accepts_three_candidates():
    obj = GeneratedMealSwapCandidates(candidates=[
        _meal("breakfast", "a"),
        _meal("breakfast", "b"),
        _meal("breakfast", "c"),
    ])
    assert len(obj.candidates) == 3
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_generated_meal_swap.py -v`
Expected: FAIL (ImportError)

- [ ] **Step 3: 実装**

```python
# packages/contracts-py/src/fitness_contracts/models/plan/generated_meal_swap.py
"""GeneratedMealSwapCandidates: Strands の structured output 境界。
plan_id / date / slot / revision は含めない (Adapter 側の責務)。"""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.meal import Meal


class GeneratedMealSwapCandidates(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"title": "GeneratedMealSwapCandidates"}
    )

    candidates: list[Meal] = Field(..., min_length=3, max_length=3)
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_generated_meal_swap.py -v`
Expected: 2 passed

- [ ] **Step 5: commit**

```bash
git add packages/contracts-py/src/fitness_contracts/models/plan/generated_meal_swap.py \
        packages/contracts-py/tests/test_generated_meal_swap.py
git commit -m "feat(contracts): add GeneratedMealSwapCandidates output contract"
```

---

### Task A5: Swap API Request/Response 契約

**Files:**
- Create: `packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_api.py`
- Test: `packages/contracts-py/tests/test_meal_swap_api.py`

- [ ] **Step 1: 失敗テストを書く**

```python
# packages/contracts-py/tests/test_meal_swap_api.py
"""Swap API 契約 (Request/Response) のテスト。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.meal_swap_api import (
    MealSwapApplyRequest,
    MealSwapApplyResponse,
    MealSwapCandidatesRequest,
    MealSwapCandidatesResponse,
)
from tests.fixtures.plan_fixtures import _day


def test_candidates_request_requires_date_and_slot():
    with pytest.raises(ValidationError):
        MealSwapCandidatesRequest(date="2026-04-27")  # slot missing


def test_candidates_request_rejects_invalid_slot():
    with pytest.raises(ValidationError):
        MealSwapCandidatesRequest(date="2026-04-27", slot="snack")


def test_apply_request_chosen_index_range():
    with pytest.raises(ValidationError):
        MealSwapApplyRequest(proposal_id="p1", chosen_index=-1)
    with pytest.raises(ValidationError):
        MealSwapApplyRequest(proposal_id="p1", chosen_index=3)
    ok = MealSwapApplyRequest(proposal_id="p1", chosen_index=0)
    assert ok.chosen_index == 0


def test_apply_response_includes_revision():
    resp = MealSwapApplyResponse(
        updated_day=DayPlan(**_day("2026-04-27")),
        plan_id="pid-1",
        revision=3,
    )
    assert resp.revision == 3
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_meal_swap_api.py -v`
Expected: FAIL (ImportError)

- [ ] **Step 3: 実装**

```python
# packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_api.py
"""Meal swap API の Request/Response 契約。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.meal import Meal

MealSlot = Literal["breakfast", "lunch", "dinner", "dessert"]


class MealSwapCandidatesRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"title": "MealSwapCandidatesRequest"}
    )
    date: str
    slot: MealSlot


class MealSwapCandidatesResponse(BaseModel):
    """candidates 生成結果。proposal_id を client が apply で返す。"""
    model_config = ConfigDict(
        json_schema_extra={"title": "MealSwapCandidatesResponse"}
    )
    proposal_id: str
    proposal_expires_at: str
    candidates: list[Meal] = Field(..., min_length=3, max_length=3)


class MealSwapApplyRequest(BaseModel):
    """apply は meal 内容を持たず、server 側の proposal を信頼する。"""
    model_config = ConfigDict(
        json_schema_extra={"title": "MealSwapApplyRequest"}
    )
    proposal_id: str
    chosen_index: int = Field(..., ge=0, le=2)


class MealSwapApplyResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"title": "MealSwapApplyResponse"}
    )
    updated_day: DayPlan
    plan_id: str
    revision: int = Field(..., ge=0)
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_meal_swap_api.py -v`
Expected: 4 passed

- [ ] **Step 5: commit**

```bash
git add packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_api.py \
        packages/contracts-py/tests/test_meal_swap_api.py
git commit -m "feat(contracts): add meal swap API request/response contracts"
```

---

### Task A6: `MODEL_REGISTRY` 更新

**Files:**
- Modify: `packages/contracts-py/src/fitness_contracts/schema_export.py`

- [ ] **Step 1: 既存 import 構造を確認**

Run: `grep -n "MODEL_REGISTRY\|from fitness_contracts" packages/contracts-py/src/fitness_contracts/schema_export.py | head -40`

既存の登録順を壊さないよう、末尾近くの Plan 08 登録ブロックの直後に本 Plan のモデルを追加する。

- [ ] **Step 2: 登録を追加**

`packages/contracts-py/src/fitness_contracts/schema_export.py` の import セクションに追加:

```python
from fitness_contracts.models.plan.generated_meal_swap import (
    GeneratedMealSwapCandidates,
)
from fitness_contracts.models.plan.meal_swap_api import (
    MealSwapApplyRequest,
    MealSwapApplyResponse,
    MealSwapCandidatesRequest,
    MealSwapCandidatesResponse,
)
from fitness_contracts.models.plan.meal_swap_context import (
    DailyMacroContext,
    MealSwapContext,
)
```

`MODEL_REGISTRY` に追加 (Plan 08 の末尾に append):

```python
MODEL_REGISTRY: list[type[BaseModel]] = [
    # ... 既存 Plan 08 までの登録 ...
    # Plan 09: Meal swap
    MealSwapContext,
    DailyMacroContext,
    GeneratedMealSwapCandidates,
    MealSwapCandidatesRequest,
    MealSwapCandidatesResponse,
    MealSwapApplyRequest,
    MealSwapApplyResponse,
]
```

- [ ] **Step 3: `contracts:test` で MODEL_REGISTRY が schema 生成可能か確認**

Run: `cd packages/contracts-py && uv run pytest tests/test_schema_export.py -v`
Expected: all green (既存 test_schema_export が全 MODEL_REGISTRY エントリに対して JSON Schema 生成を試行するはず)

存在しない場合は最低限の smoke を追加:

```python
# packages/contracts-py/tests/test_schema_export.py (既存 or 新規)
from fitness_contracts.schema_export import MODEL_REGISTRY

def test_all_models_generate_json_schema():
    for model in MODEL_REGISTRY:
        schema = model.model_json_schema()
        assert "title" in schema or "$defs" in schema
```

- [ ] **Step 4: commit**

```bash
git add packages/contracts-py/src/fitness_contracts/schema_export.py
git commit -m "feat(contracts): register meal swap models in MODEL_REGISTRY"
```

---

### Task A7: TS/Zod 自動生成

**Files:**
- Run generator: `pnpm contracts:generate` (既存 script)

- [ ] **Step 1: 生成前の git 状態を clean に**

Run: `git status packages/contracts-ts/`
Expected: untracked / modified がない (または既にコミット済み)

- [ ] **Step 2: 生成を実行**

Run: `pnpm contracts:generate`
Expected: `packages/contracts-ts/schemas/*.json` と `packages/contracts-ts/generated/*.ts` に下記が追加される:
- `MealSwapContext.json` / `.ts`
- `DailyMacroContext.json` / `.ts`
- `GeneratedMealSwapCandidates.json` / `.ts`
- `MealSwapCandidatesRequest.json` / `.ts`
- `MealSwapCandidatesResponse.json` / `.ts`
- `MealSwapApplyRequest.json` / `.ts`
- `MealSwapApplyResponse.json` / `.ts`
- `WeeklyPlan.json` (`revision` field 追加されている)
- `DayPlan.json` (slot validator は JSON Schema 側では表現されないがモデル更新の timestamp は変わる可能性あり)

- [ ] **Step 3: 生成物が有効な TS/Zod か smoke check**

Run: `pnpm --filter @fitness/contracts-ts test --run`
Expected: green (生成 Zod が import される既存テストが通る)

- [ ] **Step 4: 生成物を手修正していないことを `git diff` で確認**

Run: `git diff packages/contracts-ts/schemas/ packages/contracts-ts/generated/`
Expected: 本 Plan で追加したモデル / `WeeklyPlan` の `revision` 追加以外の diff は出ない

- [ ] **Step 5: commit**

```bash
git add packages/contracts-ts/schemas/ packages/contracts-ts/generated/
git commit -m "chore(contracts): regenerate TS/Zod for Plan 09 meal swap contracts"
```

---

## Phase B: Plan 08 Adapter の小幅修正

`WeeklyPlan.revision` を新規追加したため、Plan 08 Adapter `generate-plan` でも `revision: 0` を付与しないと strict parse で落ちる。Plan 08 は未 deploy なので DDB への実害はないが、Plan 09 と同時 deploy する運用になる。

### Task B1: `generate-plan` Adapter で `revision: 0` を付与

**Files:**
- Modify: `infra/lambdas/generate-plan/index.ts`
- Test: `infra/test/lambdas/generate-plan/index.test.ts`

- [ ] **Step 1: 既存 index.ts の WeeklyPlan 構築箇所を特定**

Run: `grep -n "plan_id\|generated_at\|WeeklyPlanSchema" infra/lambdas/generate-plan/index.ts`

`plan_id` + `generated_at` を付与している箇所 (`GeneratedWeeklyPlan` → `WeeklyPlan` への昇格部分) を確認する。

- [ ] **Step 2: 回帰テストを先に追加**

`infra/test/lambdas/generate-plan/index.test.ts` の既存 "happy path" テスト (AgentCore が GeneratedWeeklyPlan を返して DDB に PutItem する) に assertion を追加:

```typescript
// 既存の PutItem を受ける mock の引数 assertion に 1 行追加
expect(ddbMock.calls()[0].args[0].input).toMatchObject({
  TableName: "FitnessTable",
  Item: expect.objectContaining({
    pk: `user#${TEST_USER_ID}`,
    sk: `plan#${TEST_WEEK_START}`,
    plan_id: expect.any(String),
    generated_at: expect.any(String),
    revision: 0,  // 新規: Plan 09 で追加
  }),
});
```

- [ ] **Step 3: テスト実行して失敗を確認**

Run: `pnpm --filter infra test -- generate-plan/index.test.ts --run`
Expected: FAIL (現状の実装は `revision` を付与していないため object に含まれない)

- [ ] **Step 4: 実装**

`infra/lambdas/generate-plan/index.ts` の `WeeklyPlan` 組み立て箇所で `revision: 0` を追加:

```typescript
const weeklyPlan = WeeklyPlanSchema.strict().parse({
  plan_id: randomUUID(),
  week_start: req.data.week_start,
  generated_at: new Date().toISOString(),
  revision: 0,  // Plan 09: optimistic concurrency token、新規 plan は 0 から
  ...generatedPlan,  // GeneratedWeeklyPlan の target_*, days, snack_swaps, ...
});
```

- [ ] **Step 5: テスト実行して成功を確認**

Run: `pnpm --filter infra test -- generate-plan/index.test.ts --run`
Expected: all green

- [ ] **Step 6: generate-plan の他テストも regression なしを確認**

Run: `pnpm --filter infra test --run`
Expected: all green (mappers / agentcore-client / plan-generator-stack の既存テストも影響なし)

- [ ] **Step 7: commit**

```bash
git add infra/lambdas/generate-plan/index.ts \
        infra/test/lambdas/generate-plan/index.test.ts
git commit -m "feat(generate-plan): set revision=0 for new WeeklyPlan items"
```

---

## Phase C: Strands Agent 拡張

既存 `plan-generator` container に swap handler を追加。container を新規作成しない。

### Task C1: `prompts/system_swap.py` 新規

**Files:**
- Create: `infra/agents/plan-generator/src/plan_generator/prompts/system_swap.py`
- Test: `infra/agents/plan-generator/tests/test_prompts_system_swap.py`

- [ ] **Step 1: 失敗テストを書く**

```python
# infra/agents/plan-generator/tests/test_prompts_system_swap.py
"""Meal swap 用 system prompt の不変検査。"""

from plan_generator.prompts.system_swap import build_swap_system_prompt


def test_prompt_contains_required_directives():
    prompt = build_swap_system_prompt()
    # 候補数と slot の制約
    assert "EXACTLY 3" in prompt
    assert "same slot" in prompt
    # 予算は original_day_total から other_meals_total を引いて算出する
    assert "original_day_total" in prompt
    assert "other_meals_total" in prompt
    # PII / 医療関連は除外
    assert "NEVER" in prompt
    assert "medical" in prompt.lower()
    # tool 使用権限
    assert "get_food_by_id" in prompt


def test_prompt_includes_food_hints_marker():
    prompt = build_swap_system_prompt()
    # FOOD_HINTS が末尾に連結されていることを示すマーカー
    # (連結の詳細は agent.py のテストで確認、ここでは "FOOD_HINTS" 言及があれば OK)
    assert "FOOD_HINTS" in prompt
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `cd infra/agents/plan-generator && uv run pytest tests/test_prompts_system_swap.py -v`
Expected: FAIL (ImportError)

- [ ] **Step 3: 実装**

```python
# infra/agents/plan-generator/src/plan_generator/prompts/system_swap.py
"""Meal swap 用 system prompt。build_swap_system_prompt() で FOOD_HINTS を連結。"""

from plan_generator.prompts.food_hints import FOOD_HINTS_TEXT


_BASE_PROMPT = """You are a personal fitness nutrition planner.
The user has an existing 7-day meal plan but wants to swap ONE specific meal.

You will receive:
- safe_prompt_profile: user preferences (no medical notes)
- target_meal: the meal they want to replace (slot/title/items/totals)
- daily_context:
    original_day_total_calories_kcal / protein / fat / carbs
      (the original day budget from the existing plan — preserves alcohol day / treat day / batch day configuration)
    other_meals_total_calories_kcal / protein / fat / carbs
      (already-committed portion for OTHER meals on the same day)

Produce EXACTLY 3 alternative meals that:
- have the same slot as target_meal
- ideally fall within (original_day_total_* - other_meals_total_*) ± 10% for calories/protein
- respect hated_foods / restrictions / alcohol avoidance in safe_prompt_profile
- differ from each other meaningfully (cuisine / main protein / preparation style)
- stay realistic for this user's cooking_preference / budget_level
- each has explanatory notes[] of 1-2 short reasons ("why suggested")

You MAY call get_food_by_id to pin down accurate macros when choosing known foods.
LLM-invented dishes are allowed but must include grams/macros/totals.

NEVER reference medical conditions, medications, or pregnancy.

Return a GeneratedMealSwapCandidates object with exactly 3 Meal items.

[FOOD_HINTS section follows]
"""


def build_swap_system_prompt() -> str:
    """system_swap prompt に FOOD_HINTS を連結して返す。"""
    return f"{_BASE_PROMPT}\n\n{FOOD_HINTS_TEXT}"
```

- [ ] **Step 4: テスト実行して成功を確認**

Run: `cd infra/agents/plan-generator && uv run pytest tests/test_prompts_system_swap.py -v`
Expected: 2 passed

- [ ] **Step 5: commit**

```bash
git add infra/agents/plan-generator/src/plan_generator/prompts/system_swap.py \
        infra/agents/plan-generator/tests/test_prompts_system_swap.py
git commit -m "feat(plan-generator): add meal swap system prompt"
```

---

### Task C2: `agent.py` に `build_swap_agent()` 追加

**Files:**
- Modify: `infra/agents/plan-generator/src/plan_generator/agent.py`

- [ ] **Step 1: 既存 `build_agent` の構造を確認**

Run: `grep -n "def build_agent\|BedrockModel\|Agent(" infra/agents/plan-generator/src/plan_generator/agent.py`

既存 `build_agent()` が `Agent(model=..., tools=[...], system_prompt=..., structured_output_model=...)` を組み立てている pattern を踏襲する。

- [ ] **Step 2: 実装 (既存 `build_agent` を壊さない追加のみ)**

`infra/agents/plan-generator/src/plan_generator/agent.py` に追加:

```python
from plan_generator.prompts.system_swap import build_swap_system_prompt
from fitness_contracts.models.plan.generated_meal_swap import (
    GeneratedMealSwapCandidates,
)


def build_swap_agent():
    """Meal swap 候補生成用の Strands Agent。
    既存 4 tools を再利用 (calorie_macro / hydration / supplements / get_food_by_id)。
    output_schema は GeneratedMealSwapCandidates (厳密に 3 件)。"""
    from strands.agent import Agent  # type: ignore
    from strands.models.bedrock import BedrockModel  # type: ignore

    from plan_generator.tools.calorie_macro import calculate_calories_macros
    from plan_generator.tools.hydration import calculate_hydration
    from plan_generator.tools.supplements import recommend_supplements
    from plan_generator.tools.get_food_by_id import get_food_by_id

    model = BedrockModel(
        model_id="anthropic.claude-sonnet-4-6",
        region_name="us-west-2",
    )
    return Agent(
        model=model,
        tools=[
            calculate_calories_macros,
            calculate_hydration,
            recommend_supplements,
            get_food_by_id,
        ],
        system_prompt=build_swap_system_prompt(),
        structured_output_model=GeneratedMealSwapCandidates,
    )
```

(注: 実際の `Agent` / `BedrockModel` の API 名は既存 `build_agent` の呼び方に合わせる。本 Plan は差分 reviewer が既存 `build_agent` シグネチャに合わせて `Agent(output_schema=...)` か `Agent(structured_output_model=...)` かを 1 行調整すれば通るよう書いている)

- [ ] **Step 3: テストは Task C5 の e2e で実施。この step では import が壊れていないことだけ確認**

Run: `cd infra/agents/plan-generator && uv run python -c "from plan_generator.agent import build_agent, build_swap_agent; print('OK')"`
Expected: `OK` が出力される

- [ ] **Step 4: commit**

```bash
git add infra/agents/plan-generator/src/plan_generator/agent.py
git commit -m "feat(plan-generator): add build_swap_agent for meal swap"
```

---

### Task C3: `handler.py` に action 分岐追加

**Files:**
- Modify: `infra/agents/plan-generator/src/plan_generator/handler.py`
- Modify: `infra/agents/plan-generator/tests/test_handler.py`

- [ ] **Step 1: 失敗テストを `test_handler.py` に追加**

```python
# infra/agents/plan-generator/tests/test_handler.py に追記

from unittest.mock import patch

from plan_generator.handler import handle


def _swap_event():
    return {
        "action": "swap_candidates",
        "swap_context": {
            "safe_prompt_profile": {
                "name": None, "age": 30, "sex": "male",
                "height_cm": 170, "weight_kg": 70,
                "goal_weight_kg": 65, "goal_description": None,
                "desired_pace": "steady",
                "favorite_meals": [], "hated_foods": [], "restrictions": [],
                "cooking_preference": None, "food_adventurousness": None,
                "current_snacks": [], "snacking_reason": None,
                "snack_taste_preference": None, "late_night_snacking": None,
                "eating_out_style": None, "budget_level": None,
                "meal_frequency_preference": None, "location_region": None,
                "kitchen_access": None, "convenience_store_usage": None,
                "avoid_alcohol": True,
                "avoid_supplements_without_consultation": False,
            },
            "target_meal": {
                "slot": "breakfast", "title": "朝食",
                "items": [{
                    "food_id": None, "name": "米", "grams": 150,
                    "calories_kcal": 252, "protein_g": 4,
                    "fat_g": 0.5, "carbs_g": 55,
                }],
                "total_calories_kcal": 252, "total_protein_g": 4,
                "total_fat_g": 0.5, "total_carbs_g": 55,
                "prep_tag": None, "notes": None,
            },
            "daily_context": {
                "date": "2026-04-27",
                "original_day_total_calories_kcal": 2000,
                "original_day_total_protein_g": 120,
                "original_day_total_fat_g": 60,
                "original_day_total_carbs_g": 220,
                "other_meals_total_calories_kcal": 1500,
                "other_meals_total_protein_g": 90,
                "other_meals_total_fat_g": 45,
                "other_meals_total_carbs_g": 170,
            },
        },
    }


def test_handle_routes_swap_candidates_to_swap_handler():
    with patch("plan_generator.handler.handle_swap_candidates") as mock:
        mock.return_value = {"generated_candidates": {"candidates": []}}
        handle(_swap_event(), None)
        mock.assert_called_once()


def test_handle_unknown_action_raises():
    import pytest
    with pytest.raises(ValueError) as ei:
        handle({"action": "unknown"}, None)
    assert "unknown action" in str(ei.value).lower()


def test_handle_defaults_to_generate_plan_when_action_absent():
    with patch("plan_generator.handler.handle_generate_plan") as mock:
        mock.return_value = {"generated_weekly_plan": {}}
        handle({"user_id": "u1", "week_start": "2026-04-27"}, None)
        mock.assert_called_once()
```

- [ ] **Step 2: テスト実行して失敗を確認**

Run: `cd infra/agents/plan-generator && uv run pytest tests/test_handler.py -v`
Expected: FAIL (action 分岐ロジックが未実装)

- [ ] **Step 3: 実装**

既存 `handler.py` を以下のように拡張 (既存 `handle_generate_plan` 本体は維持、entrypoint `handle` を追加):

```python
# infra/agents/plan-generator/src/plan_generator/handler.py
"""AgentCore Runtime entrypoint。action で generate_plan / swap_candidates を分岐。"""

from typing import Any

from fitness_contracts.models.plan.meal_swap_context import MealSwapContext

from plan_generator.agent import build_agent, build_swap_agent


def handle(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """AgentCore Runtime に登録される entrypoint。
    action が未指定 / "generate_plan" なら Plan 08 の既存フロー、
    "swap_candidates" なら本 Plan の swap フローへ routing。"""
    action = event.get("action", "generate_plan")
    if action == "generate_plan":
        return handle_generate_plan(event)
    if action == "swap_candidates":
        return handle_swap_candidates(event)
    raise ValueError(f"unknown action: {action}")


def handle_generate_plan(event: dict[str, Any]) -> dict[str, Any]:
    """Plan 08 既存実装 (変更なし)。"""
    # ... 既存本文 ...
    raise NotImplementedError  # 既存実装をそのまま残す


def handle_swap_candidates(event: dict[str, Any]) -> dict[str, Any]:
    """Meal swap の候補 3 件を LLM に生成させる。"""
    ctx = MealSwapContext.model_validate(event["swap_context"])
    agent = build_swap_agent()
    # Strands の呼び方は既存 handle_generate_plan と揃える。
    # 下記は擬似コード: 実際は agent.run(ctx) や agent.invoke(ctx) など repo の pattern に従う。
    result = agent(ctx.model_dump())
    # structured output なので result.structured_output は GeneratedMealSwapCandidates 相当
    return {"generated_candidates": result.structured_output.model_dump()}
```

既存 `handle_generate_plan` の中身は本 Plan では **一切触らない**。`handle` と `handle_swap_candidates` の追加のみ。

- [ ] **Step 4: テスト実行して成功を確認**

Run: `cd infra/agents/plan-generator && uv run pytest tests/test_handler.py -v`
Expected: all passed (既存 test_handler も含めて regression なし)

- [ ] **Step 5: commit**

```bash
git add infra/agents/plan-generator/src/plan_generator/handler.py \
        infra/agents/plan-generator/tests/test_handler.py
git commit -m "feat(plan-generator): add action dispatch for swap_candidates"
```

---

### Task C4: Swap agent e2e テスト

**Files:**
- Create: `infra/agents/plan-generator/tests/test_agent_swap_e2e.py`

- [ ] **Step 1: テストを書く (Bedrock 層だけ mock、それ以外は実配線を通す)**

```python
# infra/agents/plan-generator/tests/test_agent_swap_e2e.py
"""Meal swap agent の wiring e2e テスト。BedrockModel 呼出しだけ mock。"""

from unittest.mock import MagicMock, patch

from fitness_contracts.models.plan.generated_meal_swap import (
    GeneratedMealSwapCandidates,
)
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem


def _valid_candidates() -> GeneratedMealSwapCandidates:
    meal = Meal(
        slot="breakfast", title="代替朝食",
        items=[MealItem(
            food_id=None, name="オーツ", grams=60,
            calories_kcal=220, protein_g=8, fat_g=4, carbs_g=35,
        )],
        total_calories_kcal=220, total_protein_g=8,
        total_fat_g=4, total_carbs_g=35,
        prep_tag="quick", notes=["高タンパク"],
    )
    return GeneratedMealSwapCandidates(candidates=[meal, meal, meal])


def test_build_swap_agent_wires_tools_and_output_schema():
    from plan_generator.agent import build_swap_agent

    with patch(
        "plan_generator.agent.BedrockModel"
    ) as mock_model_cls:
        mock_model_cls.return_value = MagicMock()
        agent = build_swap_agent()

    # tools 4 個が登録されている
    assert len(agent.tools) == 4
    tool_names = {t.__name__ for t in agent.tools}
    assert tool_names == {
        "calculate_calories_macros",
        "calculate_hydration",
        "recommend_supplements",
        "get_food_by_id",
    }
    # system prompt に swap 特有のキーワード
    assert "EXACTLY 3" in agent.system_prompt
    assert "original_day_total" in agent.system_prompt
    # structured output model
    assert agent.structured_output_model is GeneratedMealSwapCandidates


def test_swap_agent_parses_valid_structured_output():
    """BedrockModel が返すレスポンスを Strands が structured output として
    GeneratedMealSwapCandidates にパースできることを、Bedrock 層 mock で確認。"""
    from plan_generator.agent import build_swap_agent

    valid = _valid_candidates()
    with patch("plan_generator.agent.BedrockModel") as mock_model_cls:
        mock_model = MagicMock()
        mock_model.invoke.return_value = valid.model_dump_json()
        mock_model_cls.return_value = mock_model

        agent = build_swap_agent()
        # 呼び出しは repo の既存 pattern に合わせて 1 行調整
        # (実装者ノート: 既存 test_agent_e2e.py の呼び出し方に揃える)
```

- [ ] **Step 2: テスト実行**

Run: `cd infra/agents/plan-generator && uv run pytest tests/test_agent_swap_e2e.py -v`
Expected: 1 passed (`test_build_swap_agent_wires_tools_and_output_schema`)、2 個目は repo pattern 調整後に通す

- [ ] **Step 3: commit**

```bash
git add infra/agents/plan-generator/tests/test_agent_swap_e2e.py
git commit -m "test(plan-generator): add swap agent e2e wiring test"
```

---

## Phase D: Adapter Lambda `swap-meal`

Adapter Lambda は 1 本、内部で path により candidates / apply を分岐する。実装パターンは `infra/lambdas/generate-plan/` を忠実に踏襲。

### Task D1: scaffold + agentcore-client + fixtures + README

**Files:**
- Create: `infra/lambdas/swap-meal/agentcore-client.ts`
- Create: `infra/lambdas/swap-meal/README.md`
- Test: `infra/test/lambdas/swap-meal/agentcore-client.test.ts`
- Create: `infra/test/lambdas/swap-meal/fixtures.ts`

- [ ] **Step 1: 既存 `infra/lambdas/generate-plan/agentcore-client.ts` を熟読**

Run: `cat infra/lambdas/generate-plan/agentcore-client.ts infra/test/lambdas/generate-plan/agentcore-client.test.ts`

本 Task の `invokeSwapAgent` は generate-plan 側と同形 (`BedrockAgentCoreClient` + `InvokeAgentRuntimeCommand`) で、payload の先頭に `action: "swap_candidates"` を入れる点だけ違う。

- [ ] **Step 2: `agentcore-client.test.ts` を既存 generate-plan テストからコピーして調整**

既存 `infra/test/lambdas/generate-plan/agentcore-client.test.ts` を base に、下記の差分だけ:
- import 先を `../../../lambdas/swap-meal/agentcore-client` に
- expose する関数名を `invokeSwapAgent` に
- payload assertion で `action` が `"swap_candidates"`、`swap_context` key を持つことを検査
- 成功レスポンスの body に `generated_candidates` を入れる

`AGENTCORE_RUNTIME_ARN` env 変数の検査ケース (not set → throw) も generate-plan と同じパターンで追加。

- [ ] **Step 3: テスト実行して失敗を確認**

Run: `pnpm --filter infra test -- swap-meal/agentcore-client --run`
Expected: FAIL (モジュール未作成)

- [ ] **Step 4: `agentcore-client.ts` を既存 generate-plan から写経して調整**

差分:
- 関数名は `invokeSwapAgent`
- `payload` の JSON に `action: "swap_candidates"` + `swap_context` を入れる
- 入力型は `{ swap_context: MealSwapContext }` (生成 Zod の型を import)
- `us-west-2` region 指定、`AGENTCORE_RUNTIME_ARN` を env から読む部分は同一

- [ ] **Step 5: テスト実行して成功を確認**

Run: `pnpm --filter infra test -- swap-meal/agentcore-client --run`
Expected: green

- [ ] **Step 6: `fixtures.ts` を生成**

`infra/test/lambdas/swap-meal/fixtures.ts` に下記を用意 (既存 `generate-plan/fixtures.ts` と同じ規模感):

- `TEST_USER_ID` / `TEST_WEEK_START` の定数
- `buildMeal(slot, title, overrides?)` — 最小 valid な `Meal`
- `buildDay(date)` — breakfast/lunch/dinner の 3 meal を持つ `DayPlan`
- `buildPlan(revision = 0)` — 7 日分の `DayPlan` を含む `WeeklyPlan`
- `buildSafeProfile()` — 最小 valid な `SafePromptProfile`
- `buildProfile()` — `CompleteProfileForPlan` に通る UserProfile (既存 generate-plan fixtures と同内容)

各 builder は `packages/contracts-ts/generated` の型を使い、field 値は契約の必須と範囲を満たす最小値で良い。

- [ ] **Step 7: README.md**

`infra/lambdas/swap-meal/README.md` に下記セクションで記述:
- 概要: 1 Lambda で candidates (経路 A) と apply (経路 B) を path 分岐
- API: `POST /users/me/plans/{weekStart}/meals/swap-candidates` と `swap-apply` の Request/Response
- 依存: `AGENTCORE_RUNTIME_ARN`, `TABLE_NAME` env
- 手動検証チェックリスト:
  1. Home の meal card → 差し替え → 3 候補表示
  2. 1 件選択 → DDB plan の revision が +1
  3. 同 proposal で 2 回目 → 409
  4. TTL 切れ proposal → 410
  5. 存在しない proposal_id → 404

- [ ] **Step 8: commit**

```bash
git add infra/lambdas/swap-meal/ infra/test/lambdas/swap-meal/
git commit -m "feat(swap-meal): scaffold agentcore client, fixtures, and README"
```

---

### Task D2: `swap-mappers.ts` 純粋関数

**Files:**
- Create: `infra/lambdas/swap-meal/swap-mappers.ts`
- Test: `infra/test/lambdas/swap-meal/mappers.test.ts`

本 Task は副作用なしの純粋関数 4 つ:

- `buildDailyMacroContext(plan, date, slot) -> DailyMacroContext` — `plan.days[i].daily_total_*` を `original_day_total_*` に、target 以外の meal totals 合計を `other_meals_total_*` に
- `recalcDailyTotals(day) -> DayPlan` — 全 meal の totals を合算した新 DayPlan を返す (入力 mutate しない)
- `replaceMealInDay(day, slot, chosenMeal) -> DayPlan` — slot 一致 meal を入れ替えて `recalcDailyTotals` を通す
- `buildProposalItem({userId, proposalId, weekStart, date, slot, plan, candidates, nowEpochSeconds}) -> ProposalItem` — pk/sk, `current_plan_id=plan.plan_id`, `expected_revision=plan.revision`, `ttl=nowEpochSeconds+600` を付与

- [ ] **Step 1: テスト先行 (TDD)**

`infra/test/lambdas/swap-meal/mappers.test.ts` に次のケース群を書く (全て失敗するはず):

- `buildDailyMacroContext`:
  - `plan.days[i].daily_total_*` がそのまま `original_day_total_*` にコピーされる (alcohol day を模して `daily_total_calories_kcal = 2400` を設定 → `target_calories_kcal / 7 = 1200` にならないことを assert)
  - `other_meals_total_*` が target 以外の meal totals の正しい合計
  - date 非存在 → throw
  - slot 非存在 → throw
- `recalcDailyTotals`:
  - 3 meal の cal を書き換えて合算値を検証
  - 入力 day を mutate しないこと
- `buildProposalItem`:
  - `current_plan_id` と `expected_revision` が `plan` から正しく持ってこられる
  - `ttl = nowEpochSeconds + 600`
  - `candidates` が 3 件入る
  - `sk` が `swap_proposal#` prefix

- [ ] **Step 2: テスト実行で失敗確認**

Run: `pnpm --filter infra test -- swap-meal/mappers --run`
Expected: FAIL (未実装)

- [ ] **Step 3: 実装**

契約の TS 型 (`DailyMacroContext`, `DayPlan`, `Meal`, `WeeklyPlan`) は `@fitness/contracts-ts` から import。全関数は新オブジェクトを返す immutable スタイル (spread operator)。

`buildDailyMacroContext`: target 以外の meal を filter して reduce で sum、`day.daily_total_*` をそのまま `original_day_total_*` にコピー。

`recalcDailyTotals`: `day.meals.reduce((acc, m) => acc + m.total_xxx, 0)` で 4 指標合算、`{ ...day, daily_total_xxx }` を return。

`replaceMealInDay`: `meals.map(m => m.slot === slot ? chosen : m)` → `recalcDailyTotals` に渡す。

`buildProposalItem`: オブジェクトリテラルで pk/sk, current_plan_id, expected_revision, ttl, created_at (ISO) を組み立てて return。

- [ ] **Step 4: テスト実行で成功確認**

Run: `pnpm --filter infra test -- swap-meal/mappers --run`
Expected: all green

- [ ] **Step 5: commit**

```bash
git add infra/lambdas/swap-meal/swap-mappers.ts \
        infra/test/lambdas/swap-meal/mappers.test.ts
git commit -m "feat(swap-meal): add pure-function mappers"
```

---

### Task D3: candidates path handler

**Files:**
- Create: `infra/lambdas/swap-meal/index.ts`
- Test: `infra/test/lambdas/swap-meal/index.test.ts`

- [ ] **Step 1: candidates path のテストケースを書く (TDD)**

`infra/test/lambdas/swap-meal/index.test.ts` に `DynamoDBDocumentClient` を `aws-sdk-client-mock` で mock、`agentcore-client` の `invokeSwapAgent` を `vi.mock` で stub。

テストケース:
1. **`meal_not_found` (404)**: プロフィール取得 → plan 取得 OK だが、request の slot が target day に存在しない → 404
2. **`plan_not_found` (404)**: plan GetItem の Item が undefined → 404
3. **`incomplete_profile_fields` (400)**: profile の `CompleteProfileForPlanSchema.safeParse` 失敗 → 400
4. **`invalid_swap_shape` (502) — Strands 出力 Schema 違反**: `generated_candidates.candidates` が 2 件 → 502
5. **`invalid_swap_shape` (502) — slot mismatch**: 3 件返るが 1 件が `slot: "lunch"` (target は breakfast) → 502
6. **`swap_timeout` (504)**: `invokeSwapAgent` が timeout error throw → 504
7. **Happy path**: 正常 3 件返る → 200、レスポンス body が `{ proposal_id, proposal_expires_at, candidates[3] }`
8. **proposal 永続化検査**: Happy path で `PutCommand` が呼ばれ、`Item` に `pk=user#<id>`, `sk=swap_proposal#...`, `current_plan_id=plan.plan_id`, `expected_revision=plan.revision`, `ttl`, `candidates[3]` が入っている

`requestContext.http.path` の末尾が `/swap-candidates` になる event を builder 関数で生成 (`candidatesEvent(body)`)。

- [ ] **Step 2: テスト実行で失敗確認**

Run: `pnpm --filter infra test -- swap-meal/index --run`
Expected: FAIL (handler 未作成)

- [ ] **Step 3: handler 骨格と candidates 実装**

`infra/lambdas/swap-meal/index.ts` を新規作成し、以下を順に実装:

1. `export const handler` entrypoint:
   - `event.requestContext.http.path` の末尾で `/swap-candidates` or `/swap-apply` を判定
   - どちらでもなければ 404 `{ error: "not_found" }`
2. `handleCandidates`:
   - `requireUserId(event)` / `requireJsonBody(event)`
   - `MealSwapCandidatesRequestSchema.safeParse(body)` → 失敗なら 400
   - `event.pathParameters.weekStart` を取り出し、欠落なら 400
   - DDB GetItem profile → `CompleteProfileForPlanSchema.safeParse(stripKeys(Item))` → 失敗なら 400 `incomplete_profile_fields`
   - DDB GetItem plan (ConsistentRead) → 未存在で 404 `plan_not_found` / 存在で `WeeklyPlanSchema.strict().parse`
   - `plan.days.find(d => d.date === date)` → 未存在で 404 `meal_not_found`
   - `day.meals.find(m => m.slot === slot)` → 未存在で 404 `meal_not_found`
   - `buildDailyMacroContext(plan, date, slot)` / `buildSafePromptProfile(profile)` (generate-plan の mapper を `import "../generate-plan/mappers"` で再利用)
   - `invokeSwapAgent({ swap_context: { safe_prompt_profile, target_meal: target, daily_context } })` — try/catch、timeout 判定は error message に `timeout` 含むかで
   - `GeneratedMealSwapCandidatesSchema.strict().safeParse(raw.generated_candidates)` → 失敗で 502 `invalid_swap_shape`
   - `candidates.every(c => c.slot === slot)` 検査 → 失敗で 502 `invalid_swap_shape`
   - `randomUUID()` で `proposal_id` 生成、`buildProposalItem` で item 組み立て
   - DDB PutItem proposal (ConditionExpression `attribute_not_exists(pk)`) → 失敗で 502 `proposal_persistence_failed`
   - 200 `{ proposal_id, proposal_expires_at: ISO(ttl*1000), candidates }`
3. `handleApply`: この時点では `501 not_implemented` を返すだけ (Task D4 で実装)

共通依存は generate-plan と揃える:
- `@aws-sdk/lib-dynamodb` の `GetCommand` / `PutCommand`
- `docClient` / `TABLE_NAME` / `stripKeys` from `../shared/dynamo`
- `planKey` from `../shared/keys/plan`
- `ok` / `badRequestJson` / `badGatewayJson` / `gatewayTimeoutJson` / `errorJson` from `../shared/response-json`
- `requireUserId` / `requireJsonBody` from `../shared/response`
- 生成 Zod from `@fitness/contracts-ts`

- [ ] **Step 4: テスト実行で成功確認**

Run: `pnpm --filter infra test -- swap-meal/index --run`
Expected: candidates 系 8 ケース全 green (apply 系は未実装なので除外 or skip)

- [ ] **Step 5: commit**

```bash
git add infra/lambdas/swap-meal/index.ts \
        infra/test/lambdas/swap-meal/index.test.ts
git commit -m "feat(swap-meal): implement candidates handler with proposal persistence"
```

---

### Task D4: apply path handler + concurrency

**Files:**
- Modify: `infra/lambdas/swap-meal/index.ts`
- Modify: `infra/test/lambdas/swap-meal/index.test.ts`

- [ ] **Step 1: apply テストケース追加**

`applyEvent(body)` ヘルパを追加 (path を `/swap-apply` に設定)。次のケース:

1. **`proposal_expired_or_missing` (404)**: proposal GetItem で Item 未存在
2. **`proposal_expired` (410)**: `ttl <= nowSec`
3. **`invalid_chosen_index` (400)**: `chosen_index >= proposal.candidates.length`
4. **`plan_not_found` (404)**
5. **plan_id mismatch で 409 `plan_stale`**
6. **revision mismatch で 409 `plan_stale`**
7. **Happy path**:
   - `PutCommand` の `Item.revision === plan.revision + 1`
   - `ConditionExpression` に `plan_id = :pid AND revision = :rev` を含む
   - `DeleteCommand` で proposal 削除
   - レスポンス `{ updated_day, plan_id, revision: new }`、`updated_day.meals[i]` が chosen で置換、`daily_total_*` が再計算
8. **`ConditionalCheckFailedException` → 409**
9. **DeleteItem 失敗でも 200** (warning log のみ)
10. **任意 meal 注入不可**: body に `chosen_meal: { title: "ATTACKER" }` を混入しても結果の `updated_day.meals[i].title` は `proposal.candidates[chosen_index].title`
11. **concurrency 1**: 同 plan_id / revision=0 から 2 proposal、1 回目 apply 成功 (revision → 1)、2 回目 apply (expected_revision=0) → 409
12. **concurrency 2 (DeleteItem 失敗後の再 apply)**: 1 回目 apply 成功 + DeleteItem reject、ddbMock reset して 2 回目 apply → plan.revision=1 のため expected_revision=0 の proposal は 409

- [ ] **Step 2: テスト実行で失敗確認**

Run: `pnpm --filter infra test -- swap-meal/index --run`
Expected: apply 系 12 ケース全 FAIL (handleApply が 501 を返している)

- [ ] **Step 3: `handleApply` 実装**

1. `requireUserId` / `requireJsonBody`
2. `MealSwapApplyRequestSchema.safeParse(body)` → 失敗で 400
3. proposal GetItem (`pk=user#<id>, sk=swap_proposal#<proposal_id>`, `ConsistentRead: true`)。Item 未存在で 404 `proposal_expired_or_missing`
4. `proposal.ttl <= Math.floor(Date.now()/1000)` で 410 `proposal_expired`
5. `const chosen = proposal.candidates[chosen_index]` — undefined なら 400 `invalid_chosen_index`
6. plan GetItem (ConsistentRead) → 未存在で 404 `plan_not_found`、存在で `WeeklyPlanSchema.strict().parse`
7. `plan.plan_id !== proposal.current_plan_id` → 409 `plan_stale`
8. `plan.revision !== proposal.expected_revision` → 409 `plan_stale`
9. target day index 特定、`replaceMealInDay(day, proposal.slot, chosen)` で新 day
10. `newPlan = { ...plan, days: [...置換...], revision: plan.revision + 1 }`、`WeeklyPlanSchema.strict().parse(newPlan)` で最終検証
11. PutItem の item は `{ ...planKey(userId, weekStart), ...newPlan }`、`ConditionExpression: "plan_id = :pid AND revision = :rev"`、`ExpressionAttributeValues: { ":pid": plan.plan_id, ":rev": plan.revision }` (新値ではなく旧値と比較する点に注意)
12. PutItem 失敗時、`error.name === "ConditionalCheckFailedException"` なら 409 `plan_stale`、それ以外なら 502 `persistence_failed`
13. DeleteItem proposal — try/catch で warning log、成功/失敗どちらでも 200 は返す
14. 200 `{ updated_day, plan_id: plan.plan_id, revision: plan.revision + 1 }`

- [ ] **Step 4: テスト実行で成功確認**

Run: `pnpm --filter infra test -- swap-meal/index --run`
Expected: all green (candidates 8 + apply 12、合計 20 tests)

- [ ] **Step 5: commit**

```bash
git add infra/lambdas/swap-meal/index.ts \
        infra/test/lambdas/swap-meal/index.test.ts
git commit -m "feat(swap-meal): implement apply handler with revision-based optimistic concurrency"
```

---

## Phase E: CDK 配管

### Task E1: FitnessTable の TTL 属性有効化

**Files:**
- Modify: `infra/lib/constructs/database.ts` (既存、TTL 属性を追加)
- Test: `infra/test/lib/constructs/database.test.ts` (存在しなければ新規)

- [ ] **Step 1: 現状確認**

Run: `grep -n "timeToLiveAttribute\|ttl\|TimeToLive" infra/lib/constructs/database.ts infra/lib/fitness-stack.ts`

Plan 08 時点では TTL 属性が未設定のはず。

- [ ] **Step 2: テスト先行**

`infra/test/lib/constructs/database.test.ts` に CFN template assertion:

```typescript
import { Template } from "aws-cdk-lib/assertions";
// ... Stack 生成 ...
const template = Template.fromStack(stack);
template.hasResourceProperties("AWS::DynamoDB::Table", {
  TimeToLiveSpecification: {
    AttributeName: "ttl",
    Enabled: true,
  },
});
```

- [ ] **Step 3: テスト実行で失敗確認**

Run: `pnpm --filter infra test -- database --run`
Expected: FAIL

- [ ] **Step 4: 実装**

`infra/lib/constructs/database.ts` (FitnessTable 定義箇所) に `timeToLiveAttribute: "ttl"` を追加:

```typescript
new dynamodb.Table(this, "FitnessTable", {
  // 既存 props ...
  timeToLiveAttribute: "ttl",
});
```

- [ ] **Step 5: テスト実行で成功確認 + 既存 snapshot 更新**

Run: `pnpm --filter infra test --run`
Expected: green (CDK snapshot test が変化していれば update で対応)

- [ ] **Step 6: commit**

```bash
git add infra/lib/constructs/database.ts infra/test/lib/constructs/
git commit -m "feat(infra): enable DynamoDB TTL on FitnessTable for swap proposals"
```

---

### Task E2: `SwapMealLambda` construct

**Files:**
- Create: `infra/lib/constructs/swap-meal-lambda.ts`
- Test: `infra/test/lib/constructs/swap-meal-lambda.test.ts`

- [ ] **Step 1: 既存 `infra/lib/constructs/generate-plan-lambda.ts` を base に構造をコピー**

Run: `cat infra/lib/constructs/generate-plan-lambda.ts`

`GeneratePlanLambda` の構造:
- `NodejsFunction` を作成 (timeout: 25s, memory: 512MB, env: `AGENTCORE_RUNTIME_ARN` / `TABLE_NAME`)
- IAM grant:
  - `bedrock-agentcore:InvokeAgentRuntime` on `agentcoreRuntimeArn`
  - `dynamodb:GetItem` / `PutItem` on table (LeadingKeys condition `user#*`)
- API Gateway `HttpRoute` を 1 本追加

SwapMealLambda は上記に加えて `DeleteItem` 権限と API Gateway route を 2 本追加。

- [ ] **Step 2: construct snapshot テスト先行**

```typescript
// infra/test/lib/constructs/swap-meal-lambda.test.ts
import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { describe, it, expect } from "vitest";

import { SwapMealLambda } from "../../../lib/constructs/swap-meal-lambda";

describe("SwapMealLambda", () => {
  function buildStack() {
    const app = new App();
    const stack = new Stack(app, "TestStack", {
      env: { account: "111122223333", region: "ap-northeast-1" },
    });
    const table = new dynamodb.Table(stack, "T", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
    });
    const httpApi = new HttpApi(stack, "Api");
    new SwapMealLambda(stack, "SM", {
      httpApi,
      table,
      agentcoreRuntimeArn:
        "arn:aws:bedrock-agentcore:us-west-2:111122223333:runtime/abc",
    });
    return Template.fromStack(stack);
  }

  it("adds two routes for candidates and apply", () => {
    const t = buildStack();
    t.resourceCountIs("AWS::ApiGatewayV2::Route", 2);
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /users/me/plans/{weekStart}/meals/swap-candidates",
    });
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", {
      RouteKey: "POST /users/me/plans/{weekStart}/meals/swap-apply",
    });
  });

  it("grants DeleteItem in addition to Get/Put on the table", () => {
    const t = buildStack();
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              "dynamodb:GetItem",
              "dynamodb:PutItem",
              "dynamodb:DeleteItem",
            ]),
          }),
        ]),
      },
    });
  });

  it("grants InvokeAgentRuntime on the provided ARN", () => {
    const t = buildStack();
    t.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "bedrock-agentcore:InvokeAgentRuntime",
          }),
        ]),
      },
    });
  });
});
```

- [ ] **Step 3: テスト実行で失敗確認**

Run: `pnpm --filter infra test -- swap-meal-lambda --run`
Expected: FAIL (construct 未作成)

- [ ] **Step 4: 実装**

`infra/lib/constructs/swap-meal-lambda.ts` を generate-plan-lambda.ts の写経ベースで作成:

- Props: `{ httpApi: HttpApi, table: dynamodb.Table, agentcoreRuntimeArn: string }`
- `NodejsFunction` entry は `infra/lambdas/swap-meal/index.ts`、timeout 25s, memory 512MB, env `AGENTCORE_RUNTIME_ARN` / `TABLE_NAME`
- `table.grantReadWriteData` ではなく、最小権限で `GetItem` / `PutItem` / `DeleteItem` だけ付与 (既存 generate-plan 方針に揃える)
- IAM policy に `dynamodb:LeadingKeys=["user#*"]` condition を付ける (既存 pattern 流用)
- `bedrock-agentcore:InvokeAgentRuntime` を `agentcoreRuntimeArn` に対して grant
- `HttpApi.addRoutes` で 2 route 追加、両方とも `HttpMethod.POST`、同じ `HttpLambdaIntegration` instance を共有

- [ ] **Step 5: テスト実行で成功確認**

Run: `pnpm --filter infra test -- swap-meal-lambda --run`
Expected: green

- [ ] **Step 6: commit**

```bash
git add infra/lib/constructs/swap-meal-lambda.ts \
        infra/test/lib/constructs/swap-meal-lambda.test.ts
git commit -m "feat(infra): add SwapMealLambda construct"
```

---

### Task E3: `FitnessStack` 統合 + scripts

**Files:**
- Modify: `infra/lib/fitness-stack.ts`
- Modify: `infra/test/lib/fitness-stack.test.ts`
- Modify: `infra/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: FitnessStack に SwapMealLambda を追加 (optional context 対応)**

`infra/lib/fitness-stack.ts` で既存の `GeneratePlanLambda` 追加ブロックの直下に同等のブロックを追加:

```typescript
// 既存: agentcoreRuntimeArn context が未指定なら GeneratePlanLambda を skip
// 本 Plan: SwapMealLambda も同様に skip
if (agentcoreRuntimeArn) {
  new GeneratePlanLambda(this, "GeneratePlan", {
    httpApi, table, agentcoreRuntimeArn,
  });
  new SwapMealLambda(this, "SwapMeal", {
    httpApi, table, agentcoreRuntimeArn,
  });
}
```

- [ ] **Step 2: FitnessStack snapshot テスト更新**

既存 `infra/test/lib/fitness-stack.test.ts` に assertion を追加:
- `agentcoreRuntimeArn` 指定時は swap-meal ルート 2 本が existence
- 未指定時は swap-meal ルート 0 本 (generate-plan と同じ挙動)

- [ ] **Step 3: テスト実行で失敗確認 → 実装 → 成功確認**

Run: `pnpm --filter infra test -- fitness-stack --run`
Expected: 更新後に green

- [ ] **Step 4: scripts 追加**

`infra/package.json` に `deploy:plan09` を追加:

```json
{
  "scripts": {
    "deploy:plan09": "pnpm deploy:plan-generator && pnpm deploy:fitness-with-arn"
  }
}
```

(既存 Plan 08 の `deploy:plan08` と同じ中身で OK。PlanGeneratorStack 再 deploy で container が自動 re-build される)

`package.json` (root) にも `deploy:plan09` passthrough を追加:

```json
{
  "scripts": {
    "deploy:plan09": "pnpm --filter infra deploy:plan09"
  }
}
```

- [ ] **Step 5: commit**

```bash
git add infra/lib/fitness-stack.ts \
        infra/test/lib/fitness-stack.test.ts \
        infra/package.json package.json
git commit -m "feat(infra): integrate SwapMealLambda into FitnessStack with deploy script"
```

---

## Phase F: Web 側実装

### Task F1: `plan-mappers.ts` の 5 セクション + revision 拡張

**Files:**
- Modify: `packages/web/src/lib/plan/plan-mappers.ts`
- Modify: `packages/web/src/lib/plan/plan-mappers.test.ts`

- [ ] **Step 1: テスト先行**

`plan-mappers.test.ts` に下記 DTO を用意し、VM への変換結果を assert:

- `snack_swaps: [{ current_snack: "チョコ", replacement: "ナッツ", calories_kcal: 150, why_it_works: "満足感" }]` → `snackSwaps: [{ currentSnack: ..., replacement: ..., caloriesKcal: 150, whyItWorks: ... }]`
- `hydration_target_liters: 2.5`, `hydration_breakdown: ["起床時 500ml"]` → `hydration: { targetLiters: 2.5, breakdown: [...] }`
- `supplement_recommendations: [{ name, dose, timing, why_relevant, caution }]` → `supplementRecommendations: [{ name, dose, timing, whyRelevant, caution }]` (既存 Pydantic shape と揃える)
- `personal_rules` / `timeline_notes` / `weekly_notes` はそのまま array コピー (snake→camel は key のみ)
- `revision: 3` が VM の `revision: 3` に反映される

- [ ] **Step 2: テスト実行で失敗確認**

Run: `pnpm --filter @fitness/web test -- plan-mappers --run`
Expected: FAIL

- [ ] **Step 3: `plan-mappers.ts` 拡張**

`WeeklyPlanVM` interface に `revision: number` と 5 セクション VM 型を追加:

```typescript
export interface SnackSwapVM {
  currentSnack: string;
  replacement: string;
  caloriesKcal: number;
  whyItWorks: string;
}

export interface HydrationVM {
  targetLiters: number;
  breakdown: string[];
}

export interface SupplementRecommendationVM {
  name: string;
  dose: string;
  timing: string;
  whyRelevant: string;
  caution: string | null;
}

export interface WeeklyPlanVM {
  // 既存 field
  planId: string;
  weekStart: string;
  generatedAt: string;
  revision: number;  // 新規
  targetCaloriesKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
  days: DayPlanVM[];
  // 5 セクション新規
  snackSwaps: SnackSwapVM[];
  hydration: HydrationVM;
  supplementRecommendations: SupplementRecommendationVM[];
  personalRules: string[];
  timelineNotes: string[];
  weeklyNotes: string[];
}
```

`weeklyPlanToVM(dto)` に 5 セクションの変換を追加 (`dto.snack_swaps.map(s => ({ currentSnack: s.current_snack, ... }))` 等)、`revision: dto.revision` を代入。

- [ ] **Step 4: テスト実行で成功確認**

Run: `pnpm --filter @fitness/web test -- plan-mappers --run`
Expected: green

- [ ] **Step 5: commit**

```bash
git add packages/web/src/lib/plan/plan-mappers.ts \
        packages/web/src/lib/plan/plan-mappers.test.ts
git commit -m "feat(web): extend WeeklyPlanVM with 5 sections and revision"
```

---

### Task F2: `lib/api/plans.ts` に swap API 追加

**Files:**
- Modify: `packages/web/src/lib/api/plans.ts`
- Modify: `packages/web/src/lib/api/plans.test.ts`

- [ ] **Step 1: テスト先行**

既存 `generatePlanDto` / `fetchWeeklyPlanDto` の test pattern を参考に、`swapCandidatesDto` / `swapApplyDto` のテストを追加:

- 正常系: `apiClient` が正しい path + body で呼ばれ、Zod parse が通る DTO を返す
- エラー系: 500 レスポンスで `apiClient` が throw する挙動を再現 (既存 apiClient の error handling を壊していないか)

- [ ] **Step 2: テスト実行で失敗確認 → 実装**

`packages/web/src/lib/api/plans.ts` に追加:

```typescript
import {
  MealSwapCandidatesRequestSchema,
  MealSwapCandidatesResponseSchema,
  MealSwapApplyRequestSchema,
  MealSwapApplyResponseSchema,
} from "@fitness/contracts-ts";

export async function swapCandidatesDto(input: {
  weekStart: string;
  date: string;
  slot: "breakfast" | "lunch" | "dinner" | "dessert";
}) {
  const body = MealSwapCandidatesRequestSchema.parse({
    date: input.date,
    slot: input.slot,
  });
  return apiClient(
    `/users/me/plans/${input.weekStart}/meals/swap-candidates`,
    MealSwapCandidatesResponseSchema,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function swapApplyDto(input: {
  weekStart: string;
  proposalId: string;
  chosenIndex: number;
}) {
  const body = MealSwapApplyRequestSchema.parse({
    proposal_id: input.proposalId,
    chosen_index: input.chosenIndex,
  });
  return apiClient(
    `/users/me/plans/${input.weekStart}/meals/swap-apply`,
    MealSwapApplyResponseSchema,
    { method: "POST", body: JSON.stringify(body) },
  );
}
```

- [ ] **Step 3: テスト実行で成功確認 + commit**

```bash
git add packages/web/src/lib/api/plans.ts packages/web/src/lib/api/plans.test.ts
git commit -m "feat(web): add swapCandidatesDto and swapApplyDto"
```

---

### Task F3: `plan-mutations.ts` 純粋関数

**Files:**
- Create: `packages/web/src/lib/plan/plan-mutations.ts`
- Test: `packages/web/src/lib/plan/plan-mutations.test.ts`

- [ ] **Step 1: テスト先行**

```typescript
// plan-mutations.test.ts
describe("replaceDayInPlan", () => {
  it("replaces day matching date and returns new plan with given revision", () => {
    const plan = /* WeeklyPlanVM fixture with 7 days */;
    const updatedDay = { ...plan.days[2], theme: "new theme" };
    const result = replaceDayInPlan(plan, updatedDay, 5);
    expect(result.revision).toBe(5);
    expect(result.days[2].theme).toBe("new theme");
    expect(result.days[0]).toBe(plan.days[0]); // 他日は reference 同じ
  });

  it("returns plan unchanged when date not found (defensive)", () => {
    // 存在しない date で呼んだ場合は plan をそのまま返す
  });

  it("does not mutate input plan", () => {
    const plan = /* fixture */;
    const snapshot = JSON.stringify(plan);
    replaceDayInPlan(plan, plan.days[0], 99);
    expect(JSON.stringify(plan)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: 実装**

```typescript
// packages/web/src/lib/plan/plan-mutations.ts
import type { DayPlanVM, WeeklyPlanVM } from "./plan-mappers";

export function replaceDayInPlan(
  plan: WeeklyPlanVM,
  updatedDay: DayPlanVM,
  revision: number,
): WeeklyPlanVM {
  const idx = plan.days.findIndex((d) => d.date === updatedDay.date);
  if (idx < 0) return plan;
  const newDays = plan.days.map((d, i) => (i === idx ? updatedDay : d));
  return { ...plan, days: newDays, revision };
}
```

- [ ] **Step 3: commit**

```bash
git add packages/web/src/lib/plan/plan-mutations.ts \
        packages/web/src/lib/plan/plan-mutations.test.ts
git commit -m "feat(web): add replaceDayInPlan pure function"
```

---

### Task F4: `use-meal-swap` hook

**Files:**
- Create: `packages/web/src/hooks/use-meal-swap.ts`
- Test: `packages/web/src/hooks/use-meal-swap.test.tsx`

- [ ] **Step 1: テスト先行**

QueryClientProvider でラップした renderHook pattern (既存 `use-plan.test.tsx` と同じ) で以下をテスト:

- `useSwapCandidates`:
  - mutation 成功時に response (proposal_id + candidates) が返る
  - `apiClient` が swap-candidates path で呼ばれる
- `useSwapApply`:
  - mutation 成功時に `queryClient.setQueryData(["weekly-plan", weekStart], ...)` が呼ばれて plan VM の対応 day が置換されていること (replaceDayInPlan の積分テスト)
  - response の `revision` が新 VM に反映される
- エラー:
  - 410 `proposal_expired` で mutation が error state になる
  - 409 `plan_stale` でも同様にエラー化

- [ ] **Step 2: 実装**

```typescript
// packages/web/src/hooks/use-meal-swap.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { swapCandidatesDto, swapApplyDto } from "@/lib/api/plans";
import {
  type DayPlanVM,
  type WeeklyPlanVM,
  weeklyPlanToVM,
  dayPlanDtoToVM,
} from "@/lib/plan/plan-mappers";
import { replaceDayInPlan } from "@/lib/plan/plan-mutations";
import type { MealSlot } from "@fitness/contracts-ts";

export function useSwapCandidates() {
  return useMutation({
    mutationFn: (input: { weekStart: string; date: string; slot: MealSlot }) =>
      swapCandidatesDto(input),
  });
}

export function useSwapApply(weekStart: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposalId: string; chosenIndex: number }) =>
      swapApplyDto({ weekStart, ...input }),
    onSuccess: (data) => {
      const updatedDayVM = dayPlanDtoToVM(data.updated_day);
      qc.setQueryData<WeeklyPlanVM | undefined>(
        ["weekly-plan", weekStart],
        (prev) => (prev ? replaceDayInPlan(prev, updatedDayVM, data.revision) : prev),
      );
    },
  });
}
```

(`dayPlanDtoToVM` は既存 `plan-mappers.ts` に内部用で存在する `dayToVM` を export するか、新設する)

- [ ] **Step 3: commit**

```bash
git add packages/web/src/hooks/use-meal-swap.ts \
        packages/web/src/hooks/use-meal-swap.test.tsx \
        packages/web/src/lib/plan/plan-mappers.ts
git commit -m "feat(web): add useSwapCandidates and useSwapApply hooks"
```

---

### Task F5: `meal-card.tsx` + `seven-day-meal-list.tsx` に onSwap prop

**Files:**
- Modify: `packages/web/src/components/domain/meal-card.tsx`
- Modify: `packages/web/src/components/domain/seven-day-meal-list.tsx`
- Test: 既存 or 新規 component テスト

- [ ] **Step 1: `MealCard` に `onSwap?: () => void` prop 追加**

- prop が undefined なら「差し替え」ボタンを表示しない (既存の描画と互換)
- prop が defined なら Button (`shadcn/ui Button` の outline variant など) を表示し、クリックで呼び出す
- 既存 snapshot テストが落ちるなら `onSwap` を undefined で渡して変化なしを確認

- [ ] **Step 2: `SevenDayMealList` に `onSwap?: (date: string, slot: MealSlot) => void` prop 追加**

各 `MealCard` に `() => props.onSwap?.(day.date, meal.slot)` を bind して渡す。

- [ ] **Step 3: 既存 Home の test snapshot を必要に応じて update**

- [ ] **Step 4: commit**

```bash
git add packages/web/src/components/domain/meal-card.tsx \
        packages/web/src/components/domain/seven-day-meal-list.tsx
git commit -m "feat(web): add onSwap prop to MealCard and SevenDayMealList"
```

---

### Task F6: `meal-swap-modal.tsx`

**Files:**
- Create: `packages/web/src/components/domain/meal-swap-modal.tsx`
- Test: `packages/web/src/components/domain/meal-swap-modal.test.tsx`

- [ ] **Step 1: テスト先行**

`@testing-library/react` で以下をテスト:

- 候補 3 件が render される (title / total_calories_kcal / protein_g を表示)
- `meal.notes[]` が "why suggested" として表示される
- 「別の候補を見る」ボタンで外部から渡された `onRegenerate` callback が呼ばれる
- 「この食事に変更」ボタンで `onApply(chosenIndex)` が呼ばれる
- 候補の中で 1 つが selected state になるラジオ UI (初期は index=0 選択)
- props に `loading` / `error` を渡した時の表示分岐

- [ ] **Step 2: 実装**

`shadcn/ui Dialog` をベースに:

```typescript
export interface MealSwapModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: MealVM[];  // MealVM は既存 plan-mappers の型
  onApply: (chosenIndex: number) => void;
  onRegenerate: () => void;
  loadingCandidates?: boolean;
  loadingApply?: boolean;
  error?: string | null;
}
```

内部で `useState<number>` で chosenIndex を管理、ラジオボタン UI で 3 候補から 1 つ選択。各候補 Card に `title / slot / total_calories_kcal / total_protein_g / total_fat_g / total_carbs_g / notes` を表示。CTA 2 つ (別の候補を見る / この食事に変更)。

- [ ] **Step 3: commit**

```bash
git add packages/web/src/components/domain/meal-swap-modal.tsx \
        packages/web/src/components/domain/meal-swap-modal.test.tsx
git commit -m "feat(web): add MealSwapModal with 3 candidates and dual CTAs"
```

---

### Task F7: 5 セクション Card components

**Files:**
- Create: `packages/web/src/components/domain/snack-swaps-card.tsx` + test
- Create: `packages/web/src/components/domain/hydration-card.tsx` + test
- Create: `packages/web/src/components/domain/supplements-card.tsx` + test
- Create: `packages/web/src/components/domain/personal-rules-card.tsx` + test
- Create: `packages/web/src/components/domain/timeline-card.tsx` + test

- [ ] **Step 1: 各 Card component を TDD で実装**

shadcn/ui の `Card` を base に、VM を props で受ける presentational component。各 Card のテストは以下を verify:

- `snack-swaps-card`: `snackSwaps: SnackSwapVM[]` を props 受け、`currentSnack` → `replacement` の 1 行 + `caloriesKcal` + `whyItWorks` を表示、空配列なら "まだ候補はありません" のような空状態
- `hydration-card`: `targetLiters` を大きく + `breakdown: string[]` を箇条書き
- `supplements-card`: 各 supplement の `name` / `dose` / `timing` / `whyRelevant` / `caution` (caution が非 null なら warning 色で強調)
- `personal-rules-card`: `rules: string[]` を numbered list (1., 2., ...)
- `timeline-card`: `notes: string[]` を箇条書き (朝・昼・夕 が文字列に含まれるなら軽く強調でも良いが MVP は plain list)

- [ ] **Step 2: 各 Card を 1 commit ずつ or まとめて commit**

```bash
git add packages/web/src/components/domain/{snack-swaps,hydration,supplements,personal-rules,timeline}-card.{tsx,test.tsx}
git commit -m "feat(web): add 5 section cards for weekly plan (snack/hydration/supplements/rules/timeline)"
```

---

### Task F8: `week-selector.tsx` + `daily-tabs.tsx` + `daily-detail.tsx`

**Files:**
- Create: `packages/web/src/components/domain/week-selector.tsx` + test
- Create: `packages/web/src/components/domain/daily-tabs.tsx` + test
- Create: `packages/web/src/components/domain/daily-detail.tsx` + test

- [ ] **Step 1: `WeekSelector`**

- Props: `{ currentWeekStart: string, onPrevWeek?: () => void, onNextWeek?: () => void }`
- 本 Plan では prev/next は **disabled** で視覚的にだけ存在 (`onPrevWeek` / `onNextWeek` が undefined なら button を disabled に)
- 表示: `<<  2026-04-27 の週  >>`

- [ ] **Step 2: `DailyTabs`**

- Props: `{ dates: string[], selectedDate: string, onSelect: (date: string) => void }`
- 横スクロール可能な tab list (7 日分)、選択中の day にアクティブスタイル
- 内部で URL query `?day=YYYY-MM-DD` の同期は呼出し側の責務 (本 component は selectedDate / onSelect props だけに依存する)
- テスト: tab click で onSelect が正しい date を引数に呼ばれる / selectedDate に対応する tab が `aria-selected=true`

- [ ] **Step 3: `DailyDetail`**

- Props: `{ day: DayPlanVM, onSwap?: (slot: MealSlot) => void }`
- 表示: `day.theme` (header) + daily totals (kcal / P/F/C) + 4 meal の card 縦並び
- 各 meal card に `onSwap` が defined なら「差し替え」ボタン
- テスト: day の meal 数だけ card render / onSwap click で正しい slot が渡る / theme と totals が表示される

- [ ] **Step 4: commit**

```bash
git add packages/web/src/components/domain/{week-selector,daily-tabs,daily-detail}.{tsx,test.tsx}
git commit -m "feat(web): add week selector, daily tabs, and daily detail components"
```

---

### Task F9: Plan 画面 `plan-content.tsx` で再構築

**Files:**
- Create: `packages/web/src/app/(app)/plan/plan-content.tsx`
- Modify: `packages/web/src/app/(app)/plan/page.tsx`
- Test: `packages/web/src/app/(app)/plan/plan-content.test.tsx`

- [ ] **Step 1: `plan-content.tsx` を実装**

Client Component として:

- `useWeeklyPlan(weekStart)` で plan VM を取得 (既存 hook)
- URL query `?day=YYYY-MM-DD` を `useSearchParams` / `router.replace` で扱い、`selectedDate` に反映 (未指定なら今日 or plan.days[0].date)
- `useSwapCandidates` / `useSwapApply` を接続
- state: `swapTarget: { date, slot } | null` で modal の open/close を制御、candidates mutation の data を modal に渡す
- 「差し替え」ボタン (DailyDetail 経由) タップ → `setSwapTarget({date, slot})` + `candidates.mutate({weekStart, date, slot})`
- modal の `onApply(chosenIndex)` → `apply.mutate({ proposalId, chosenIndex })` → `onSuccess` で modal close
- modal の `onRegenerate` → `candidates.mutate({weekStart, date, slot})` 再実行
- 描画: `WeekSelector` + `DailyTabs` + `DailyDetail` + 5 セクション Card + `MealSwapModal`

- [ ] **Step 2: `page.tsx` を置換**

```typescript
// packages/web/src/app/(app)/plan/page.tsx
import { weekStartOf } from "@/lib/date/week-start";
import { getWeeklyPlanServerSideResult } from "@/lib/plan/server";
import { PlanContent } from "./plan-content";

export default async function PlanPage() {
  const weekStart = weekStartOf(new Date());
  const result = await getWeeklyPlanServerSideResult(weekStart);
  return <PlanContent weekStart={weekStart} initialPlan={result.ok ? result.plan : null} />;
}
```

(placeholder を撤去)

- [ ] **Step 3: 統合テスト**

`plan-content.test.tsx` で次をテスト:
- plan あり: week selector + daily tabs + daily detail + 5 セクション card 全部 render
- plan なし: PlanEmptyState (既存 component を再利用) 表示
- daily tab click で URL query が更新され DailyDetail が切り替わる
- 差し替えボタン → candidates mock → modal open → 「この食事に変更」 → apply mock → plan VM が更新される (`replaceDayInPlan` の積分)
- 「別の候補を見る」 → 新 proposal_id を受けて candidates が更新される

- [ ] **Step 4: commit**

```bash
git add packages/web/src/app/(app)/plan/
git commit -m "feat(web): rebuild plan page with week selector, daily tabs, swap modal"
```

---

### Task F10: Home に 5 セクション + swap 導線を追加

**Files:**
- Modify: `packages/web/src/app/(app)/home/home-content.tsx`
- Modify: `packages/web/src/app/(app)/home/home-content.test.tsx`

- [ ] **Step 1: Home テストに assertion 追加**

既存 Home テストに:
- plan あり時、snack swaps / hydration / supplements / personal rules / timeline の Card が render される
- SevenDayMealList の meal card の「差し替え」ボタンタップ → MealSwapModal open → 選択 → apply → plan VM 更新 の完全フロー

- [ ] **Step 2: `home-content.tsx` 実装**

- `useSwapCandidates` / `useSwapApply(weekStart)` を接続 (plan-content と同パターン)
- `swapTarget` state + `MealSwapModal` mount
- `SevenDayMealList` に `onSwap={(date, slot) => { setSwapTarget({date, slot}); candidates.mutate({weekStart, date, slot}); }}` を渡す
- `MacroTargetsCard` / `DailySummaryCard` / `SevenDayMealList` の下に以下を追加:
  - `<SnackSwapsCard snackSwaps={plan.snackSwaps} />`
  - `<HydrationCard hydration={plan.hydration} />`
  - `<SupplementsCard supplements={plan.supplementRecommendations} />`
  - `<PersonalRulesCard rules={plan.personalRules} />`
  - `<TimelineCard notes={plan.timelineNotes} />`

- [ ] **Step 3: commit**

```bash
git add packages/web/src/app/(app)/home/home-content.tsx \
        packages/web/src/app/(app)/home/home-content.test.tsx
git commit -m "feat(web): add 5 section cards and swap flow to home"
```

---

## Phase G: Deploy + 統合検証

**重要**: Plan 08 が未 deploy の場合も、**Plan 08 + Plan 09 を同時 deploy する** (`WeeklyPlan.revision` field の整合性を保つため)。Plan 08 単独先行 deploy は禁止。

### Task G1: 全テスト緑確認

`pnpm-workspace.yaml` の実 workspace は `packages/*` と `infra` のみ。Python package (`contracts-py` / `fitness-engine` / `infra/agents/plan-generator`) は **pnpm filter の対象ではなく uv 管理**なので、それぞれの directory で `uv run pytest` を直接実行する必要がある。

- [ ] **Step 1: Python 側テスト (uv)**

各 package の directory で直接実行 (pnpm filter は no-op で false green になる):

```bash
(cd packages/contracts-py && uv run pytest)
(cd packages/fitness-engine && uv run pytest)
(cd infra/agents/plan-generator && uv run pytest)
```

Expected: 3 つとも green。regression なし。

- [ ] **Step 2: TS 側テスト (pnpm workspace)**

```bash
pnpm --filter @fitness/contracts-ts test --run
pnpm --filter infra test --run
pnpm --filter @fitness/web test --run
```

Expected: 3 つとも green。

- [ ] **Step 3: TS 型チェック (workspace 単位)**

root に `typescript` dep が無いため `pnpm tsc --noEmit` を root で実行しても失敗する。各 TS workspace で直接 type-check:

```bash
pnpm --filter @fitness/contracts-ts exec tsc --noEmit
pnpm --filter infra exec tsc --noEmit
pnpm --filter @fitness/web exec tsc --noEmit
```

(各 workspace の `devDependencies` に `typescript` が入っている前提。入っていない workspace はここで type-check を飛ばす。各 package の `tsconfig.json` に `"noEmit": true` が既に設定されていればコマンドは `tsc -p .` に読み替えてよい)

Expected: エラーなし

- [ ] **Step 4: commit (修正があれば)**

---

### Task G2: deploy 前の env 準備と FitnessStack の一次 deploy

既存 `infra/package.json` の deploy scripts は 2 つの env と 1 つの CDK context 仕組みに依存する:

- `FITNESS_TABLE_NAME` — `deploy:plan-generator` が context `-c fitnessTableName=${FITNESS_TABLE_NAME}` で利用。**空だと literal empty が CDK に渡り、`infra/bin/app.ts` の `?? "FitnessTable"` fallback が潰される** (空文字は `??` に対して truthy 扱い) → `PlanGeneratorStack` の IAM が空 ARN になり動かない。確実に既存 FitnessStack の Output から取る
- `INVITE_CODES_PARAMETER_NAME` — `deploy:plan-generator` / `deploy:fitness-with-arn` の両方が context `-c inviteCodesParameterName=${INVITE_CODES_PARAMETER_NAME}` を要求 (Plan 04 で導入済みの SSM SecureString parameter 名、既存運用に準拠)
- `CDK_DEFAULT_ACCOUNT` / `AWS_REGION` — AWS CLI / CDK が参照

- [ ] **Step 1: 環境変数の事前セット**

```bash
export AWS_REGION=ap-northeast-1
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export INVITE_CODES_PARAMETER_NAME=/fitness/invite-codes    # 既存運用の名前を確認 (infra/README.md 参照)
```

- [ ] **Step 2: FitnessStack を先に 1 回 deploy する**

`fitnessTableName` context は **`PlanGeneratorStack` 側でのみ** 参照される値 (IAM の FitnessTable ARN を文字列組み立てするため、cross-region token 参照を避ける設計)。**`FitnessStack` 自体はこの context を使わず、自分の DynamoDB Table リソースを CDK の自動命名または construct 内の固定名で作る**。したがってこの Step で `FITNESS_TABLE_NAME` を事前に export しておく意味はない。

```bash
pnpm --filter infra exec cdk deploy FitnessStack \
  -c inviteCodesParameterName=$INVITE_CODES_PARAMETER_NAME
```

この時点では `agentcoreRuntimeArn` context 未指定のため、`GeneratePlanLambda` / `SwapMealLambda` は skip されて通常の CRUD + auth のみが deploy される (Plan 08 spec §Cross-region 管理の「初回 synth 対応」に準拠)。

実テーブル名は CloudFormation の自動命名 (例: `FitnessStack-FitnessTable...`) で決まる。Step 3 でこの値を CFN Output から取得し、`FITNESS_TABLE_NAME` env に確定させる (それまでは未定義でよい)。

Expected:
- FitnessStack が CFN に作成される
- FitnessTable に TTL 属性 (`ttl`) が有効化されている (Task E1 の修正が反映)
- Output に `TableName` / `TableArn` が出る

- [ ] **Step 3: FitnessTable 名を確認**

```bash
export FITNESS_TABLE_NAME=$(aws cloudformation describe-stacks \
  --stack-name FitnessStack \
  --region ap-northeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='TableName'].OutputValue" \
  --output text)
echo "FitnessTable: $FITNESS_TABLE_NAME"
```

空で返ってきた場合は OutputKey が違う。`aws cloudformation describe-stacks --stack-name FitnessStack --region ap-northeast-1 --query "Stacks[0].Outputs"` で全 Output を一覧して適切な key を選ぶ (既存 infra では `TableName` が標準だが、repo のバージョンで異なる可能性があるため)。

---

### Task G3: PlanGeneratorStack を deploy (container build + Runtime 更新)

- [ ] **Step 1: `deploy:plan-generator` 実行**

本 Plan では `plan-generator` container の source が変わった (system_swap.py 追加 / handler.py 修正) ため、`DockerImageAsset` が diff を検出して自動 re-build & push する (初回は新規 build)。

```bash
pnpm --filter infra deploy:plan-generator
```

内部実行: `cdk deploy PlanGeneratorStack --outputs-file cdk-outputs.json -c fitnessTableName=$FITNESS_TABLE_NAME -c inviteCodesParameterName=$INVITE_CODES_PARAMETER_NAME`

Expected:
- Docker image build + ECR push (linux/arm64)
- AgentCore Runtime が作成 (初回) or 新 image URI で update (再 deploy)
- `infra/cdk-outputs.json` に Runtime ARN が書かれる

- [ ] **Step 2: Runtime ARN 抽出**

```bash
export AGENTCORE_RUNTIME_ARN=$(node ./infra/scripts/extract-runtime-arn.mjs infra/cdk-outputs.json)
echo "Runtime ARN: $AGENTCORE_RUNTIME_ARN"
```

(パスは `infra/cdk-outputs.json` か `./cdk-outputs.json` かを script の書いた位置と pnpm cwd で確認する。既存 `extract-runtime-arn.mjs` の記述に合わせること)

---

### Task G4: FitnessStack 再 deploy (Adapter Lambda + API Gateway route 追加)

- [ ] **Step 1: `deploy:fitness-with-arn` 実行**

```bash
pnpm --filter infra deploy:fitness-with-arn
```

内部実行: `cdk deploy FitnessStack -c inviteCodesParameterName=$INVITE_CODES_PARAMETER_NAME -c agentcoreRuntimeArn=$(node ./scripts/extract-runtime-arn.mjs cdk-outputs.json)`

Expected:
- `GeneratePlanLambda` と `SwapMealLambda` が新規作成 (2 回目以降は update)
- API Gateway に route 追加:
  - `POST /users/me/plans/generate` (Plan 08)
  - `POST /users/me/plans/{weekStart}/meals/swap-candidates` (Plan 09)
  - `POST /users/me/plans/{weekStart}/meals/swap-apply` (Plan 09)
- IAM policy: `dynamodb:GetItem` / `PutItem` / `DeleteItem` (LeadingKeys=user#\*) + `bedrock-agentcore:InvokeAgentRuntime`

- [ ] **Step 2: 一括コマンド (`deploy:plan09`) の代替**

前述の Step 1-2 を `pnpm --filter infra deploy:plan09` (Task E3 で追加) で 1 コマンドにまとめて実行できる。env が既に set されていれば:

```bash
pnpm --filter infra deploy:plan09
```

---

### Task G5: Web deploy

- [ ] **Step 1: Vercel へ production deploy**

```bash
cd packages/web
vercel deploy --prod
```

Expected: deploy 成功

---

### Task G6: end-to-end 手動検証

- [ ] **Step 1: Onboarding 完了済みユーザーで plan を持っている状態を用意**

既存ユーザーで `/home` を開き、plan がある (または Review CTA で生成)。

- [ ] **Step 2: Home の 5 セクション描画確認**

- [ ] Snack Swaps Card が render (空なら空状態メッセージ)
- [ ] Hydration Card に target liters + breakdown
- [ ] Supplements Card (空なら空状態)
- [ ] Personal Rules Card に number list
- [ ] Timeline Card に箇条書き

- [ ] **Step 3: Meal swap フロー (Home から)**

- [ ] Home の meal card に「差し替え」ボタンが表示される
- [ ] ボタンタップ → `MealSwapModal` open、5-10 秒で 3 候補が表示
- [ ] 各候補に notes[] の "why suggested"、totals、prep tag が見える
- [ ] 「別の候補を見る」で新しい 3 候補に更新 (時間がかかる)
- [ ] 「この食事に変更」で modal closed、home の meal card が置換、`daily_total_*` が再計算されている
- [ ] ブラウザ DevTools Network で `swap-apply` の response body の `revision` が +1 されていることを確認

- [ ] **Step 4: Meal swap フロー (Plan 画面から)**

- [ ] `/plan` 開き week selector + daily tabs + daily detail が render
- [ ] 日付 tab click で URL query `?day=...` 更新、DailyDetail 切替
- [ ] 各 meal に「差し替え」ボタン
- [ ] Home と同じ swap flow が動く

- [ ] **Step 5: 失敗系**

- [ ] 候補生成中に plan を regenerate (別タブで)、その後 swap-apply → 409 `plan_stale` エラー UI が出る (モーダルが閉じる + エラーバナー)
- [ ] proposal 発行後 10 分放置 → apply 試行 → 410 `proposal_expired` でエラー UI

- [ ] **Step 6: CloudWatch Log 確認**

- [ ] `swap-meal` Lambda のログに `user_id` / `proposal_id` / `latency_ms` / `status` が JSON で出ている
- [ ] PII (target_meal フル shape 等) はログに出ていない

---

### Task G7: memory 更新

- [ ] **Step 1: `tasks/memories/decisions.md` に Plan 09 完了を append**

```markdown
## 2026-04-24: Plan 09 コード実装完了 + deploy {#plan09-implementation-complete}

- **タグ**: #plan09 #meal-swap #revision #concurrency #completion
- **ステータス**: active
- **関連**: decisions.md#plan08-implementation-complete
- **背景**: Plan 08 で DDB に保存した 5 セクションが VM に載らず描画されていなかった問題と、meal swap の要件 (ui-architecture §9.5) を Plan 09 で解消
- **決定**: WeeklyPlan に `revision: int` を追加して optimistic concurrency を実現、`DayPlan.meals` に slot 一意性 validator 追加、Strands 既存 container に swap handler を追加、Adapter Lambda `swap-meal` を 1 本 2 route 構成で deploy
- **根拠**: plan_id は identity として不変で残し、revision が swap のたびに +1 される monotonic counter として one-shot 性と stale 検出を同時に担保する。proposal item に `expected_revision` を保存 + ConditionExpression `plan_id = :x AND revision = :r` で atomic race 防止
- **実装上の注意点**:
  - Plan 08 Adapter 側で `revision: 0` 付与の小幅修正を同 PR で出す (revision field が無い item が入ると Plan 09 の strict parse が落ちる)
  - DynamoDB TTL は `ttl` 属性で enabled、proposal item に `ttl = now+600` を付けて 10 分で自動削除
  - DeleteItem 失敗でも one-shot 性は revision monotonicity で担保される (再 apply は必ず 409)
```

- [ ] **Step 2: `tasks/memories/context-log.md` を更新 (Plan 08 記録を Plan 09 に移行)**

Plan 08 が現在「進行中タスク」になっているブロックを更新:
- `ブランチ: feature/plan09` or 現ブランチ
- 現在の進行中を「Plan 10 候補から選定」にする
- Plan 09 完了を sub-section で記録
- 「Plan 10 へ持ち越す事項」として: Item 単位 swap / Chat / WeeklyCheckIn / 体重入力モーダル / Progress / EventBridge cron / AgentCore Memory / 候補 cache / Recipe DB + ハイブリッド化 / ui-architecture の契約拡張項目 (alcohol allocation / shopping notes / prep time / tags)

- [ ] **Step 3: MEMORY.md index への pointer 追加は不要** (tasks/memories は repo 内なので index.md の更新のみ)

- [ ] **Step 4: commit**

```bash
git add tasks/memories/
git commit -m "docs(memories): record Plan 09 completion and Plan 10 carry-over"
```

---

## Self-Review

本 Plan 実装後の自己検査チェックリスト:

- [ ] 全 Phase の commit が main / feature branch に push 済み
- [ ] CI (もしあれば) または手動で全 workspace test が green
- [ ] CloudWatch で swap-meal Lambda に error log / warning log が出ていない (`persistence_failed` / `invalid_swap_shape` / `agent_upstream_error` の発火率を観測)
- [ ] AWS Cost Explorer で Bedrock の増加を monitor (swap 1 回あたり plan 生成の 1/5-1/3 を想定)
- [ ] spec の「含まない」に列挙した項目が本 Plan で誤って実装されていないことを diff で確認
- [ ] Plan 08 Adapter の `revision: 0` 付与が生きていること (DDB PutItem の Item にフィールド存在)
- [ ] Plan 08 既存テストが全て緑 (revision 追加による regression なし)

---

## 未解決 (Plan 10 以降)

spec §未解決 (Plan 10 以降) をそのまま参照。本 Plan 範囲外:

- Item 単位の差し替え
- 候補の cache (6 件初回生成 → 3+3 分割 cache)
- Recipe template DB 投入 + LLM rerank ハイブリッド化
- 過去週 / 翌週の読取・差し替え
- 差し替え履歴の S3 export + Athena
- ui-architecture §9.4 / §9.5 の契約拡張 (alcohol allocation / shopping notes / prep time / 複数 tags)
- Shopping support
- Home の Today Actions / Coach Insight / Quick Actions
- 体重入力モーダル / 食事ログ UI / WeeklyCheckIn / Chat / Progress
- Playwright E2E 導入
- apply 時の daily totals ±10% 逸脱の server-side 検査





