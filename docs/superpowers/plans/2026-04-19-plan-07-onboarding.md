# Onboarding Flow (Plan 07) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 7 画面の Onboarding フロー (Safety → Stats → Lifestyle → Preferences → Snacks → Feasibility → Review) + Blocked 画面を実装し、UserProfile の段階的構造化入力 + 中断→再開 + Coach prompt 先読み生成 + Safety 決定的判定 を完成させる。Plan 生成 (経路 A) は Plan 08 に委ねる。

**Architecture:** contracts-py に Pydantic `UserProfile` を新設し `MODEL_REGISTRY` に登録、全 Onboarding フィールドを契約 (Pydantic → JSON Schema → Zod) に反映。Lambda 側 `PROFILE_FIELDS` / `ProfilePatch` / `ProfileRowSchema` を追従。web では DTO (`snake_case`) を boundary で ViewModel (`camelCase`) に変換し、React / Server Component / hook / local state は `camelCase` に統一する。Next.js `app/onboarding/layout.tsx` が Server Component で profile 取得 + stage gate を一元化、page は UI と `useOnboarding` 操作に専念。Coach prompt / Free-text parse は経路 C (Route Handler から Anthropic 直呼、Vercel AI SDK)。

**Tech Stack:** Pydantic v2, uv, pnpm workspace, Next.js 16 App Router, React 19, TanStack Query v5, Vercel AI SDK v6 (`ai@^6` + `@ai-sdk/anthropic@^2`), shadcn/ui, Radix UI, Zod (contracts-ts 生成済み)、Vitest, AWS Lambda (TypeScript), DynamoDB

**命名規約:** contracts-py / contracts-ts / Lambda / HTTP body は **snake_case** を維持する。一方で web の boundary (`useProfile`, `getProfileServerSide`, `useOnboarding`) で DTO→ViewModel 変換を行い、React / Server Component / hook / props / local state は **camelCase** に統一する。つまり「外部契約は snake_case、React 内部モデルは camelCase」で責務を分離する。

**E2E テスト:** repo に Playwright config / E2E test ファイルは存在しない。E2E は別 Plan でセットアップする前提とし、Plan 07 では unit + integration テストのみで完了とする。

## 設計書

`docs/superpowers/specs/2026-04-19-onboarding-design.md`

## 前提条件

- Plan 06 (Next.js Bootstrap) 完了済み (`/home` `/plan` `/chat` `/progress` `/profile` のプレースホルダ + Cognito auth + API proxy 疎通)
- Plan 01-05 完了済み (contracts-py / fitness-engine / AWS bootstrap / food-catalog-etl / CRUD Lambdas)
- `ANTHROPIC_API_KEY` を Vercel dashboard または AWS SSM に登録できる権限あり

## ファイル構成

### 新規作成

#### contracts-py

| ファイル                                                                          | 責務                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/contracts-py/src/fitness_contracts/models/profile/user_profile.py`      | UserProfile Pydantic モデル (全 Onboarding フィールド) |
| `packages/contracts-py/src/fitness_contracts/models/onboarding/__init__.py`       | onboarding サブモジュール初期化                 |
| `packages/contracts-py/src/fitness_contracts/models/onboarding/coach_prompt.py`   | CoachPromptRequest / Response                  |
| `packages/contracts-py/src/fitness_contracts/models/onboarding/free_text_parse.py`| FreeTextParseRequest / Response                |
| `packages/contracts-py/tests/test_user_profile.py`                                | UserProfile の Pydantic validation テスト      |
| `packages/contracts-py/tests/test_onboarding_models.py`                           | Coach / FreeText モデルのテスト                |

#### Lambda (infra/lambdas)

| ファイル                                      | 責務                                               |
| --------------------------------------------- | -------------------------------------------------- |
| `infra/lambdas/shared/onboarding-safety.ts`          | サーバー側 Safety 決定的判定 (二重防御)            |
| `infra/test/lambdas/shared/onboarding-safety.test.ts` | 判定ロジック unit テスト                           |
| `infra/test/lambdas/shared/onboarding-safety-equivalence.test.ts` | Python `fitness_engine.onboarding_safety` adapter との等価性テスト |
| `infra/test/lambdas/update-user-profile-guard.test.ts` | stage = blocked 時の Safety 二重防御テスト         |
| `packages/fitness-engine/src/fitness_engine/onboarding_safety.py` | Onboarding bool subset 用の Python adapter |
| `packages/fitness-engine/tests/test_onboarding_safety_equivalence.py` | TS 実装との等価性テスト (Python 側)           |
| `packages/contracts-ts/schemas/fixtures/safety-matrix.json` (shared golden) | 両言語で共有する決定テーブル fixture |

#### web (packages/web/src)

| ファイル                                                                         | 責務                                                     |
| -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `packages/web/src/lib/onboarding/stage-routing.ts`                               | `pathForStage` / `stageForPath` 純粋関数                 |
| `packages/web/src/lib/onboarding/stage-routing.test.ts`                          | 純粋関数の decision table テスト                         |
| `packages/web/src/lib/onboarding/safety.ts`                                      | クライアント側 `evaluateSafetyRisk`                      |
| `packages/web/src/lib/onboarding/safety.test.ts`                                 | Safety 決定的判定の unit テスト                          |
| `packages/web/src/lib/profile/profile-mappers.ts`                                | DTO↔ViewModel (`snake_case` ↔ `camelCase`) 変換         |
| `packages/web/src/lib/profile/server.ts`                                         | `getProfileServerSide()` Server Component 用 fetch + mapper |
| `packages/web/src/lib/profile/server.test.ts`                                    | server fetch のテスト                                    |
| `packages/web/src/app/api/onboarding/coach-prompt/route.ts`                      | Coach prompt 生成 Route Handler (経路 C)                 |
| `packages/web/src/app/api/onboarding/coach-prompt/route.test.ts`                 | 認証 + Zod + AI SDK 呼び出しテスト                       |
| `packages/web/src/app/api/onboarding/free-text-parse/route.ts`                   | Free-text parse Route Handler (経路 C)                   |
| `packages/web/src/app/api/onboarding/free-text-parse/route.test.ts`              | 認証 + structured output テスト                          |
| `packages/web/src/hooks/use-onboarding.ts`                                       | patch + prefetchCoachPrompt + parseFreeText              |
| `packages/web/src/hooks/use-onboarding.test.ts`                                  | hook 挙動テスト                                          |
| `packages/web/src/components/domain/onboarding-shell.tsx`                        | TopBar + ProgressBar + Coach + 戻る/次へ                 |
| `packages/web/src/components/domain/coach-prompt-card.tsx`                       | LLM 生成 prompt 表示                                     |
| `packages/web/src/components/domain/section-summary-card.tsx`                    | Review 画面のセクション summary                          |
| `packages/web/src/components/domain/segmented-control.tsx`                       | Yes/No や 3 択                                           |
| `packages/web/src/components/domain/choice-chips.tsx`                            | 単一選択 chip 群                                         |
| `packages/web/src/components/domain/multi-tag-input.tsx`                         | 複数 tag 入力                                            |
| `packages/web/src/components/domain/number-field.tsx`                            | 単位付き数値入力                                         |
| `packages/web/src/components/domain/stepper.tsx`                                 | ±ボタン付き数値                                          |
| `packages/web/src/components/domain/slider-field.tsx`                            | 1-10 スライダー + 値表示                                 |
| `packages/web/src/components/domain/caution-banner.tsx`                          | 注意事項バナー                                           |
| `packages/web/src/components/domain/blocked-notice-card.tsx`                     | Blocked 画面のメイン表示                                 |
| `packages/web/src/app/onboarding/layout.tsx`                                     | OnboardingShell + 認証 + stage gate (唯一の gate)        |
| `packages/web/src/app/onboarding/page.tsx`                                       | `/onboarding` エントリ、stage に応じた redirect          |
| `packages/web/src/app/onboarding/safety/page.tsx`                                | Safety 画面                                              |
| `packages/web/src/app/onboarding/stats/page.tsx`                                 | Stats 画面                                               |
| `packages/web/src/app/onboarding/lifestyle/page.tsx`                             | Lifestyle 画面                                           |
| `packages/web/src/app/onboarding/preferences/page.tsx`                           | Preferences 画面                                         |
| `packages/web/src/app/onboarding/snacks/page.tsx`                                | Snacks 画面                                              |
| `packages/web/src/app/onboarding/feasibility/page.tsx`                           | Feasibility 画面                                         |
| `packages/web/src/app/onboarding/review/page.tsx`                                | Review 画面                                              |
| `packages/web/src/app/onboarding/blocked/page.tsx`                               | Blocked 画面                                             |
| `packages/web/src/components/ui/progress.tsx`                                    | shadcn Progress (CLI で追加)                             |
| `packages/web/src/components/ui/toggle-group.tsx`                                | shadcn ToggleGroup                                       |
| `packages/web/src/components/ui/toggle.tsx`                                      | shadcn Toggle                                            |
| `packages/web/src/components/ui/slider.tsx`                                      | shadcn Slider                                            |
| `packages/web/src/components/ui/alert.tsx`                                       | shadcn Alert                                             |
| `packages/web/src/components/ui/skeleton.tsx`                                    | shadcn Skeleton                                          |
| `packages/web/src/components/ui/textarea.tsx`                                    | shadcn Textarea                                          |

### 変更

| ファイル                                                                                     | 変更内容                                                                                |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `packages/contracts-py/src/fitness_contracts/models/profile/update_user_profile_input.py`    | Onboarding 全フィールド + `onboarding_stage` + `blocked_reason` + `*_note` を optional で追加、`x-at-least-one-not-null` 拡張 |
| `packages/contracts-py/src/fitness_contracts/schema_export.py`                               | `MODEL_REGISTRY` に `UserProfile` / `CoachPromptRequest` / `CoachPromptResponse` / `FreeTextParseRequest` / `FreeTextParseResponse` を追加 |
| `packages/contracts-ts/schemas/UserProfile.schema.json`                                       | **削除** (自動生成に置き換え)                                                           |
| `infra/lambdas/shared/profile-types.ts`                                                       | `PROFILE_FIELDS` / `ProfilePatch` に Onboarding 全フィールド追加                         |
| `infra/lambdas/shared/db-schemas.ts`                                                          | `ProfileRowSchema` 拡張                                                                 |
| `infra/lambdas/update-user-profile/index.ts`                                                  | Safety 二重防御 + `blocked_reason` 必須検証                                             |
| `packages/web/package.json`                                                                   | `ai` / `@ai-sdk/anthropic` / shadcn 依存 Radix を追加                                   |
| `packages/web/proxy.ts`                                                                       | `x-next-pathname` header 付与 (Server Component が pathname を読むため)                 |
| `packages/web/src/hooks/use-profile.ts`                                                       | DTO→ViewModel / ViewModel→DTO mapper を導入し、web 公開 API を camelCase 化            |
| `packages/web/src/lib/profile/build-update-input.ts`                                          | `ProfileData` を camelCase ViewModel に追従                                             |
| `packages/web/src/app/(app)/profile/page.tsx`                                                 | `useProfile` の camelCase 返却値に追従                                                 |
| `packages/web/src/app/(app)/layout.tsx`                                                       | `onboardingStage !== "complete"` → `/onboarding` redirect を追加                       |
| `packages/web/.env.schema`                                                                    | `ANTHROPIC_API_KEY` 追加                                                                |

---

## Phase A: Contracts 拡張 (Python → JSON Schema → Zod)

### Task A1: UserProfile Pydantic モデル新規作成

**Files:**
- Create: `packages/contracts-py/src/fitness_contracts/models/profile/user_profile.py`
- Modify: `packages/contracts-py/src/fitness_contracts/models/profile/__init__.py`

- [ ] **Step 1: UserProfile モデルを作成**

```python
# packages/contracts-py/src/fitness_contracts/models/profile/user_profile.py
"""UserProfile: 永続化されたプロフィール全体の形状。全フィールド optional (Onboarding 中は欠落しうる)。"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


OnboardingStage = Literal[
    "safety",
    "stats",
    "lifestyle",
    "preferences",
    "snacks",
    "feasibility",
    "review",
    "complete",
    "blocked",
]


class UserProfile(BaseModel):
    """DynamoDB の profile アイテム形状に対応する UserProfile。Onboarding 中はフィールド欠落。"""

    model_config = ConfigDict(
        json_schema_extra={
            "title": "UserProfile",
            "description": "永続化されたユーザープロフィール。全フィールド optional。",
        }
    )

    # Core body stats
    name: str | None = None
    age: int | None = Field(default=None, ge=18, le=120)
    sex: Literal["male", "female"] | None = None
    height_cm: float | None = Field(default=None, gt=0, lt=300)
    weight_kg: float | None = Field(default=None, gt=0, lt=500)
    goal_weight_kg: float | None = Field(default=None, gt=0, lt=500)
    goal_description: str | None = None
    desired_pace: Literal["steady", "aggressive"] | None = None

    # Activity / wellness
    activity_level: Literal[
        "sedentary",
        "lightly_active",
        "moderately_active",
        "very_active",
        "extremely_active",
    ] | None = None
    job_type: Literal[
        "desk", "standing", "light_physical", "manual_labour", "outdoor"
    ] | None = None
    workouts_per_week: int | None = Field(default=None, ge=0, le=14)
    workout_types: list[str] | None = None
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"] | None = None
    alcohol_per_week: str | None = None

    # Food preferences
    favorite_meals: list[str] | None = Field(default=None, max_length=5)
    hated_foods: list[str] | None = None
    restrictions: list[str] | None = None
    cooking_preference: Literal["scratch", "quick", "batch", "mixed"] | None = None
    food_adventurousness: int | None = Field(default=None, ge=1, le=10)

    # Snacking
    current_snacks: list[str] | None = None
    snacking_reason: Literal["hunger", "boredom", "habit", "mixed"] | None = None
    snack_taste_preference: Literal["sweet", "savory", "both"] | None = None
    late_night_snacking: bool | None = None

    # Feasibility
    eating_out_style: Literal["mostly_home", "mostly_eating_out", "mixed"] | None = None
    budget_level: Literal["low", "medium", "high"] | None = None
    meal_frequency_preference: int | None = Field(default=None, ge=1, le=6)
    location_region: str | None = None
    kitchen_access: str | None = None
    convenience_store_usage: Literal["low", "medium", "high"] | None = None

    # Safety flags
    has_medical_condition: bool | None = None
    is_under_treatment: bool | None = None
    on_medication: bool | None = None
    is_pregnant_or_breastfeeding: bool | None = None
    has_doctor_diet_restriction: bool | None = None
    has_eating_disorder_history: bool | None = None
    medical_condition_note: str | None = None
    medication_note: str | None = None

    # Onboarding meta
    onboarding_stage: OnboardingStage | None = None
    blocked_reason: str | None = None
    preferences_note: str | None = None
    snacks_note: str | None = None
    lifestyle_note: str | None = None

    # Persistence meta
    updated_at: str | None = None
```

- [ ] **Step 2: profile パッケージの __init__.py を更新**

```python
# packages/contracts-py/src/fitness_contracts/models/profile/__init__.py
from .update_user_profile_input import UpdateUserProfileInput
from .user_profile import OnboardingStage, UserProfile

__all__ = ["OnboardingStage", "UpdateUserProfileInput", "UserProfile"]
```

- [ ] **Step 3: Commit**

```bash
git add packages/contracts-py/src/fitness_contracts/models/profile/
git commit -m "feat(contracts-py): add UserProfile model with full onboarding fields"
```

---

### Task A2: UpdateUserProfileInput を全 Onboarding フィールドに拡張

**Files:**
- Modify: `packages/contracts-py/src/fitness_contracts/models/profile/update_user_profile_input.py`

- [ ] **Step 1: モデルを拡張**

```python
"""UpdateUserProfileInput: プロフィール部分更新の入力型。"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from fitness_contracts.models.profile.user_profile import OnboardingStage


_ALL_FIELDS = (
    "name", "age", "sex", "height_cm", "weight_kg", "goal_weight_kg", "goal_description",
    "desired_pace", "activity_level", "job_type", "workouts_per_week", "workout_types",
    "sleep_hours", "stress_level", "alcohol_per_week",
    "favorite_meals", "hated_foods", "restrictions", "cooking_preference", "food_adventurousness",
    "current_snacks", "snacking_reason", "snack_taste_preference", "late_night_snacking",
    "eating_out_style", "budget_level", "meal_frequency_preference", "location_region",
    "kitchen_access", "convenience_store_usage",
    "has_medical_condition", "is_under_treatment", "on_medication",
    "is_pregnant_or_breastfeeding", "has_doctor_diet_restriction", "has_eating_disorder_history",
    "medical_condition_note", "medication_note",
    "onboarding_stage", "blocked_reason",
    "preferences_note", "snacks_note", "lifestyle_note",
)


class UpdateUserProfileInput(BaseModel):
    """プロフィール部分更新の入力。全フィールド optional (PATCH セマンティクス)。"""

    model_config = ConfigDict(
        json_schema_extra={
            "title": "UpdateUserProfileInput",
            "description": "プロフィール部分更新の入力。",
            "x-at-least-one-not-null": list(_ALL_FIELDS),
        }
    )

    # Core body stats
    name: str | None = None
    age: int | None = Field(default=None, ge=18, le=120)
    sex: Literal["male", "female"] | None = None
    height_cm: float | None = Field(default=None, gt=0, lt=300)
    weight_kg: float | None = Field(default=None, gt=0, lt=500)
    goal_weight_kg: float | None = Field(default=None, gt=0, lt=500)
    goal_description: str | None = None
    desired_pace: Literal["steady", "aggressive"] | None = None

    # Activity / wellness
    activity_level: Literal[
        "sedentary", "lightly_active", "moderately_active", "very_active", "extremely_active",
    ] | None = None
    job_type: Literal[
        "desk", "standing", "light_physical", "manual_labour", "outdoor",
    ] | None = None
    workouts_per_week: int | None = Field(default=None, ge=0, le=14)
    workout_types: list[str] | None = None
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"] | None = None
    alcohol_per_week: str | None = None

    # Food preferences
    favorite_meals: list[str] | None = Field(default=None, max_length=5)
    hated_foods: list[str] | None = None
    restrictions: list[str] | None = None
    cooking_preference: Literal["scratch", "quick", "batch", "mixed"] | None = None
    food_adventurousness: int | None = Field(default=None, ge=1, le=10)

    # Snacking
    current_snacks: list[str] | None = None
    snacking_reason: Literal["hunger", "boredom", "habit", "mixed"] | None = None
    snack_taste_preference: Literal["sweet", "savory", "both"] | None = None
    late_night_snacking: bool | None = None

    # Feasibility
    eating_out_style: Literal["mostly_home", "mostly_eating_out", "mixed"] | None = None
    budget_level: Literal["low", "medium", "high"] | None = None
    meal_frequency_preference: int | None = Field(default=None, ge=1, le=6)
    location_region: str | None = None
    kitchen_access: str | None = None
    convenience_store_usage: Literal["low", "medium", "high"] | None = None

    # Safety flags
    has_medical_condition: bool | None = None
    is_under_treatment: bool | None = None
    on_medication: bool | None = None
    is_pregnant_or_breastfeeding: bool | None = None
    has_doctor_diet_restriction: bool | None = None
    has_eating_disorder_history: bool | None = None
    medical_condition_note: str | None = None
    medication_note: str | None = None

    # Onboarding meta
    onboarding_stage: OnboardingStage | None = None
    blocked_reason: str | None = None
    preferences_note: str | None = None
    snacks_note: str | None = None
    lifestyle_note: str | None = None

    @model_validator(mode="before")
    @classmethod
    def check_at_least_one_field(cls, data: Any) -> Any:
        if isinstance(data, dict):
            has_value = any(data.get(f) is not None for f in _ALL_FIELDS)
            if not has_value:
                raise ValueError("At least one field must be provided")
        return data
```

- [ ] **Step 2: Commit**

```bash
git add packages/contracts-py/src/fitness_contracts/models/profile/update_user_profile_input.py
git commit -m "feat(contracts-py): extend UpdateUserProfileInput with all onboarding fields"
```

---

### Task A3: CoachPrompt / FreeTextParse Pydantic モデル新規作成

**Files:**
- Create: `packages/contracts-py/src/fitness_contracts/models/onboarding/__init__.py`
- Create: `packages/contracts-py/src/fitness_contracts/models/onboarding/coach_prompt.py`
- Create: `packages/contracts-py/src/fitness_contracts/models/onboarding/free_text_parse.py`

- [ ] **Step 1: CoachPrompt モデルを作成**

```python
# packages/contracts-py/src/fitness_contracts/models/onboarding/coach_prompt.py
"""Onboarding 画面の Coach prompt 生成 API 契約。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

from fitness_contracts.models.profile.user_profile import OnboardingStage


class CoachPromptRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "title": "CoachPromptRequest",
            "description": "Onboarding Coach prompt 生成の入力。",
        }
    )

    target_stage: OnboardingStage
    profile_snapshot: dict[str, Any]


class CoachPromptResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "title": "CoachPromptResponse",
            "description": "Onboarding Coach prompt 生成の出力。",
        }
    )

    prompt: str
    cached: bool
```

- [ ] **Step 2: FreeTextParse モデルを作成**

```python
# packages/contracts-py/src/fitness_contracts/models/onboarding/free_text_parse.py
"""Onboarding の free-text parse API 契約。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class FreeTextParseRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "title": "FreeTextParseRequest",
            "description": "Onboarding の free-text parse 入力。",
        }
    )

    stage: Literal["lifestyle", "preferences", "snacks"]
    free_text: str
    structured_snapshot: dict[str, Any]


class FreeTextParseResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "title": "FreeTextParseResponse",
            "description": "Onboarding の free-text parse 出力。構造化フィールドは上書きしない。",
        }
    )

    note_field: Literal["lifestyle_note", "preferences_note", "snacks_note"]
    extracted_note: str
    suggested_tags: list[str]
```

- [ ] **Step 3: __init__.py を作成**

```python
# packages/contracts-py/src/fitness_contracts/models/onboarding/__init__.py
from .coach_prompt import CoachPromptRequest, CoachPromptResponse
from .free_text_parse import FreeTextParseRequest, FreeTextParseResponse

__all__ = [
    "CoachPromptRequest",
    "CoachPromptResponse",
    "FreeTextParseRequest",
    "FreeTextParseResponse",
]
```

- [ ] **Step 4: Commit**

```bash
git add packages/contracts-py/src/fitness_contracts/models/onboarding/
git commit -m "feat(contracts-py): add coach prompt and free-text parse models"
```

---

### Task A4: MODEL_REGISTRY に登録、手書き UserProfile.schema.json 削除

**Files:**
- Modify: `packages/contracts-py/src/fitness_contracts/schema_export.py`
- Delete: `packages/contracts-ts/schemas/UserProfile.schema.json`

- [ ] **Step 1: schema_export.py を更新**

```python
# packages/contracts-py/src/fitness_contracts/schema_export.py (抜粋)
from fitness_contracts.models.onboarding.coach_prompt import (
    CoachPromptRequest,
    CoachPromptResponse,
)
from fitness_contracts.models.onboarding.free_text_parse import (
    FreeTextParseRequest,
    FreeTextParseResponse,
)
from fitness_contracts.models.profile.user_profile import UserProfile

MODEL_REGISTRY: list[tuple[str, type[BaseModel]]] = [
    # ... 既存エントリ ...
    ("UserProfile", UserProfile),
    ("CoachPromptRequest", CoachPromptRequest),
    ("CoachPromptResponse", CoachPromptResponse),
    ("FreeTextParseRequest", FreeTextParseRequest),
    ("FreeTextParseResponse", FreeTextParseResponse),
]
```

- [ ] **Step 2: 手書き UserProfile.schema.json を削除**

```bash
rm packages/contracts-ts/schemas/UserProfile.schema.json
```

- [ ] **Step 3: Commit**

```bash
git add packages/contracts-py/src/fitness_contracts/schema_export.py packages/contracts-ts/schemas/UserProfile.schema.json
git commit -m "feat(contracts-py): register onboarding models and UserProfile for auto-generation"
```

---

### Task A5: make contracts 実行と生成物検証

**Files:**
- Modified by generator: `packages/contracts-ts/schemas/*.json`
- Modified by generator: `packages/contracts-ts/generated/types.d.ts`
- Modified by generator: `packages/contracts-ts/generated/zod.ts`

`packages/contracts-ts/src/` には生成ファイルを出力しない (`src/index.ts` が `generated/` を re-export する構造)。

- [ ] **Step 1: 生成コマンドを実行**

```bash
make contracts
```

Expected: `wrote packages/contracts-ts/schemas/UserProfile.schema.json` 等が表示され exit 0。TS 側は `generate:types` → `generate:zod` → `generate:format` が成功。

- [ ] **Step 2: 生成された UserProfile.schema.json を確認**

```bash
jq '.properties.onboarding_stage' packages/contracts-ts/schemas/UserProfile.schema.json
jq '.properties.is_pregnant_or_breastfeeding' packages/contracts-ts/schemas/UserProfile.schema.json
```

Expected: enum / boolean の定義が出力される。

- [ ] **Step 3: UpdateUserProfileInput の拡張を確認**

```bash
jq '.properties | keys | length' packages/contracts-ts/schemas/UpdateUserProfileInput.schema.json
```

Expected: 既存 9 + 追加 ~34 = ~43 フィールド。

- [ ] **Step 4: Zod と TS types 生成物を確認**

```bash
grep -c "onboarding_stage\|is_pregnant_or_breastfeeding\|preferences_note" packages/contracts-ts/generated/zod.ts
grep -c "UserProfile\|CoachPromptRequest\|FreeTextParseRequest" packages/contracts-ts/generated/types.d.ts
```

Expected: zod.ts は 3 以上、types.d.ts は 3 以上 (全型と Zod が生成されている)。

- [ ] **Step 5: Commit 生成物**

```bash
git add packages/contracts-ts/schemas/ packages/contracts-ts/generated/
git commit -m "chore(contracts-ts): regenerate schemas and zod for onboarding fields"
```

---

### Task A6: UserProfile / UpdateUserProfileInput の Python テスト

**Files:**
- Create: `packages/contracts-py/tests/test_user_profile.py`
- Create: `packages/contracts-py/tests/test_onboarding_models.py`

- [ ] **Step 1: UserProfile テストを作成**

```python
# packages/contracts-py/tests/test_user_profile.py
import pytest
from pydantic import ValidationError

from fitness_contracts.models.profile.user_profile import UserProfile


def test_user_profile_all_fields_optional():
    profile = UserProfile()
    assert profile.age is None
    assert profile.onboarding_stage is None


def test_user_profile_age_out_of_range():
    with pytest.raises(ValidationError):
        UserProfile(age=17)
    with pytest.raises(ValidationError):
        UserProfile(age=121)


def test_user_profile_favorite_meals_max_5():
    with pytest.raises(ValidationError):
        UserProfile(favorite_meals=["a", "b", "c", "d", "e", "f"])


def test_user_profile_onboarding_stage_enum():
    profile = UserProfile(onboarding_stage="complete")
    assert profile.onboarding_stage == "complete"
    with pytest.raises(ValidationError):
        UserProfile(onboarding_stage="invalid")


def test_user_profile_safety_flags_all_boolean():
    profile = UserProfile(is_pregnant_or_breastfeeding=True, has_eating_disorder_history=False)
    assert profile.is_pregnant_or_breastfeeding is True
    assert profile.has_eating_disorder_history is False
```

- [ ] **Step 2: Onboarding モデルテストを作成**

```python
# packages/contracts-py/tests/test_onboarding_models.py
import pytest
from pydantic import ValidationError

from fitness_contracts.models.onboarding.coach_prompt import (
    CoachPromptRequest,
    CoachPromptResponse,
)
from fitness_contracts.models.onboarding.free_text_parse import (
    FreeTextParseRequest,
    FreeTextParseResponse,
)


def test_coach_prompt_request_valid():
    req = CoachPromptRequest(target_stage="stats", profile_snapshot={"age": 30})
    assert req.target_stage == "stats"


def test_coach_prompt_request_invalid_stage():
    with pytest.raises(ValidationError):
        CoachPromptRequest(target_stage="unknown", profile_snapshot={})


def test_free_text_parse_request_stage_restricted():
    FreeTextParseRequest(stage="lifestyle", free_text="hello", structured_snapshot={})
    with pytest.raises(ValidationError):
        FreeTextParseRequest(stage="safety", free_text="x", structured_snapshot={})


def test_free_text_parse_response_shape():
    res = FreeTextParseResponse(
        note_field="preferences_note",
        extracted_note="summary",
        suggested_tags=["tag1"],
    )
    assert res.note_field == "preferences_note"
```

- [ ] **Step 3: テスト実行**

```bash
.venv/bin/pytest packages/contracts-py/tests/test_user_profile.py packages/contracts-py/tests/test_onboarding_models.py -v
```

Expected: 全 PASS。

- [ ] **Step 4: Commit**

```bash
git add packages/contracts-py/tests/test_user_profile.py packages/contracts-py/tests/test_onboarding_models.py
git commit -m "test(contracts-py): add tests for UserProfile and onboarding models"
```

---

## Phase B: Lambda 追従

### Task B1: PROFILE_FIELDS / ProfilePatch を全 Onboarding フィールドに拡張

**Files:**
- Modify: `infra/lambdas/shared/profile-types.ts`

- [ ] **Step 1: PROFILE_FIELDS と ProfilePatch を拡張**

```typescript
// infra/lambdas/shared/profile-types.ts
export const PROFILE_FIELDS = [
	// Core body
	"name", "age", "sex", "height_cm", "weight_kg", "goal_weight_kg", "goal_description", "desired_pace",
	// Activity / wellness
	"activity_level", "job_type", "workouts_per_week", "workout_types",
	"sleep_hours", "stress_level", "alcohol_per_week",
	// Food preferences
	"favorite_meals", "hated_foods", "restrictions", "cooking_preference", "food_adventurousness",
	// Snacking
	"current_snacks", "snacking_reason", "snack_taste_preference", "late_night_snacking",
	// Feasibility
	"eating_out_style", "budget_level", "meal_frequency_preference",
	"location_region", "kitchen_access", "convenience_store_usage",
	// Safety flags
	"has_medical_condition", "is_under_treatment", "on_medication",
	"is_pregnant_or_breastfeeding", "has_doctor_diet_restriction", "has_eating_disorder_history",
	"medical_condition_note", "medication_note",
	// Onboarding meta
	"onboarding_stage", "blocked_reason",
	"preferences_note", "snacks_note", "lifestyle_note",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

type Sex = "male" | "female";
type ActivityLevel = "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "extremely_active";
type DesiredPace = "steady" | "aggressive";
type StressLevel = "low" | "moderate" | "high";
type JobType = "desk" | "standing" | "light_physical" | "manual_labour" | "outdoor";
type CookingPreference = "scratch" | "quick" | "batch" | "mixed";
type SnackingReason = "hunger" | "boredom" | "habit" | "mixed";
type SnackTastePreference = "sweet" | "savory" | "both";
type EatingOutStyle = "mostly_home" | "mostly_eating_out" | "mixed";
type BudgetLevel = "low" | "medium" | "high";
type ConvenienceStoreUsage = "low" | "medium" | "high";
export type OnboardingStage =
	| "safety" | "stats" | "lifestyle" | "preferences"
	| "snacks" | "feasibility" | "review" | "complete" | "blocked";

export type ProfilePatch = {
	name?: string;
	age?: number;
	sex?: Sex;
	height_cm?: number;
	weight_kg?: number;
	goal_weight_kg?: number;
	goal_description?: string;
	desired_pace?: DesiredPace;
	activity_level?: ActivityLevel;
	job_type?: JobType;
	workouts_per_week?: number;
	workout_types?: string[];
	sleep_hours?: number;
	stress_level?: StressLevel;
	alcohol_per_week?: string;
	favorite_meals?: string[];
	hated_foods?: string[];
	restrictions?: string[];
	cooking_preference?: CookingPreference;
	food_adventurousness?: number;
	current_snacks?: string[];
	snacking_reason?: SnackingReason;
	snack_taste_preference?: SnackTastePreference;
	late_night_snacking?: boolean;
	eating_out_style?: EatingOutStyle;
	budget_level?: BudgetLevel;
	meal_frequency_preference?: number;
	location_region?: string;
	kitchen_access?: string;
	convenience_store_usage?: ConvenienceStoreUsage;
	has_medical_condition?: boolean;
	is_under_treatment?: boolean;
	on_medication?: boolean;
	is_pregnant_or_breastfeeding?: boolean;
	has_doctor_diet_restriction?: boolean;
	has_eating_disorder_history?: boolean;
	medical_condition_note?: string;
	medication_note?: string;
	onboarding_stage?: OnboardingStage;
	blocked_reason?: string;
	preferences_note?: string;
	snacks_note?: string;
	lifestyle_note?: string;
};
```

- [ ] **Step 2: 既存テストで型整合確認**

```bash
pnpm --filter @fitness/infra test
```

Expected: `toProfileMutation` など既存コードが自動追従してエラーなし。`updateUserProfile` Lambda は `PROFILE_FIELDS` 反復なので型拡張で自動対応される。infra には `typecheck` script がないため、vitest (esbuild transform 経由) の型エラー検出に依存する。

- [ ] **Step 3: Commit**

```bash
git add infra/lambdas/shared/profile-types.ts
git commit -m "feat(lambda): extend PROFILE_FIELDS and ProfilePatch for onboarding"
```

---

### Task B2: ProfileRowSchema を Onboarding フィールドに追従

**Files:**
- Modify: `infra/lambdas/shared/db-schemas.ts`

- [ ] **Step 1: ProfileRowSchema を contracts-ts の UserProfile Zod に置き換え (fail-fast 維持)**

既存コメントの意図「DB 側で想定外フィールドが混入したら 500 で fail-fast」を維持するため、`.catchall()` は付けない。Onboarding で必要なのは **field 拡張** であって parse 境界の緩和ではない。

```typescript
// infra/lambdas/shared/db-schemas.ts
import { UserProfileSchema } from "@fitness/contracts-ts";
import { z } from "zod";

/**
 * DynamoDB profile アイテムの形状。
 * contracts-ts の UserProfile Zod に updated_at (DB 専用メタ) のみを追加する。
 * 想定外フィールドが混入したら fail-fast (strict parse) で 500 を返す既存方針を維持。
 */
export const ProfileRowSchema = UserProfileSchema.extend({
	updated_at: z.string().optional(),
}).strict();

export type ProfileRow = z.infer<typeof ProfileRowSchema>;

// WeeklyPlanRowSchema は既存のまま (WeeklyPlan 契約未確定のため catchall 継続)
export const WeeklyPlanRowSchema = z
	.object({ meals: z.array(z.unknown()).optional() })
	.catchall(z.unknown());

export type WeeklyPlanRow = z.infer<typeof WeeklyPlanRowSchema>;
```

- [ ] **Step 2: 既存 Lambda テスト実行**

```bash
pnpm --filter @fitness/infra test
```

Expected: 既存 `fetch-user-profile` / `update-user-profile` Lambda テストは PASS のまま。infra には `typecheck` script がないため、型検証は `test` の vitest 実行時の esbuild 経由で行われる。

- [ ] **Step 3: Commit**

```bash
git add infra/lambdas/shared/db-schemas.ts
git commit -m "feat(lambda): delegate ProfileRowSchema to contracts-ts UserProfile (strict)"
```

---

### Task B3: サーバー側 Safety 判定を作成 (onboarding-safety.ts)

**Files:**
- Create: `infra/lambdas/shared/onboarding-safety.ts`
- Create: `infra/test/lambdas/shared/onboarding-safety.test.ts` (infra vitest は `test/**/*.test.ts` のみ収集)

- [ ] **Step 1: テストを書く (失敗させる)**

```typescript
// infra/test/lambdas/shared/onboarding-safety.test.ts
import { describe, expect, it } from "vitest";
import { evaluateSafetyGuard, type SafetyInput } from "../../../lambdas/shared/onboarding-safety";

const safe: SafetyInput = {
	has_medical_condition: false,
	is_under_treatment: false,
	on_medication: false,
	is_pregnant_or_breastfeeding: false,
	has_doctor_diet_restriction: false,
	has_eating_disorder_history: false,
};

describe("evaluateSafetyGuard", () => {
	it("returns safe for all false", () => {
		const r = evaluateSafetyGuard(safe);
		expect(r.level).toBe("safe");
	});

	it("returns blocked for pregnancy", () => {
		const r = evaluateSafetyGuard({ ...safe, is_pregnant_or_breastfeeding: true });
		expect(r.level).toBe("blocked");
		expect(r.reasons).toContain("pregnancy_or_breastfeeding");
	});

	it("returns blocked for eating disorder history", () => {
		const r = evaluateSafetyGuard({ ...safe, has_eating_disorder_history: true });
		expect(r.level).toBe("blocked");
		expect(r.reasons).toContain("eating_disorder_history");
	});

	it("returns blocked for doctor diet restriction", () => {
		const r = evaluateSafetyGuard({ ...safe, has_doctor_diet_restriction: true });
		expect(r.level).toBe("blocked");
		expect(r.reasons).toContain("doctor_diet_restriction");
	});

	it("returns caution for medical condition only", () => {
		const r = evaluateSafetyGuard({ ...safe, has_medical_condition: true });
		expect(r.level).toBe("caution");
	});

	it("returns caution for medication only", () => {
		const r = evaluateSafetyGuard({ ...safe, on_medication: true });
		expect(r.level).toBe("caution");
	});

	it("blocked takes priority over caution", () => {
		const r = evaluateSafetyGuard({
			...safe,
			has_medical_condition: true,
			is_pregnant_or_breastfeeding: true,
		});
		expect(r.level).toBe("blocked");
	});
});
```

- [ ] **Step 2: テスト失敗確認**

```bash
pnpm --filter @fitness/infra exec vitest run test/lambdas/shared/onboarding-safety.test.ts
```

Expected: FAIL (`Cannot find module './onboarding-safety'`)。

- [ ] **Step 3: 実装を書く**

```typescript
// infra/lambdas/shared/onboarding-safety.ts
export type SafetyInput = {
	has_medical_condition: boolean;
	is_under_treatment: boolean;
	on_medication: boolean;
	is_pregnant_or_breastfeeding: boolean;
	has_doctor_diet_restriction: boolean;
	has_eating_disorder_history: boolean;
};

export type SafetyResult =
	| { level: "safe"; reasons: []; warnings: [] }
	| { level: "caution"; reasons: []; warnings: string[] }
	| { level: "blocked"; reasons: string[]; warnings: [] };

export function evaluateSafetyGuard(input: SafetyInput): SafetyResult {
	const blockedReasons: string[] = [];
	if (input.is_pregnant_or_breastfeeding) blockedReasons.push("pregnancy_or_breastfeeding");
	if (input.has_eating_disorder_history) blockedReasons.push("eating_disorder_history");
	if (input.has_doctor_diet_restriction) blockedReasons.push("doctor_diet_restriction");

	if (blockedReasons.length > 0) {
		return { level: "blocked", reasons: blockedReasons, warnings: [] };
	}

	const warnings: string[] = [];
	if (input.has_medical_condition) warnings.push("medical_condition");
	if (input.on_medication) warnings.push("on_medication");

	if (warnings.length > 0) {
		return { level: "caution", reasons: [], warnings };
	}

	return { level: "safe", reasons: [], warnings: [] };
}
```

- [ ] **Step 4: テスト PASS 確認**

```bash
pnpm --filter @fitness/infra exec vitest run test/lambdas/shared/onboarding-safety.test.ts
```

Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add infra/lambdas/shared/onboarding-safety.ts infra/test/lambdas/shared/onboarding-safety.test.ts
git commit -m "feat(lambda): add server-side onboarding safety guard"
```

---

### Task B3.5: Python ↔ TypeScript Safety 判定の等価性テスト

既存 `packages/fitness-engine/src/fitness_engine/safety.py` は age / BMI / desired_pace などを含む **Plan 生成用の広い Safety 契約** を扱っており、Plan 07 の Onboarding bool subset とは I/O 契約が異なる。Plan 07 ではその差を曖昧にせず、`fitness_engine.onboarding_safety` に **Onboarding 専用 adapter** を追加して `infra/lambdas/shared/onboarding-safety.ts` と共有 fixture で等価性を担保する。

**Files:**
- Create: `packages/contracts-ts/schemas/fixtures/safety-matrix.json` (共有 golden)
- Create: `infra/test/lambdas/shared/onboarding-safety-equivalence.test.ts`
- Create: `packages/fitness-engine/src/fitness_engine/onboarding_safety.py`
- Create: `packages/fitness-engine/tests/test_onboarding_safety_equivalence.py`

- [ ] **Step 1: 共有 fixture を作成 (両言語の golden となる決定テーブル)**

```json
// packages/contracts-ts/schemas/fixtures/safety-matrix.json
{
  "cases": [
    {
      "name": "all_false_is_safe",
      "input": {
        "has_medical_condition": false, "is_under_treatment": false, "on_medication": false,
        "is_pregnant_or_breastfeeding": false, "has_doctor_diet_restriction": false,
        "has_eating_disorder_history": false
      },
      "expected": { "level": "safe", "reasons": [], "warnings": [] }
    },
    {
      "name": "pregnancy_blocks",
      "input": {
        "has_medical_condition": false, "is_under_treatment": false, "on_medication": false,
        "is_pregnant_or_breastfeeding": true, "has_doctor_diet_restriction": false,
        "has_eating_disorder_history": false
      },
      "expected": { "level": "blocked", "reasons": ["pregnancy_or_breastfeeding"], "warnings": [] }
    },
    {
      "name": "eating_disorder_blocks",
      "input": {
        "has_medical_condition": false, "is_under_treatment": false, "on_medication": false,
        "is_pregnant_or_breastfeeding": false, "has_doctor_diet_restriction": false,
        "has_eating_disorder_history": true
      },
      "expected": { "level": "blocked", "reasons": ["eating_disorder_history"], "warnings": [] }
    },
    {
      "name": "doctor_restriction_blocks",
      "input": {
        "has_medical_condition": false, "is_under_treatment": false, "on_medication": false,
        "is_pregnant_or_breastfeeding": false, "has_doctor_diet_restriction": true,
        "has_eating_disorder_history": false
      },
      "expected": { "level": "blocked", "reasons": ["doctor_diet_restriction"], "warnings": [] }
    },
    {
      "name": "medical_condition_cautions",
      "input": {
        "has_medical_condition": true, "is_under_treatment": false, "on_medication": false,
        "is_pregnant_or_breastfeeding": false, "has_doctor_diet_restriction": false,
        "has_eating_disorder_history": false
      },
      "expected": { "level": "caution", "reasons": [], "warnings": ["medical_condition"] }
    },
    {
      "name": "medication_cautions",
      "input": {
        "has_medical_condition": false, "is_under_treatment": false, "on_medication": true,
        "is_pregnant_or_breastfeeding": false, "has_doctor_diet_restriction": false,
        "has_eating_disorder_history": false
      },
      "expected": { "level": "caution", "reasons": [], "warnings": ["on_medication"] }
    },
    {
      "name": "blocked_takes_priority_over_caution",
      "input": {
        "has_medical_condition": true, "is_under_treatment": false, "on_medication": true,
        "is_pregnant_or_breastfeeding": true, "has_doctor_diet_restriction": false,
        "has_eating_disorder_history": false
      },
      "expected": { "level": "blocked", "reasons": ["pregnancy_or_breastfeeding"], "warnings": [] }
    },
    {
      "name": "multiple_blocks_all_listed",
      "input": {
        "has_medical_condition": false, "is_under_treatment": false, "on_medication": false,
        "is_pregnant_or_breastfeeding": true, "has_doctor_diet_restriction": true,
        "has_eating_disorder_history": true
      },
      "expected": {
        "level": "blocked",
        "reasons": ["pregnancy_or_breastfeeding", "eating_disorder_history", "doctor_diet_restriction"],
        "warnings": []
      }
    }
  ]
}
```

- [ ] **Step 2: TypeScript 側の等価性テスト**

```typescript
// infra/test/lambdas/shared/onboarding-safety-equivalence.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	evaluateSafetyGuard,
	type SafetyInput,
} from "../../../lambdas/shared/onboarding-safety";

type Matrix = {
	cases: Array<{
		name: string;
		input: SafetyInput;
		expected: { level: string; reasons: string[]; warnings: string[] };
	}>;
};

const matrix: Matrix = JSON.parse(
	readFileSync(
		new URL(
			"../../../../packages/contracts-ts/schemas/fixtures/safety-matrix.json",
			import.meta.url,
		),
		"utf8",
	),
);

describe("onboarding-safety ↔ fitness_engine.onboarding_safety equivalence", () => {
	for (const c of matrix.cases) {
		it(c.name, () => {
			const result = evaluateSafetyGuard(c.input);
			expect(result.level).toBe(c.expected.level);
			expect(result.reasons).toEqual(c.expected.reasons);
			expect(result.warnings).toEqual(c.expected.warnings);
		});
	}
});
```

- [ ] **Step 3: Python adapter 実装**

```python
# packages/fitness-engine/src/fitness_engine/onboarding_safety.py
"""Onboarding Flow (Plan 07) 用の bool subset Safety adapter。

既存 `fitness_engine.safety` は Plan 生成用の broader contract を扱うため、
Onboarding 画面の二重防御とは分離して mirror 実装する。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class OnboardingSafetyInput:
    has_medical_condition: bool
    is_under_treatment: bool
    on_medication: bool
    is_pregnant_or_breastfeeding: bool
    has_doctor_diet_restriction: bool
    has_eating_disorder_history: bool


@dataclass(frozen=True)
class OnboardingSafetyResult:
    level: Literal["safe", "caution", "blocked"]
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def evaluate_onboarding_safety_guard(
    input_: OnboardingSafetyInput,
) -> OnboardingSafetyResult:
    blocked_reasons: list[str] = []
    if input_.is_pregnant_or_breastfeeding:
        blocked_reasons.append("pregnancy_or_breastfeeding")
    if input_.has_eating_disorder_history:
        blocked_reasons.append("eating_disorder_history")
    if input_.has_doctor_diet_restriction:
        blocked_reasons.append("doctor_diet_restriction")

    if blocked_reasons:
        return OnboardingSafetyResult(level="blocked", reasons=blocked_reasons)

    warnings: list[str] = []
    if input_.has_medical_condition:
        warnings.append("medical_condition")
    if input_.on_medication:
        warnings.append("on_medication")

    if warnings:
        return OnboardingSafetyResult(level="caution", warnings=warnings)

    return OnboardingSafetyResult(level="safe")
```

- [ ] **Step 4: Python 側の等価性テスト**

```python
# packages/fitness-engine/tests/test_onboarding_safety_equivalence.py
"""TypeScript onboarding-safety.ts と Python adapter の等価性を担保するテスト。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from fitness_engine.onboarding_safety import (
    OnboardingSafetyInput,
    evaluate_onboarding_safety_guard,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "contracts-ts"
    / "schemas"
    / "fixtures"
    / "safety-matrix.json"
)


def load_matrix() -> list[dict]:
    return json.loads(FIXTURE_PATH.read_text())["cases"]


@pytest.mark.parametrize("case", load_matrix(), ids=lambda c: c["name"])
def test_onboarding_safety_matrix(case: dict) -> None:
    result = evaluate_onboarding_safety_guard(OnboardingSafetyInput(**case["input"]))
    assert result.level == case["expected"]["level"]
    assert result.reasons == case["expected"]["reasons"]
    assert result.warnings == case["expected"]["warnings"]
```

- [ ] **Step 5: 両言語でテスト実行**

```bash
pnpm --filter @fitness/infra exec vitest run test/lambdas/shared/onboarding-safety-equivalence.test.ts
.venv/bin/pytest packages/fitness-engine/tests/test_onboarding_safety_equivalence.py -v
```

Expected: 両方とも同じ `cases` 数 PASS。1 つでも乖離があれば即 FAIL する。

- [ ] **Step 6: Commit**

```bash
git add packages/contracts-ts/schemas/fixtures/safety-matrix.json infra/test/lambdas/shared/onboarding-safety-equivalence.test.ts packages/fitness-engine/src/fitness_engine/onboarding_safety.py packages/fitness-engine/tests/test_onboarding_safety_equivalence.py
git commit -m "test: cross-language equivalence for onboarding safety (TS ↔ Python)"
```

---

### Task B4: update-user-profile に Safety 二重防御を追加

**Files:**
- Modify: `infra/lambdas/update-user-profile/index.ts`
- Create: `infra/test/lambdas/update-user-profile-guard.test.ts` (既存 `infra/test/lambdas/update-user-profile.test.ts` とは別ファイルで、Safety ガード専用のケースを追加)

- [ ] **Step 1: 二重防御テストを書く (失敗させる)**

```typescript
// infra/test/lambdas/update-user-profile-guard.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

vi.mock("../../lambdas/shared/dynamo", () => ({
	docClient: { send: vi.fn() },
	stripKeys: (o: object) => o,
	TABLE_NAME: "test",
}));

// 最小の event を組み立てるヘルパーは実装側ですでに存在するものを利用
function buildEvent(body: object): APIGatewayProxyEventV2WithJWTAuthorizer {
	return {
		requestContext: {
			authorizer: { jwt: { claims: { sub: "user-123" } } },
		},
		body: JSON.stringify(body),
		isBase64Encoded: false,
		headers: { "content-type": "application/json" },
	} as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("updateUserProfile safety guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects pregnancy=true without stage=blocked", async () => {
		const { handler } = await import("./index");
		const res = await handler(buildEvent({ is_pregnant_or_breastfeeding: true }));
		expect(res.statusCode).toBe(400);
	});

	it("rejects stage=blocked without blocked_reason", async () => {
		const { handler } = await import("./index");
		const res = await handler(
			buildEvent({
				onboarding_stage: "blocked",
				is_pregnant_or_breastfeeding: true,
			}),
		);
		expect(res.statusCode).toBe(400);
	});

	it("accepts stage=blocked with blocked_reason and pregnancy=true", async () => {
		const { docClient } = await import("../shared/dynamo");
		(docClient.send as ReturnType<typeof vi.fn>).mockResolvedValue({
			Attributes: { pk: "user#x", sk: "profile", onboarding_stage: "blocked" },
		});
		const { handler } = await import("./index");
		const res = await handler(
			buildEvent({
				onboarding_stage: "blocked",
				blocked_reason: "pregnancy_or_breastfeeding",
				is_pregnant_or_breastfeeding: true,
			}),
		);
		expect(res.statusCode).toBe(200);
	});
});
```

- [ ] **Step 2: 実装を修正**

```typescript
// infra/lambdas/update-user-profile/index.ts
// 既存の import 群の下に追加:
import { evaluateSafetyGuard } from "../shared/onboarding-safety";

// createHandler の中で、parseRequest の後・toProfileMutation の前に以下を挿入:

		const patch = parsed.data;

		// ── Safety 二重防御 ────────────────────────────────
		const anySafetyFlagProvided =
			patch.has_medical_condition !== undefined
			|| patch.is_under_treatment !== undefined
			|| patch.on_medication !== undefined
			|| patch.is_pregnant_or_breastfeeding !== undefined
			|| patch.has_doctor_diet_restriction !== undefined
			|| patch.has_eating_disorder_history !== undefined;

		if (anySafetyFlagProvided) {
			const guard = evaluateSafetyGuard({
				has_medical_condition: patch.has_medical_condition ?? false,
				is_under_treatment: patch.is_under_treatment ?? false,
				on_medication: patch.on_medication ?? false,
				is_pregnant_or_breastfeeding: patch.is_pregnant_or_breastfeeding ?? false,
				has_doctor_diet_restriction: patch.has_doctor_diet_restriction ?? false,
				has_eating_disorder_history: patch.has_eating_disorder_history ?? false,
			});

			if (guard.level === "blocked" && patch.onboarding_stage !== "blocked") {
				return badRequest("Safety flags imply blocked stage but onboarding_stage is not 'blocked'");
			}
		}

		if (patch.onboarding_stage === "blocked" && !patch.blocked_reason) {
			return badRequest("blocked_reason is required when onboarding_stage is 'blocked'");
		}
```

- [ ] **Step 3: テスト PASS 確認**

```bash
pnpm --filter @fitness/infra exec vitest run test/lambdas/update-user-profile-guard.test.ts
```

Expected: 全 PASS。

- [ ] **Step 4: Commit**

```bash
git add infra/lambdas/update-user-profile/index.ts infra/test/lambdas/update-user-profile-guard.test.ts
git commit -m "feat(lambda): add safety double-check to update-user-profile"
```

---

## Phase C: Web 基盤 (依存・純粋関数・Route Handler)

### Task C1: web 依存追加 (Vercel AI SDK + shadcn primitives)

**Files:**
- Modify: `packages/web/package.json` (pnpm add 経由)

- [ ] **Step 1: Vercel AI SDK 追加**

```bash
pnpm --filter @fitness/web add ai@^6 @ai-sdk/anthropic@^2
```

> Note: AI SDK v6 では `generateObject` が削除され、`generateText` + `Output.object({ schema })` に統一された。本 Plan はこの v6 形式を採用する。

- [ ] **Step 2: shadcn primitives 追加**

```bash
pnpm --filter @fitness/web exec npx shadcn@latest add progress toggle-group toggle slider alert skeleton textarea
```

追加される Radix 依存は CLI が自動 resolve。`components.json` は Plan 06 で既に設定済み。

- [ ] **Step 3: 生成物確認**

```bash
ls packages/web/src/components/ui/
```

Expected: 既存 `button.tsx` `card.tsx` `input.tsx` `label.tsx` に加え `progress.tsx` / `toggle-group.tsx` / `toggle.tsx` / `slider.tsx` / `alert.tsx` / `skeleton.tsx` / `textarea.tsx` が存在。

- [ ] **Step 4: build 通るか確認**

```bash
pnpm --filter @fitness/web build
```

Expected: build 成功。

- [ ] **Step 5: Commit**

```bash
git add packages/web/package.json packages/web/src/components/ui/ pnpm-lock.yaml
git commit -m "feat(web): add ai sdk and shadcn primitives for onboarding"
```

---

### Task C2: stage-routing 純粋関数

**Files:**
- Create: `packages/web/src/lib/onboarding/stage-routing.ts`
- Create: `packages/web/src/lib/onboarding/stage-routing.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
// packages/web/src/lib/onboarding/stage-routing.test.ts
import { describe, expect, it } from "vitest";
import { pathForStage, stageForPath, type OnboardingStage } from "./stage-routing";

describe("pathForStage", () => {
	it("maps each stage to its URL", () => {
		const cases: Array<[OnboardingStage, string]> = [
			["safety", "/onboarding/safety"],
			["stats", "/onboarding/stats"],
			["lifestyle", "/onboarding/lifestyle"],
			["preferences", "/onboarding/preferences"],
			["snacks", "/onboarding/snacks"],
			["feasibility", "/onboarding/feasibility"],
			["review", "/onboarding/review"],
			["blocked", "/onboarding/blocked"],
		];
		for (const [stage, path] of cases) {
			expect(pathForStage(stage)).toBe(path);
		}
	});
});

describe("stageForPath", () => {
	it("extracts stage from pathname", () => {
		expect(stageForPath("/onboarding/stats")).toBe("stats");
		expect(stageForPath("/onboarding/review")).toBe("review");
	});
	it("returns null for non-onboarding paths", () => {
		expect(stageForPath("/home")).toBeNull();
		expect(stageForPath("/onboarding")).toBeNull();
	});
});
```

- [ ] **Step 2: テスト失敗確認**

```bash
pnpm --filter @fitness/web exec vitest run src/lib/onboarding/stage-routing.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 実装**

```typescript
// packages/web/src/lib/onboarding/stage-routing.ts
export type OnboardingStage =
	| "safety"
	| "stats"
	| "lifestyle"
	| "preferences"
	| "snacks"
	| "feasibility"
	| "review"
	| "blocked";

const STAGE_TO_PATH: Record<OnboardingStage, string> = {
	safety: "/onboarding/safety",
	stats: "/onboarding/stats",
	lifestyle: "/onboarding/lifestyle",
	preferences: "/onboarding/preferences",
	snacks: "/onboarding/snacks",
	feasibility: "/onboarding/feasibility",
	review: "/onboarding/review",
	blocked: "/onboarding/blocked",
};

export function pathForStage(stage: OnboardingStage): string {
	return STAGE_TO_PATH[stage];
}

export function stageForPath(pathname: string): OnboardingStage | null {
	const match = pathname.match(/^\/onboarding\/(safety|stats|lifestyle|preferences|snacks|feasibility|review|blocked)(?:\/|$)/);
	return match ? (match[1] as OnboardingStage) : null;
}

export const ONBOARDING_STAGE_ORDER: OnboardingStage[] = [
	"safety", "stats", "lifestyle", "preferences", "snacks", "feasibility", "review",
];

export function nextStage(current: OnboardingStage): OnboardingStage | "complete" {
	const idx = ONBOARDING_STAGE_ORDER.indexOf(current);
	if (idx === -1 || current === "blocked") return current;
	if (idx === ONBOARDING_STAGE_ORDER.length - 1) return "complete";
	return ONBOARDING_STAGE_ORDER[idx + 1];
}
```

- [ ] **Step 4: テスト PASS 確認**

```bash
pnpm --filter @fitness/web exec vitest run src/lib/onboarding/stage-routing.test.ts
```

Expected: 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/lib/onboarding/
git commit -m "feat(web): add onboarding stage routing pure functions"
```

---

### Task C3: クライアント側 Safety 純粋関数

**Files:**
- Create: `packages/web/src/lib/onboarding/safety.ts`
- Create: `packages/web/src/lib/onboarding/safety.test.ts`

- [ ] **Step 1: テストを書く**

```typescript
// packages/web/src/lib/onboarding/safety.test.ts
import { describe, expect, it } from "vitest";
import { evaluateSafetyRisk, type SafetyInput } from "./safety";

const baseInput: SafetyInput = {
	hasMedicalCondition: false,
	isUnderTreatment: false,
	onMedication: false,
	isPregnantOrBreastfeeding: false,
	hasDoctorDietRestriction: false,
	hasEatingDisorderHistory: false,
	medicalConditionNote: null,
	medicationNote: null,
};

describe("evaluateSafetyRisk", () => {
	it("returns safe when all flags are false", () => {
		const r = evaluateSafetyRisk(baseInput);
		expect(r.level).toBe("safe");
	});

	it("blocked for pregnancy", () => {
		const r = evaluateSafetyRisk({ ...baseInput, isPregnantOrBreastfeeding: true });
		expect(r.level).toBe("blocked");
		expect(r.blockedReason).toContain("pregnancy");
	});

	it("blocked for eating disorder", () => {
		const r = evaluateSafetyRisk({ ...baseInput, hasEatingDisorderHistory: true });
		expect(r.level).toBe("blocked");
	});

	it("blocked for doctor diet restriction", () => {
		const r = evaluateSafetyRisk({ ...baseInput, hasDoctorDietRestriction: true });
		expect(r.level).toBe("blocked");
	});

	it("caution for medical condition", () => {
		const r = evaluateSafetyRisk({ ...baseInput, hasMedicalCondition: true });
		expect(r.level).toBe("caution");
	});

	it("blocked takes priority over caution", () => {
		const r = evaluateSafetyRisk({
			...baseInput,
			hasMedicalCondition: true,
			isPregnantOrBreastfeeding: true,
		});
		expect(r.level).toBe("blocked");
	});
});
```

- [ ] **Step 2: 実装**

```typescript
// packages/web/src/lib/onboarding/safety.ts
export type SafetyInput = {
	hasMedicalCondition: boolean;
	isUnderTreatment: boolean;
	onMedication: boolean;
	isPregnantOrBreastfeeding: boolean;
	hasDoctorDietRestriction: boolean;
	hasEatingDisorderHistory: boolean;
	medicalConditionNote: string | null;
	medicationNote: string | null;
};

export type SafetyResult =
	| { level: "safe"; blockedReason: null; reasons: []; warnings: [] }
	| { level: "caution"; blockedReason: null; reasons: []; warnings: string[] }
	| { level: "blocked"; blockedReason: string; reasons: string[]; warnings: [] };

export function evaluateSafetyRisk(input: SafetyInput): SafetyResult {
	const blockedReasons: string[] = [];
	if (input.isPregnantOrBreastfeeding) blockedReasons.push("pregnancy_or_breastfeeding");
	if (input.hasEatingDisorderHistory) blockedReasons.push("eating_disorder_history");
	if (input.hasDoctorDietRestriction) blockedReasons.push("doctor_diet_restriction");

	if (blockedReasons.length > 0) {
		return {
			level: "blocked",
			blockedReason: blockedReasons.join("; "),
			reasons: blockedReasons,
			warnings: [],
		};
	}

	const warnings: string[] = [];
	if (input.hasMedicalCondition) warnings.push("medical_condition");
	if (input.onMedication) warnings.push("on_medication");

	if (warnings.length > 0) {
		return { level: "caution", blockedReason: null, reasons: [], warnings };
	}

	return { level: "safe", blockedReason: null, reasons: [], warnings: [] };
}
```

- [ ] **Step 3: テスト PASS 確認 + Commit**

```bash
pnpm --filter @fitness/web exec vitest run src/lib/onboarding/safety.test.ts
git add packages/web/src/lib/onboarding/safety.ts packages/web/src/lib/onboarding/safety.test.ts
git commit -m "feat(web): add client-side safety evaluation"
```

---

### Task C4: getProfileServerSide (Server Component 用 profile fetch)

**Files:**
- Create: `packages/web/src/lib/profile/server.ts`
- Create: `packages/web/src/lib/profile/server.test.ts`

- [ ] **Step 1: テスト**

```typescript
// packages/web/src/lib/profile/server.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({
	getValidAccessTokenServer: vi.fn(),
}));

describe("getProfileServerSide", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.API_GATEWAY_URL = "https://api.example.com";
	});

	it("returns null when no access token", async () => {
		const { getValidAccessTokenServer } = await import("../auth/session");
		(getValidAccessTokenServer as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const { getProfileServerSide } = await import("./server");
		const result = await getProfileServerSide();
		expect(result).toBeNull();
	});

	it("returns profile on 200", async () => {
		const { getValidAccessTokenServer } = await import("../auth/session");
		(getValidAccessTokenServer as ReturnType<typeof vi.fn>).mockResolvedValue("token");
		global.fetch = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ profile: { onboarding_stage: "stats" } }), { status: 200 }),
		);
		const { getProfileServerSide } = await import("./server");
		const result = await getProfileServerSide();
		expect(result?.onboardingStage).toBe("stats");
	});

	it("returns null on 404", async () => {
		const { getValidAccessTokenServer } = await import("../auth/session");
		(getValidAccessTokenServer as ReturnType<typeof vi.fn>).mockResolvedValue("token");
		global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
		const { getProfileServerSide } = await import("./server");
		const result = await getProfileServerSide();
		expect(result).toBeNull();
	});
});
```

- [ ] **Step 2: 実装**

既存 `session.ts` に `getValidAccessTokenServer` を追加（未定義なら proxy route の `getValidAccessToken` を関数抽出して共有）。

```typescript
// packages/web/src/lib/profile/server.ts
import "server-only";

import type { UserProfile } from "@fitness/contracts-ts";
import { getValidAccessTokenServer } from "../auth/session";

export async function getProfileServerSide(): Promise<UserProfile | null> {
	const token = await getValidAccessTokenServer();
	if (!token) return null;

	const apiBase = process.env.API_GATEWAY_URL;
	if (!apiBase) return null;

	const res = await fetch(`${apiBase.replace(/\/$/, "")}/users/me/profile`, {
		headers: { Authorization: `Bearer ${token}` },
		cache: "no-store",
	});

	if (res.status !== 200) return null;
	const body = (await res.json()) as { profile?: UserProfile };
	return body.profile ?? null;
}
```

- [ ] **Step 3: 既存 session.ts に `getValidAccessTokenServer` 追加**

```typescript
// packages/web/src/lib/auth/session.ts に追加
export async function getValidAccessTokenServer(): Promise<string | null> {
	const accessToken = await getAccessToken();
	if (accessToken) return accessToken;
	const refreshToken = await getRefreshToken();
	if (!refreshToken) return null;
	try {
		const refreshed = await cognitoRefreshTokens(refreshToken);
		await setRefreshedTokens(refreshed.idToken, refreshed.accessToken);
		return refreshed.accessToken;
	} catch {
		await clearSession();
		return null;
	}
}
```

proxy route の既存 `getValidAccessToken` / `refreshAccessToken` と同ロジック。proxy route は既存実装を維持し共通化は YAGNI で後日。

- [ ] **Step 4: テスト PASS + Commit**

```bash
pnpm --filter @fitness/web exec vitest run src/lib/profile/server.test.ts
git add packages/web/src/lib/profile/ packages/web/src/lib/auth/session.ts
git commit -m "feat(web): add server-side profile fetch helper"
```

---

### Task C5: proxy.ts で pathname header を付与

**Files:**
- Modify: `packages/web/proxy.ts`

- [ ] **Step 1: 実装**

```typescript
// packages/web/proxy.ts
import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
	const headers = new Headers(request.headers);
	headers.set("x-next-pathname", request.nextUrl.pathname);
	return NextResponse.next({ request: { headers } });
}

export const config = {
	matcher: ["/((?!api|_next|favicon.ico|.*\\.).*)"],
};
```

- [ ] **Step 2: build 確認**

```bash
pnpm --filter @fitness/web build
```

Expected: 成功。Plan 06 機能に影響なし (route handler と auth は未変更)。

- [ ] **Step 3: Commit**

```bash
git add packages/web/proxy.ts
git commit -m "feat(web): propagate pathname header for onboarding layout"
```

---

### Task C6: Coach prompt Route Handler

**Files:**
- Create: `packages/web/src/app/api/onboarding/coach-prompt/route.ts`
- Create: `packages/web/src/app/api/onboarding/coach-prompt/route.test.ts`

- [ ] **Step 1: テスト**

```typescript
// packages/web/src/app/api/onboarding/coach-prompt/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => ({}) }));

describe("POST /api/onboarding/coach-prompt", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns 401 when no session", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/coach-prompt", {
			method: "POST",
			body: JSON.stringify({ target_stage: "stats", profile_snapshot: {} }),
		});
		const res = await POST(req);
		expect(res.status).toBe(401);
	});

	it("returns 400 on invalid body", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "u", email: "x" });
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/coach-prompt", {
			method: "POST",
			body: JSON.stringify({ target_stage: "unknown" }),
		});
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	it("returns prompt on success", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "u", email: "x" });
		const { generateText } = await import("ai");
		(generateText as ReturnType<typeof vi.fn>).mockResolvedValue({ text: "Welcome." });
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/coach-prompt", {
			method: "POST",
			body: JSON.stringify({ target_stage: "stats", profile_snapshot: { age: 30 } }),
		});
		const res = await POST(req);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.prompt).toBe("Welcome.");
		expect(body.cached).toBe(false);
	});
});
```

- [ ] **Step 2: 実装**

```typescript
// packages/web/src/app/api/onboarding/coach-prompt/route.ts
import { anthropic } from "@ai-sdk/anthropic";
import { CoachPromptRequestSchema } from "@fitness/contracts-ts";
import { generateText } from "ai";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";

const SYSTEM_PROMPT = `
あなたはパーソナルフィットネスコーチです。
トーン:
- 温かい / 前向き / 命令口調ではない
- 罪悪感を煽らない
- 2-4 文、日本語
- ユーザーの入力済み情報 (profile_snapshot) に軽く言及して、これから聞く内容 (target_stage) の意義を自然に伝える
`.trim();

export async function POST(request: Request) {
	const session = await getSession();
	if (!session) {
		return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}

	const parsed = CoachPromptRequestSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: "invalid_body" }, { status: 400 });
	}

	try {
		const { text } = await generateText({
			model: anthropic("claude-haiku-4-5"),
			system: SYSTEM_PROMPT,
			prompt: `target_stage: ${parsed.data.target_stage}\nprofile_snapshot: ${JSON.stringify(parsed.data.profile_snapshot)}`,
			maxTokens: 200,
		});
		return NextResponse.json({ prompt: text, cached: false });
	} catch (error) {
		console.error("coach-prompt generation failed", error);
		return NextResponse.json({ error: "generation_failed" }, { status: 500 });
	}
}
```

- [ ] **Step 3: テスト PASS + Commit**

```bash
pnpm --filter @fitness/web exec vitest run src/app/api/onboarding/coach-prompt
git add packages/web/src/app/api/onboarding/coach-prompt/
git commit -m "feat(web): add coach prompt route handler"
```

---

### Task C7: Free-text parse Route Handler

**Files:**
- Create: `packages/web/src/app/api/onboarding/free-text-parse/route.ts`
- Create: `packages/web/src/app/api/onboarding/free-text-parse/route.test.ts`

- [ ] **Step 1: テスト**

```typescript
// packages/web/src/app/api/onboarding/free-text-parse/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("ai", () => ({
	generateText: vi.fn(),
	Output: { object: vi.fn((opts) => opts) },
}));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => ({}) }));

describe("POST /api/onboarding/free-text-parse", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns 401 when no session", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/free-text-parse", {
			method: "POST",
			body: JSON.stringify({ stage: "lifestyle", free_text: "x", structured_snapshot: {} }),
		});
		expect((await POST(req)).status).toBe(401);
	});

	it("rejects stage=safety", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "u", email: "x" });
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/free-text-parse", {
			method: "POST",
			body: JSON.stringify({ stage: "safety", free_text: "x", structured_snapshot: {} }),
		});
		expect((await POST(req)).status).toBe(400);
	});

	it("returns structured parse on success", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: "u", email: "x" });
		const { generateText } = await import("ai");
		(generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
			experimental_output: { extracted_note: "summary", suggested_tags: ["tag1"] },
		});
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/free-text-parse", {
			method: "POST",
			body: JSON.stringify({ stage: "preferences", free_text: "I like fish", structured_snapshot: {} }),
		});
		const res = await POST(req);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.note_field).toBe("preferences_note");
		expect(body.extracted_note).toBe("summary");
	});
});
```

- [ ] **Step 2: 実装**

```typescript
// packages/web/src/app/api/onboarding/free-text-parse/route.ts
import { anthropic } from "@ai-sdk/anthropic";
import { FreeTextParseRequestSchema } from "@fitness/contracts-ts";
import { Output, generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth/session";

// LLM の structured output 形状。契約の FreeTextParseResponse から note_field を除いた部分。
const llmOutputSchema = z.object({
	extracted_note: z.string(),
	suggested_tags: z.array(z.string()),
});

const NOTE_FIELD_MAP = {
	lifestyle: "lifestyle_note",
	preferences: "preferences_note",
	snacks: "snacks_note",
} as const;

const SYSTEM_PROMPT = `
ユーザーの自由記述から、嗜好や生活パターンの要点を抽出します。
- extracted_note: 1-3 文で要約
- suggested_tags: 構造化候補の文字列配列 (食材名、料理名、習慣名など)
- 構造化済みフィールドを上書きする意図は持たない。note と tag のみを返す
- 出力は日本語
`.trim();

export async function POST(request: Request) {
	const session = await getSession();
	if (!session) {
		return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}

	const parsed = FreeTextParseRequestSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: "invalid_body" }, { status: 400 });
	}

	try {
		// AI SDK v6: generateObject は削除され、generateText + Output.object に統一
		const { experimental_output: object } = await generateText({
			model: anthropic("claude-haiku-4-5"),
			experimental_output: Output.object({ schema: llmOutputSchema }),
			system: SYSTEM_PROMPT,
			prompt: `stage: ${parsed.data.stage}\nfree_text: ${parsed.data.free_text}\nstructured_snapshot: ${JSON.stringify(parsed.data.structured_snapshot)}`,
			maxTokens: 400,
		});
		return NextResponse.json({
			note_field: NOTE_FIELD_MAP[parsed.data.stage],
			extracted_note: object.extracted_note,
			suggested_tags: object.suggested_tags,
		});
	} catch (error) {
		console.error("free-text-parse failed", error);
		return NextResponse.json({ error: "parse_failed" }, { status: 500 });
	}
}
```

- [ ] **Step 3: テスト PASS + Commit**

```bash
pnpm --filter @fitness/web exec vitest run src/app/api/onboarding/free-text-parse
git add packages/web/src/app/api/onboarding/free-text-parse/
git commit -m "feat(web): add free-text parse route handler"
```

---

### Task C8: ANTHROPIC_API_KEY を .env.schema に追加 (Varlock annotation 付き)

**Files:**
- Modify: `packages/web/.env.schema`
- Regenerated by varlock: `packages/web/env.d.ts`

- [ ] **Step 1: 既存ファイルのスタイル (Varlock annotation) に合わせて追記**

既存の `.env.schema` は 1 行目に `# @defaultSensitive=false @generateTypes(lang='ts', path='env.d.ts')` を持ち、各変数に `# @required @type=...` を付ける形式。同じ形式で ANTHROPIC_API_KEY を追加する：

```dotenv
# Anthropic API key for Coach prompt generation and Free-text parse (経路 C, server-only).
# Local 環境は .env.local に手動で設定、Vercel / AWS SSM へは deploy 前に注入する。
# @required @type=string @sensitive=true
ANTHROPIC_API_KEY=
```

`@sensitive=true` を明示することで、varlock の log / error output で値がマスクされる。`@required` により未設定時は `env:check` / Next.js 起動が失敗する (fail-fast)。

- [ ] **Step 2: env.d.ts が再生成されることを確認**

```bash
pnpm --filter @fitness/web env:check
```

Expected: `packages/web/env.d.ts` に `ANTHROPIC_API_KEY: string` が追加される。未設定のローカルでは `.env.local` に追加するよう促すエラー出力を確認。

- [ ] **Step 3: .env.local に追加 (ローカルのみ、git ignore 済み)**

```bash
echo "ANTHROPIC_API_KEY=sk-ant-..." >> packages/web/.env.local
```

(実 key は Anthropic Console から取得)

- [ ] **Step 4: Commit (env.d.ts も含める、.env.local は除外)**

```bash
git add packages/web/.env.schema packages/web/env.d.ts
git commit -m "feat(web): declare ANTHROPIC_API_KEY with varlock annotations"
```

---

## Phase D: domain コンポーネント

### Task D1: OnboardingShell

**Files:**
- Create: `packages/web/src/components/domain/onboarding-shell.tsx`

- [ ] **Step 1: 実装**

```tsx
// packages/web/src/components/domain/onboarding-shell.tsx
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { ONBOARDING_STAGE_ORDER, type OnboardingStage } from "@/lib/onboarding/stage-routing";

type OnboardingShellProps = {
	stage: OnboardingStage;
	backHref?: string;
	children: React.ReactNode;
};

export function OnboardingShell({ stage, backHref, children }: OnboardingShellProps) {
	const stepIndex = ONBOARDING_STAGE_ORDER.indexOf(stage);
	const totalSteps = ONBOARDING_STAGE_ORDER.length;
	const progress = stepIndex >= 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0;

	return (
		<div className="min-h-dvh bg-canvas">
			<header className="flex items-center justify-between px-4 h-12 border-b border-neutral-200 bg-surface">
				{backHref ? (
					<Link href={backHref} className="p-2 -ml-2" aria-label="戻る">
						<ArrowLeft className="h-5 w-5" />
					</Link>
				) : <span className="w-9" />}
				<h1 className="text-sm font-medium">セットアップ</h1>
				<span className="text-xs text-neutral-500 w-9 text-right">
					{stepIndex >= 0 ? `${stepIndex + 1}/${totalSteps}` : ""}
				</span>
			</header>
			{stage !== "blocked" && (
				<Progress value={progress} className="h-1 rounded-none" />
			)}
			<main className="max-w-lg mx-auto px-4 py-6 pb-24">
				{children}
			</main>
		</div>
	);
}
```

- [ ] **Step 2: build 確認 + Commit**

```bash
pnpm --filter @fitness/web build
git add packages/web/src/components/domain/onboarding-shell.tsx
git commit -m "feat(web): add OnboardingShell"
```

---

### Task D2: CoachPromptCard

**Files:**
- Create: `packages/web/src/components/domain/coach-prompt-card.tsx`

- [ ] **Step 1: 実装**

```tsx
// packages/web/src/components/domain/coach-prompt-card.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type CoachPromptCardProps = {
	prompt: string | null;
	isLoading: boolean;
};

const FALLBACK = "ここではあなたのことをもう少し教えてください。入力内容に合わせて最適な提案ができるよう準備します。";

export function CoachPromptCard({ prompt, isLoading }: CoachPromptCardProps) {
	return (
		<Card className="mb-6 bg-subtle border-primary-100">
			<CardContent className="pt-6">
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				) : (
					<p className="text-sm leading-relaxed text-neutral-900 whitespace-pre-wrap">
						{prompt ?? FALLBACK}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/domain/coach-prompt-card.tsx
git commit -m "feat(web): add CoachPromptCard"
```

---

### Task D3: SegmentedControl

**Files:**
- Create: `packages/web/src/components/domain/segmented-control.tsx`

- [ ] **Step 1: 実装**

```tsx
// packages/web/src/components/domain/segmented-control.tsx
"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type SegmentOption<T extends string> = {
	value: T;
	label: string;
};

type SegmentedControlProps<T extends string> = {
	value: T | null;
	onChange: (value: T) => void;
	options: SegmentOption<T>[];
	ariaLabel: string;
};

export function SegmentedControl<T extends string>({
	value, onChange, options, ariaLabel,
}: SegmentedControlProps<T>) {
	return (
		<ToggleGroup
			type="single"
			value={value ?? undefined}
			onValueChange={(v) => { if (v) onChange(v as T); }}
			aria-label={ariaLabel}
			className="inline-flex rounded-md border border-neutral-200 bg-surface p-0.5"
		>
			{options.map((opt) => (
				<ToggleGroupItem
					key={opt.value}
					value={opt.value}
					className="px-3 py-1.5 text-sm rounded data-[state=on]:bg-primary-500 data-[state=on]:text-white"
				>
					{opt.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/domain/segmented-control.tsx
git commit -m "feat(web): add SegmentedControl"
```

---

### Task D4: ChoiceChips / MultiTagInput / NumberField / Stepper / SliderField / CautionBanner / BlockedNoticeCard / SectionSummaryCard

(残りの domain コンポーネントは類似構造。テンプレートとして `SegmentedControl` と同様に 1 コンポーネント = 1 ファイルで実装)

**Files (create 8 ファイル)**:
- `components/domain/choice-chips.tsx`
- `components/domain/multi-tag-input.tsx`
- `components/domain/number-field.tsx`
- `components/domain/stepper.tsx`
- `components/domain/slider-field.tsx`
- `components/domain/caution-banner.tsx`
- `components/domain/blocked-notice-card.tsx`
- `components/domain/section-summary-card.tsx`

- [ ] **Step 1: ChoiceChips 実装**

```tsx
// packages/web/src/components/domain/choice-chips.tsx
"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type ChoiceChipsProps<T extends string> = {
	value: T | null;
	onChange: (value: T) => void;
	options: Array<{ value: T; label: string }>;
	ariaLabel: string;
};

export function ChoiceChips<T extends string>({ value, onChange, options, ariaLabel }: ChoiceChipsProps<T>) {
	return (
		<ToggleGroup
			type="single"
			value={value ?? undefined}
			onValueChange={(v) => { if (v) onChange(v as T); }}
			aria-label={ariaLabel}
			className="flex flex-wrap gap-2"
		>
			{options.map((opt) => (
				<ToggleGroupItem
					key={opt.value}
					value={opt.value}
					variant="outline"
					className="rounded-full px-4 py-2 text-sm border-neutral-200 data-[state=on]:bg-primary-500 data-[state=on]:text-white data-[state=on]:border-primary-500"
				>
					{opt.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
```

- [ ] **Step 2: MultiTagInput 実装**

```tsx
// packages/web/src/components/domain/multi-tag-input.tsx
"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";

type MultiTagInputProps = {
	value: string[];
	onChange: (value: string[]) => void;
	placeholder?: string;
	max?: number;
	ariaLabel: string;
};

export function MultiTagInput({ value, onChange, placeholder, max, ariaLabel }: MultiTagInputProps) {
	const [draft, setDraft] = useState("");

	const add = () => {
		const t = draft.trim();
		if (!t) return;
		if (max && value.length >= max) return;
		if (value.includes(t)) return;
		onChange([...value, t]);
		setDraft("");
	};

	const remove = (t: string) => onChange(value.filter((v) => v !== t));

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") { e.preventDefault(); add(); }
	};

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-2">
				{value.map((t) => (
					<span key={t} className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-600 rounded-full text-sm">
						{t}
						<button type="button" onClick={() => remove(t)} aria-label={`${t} を削除`}>
							<X className="h-3 w-3" />
						</button>
					</span>
				))}
			</div>
			<div className="flex gap-2">
				<Input
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder={placeholder}
					aria-label={ariaLabel}
					disabled={max ? value.length >= max : false}
				/>
			</div>
			{max && <p className="text-xs text-neutral-500">最大 {max} 個</p>}
		</div>
	);
}
```

- [ ] **Step 3: NumberField 実装**

```tsx
// packages/web/src/components/domain/number-field.tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type NumberFieldProps = {
	id: string;
	label: string;
	unit?: string;
	value: number | null;
	onChange: (value: number | null) => void;
	min?: number;
	max?: number;
	step?: number;
};

export function NumberField({ id, label, unit, value, onChange, min, max, step }: NumberFieldProps) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<div className="flex items-center gap-2">
				<Input
					id={id}
					type="number"
					value={value ?? ""}
					onChange={(e) => {
						const v = e.target.value;
						onChange(v === "" ? null : Number(v));
					}}
					min={min}
					max={max}
					step={step}
					className="max-w-32"
				/>
				{unit && <span className="text-sm text-neutral-500">{unit}</span>}
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Stepper 実装**

```tsx
// packages/web/src/components/domain/stepper.tsx
"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type StepperProps = {
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	ariaLabel: string;
};

export function Stepper({ value, onChange, min = 0, max = 999, ariaLabel }: StepperProps) {
	return (
		<div className="inline-flex items-center gap-3" aria-label={ariaLabel}>
			<Button type="button" size="icon" variant="outline"
				onClick={() => onChange(Math.max(min, value - 1))}
				disabled={value <= min}
				aria-label="減らす">
				<Minus className="h-4 w-4" />
			</Button>
			<span className="min-w-10 text-center text-lg font-medium">{value}</span>
			<Button type="button" size="icon" variant="outline"
				onClick={() => onChange(Math.min(max, value + 1))}
				disabled={value >= max}
				aria-label="増やす">
				<Plus className="h-4 w-4" />
			</Button>
		</div>
	);
}
```

- [ ] **Step 5: SliderField 実装**

```tsx
// packages/web/src/components/domain/slider-field.tsx
"use client";

import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

type SliderFieldProps = {
	id: string;
	label: string;
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
};

export function SliderField({ id, label, value, onChange, min = 1, max = 10, step = 1 }: SliderFieldProps) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Label htmlFor={id}>{label}</Label>
				<span className="text-sm text-neutral-700 font-medium">{value}</span>
			</div>
			<Slider
				id={id}
				value={[value]}
				onValueChange={(v) => onChange(v[0])}
				min={min}
				max={max}
				step={step}
			/>
		</div>
	);
}
```

- [ ] **Step 6: CautionBanner 実装**

```tsx
// packages/web/src/components/domain/caution-banner.tsx
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function CautionBanner({ message }: { message: string }) {
	return (
		<Alert className="border-warning-500 bg-warning-100 text-warning-500">
			<AlertCircle className="h-4 w-4" />
			<AlertDescription>{message}</AlertDescription>
		</Alert>
	);
}
```

- [ ] **Step 7: BlockedNoticeCard 実装**

```tsx
// packages/web/src/components/domain/blocked-notice-card.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BlockedNoticeCardProps = {
	reasons: string[];
};

const REASON_LABELS: Record<string, string> = {
	pregnancy_or_breastfeeding: "妊娠中または授乳中",
	eating_disorder_history: "摂食障害の既往",
	doctor_diet_restriction: "医師からの食事制限指示",
};

export function BlockedNoticeCard({ reasons }: BlockedNoticeCardProps) {
	return (
		<Card className="border-danger-500 bg-danger-100">
			<CardHeader>
				<CardTitle className="text-danger-500">通常プランの作成を停止しています</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm text-neutral-900">
					以下の情報から、一般的なダイエットプランをそのまま提示することが適切でないと判断しました。
				</p>
				<ul className="list-disc pl-5 text-sm text-neutral-900 space-y-1">
					{reasons.map((r) => (
						<li key={r}>{REASON_LABELS[r] ?? r}</li>
					))}
				</ul>
				<p className="text-sm text-neutral-700">
					専門家 (医師・管理栄養士など) への相談をおすすめします。一般的な健康情報を含む参考コンテンツのみ継続してご利用いただけます。
				</p>
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 8: SectionSummaryCard 実装**

```tsx
// packages/web/src/components/domain/section-summary-card.tsx
"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SectionSummaryCardProps = {
	title: string;
	editHref: string;
	items: Array<{ label: string; value: string | null }>;
};

export function SectionSummaryCard({ title, editHref, items }: SectionSummaryCardProps) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="text-base">{title}</CardTitle>
				<Button asChild variant="ghost" size="sm">
					<Link href={editHref} aria-label={`${title} を編集`}>
						<Pencil className="h-4 w-4 mr-1" /> 編集
					</Link>
				</Button>
			</CardHeader>
			<CardContent>
				<dl className="grid grid-cols-[1fr_2fr] gap-y-2 text-sm">
					{items.map((it) => (
						<div key={it.label} className="contents">
							<dt className="text-neutral-500">{it.label}</dt>
							<dd>{it.value ?? <span className="text-neutral-400">未入力</span>}</dd>
						</div>
					))}
				</dl>
			</CardContent>
		</Card>
	);
}
```

- [ ] **Step 9: build 確認 + Commit**

```bash
pnpm --filter @fitness/web build
git add packages/web/src/components/domain/
git commit -m "feat(web): add onboarding domain components"
```

---

## Phase E: useOnboarding + layout + pages

### Task E1: useOnboarding hook

**Files:**
- Create: `packages/web/src/lib/profile/profile-mappers.ts`
- Create: `packages/web/src/hooks/use-onboarding.ts`
- Create: `packages/web/src/hooks/use-onboarding.test.ts`
- Modify: `packages/web/src/hooks/use-profile.ts`
- Modify: `packages/web/src/lib/profile/server.ts`
- Modify: `packages/web/src/lib/profile/build-update-input.ts`
- Modify: `packages/web/src/app/(app)/profile/page.tsx`

- [ ] **Step 1: テスト**

```typescript
// packages/web/src/hooks/use-onboarding.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

import { useOnboarding } from "./use-onboarding";

// apiClient は useProfile / useUpdateProfile の内部で使われる (Plan 06 実装)
vi.mock("@/lib/api-client", () => ({
	ApiError: class extends Error { status = 0 },
	apiClient: vi.fn(),
}));

describe("useOnboarding", () => {
	let queryClient: QueryClient;
	let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;

	beforeEach(async () => {
		queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		wrapper = ({ children }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
		const { apiClient } = await import("@/lib/api-client");
		(apiClient as ReturnType<typeof vi.fn>).mockReset();
		global.fetch = vi.fn();
	});

	it("patch delegates to useUpdateProfile (existing hook)", async () => {
		const { apiClient } = await import("@/lib/api-client");
		(apiClient as ReturnType<typeof vi.fn>).mockResolvedValue({
			profile: { onboarding_stage: "stats" },
		});
		const { result } = renderHook(() => useOnboarding(), { wrapper });
		await act(async () => {
			await result.current.patch({ age: 30 }, "stats");
		});
		expect(result.current.profile?.onboardingStage).toBe("stats");
		// useUpdateProfile は queryKey ["profile", "me"] を使う既存実装
		expect(apiClient).toHaveBeenCalledWith(
			"users/me/profile",
			expect.anything(),
			expect.objectContaining({ method: "PATCH" }),
		);
	});

	it("prefetchCoachPrompt triggers prefetchQuery", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
			new Response(JSON.stringify({ prompt: "x", cached: false }), { status: 200 }),
		);
		const { result } = renderHook(() => useOnboarding(), { wrapper });
		act(() => {
			result.current.prefetchCoachPrompt("stats", { age: 30 });
		});
		await waitFor(() => {
			const state = queryClient.getQueryState(["coach-prompt", "stats"]);
			expect(state).toBeDefined();
		});
	});
});
```

- [ ] **Step 2: 実装**

`contracts-ts` 由来の DTO は snake_case のまま維持しつつ、web の boundary で camelCase ViewModel に変換する。`useProfile()` / `useUpdateProfile()` / `getProfileServerSide()` は `profile-mappers.ts` を通して React へ `camelCase` を返し、PATCH / Route Handler 呼び出し時だけ snake_case DTO に戻す。`/profile` 既存画面と `build-update-input.ts` もこの ViewModel に追従させる。queryKey は `["profile", "me"]` で統一 (既存 hook と整合)。

```typescript
// packages/web/src/hooks/use-onboarding.ts
"use client";

import { useQueryClient } from "@tanstack/react-query";

import { useProfile, useUpdateProfile } from "@/hooks/use-profile";
import type { OnboardingStage } from "@/lib/onboarding/stage-routing";
import {
	noteFieldToProfileKey,
	toCoachPromptRequestDto,
	toFreeTextParseRequestDto,
	toProfilePatchDto,
	type OnboardingProfile,
	type OnboardingProfilePatch,
} from "@/lib/profile/profile-mappers";

type ProfileSnapshot = Partial<OnboardingProfile>;

async function fetchCoachPrompt(targetStage: OnboardingStage, profileSnapshot: ProfileSnapshot) {
	const res = await fetch("/api/onboarding/coach-prompt", {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "include",
		body: JSON.stringify(toCoachPromptRequestDto(targetStage, profileSnapshot)),
	});
	if (!res.ok) throw new Error("coach_prompt_failed");
	return (await res.json()) as { prompt: string; cached: boolean };
}

async function postFreeTextParse(
	stage: "lifestyle" | "preferences" | "snacks",
	freeText: string,
	structuredSnapshot: ProfileSnapshot,
) {
	const res = await fetch("/api/onboarding/free-text-parse", {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "include",
		body: JSON.stringify(toFreeTextParseRequestDto(stage, freeText, structuredSnapshot)),
	});
	if (!res.ok) throw new Error("parse_failed");
	return (await res.json()) as {
		note_field: "lifestyle_note" | "preferences_note" | "snacks_note";
		extracted_note: string;
		suggested_tags: string[];
	};
}

export function useOnboarding() {
	const qc = useQueryClient();
	const profileQuery = useProfile();
	const updateMutation = useUpdateProfile();

	const patch = async (
		input: Partial<OnboardingProfilePatch>,
		nextStage: OnboardingStage | "complete",
	) => {
		await updateMutation.mutateAsync(
			toProfilePatchDto({ ...input, onboardingStage: nextStage }),
		);
	};

	const prefetchCoachPrompt = (targetStage: OnboardingStage, snapshot: ProfileSnapshot) => {
		qc.prefetchQuery({
			queryKey: ["coach-prompt", targetStage],
			queryFn: () => fetchCoachPrompt(targetStage, snapshot),
			staleTime: Infinity,
		});
	};

	const parseFreeText = (
		stage: "lifestyle" | "preferences" | "snacks",
		freeText: string,
		snapshot: ProfileSnapshot,
	) => {
		if (!freeText.trim()) return;
		// fire-and-forget
		postFreeTextParse(stage, freeText, snapshot)
			.then((result) =>
				updateMutation.mutateAsync(
					toProfilePatchDto({
						[noteFieldToProfileKey(result.note_field)]: result.extracted_note,
					}),
				),
			)
			.catch((err) => console.error("free-text-parse failed", err));
	};

	return {
		currentStage: profileQuery.data?.onboardingStage ?? "safety",
		profile: profileQuery.data ?? null,
		isLoading: profileQuery.isLoading,
		patch,
		prefetchCoachPrompt,
		parseFreeText,
		isPatching: updateMutation.isPending,
		patchError: updateMutation.error,
	};
}
```

- [ ] **Step 3: テスト PASS + Commit**

```bash
pnpm --filter @fitness/web exec vitest run src/hooks/use-onboarding.test.ts
git add packages/web/src/hooks/use-onboarding.ts packages/web/src/hooks/use-onboarding.test.ts
git commit -m "feat(web): add useOnboarding hook"
```

---

### Task E2: app/onboarding/layout.tsx と /onboarding エントリ page

**Files:**
- Create: `packages/web/src/app/onboarding/layout.tsx`
- Create: `packages/web/src/app/onboarding/page.tsx`

- [ ] **Step 1: layout 実装**

Review 編集フローは **stage ベース** に統一する。`?return=review` クエリは使わない。理由は middleware が `x-next-pathname` に pathname しか載せず、layout では query を参照できないため。代わりに **profile.onboardingStage === "review" のユーザーは任意の onboarding セクション画面を編集目的で開ける** と定義し、各 page Form は `profile.onboardingStage === "review"` を検出して「次へ」を `/onboarding/review` に戻す。review 未到達のユーザーは引き続き厳格に stage 強制する。

```tsx
// packages/web/src/app/onboarding/layout.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { pathForStage, stageForPath, type OnboardingStage } from "@/lib/onboarding/stage-routing";
import { getProfileServerSide } from "@/lib/profile/server";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
	const session = await getSession();
	if (!session) redirect("/signin");

	const profile = await getProfileServerSide();
	const stage = profile?.onboardingStage ?? "safety";

	if (stage === "complete") redirect("/home");

	const pathname = (await headers()).get("x-next-pathname") ?? "";
	const pathStage = stageForPath(pathname);

	// /onboarding エントリは page.tsx が stage に応じた redirect を行う
	if (pathname === "/onboarding") {
		return <>{children}</>;
	}

	// blocked は /onboarding/blocked のみアクセス可
	if (stage === "blocked") {
		if (pathStage !== "blocked") redirect("/onboarding/blocked");
		return <>{children}</>;
	}

	// review stage は全セクション画面を編集目的で開ける
	// (各 Form が stage === "review" を見て「次へ」を review に戻す)
	if (stage === "review") {
		return <>{children}</>;
	}

	// それ以外: path の stage と profile.onboardingStage が一致しなければ強制 redirect
	if (pathStage !== stage) redirect(pathForStage(stage));

	return <>{children}</>;
}
```

この設計により：
- 比較の逆転問題が消える (クエリ依存を排除)
- `x-next-pathname` ヘッダに query が載らない問題を回避
- review stage のユーザーが編集 → 「次へ」で review 復帰が純粋に page 側のロジックで成立
- review 未到達の stage 強制は厳格に保たれる

- [ ] **Step 2: /onboarding page 実装**

```tsx
// packages/web/src/app/onboarding/page.tsx
import { redirect } from "next/navigation";

import { pathForStage, type OnboardingStage } from "@/lib/onboarding/stage-routing";
import { getProfileServerSide } from "@/lib/profile/server";

export default async function OnboardingEntryPage() {
	const profile = await getProfileServerSide();
	const stage = profile?.onboardingStage ?? "safety";
	redirect(pathForStage(stage));
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/onboarding/layout.tsx packages/web/src/app/onboarding/page.tsx
git commit -m "feat(web): add onboarding layout and entry page"
```

---

### Task E3: /onboarding/blocked page

**Files:**
- Create: `packages/web/src/app/onboarding/blocked/page.tsx`

- [ ] **Step 1: 実装**

```tsx
// packages/web/src/app/onboarding/blocked/page.tsx
import { BlockedNoticeCard } from "@/components/domain/blocked-notice-card";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { getProfileServerSide } from "@/lib/profile/server";

export default async function BlockedPage() {
	const profile = await getProfileServerSide();
	const reasons = (profile?.blockedReason ?? "").split(";").map((s) => s.trim()).filter(Boolean);

	return (
		<OnboardingShell stage="blocked">
			<BlockedNoticeCard reasons={reasons} />
		</OnboardingShell>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/app/onboarding/blocked/
git commit -m "feat(web): add blocked page"
```

---

### Task E4: /onboarding/safety page

**Files:**
- Create: `packages/web/src/app/onboarding/safety/page.tsx`
- Create: `packages/web/src/app/onboarding/safety/safety-form.tsx`

- [ ] **Step 1: Server page (hook を持たない薄い wrapper)**

```tsx
// packages/web/src/app/onboarding/safety/page.tsx
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { SafetyForm } from "./safety-form";

export default function SafetyPage() {
	return (
		<OnboardingShell stage="safety">
			<SafetyForm />
		</OnboardingShell>
	);
}
```

- [ ] **Step 2: Client form 実装**

```tsx
// packages/web/src/app/onboarding/safety/safety-form.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CoachPromptCard } from "@/components/domain/coach-prompt-card";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOnboarding } from "@/hooks/use-onboarding";
import { evaluateSafetyRisk } from "@/lib/onboarding/safety";
import { pathForStage } from "@/lib/onboarding/stage-routing";
import { toCoachPromptRequestDto } from "@/lib/profile/profile-mappers";
import { useQuery } from "@tanstack/react-query";

const YES_NO = [
	{ value: "yes", label: "はい" },
	{ value: "no", label: "いいえ" },
];

type Flags = {
	hasMedicalCondition: boolean | null;
	isUnderTreatment: boolean | null;
	onMedication: boolean | null;
	isPregnantOrBreastfeeding: boolean | null;
	hasDoctorDietRestriction: boolean | null;
	hasEatingDisorderHistory: boolean | null;
};

export function SafetyForm() {
	const router = useRouter();
	const { profile, patch, prefetchCoachPrompt, isPatching, patchError } = useOnboarding();

	const [flags, setFlags] = useState<Flags>({
		hasMedicalCondition: profile?.hasMedicalCondition ?? null,
		isUnderTreatment: profile?.isUnderTreatment ?? null,
		onMedication: profile?.onMedication ?? null,
		isPregnantOrBreastfeeding: profile?.isPregnantOrBreastfeeding ?? null,
		hasDoctorDietRestriction: profile?.hasDoctorDietRestriction ?? null,
		hasEatingDisorderHistory: profile?.hasEatingDisorderHistory ?? null,
	});
	const [medicalNote, setMedicalNote] = useState(profile?.medicalConditionNote ?? "");
	const [medicationNote, setMedicationNote] = useState(profile?.medicationNote ?? "");

	const coach = useQuery({
		queryKey: ["coach-prompt", "safety"],
		queryFn: async () => {
			const res = await fetch("/api/onboarding/coach-prompt", {
				method: "POST",
				headers: { "content-type": "application/json" },
				credentials: "include",
				body: JSON.stringify(toCoachPromptRequestDto("safety", {})),
			});
			if (!res.ok) throw new Error();
			return (await res.json()) as { prompt: string; cached: boolean };
		},
		staleTime: Infinity,
	});

	const allAnswered = Object.values(flags).every((v) => v !== null);

	const handleNext = async () => {
		if (!allAnswered) return;

		const result = evaluateSafetyRisk({
			hasMedicalCondition: !!flags.hasMedicalCondition,
			isUnderTreatment: !!flags.isUnderTreatment,
			onMedication: !!flags.onMedication,
			isPregnantOrBreastfeeding: !!flags.isPregnantOrBreastfeeding,
			hasDoctorDietRestriction: !!flags.hasDoctorDietRestriction,
			hasEatingDisorderHistory: !!flags.hasEatingDisorderHistory,
			medicalConditionNote: medicalNote || null,
			medicationNote: medicationNote || null,
		});

		const basePatch = {
			hasMedicalCondition: flags.hasMedicalCondition,
			isUnderTreatment: flags.isUnderTreatment,
			onMedication: flags.onMedication,
			isPregnantOrBreastfeeding: flags.isPregnantOrBreastfeeding,
			hasDoctorDietRestriction: flags.hasDoctorDietRestriction,
			hasEatingDisorderHistory: flags.hasEatingDisorderHistory,
			medicalConditionNote: medicalNote || null,
			medicationNote: medicationNote || null,
		};

		if (result.level === "blocked") {
			await patch({ ...basePatch, blockedReason: result.blockedReason }, "blocked");
			router.push("/onboarding/blocked");
			return;
		}

		prefetchCoachPrompt("stats", { ...basePatch });
		await patch(basePatch, "stats");
		router.push(pathForStage("stats"));
	};

	const flagRow = (key: keyof Flags, label: string) => (
		<div className="flex items-center justify-between py-2">
			<Label>{label}</Label>
			<SegmentedControl
				value={flags[key] === null ? null : (flags[key] ? "yes" : "no")}
				onChange={(v) => setFlags((f) => ({ ...f, [key]: v === "yes" }))}
				options={YES_NO}
				ariaLabel={label}
			/>
		</div>
	);

	return (
		<div className="space-y-6">
			<CoachPromptCard prompt={coach.data?.prompt ?? null} isLoading={coach.isLoading} />

			<section className="space-y-1 divide-y divide-neutral-100 bg-surface rounded-lg px-4">
				{flagRow("hasMedicalCondition", "持病はありますか")}
				{flagRow("isUnderTreatment", "通院中ですか")}
				{flagRow("onMedication", "服薬中ですか")}
				{flagRow("isPregnantOrBreastfeeding", "妊娠中または授乳中ですか")}
				{flagRow("hasDoctorDietRestriction", "医師から食事制限を受けていますか")}
				{flagRow("hasEatingDisorderHistory", "摂食障害の既往はありますか")}
			</section>

			{flags.hasMedicalCondition && (
				<div className="space-y-2">
					<Label htmlFor="medical-note">持病の内容 (任意)</Label>
					<Textarea id="medical-note" value={medicalNote} onChange={(e) => setMedicalNote(e.target.value)} />
				</div>
			)}
			{flags.onMedication && (
				<div className="space-y-2">
					<Label htmlFor="medication-note">服薬の内容 (任意)</Label>
					<Textarea id="medication-note" value={medicationNote} onChange={(e) => setMedicationNote(e.target.value)} />
				</div>
			)}

			{patchError && (
				<Alert className="border-danger-500 bg-danger-100">
					<AlertDescription>保存に失敗しました。もう一度お試しください。</AlertDescription>
				</Alert>
			)}

			<div className="flex justify-end">
				<Button onClick={handleNext} disabled={!allAnswered || isPatching}>
					{isPatching ? "保存中..." : "次へ"}
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/onboarding/safety/
git commit -m "feat(web): add safety onboarding page"
```

---

### Task E5: /onboarding/stats page

**Files:**
- Create: `packages/web/src/app/onboarding/stats/page.tsx`
- Create: `packages/web/src/app/onboarding/stats/stats-form.tsx`

- [ ] **Step 1: Server wrapper**

```tsx
// packages/web/src/app/onboarding/stats/page.tsx
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { StatsForm } from "./stats-form";

export default function StatsPage() {
	return (
		<OnboardingShell stage="stats" backHref="/onboarding/safety">
			<StatsForm />
		</OnboardingShell>
	);
}
```

- [ ] **Step 2: Client form**

```tsx
// packages/web/src/app/onboarding/stats/stats-form.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChoiceChips } from "@/components/domain/choice-chips";
import { CoachPromptCard } from "@/components/domain/coach-prompt-card";
import { NumberField } from "@/components/domain/number-field";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOnboarding } from "@/hooks/use-onboarding";
import { pathForStage } from "@/lib/onboarding/stage-routing";
import { toCoachPromptRequestDto } from "@/lib/profile/profile-mappers";

export function StatsForm() {
	const router = useRouter();
	const { profile, patch, prefetchCoachPrompt, isPatching, patchError } = useOnboarding();
	// review stage で編集中のユーザーは「次へ」で review に戻す。
	// stage === "review" のみを見ればよい (layout が review 以外の stage は既に強制 redirect 済み)。
	const returnToReview = profile?.onboardingStage === "review";

	const [age, setAge] = useState<number | null>((profile?.age as number | null) ?? null);
	const [sex, setSex] = useState<"male" | "female" | null>((profile?.sex as "male" | "female" | null) ?? null);
	const [heightCm, setHeightCm] = useState<number | null>(profile?.heightCm ?? null);
	const [weightKg, setWeightKg] = useState<number | null>(profile?.weightKg ?? null);
	const [goalMode, setGoalMode] = useState<"weight" | "description">(profile?.goalDescription ? "description" : "weight");
	const [goalWeightKg, setGoalWeightKg] = useState<number | null>(profile?.goalWeightKg ?? null);
	const [goalDescription, setGoalDescription] = useState(profile?.goalDescription ?? "");
	const [pace, setPace] = useState<"steady" | "aggressive" | null>(profile?.desiredPace ?? null);

	const coach = useQuery({
		queryKey: ["coach-prompt", "stats"],
		queryFn: async () => {
			const res = await fetch("/api/onboarding/coach-prompt", {
				method: "POST",
				headers: { "content-type": "application/json" },
				credentials: "include",
				body: JSON.stringify(toCoachPromptRequestDto("stats", profile ?? {})),
			});
			if (!res.ok) throw new Error();
			return (await res.json()) as { prompt: string };
		},
		staleTime: Infinity,
	});

	const canProceed = age !== null && sex !== null && heightCm !== null && weightKg !== null && pace !== null
		&& (goalMode === "weight" ? goalWeightKg !== null : goalDescription.trim().length > 0);

	const handleNext = async () => {
		const basePatch = {
			age,
			sex,
			heightCm,
			weightKg,
			desiredPace: pace,
			goalWeightKg: goalMode === "weight" ? goalWeightKg : null,
			goalDescription: goalMode === "description" ? goalDescription : null,
		};
		const nextStage = returnToReview ? "review" : "lifestyle";
		prefetchCoachPrompt(nextStage, { ...profile, ...basePatch });
		await patch(basePatch, nextStage);
		router.push(returnToReview ? "/onboarding/review" : pathForStage("lifestyle"));
	};

	return (
		<div className="space-y-6">
			<CoachPromptCard prompt={coach.data?.prompt ?? null} isLoading={coach.isLoading} />

			<NumberField id="age" label="年齢" unit="歳" value={age} onChange={setAge} min={18} max={120} />

			<div className="space-y-2">
				<Label>性別</Label>
				<ChoiceChips
					value={sex}
					onChange={setSex}
					options={[{ value: "male", label: "男性" }, { value: "female", label: "女性" }]}
					ariaLabel="性別"
				/>
			</div>

			<NumberField id="height" label="身長" unit="cm" value={heightCm} onChange={setHeightCm} min={100} max={250} step={0.1} />
			<NumberField id="weight" label="現在の体重" unit="kg" value={weightKg} onChange={setWeightKg} min={20} max={300} step={0.1} />

			<div className="space-y-3">
				<Label>目標</Label>
				<SegmentedControl
					value={goalMode}
					onChange={setGoalMode}
					options={[{ value: "weight", label: "目標体重" }, { value: "description", label: "見た目・感覚" }]}
					ariaLabel="目標の種類"
				/>
				{goalMode === "weight" ? (
					<NumberField id="goal-weight" label="目標体重" unit="kg" value={goalWeightKg} onChange={setGoalWeightKg} min={20} max={300} step={0.1} />
				) : (
					<Textarea placeholder="理想の見た目・体感を教えてください" value={goalDescription} onChange={(e) => setGoalDescription(e.target.value)} />
				)}
			</div>

			<div className="space-y-2">
				<Label>ペース</Label>
				<SegmentedControl
					value={pace}
					onChange={setPace}
					options={[{ value: "steady", label: "じっくり" }, { value: "aggressive", label: "早めに" }]}
					ariaLabel="減量ペース"
				/>
			</div>

			{patchError && (
				<Alert className="border-danger-500 bg-danger-100">
					<AlertDescription>保存に失敗しました。</AlertDescription>
				</Alert>
			)}

			<div className="flex justify-end">
				<Button onClick={handleNext} disabled={!canProceed || isPatching}>
					{isPatching ? "保存中..." : "次へ"}
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/app/onboarding/stats/
git commit -m "feat(web): add stats onboarding page"
```

---

### Task E6-E10: Lifestyle / Preferences / Snacks / Feasibility / Review pages

**Files (各 Task で 2 ファイル作成)**:
- `app/onboarding/lifestyle/{page,lifestyle-form}.tsx`
- `app/onboarding/preferences/{page,preferences-form}.tsx`
- `app/onboarding/snacks/{page,snacks-form}.tsx`
- `app/onboarding/feasibility/{page,feasibility-form}.tsx`
- `app/onboarding/review/{page,review-content}.tsx`

構造は Task E5 の StatsForm と同一パターン。各画面で使う入力コンポーネント + useOnboarding + `profile.onboardingStage === "review"` 判定 + `parseFreeText` (Lifestyle / Preferences / Snacks) を組み込む。

#### Task E6: Lifestyle (設計書 §画面別入力項目参照)

- [ ] **Step 1: Server wrapper** — `LifestyleForm` を読み込んで `OnboardingShell stage="lifestyle" backHref="/onboarding/stats"` で包む。
- [ ] **Step 2: Client form** — `ChoiceChips` (job_type 5択) + `Stepper` (workouts_per_week, 0-14) + `MultiTagInput` (workout_types) + `NumberField` (sleep_hours) + `SegmentedControl` (stress_level 3択) + `Textarea` (alcohol_per_week) + `Textarea` (free-text lifestyle_note 入力) + 「次へ」押下時に `parseFreeText("lifestyle", freeText, snapshot)` を fire-and-forget 実行後、`patch` → 次は `preferences`。
- [ ] **Step 3: Commit** `feat(web): add lifestyle onboarding page`

#### Task E7: Preferences

- [ ] **Step 1: Server wrapper** — `stage="preferences"`, `backHref="/onboarding/lifestyle"`
- [ ] **Step 2: Client form** — `MultiTagInput` (favorite_meals max=5) + `MultiTagInput` (hated_foods) + `MultiTagInput` (restrictions) + `ChoiceChips` (cooking_preference 4択) + `SliderField` (food_adventurousness 1-10) + `Textarea` (free-text) + `parseFreeText("preferences", ...)` → 次は `snacks`。
- [ ] **Step 3: Commit** `feat(web): add preferences onboarding page`

#### Task E8: Snacks

- [ ] **Step 1: Server wrapper** — `stage="snacks"`, `backHref="/onboarding/preferences"`
- [ ] **Step 2: Client form** — `MultiTagInput` (current_snacks) + `SegmentedControl` (snacking_reason 4択) + `SegmentedControl` (snack_taste_preference 3択) + `SegmentedControl` (late_night_snacking Yes/No) + `Textarea` (free-text) + `parseFreeText("snacks", ...)` → 次は `feasibility`。
- [ ] **Step 3: Commit** `feat(web): add snacks onboarding page`

#### Task E9: Feasibility

- [ ] **Step 1: Server wrapper** — `stage="feasibility"`, `backHref="/onboarding/snacks"`
- [ ] **Step 2: Client form** — `SegmentedControl` (eating_out_style 3択) + `ChoiceChips` (budget_level 3択) + `Stepper` (meal_frequency_preference 1-6) + `Input` (location_region) + `Textarea` (kitchen_access) + `SegmentedControl` (convenience_store_usage 3択) → 次は `review`。free-text は無し。
- [ ] **Step 3: Commit** `feat(web): add feasibility onboarding page`

#### Task E10: Review

- [ ] **Step 1: Server wrapper** — `stage="review"`, `backHref="/onboarding/feasibility"`, `ReviewContent` を中に。
- [ ] **Step 2: Client content** — 6 枚の `SectionSummaryCard` (Stats / Lifestyle / Preferences / Snacks / Feasibility / Safety) を並べ、各カードの `editHref` は単に `/onboarding/<section>`（query は不要、Form 側が `profile.onboardingStage === "review"` を検出して次遷移を review に戻す）。最後に `Button` 「プランを作成する」押下時に `patch({}, "complete")` 後 `router.push("/home")`。
- [ ] **Step 3: Commit** `feat(web): add review onboarding page`

(各 page のコードは Task E5 (StatsForm) のパターンを 1:1 で流用するため、詳細コードは E5 を参照。本 Plan ではテンプレートの繰り返しを避ける。)

---

## Phase F: 統合 + 既存画面のガード追加

### Task F1: (app)/layout.tsx に onboarding 未完了ガード

**Files:**
- Modify: `packages/web/src/app/(app)/layout.tsx`

- [ ] **Step 1: 変更**

```tsx
// packages/web/src/app/(app)/layout.tsx
import { redirect } from "next/navigation";

import { AppShell } from "@/components/domain/app-shell";
import { getSession } from "@/lib/auth/session";
import { getProfileServerSide } from "@/lib/profile/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const session = await getSession();
	if (!session) redirect("/signin");

	const profile = await getProfileServerSide();
	if (profile?.onboardingStage !== "complete") {
		redirect("/onboarding");
	}

	return <AppShell>{children}</AppShell>;
}
```

- [ ] **Step 2: build 確認 + Commit**

```bash
pnpm --filter @fitness/web build
git add packages/web/src/app/(app)/layout.tsx
git commit -m "feat(web): block /home for incomplete onboarding"
```

---

### Task F2: 既存ドキュメントへの反映

**Files:**
- Modify: `docs/ui-architecture.md`
- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/specs/2026-04-11-design-decisions.md`

- [ ] **Step 1: ui-architecture.md §5 ルーティングに /onboarding/blocked を追記**
- [ ] **Step 2: ui-architecture.md §7 に Coach prompt 先読み / Free-text parse / Safety 決定的ルールを追記**
- [ ] **Step 3: architecture.md §15 に blocked 画面遷移フローを追記**
- [ ] **Step 4: design-decisions.md §6 の反映チェックを更新**
- [ ] **Step 5: Commit**

```bash
git add docs/ui-architecture.md docs/architecture.md docs/superpowers/specs/2026-04-11-design-decisions.md
git commit -m "docs: reflect onboarding decisions in architecture docs"
```

---

### Task F3: 最終検証

- [ ] **Step 1: 全テスト実行**

```bash
make test
pnpm --filter @fitness/infra test
pnpm --filter @fitness/web test
```

Expected: contracts-py / fitness-engine / contracts-ts / infra / web の全テスト PASS。

- [ ] **Step 2: Web build**

```bash
pnpm --filter @fitness/web build
```

Expected: build 成功。

- [ ] **Step 3: 手動疎通確認 (ローカル)**

```bash
pnpm --filter @fitness/web dev
```

ブラウザで以下を確認：
- 新規サインアップ → `/onboarding/safety` 到達
- Safety 全項目「いいえ」→ `/onboarding/stats` 遷移
- Stats 入力 → Lifestyle → ... → Review 到達
- Review で Stats 編集ボタン → `/onboarding/stats` → 次へで Review に戻る
- 「プランを作成する」→ `/home` 到達
- ログアウト → 再ログイン → `/home` 直接アクセスで `/onboarding` へは redirect されず、stage=complete なのでそのまま表示
- 別 user で Safety で妊娠中「はい」→ `/onboarding/blocked` 到達、他画面 URL 直打ちしても blocked に戻る

- [ ] **Step 4: Lint**

```bash
pnpm --filter @fitness/web lint
```

Expected: エラーなし。

- [ ] **Step 5: 最終 commit (検証メモのみ、実コード変更なし想定)**

tasks/todo.md の Plan 07 セクションに検証結果を記録するのみ。

```bash
git add tasks/todo.md
git commit -m "chore: record plan 07 verification results"
```

---

## Self-Review 結果

- [x] spec の「含む」項目すべてに対応する Task がある
- [x] spec の「含まない」項目は Task に入っていない (経路 A / Home 実コンテンツ / Chat / WeeklyCheckIn は Plan 08+)
- [x] 追加 34 フィールドは Task A1 / A2 / B1 / B2 で網羅
- [x] Safety 決定的判定は Task B3 (サーバー) + C3 (クライアント) の cross-validation で担保
- [x] Coach prompt 先読み + Free-text parse fire-and-forget は Task E1 (useOnboarding) で一元化
- [x] Review 編集導線は `profile.onboardingStage === "review"` を用いる stage ベース方式で統一 (Task E5 以降)
- [x] 全 page は Task E2 layout の gate + UI 専念 の方針に従う
- [x] contracts 生成コマンドは `make contracts` で統一 (Task A5)
- [x] `UserProfile.schema.json` 手書き削除 + MODEL_REGISTRY 登録は Task A4 で明示
- [x] proxy.ts は Task C5 で `x-next-pathname` 1 行追加のみ、auth gate の本格化はしない
- [x] 依存追加は Task C1 で `ai` / `@ai-sdk/anthropic` + shadcn CLI 経由の Radix 追加

---

## 実装時の注意事項

- React Compiler が有効なため `useMemo` / `useCallback` は書かない
- `Readonly` は公開境界 (Props) のみ
- 1 Task ≒ 1 commit
- Phase A (contracts) は Phase B / C より前に完了させる (型整合性)
- Phase B (Lambda) と Phase C (Web 基盤) は依存しないため並行可能 (別 Task ごとに作業者を分割可)
- Phase D (components) は Phase C1 (shadcn 依存追加) 後
- Phase E (pages) は Phase D (components) + Phase E1 (hook) 完了後
- Phase F は最後
- `ANTHROPIC_API_KEY` 未設定でも build は通るが、ローカル dev で Coach prompt / Free-text parse が 500 を返す。`.env.local` にテスト用 key を設定して確認する
