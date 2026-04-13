# Lambda Tools (Plan 05) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 経路 B (単純 CRUD) の 5 Lambda + 共通モジュール + CDK construct を実装し、ユーザーデータの読み書き API を提供する。

**Architecture:** contracts-py で入力 DTO を定義し、JSON Schema → TS 型を再生成。infra/lambdas/shared/ に共通モジュール (types, auth, keys, dynamo, response, validation) を配置し、5 つの Lambda handler が利用。生成 TS 型を field 名 / literal union の source of truth にし、ID・日付文字列は boundary parse 後に Branded Type へ昇格させる。`requireUserId` / `requireJsonBody` / `withServerError` で fail-fast と共通エラー経路を 1 箇所に集約する。CrudLambdas CDK construct が Lambda 作成・ルート登録・IAM 最小権限付与を一括管理。

**Tech Stack:** CDK v2, aws-lambda-nodejs (esbuild), DynamoDB (single-table), Pydantic v2, vitest, aws-sdk-client-mock

---

## 設計書

`docs/superpowers/specs/2026-04-13-lambda-tools-design.md`

## ファイル構成

### 新規作成

| ファイル                                                                          | 責務                                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `packages/contracts-py/src/fitness_contracts/models/update_user_profile_input.py` | UpdateUserProfileInput DTO                              |
| `packages/contracts-py/src/fitness_contracts/models/log_meal_input.py`            | LogMealInput DTO                                        |
| `packages/contracts-py/src/fitness_contracts/models/log_weight_input.py`          | LogWeightInput DTO                                      |
| `packages/contracts-py/tests/test_crud_inputs.py`                                 | 3 DTO のバリデーションテスト                            |
| `infra/lambdas/shared/auth.ts`                                                    | JWT sub 抽出 + 401 fail-fast helper                     |
| `infra/lambdas/shared/types.ts`                                                   | Branded Type / DTO 由来型                               |
| `infra/lambdas/shared/keys.ts`                                                    | pk/sk 組み立て helper                                   |
| `infra/lambdas/shared/dynamo.ts`                                                  | DynamoDB DocumentClient + TABLE_NAME                    |
| `infra/lambdas/shared/response.ts`                                                | HTTP レスポンスヘルパー + body parse + 共通 error helper |
| `infra/lambdas/shared/validation.ts`                                              | 日付パース・enum・数値範囲の共通バリデーション          |
| `infra/test/lambdas/helpers/api-event.ts`                                         | APIGatewayProxyEventV2 ビルダー (テスト用)              |
| `infra/test/lambdas/shared/auth.test.ts`                                          | getUserId テスト                                        |
| `infra/test/lambdas/shared/keys.test.ts`                                          | key helper テスト                                       |
| `infra/test/lambdas/shared/response.test.ts`                                      | レスポンスヘルパーテスト                                |
| `infra/test/lambdas/shared/validation.test.ts`                                    | isValidDate / isValidEnum / isInRange / isRecord テスト |
| `infra/lambdas/fetch-user-profile/index.ts`                                       | fetchUserProfile handler                                |
| `infra/lambdas/update-user-profile/index.ts`                                      | updateUserProfile handler + validation                  |
| `infra/lambdas/log-meal/index.ts`                                                 | logMeal handler + validation                            |
| `infra/lambdas/log-weight/index.ts`                                               | logWeight handler + validation                          |
| `infra/lambdas/fetch-weekly-plan/index.ts`                                        | fetchWeeklyPlan handler                                 |
| `infra/test/lambdas/fetch-user-profile.test.ts`                                   | fetchUserProfile テスト                                 |
| `infra/test/lambdas/update-user-profile.test.ts`                                  | updateUserProfile テスト                                |
| `infra/test/lambdas/log-meal.test.ts`                                             | logMeal テスト                                          |
| `infra/test/lambdas/log-weight.test.ts`                                           | logWeight テスト                                        |
| `infra/test/lambdas/fetch-weekly-plan.test.ts`                                    | fetchWeeklyPlan テスト                                  |
| `infra/lib/constructs/crud-lambdas.ts`                                            | CrudLambdas CDK construct                               |

### 変更

| ファイル                                                       | 変更内容                              |
| -------------------------------------------------------------- | ------------------------------------- |
| `packages/contracts-py/src/fitness_contracts/schema_export.py` | MODEL_REGISTRY に 3 モデル追加        |
| `packages/contracts-ts/schemas/`                               | 3 つの `.schema.json` 追加 (自動生成) |
| `packages/contracts-ts/generated/types.d.ts`                   | 再生成                                |
| `packages/contracts-ts/generated/zod.ts`                       | 再生成                                |
| `infra/package.json`                                           | AWS SDK v3 + aws-sdk-client-mock 追加 |
| `infra/vitest.config.ts`                                       | env に TABLE_NAME 追加 (テスト用)     |
| `infra/lib/constructs/api.ts`                                  | CORS に PATCH 追加                    |
| `infra/lib/fitness-stack.ts`                                   | CrudLambdas 追加                      |
| `infra/test/fitness-stack.test.ts`                             | CRUD ルートの CDK テスト追加          |

---

## Task 1: Input DTO モデル (contracts-py)

**Files:**

- Create: `packages/contracts-py/src/fitness_contracts/models/update_user_profile_input.py`
- Create: `packages/contracts-py/src/fitness_contracts/models/log_meal_input.py`
- Create: `packages/contracts-py/src/fitness_contracts/models/log_weight_input.py`
- Create: `packages/contracts-py/tests/test_crud_inputs.py`

- [ ] **Step 1: UpdateUserProfileInput モデルを作成**

```python
# packages/contracts-py/src/fitness_contracts/models/update_user_profile_input.py
"""UpdateUserProfileInput: プロフィール部分更新の入力型。"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class UpdateUserProfileInput(BaseModel):
    """プロフィール部分更新の入力。全フィールド optional (PATCH セマンティクス)。

    - 最低 1 フィールドは必須 (空 {} は 400)。model_validator で検証
    - None 値は「フィールド未送信」と同義 (属性削除ではない)
    - 属性削除 API は未提供。MVP では一度設定した値は上書きのみ可能
    """

    model_config = ConfigDict(
        json_schema_extra={
            "title": "UpdateUserProfileInput",
            "description": "プロフィール部分更新の入力。",
        }
    )

    name: str | None = None
    age: int | None = Field(default=None, ge=18, le=120)
    sex: Literal["male", "female"] | None = None
    height_cm: float | None = Field(default=None, gt=0, lt=300)
    weight_kg: float | None = Field(default=None, gt=0, lt=500)
    activity_level: Literal[
        "sedentary",
        "lightly_active",
        "moderately_active",
        "very_active",
        "extremely_active",
    ] | None = None
    desired_pace: Literal["steady", "aggressive"] | None = None
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"] | None = None

    @model_validator(mode="before")
    @classmethod
    def check_at_least_one_field(cls, data: Any) -> Any:
        """空 {} や全フィールド null のリクエストを拒否する。"""
        if isinstance(data, dict):
            field_names = {
                "name", "age", "sex", "height_cm", "weight_kg",
                "activity_level", "desired_pace", "sleep_hours", "stress_level",
            }
            has_value = any(data.get(f) is not None for f in field_names)
            if not has_value:
                raise ValueError("At least one field must be provided")
        return data
```

- [ ] **Step 2: LogMealInput モデルを作成**

```python
# packages/contracts-py/src/fitness_contracts/models/log_meal_input.py
"""LogMealInput: 食事ログの入力型。"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LogMealInput(BaseModel):
    """食事ログの入力。

    date は datetime.date 型。Pydantic v2 が YYYY-MM-DD 文字列を
    自動パースするため、JSON Schema 上は format: "date" になる。
    不存在日付 (2026-99-99) も Pydantic 側で弾かれ、
    Lambda 側の isValidDate() と同じ検証強度になる。
    """

    model_config = ConfigDict(
        json_schema_extra={
            "title": "LogMealInput",
            "description": "食事ログの入力。",
        }
    )

    date: date = Field(description="YYYY-MM-DD")
    food_id: str = Field(min_length=1, description="FCT2020 食品番号")
    amount_g: float = Field(gt=0, description="グラム数")
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] = Field(
        description="食事タイプ",
    )
```

- [ ] **Step 3: LogWeightInput モデルを作成**

```python
# packages/contracts-py/src/fitness_contracts/models/log_weight_input.py
"""LogWeightInput: 体重ログの入力型。"""

from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class LogWeightInput(BaseModel):
    """体重ログの入力。"""

    model_config = ConfigDict(
        json_schema_extra={
            "title": "LogWeightInput",
            "description": "体重ログの入力。",
        }
    )

    date: date = Field(
        description="YYYY-MM-DD",
    )
    weight_kg: float = Field(gt=0, lt=500, description="体重 (kg)")
```

- [ ] **Step 4: テストを作成**

```python
# packages/contracts-py/tests/test_crud_inputs.py
"""CRUD Lambda 入力 DTO のテスト。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.update_user_profile_input import (
    UpdateUserProfileInput,
)
from fitness_contracts.models.log_meal_input import LogMealInput
from fitness_contracts.models.log_weight_input import LogWeightInput


# ── UpdateUserProfileInput ───────────────────────────────────────────


class TestUpdateUserProfileInput:
    """UpdateUserProfileInput のバリデーションテスト。"""

    def test_valid_single_field(self):
        """1 フィールドだけで有効。"""
        result = UpdateUserProfileInput(name="太郎")
        assert result.name == "太郎"
        assert result.age is None

    def test_valid_multiple_fields(self):
        """複数フィールド同時更新。"""
        result = UpdateUserProfileInput(name="太郎", age=30, sex="male")
        assert result.name == "太郎"
        assert result.age == 30
        assert result.sex == "male"

    def test_rejects_empty_dict(self):
        """空 {} は ValidationError。"""
        with pytest.raises(ValidationError) as exc_info:
            UpdateUserProfileInput()
        errors = exc_info.value.errors()
        assert any("at least one field" in str(e["msg"]).lower() for e in errors)

    def test_rejects_all_none(self):
        """全フィールド None も ValidationError。"""
        with pytest.raises(ValidationError):
            UpdateUserProfileInput(
                name=None, age=None, sex=None, height_cm=None,
                weight_kg=None, activity_level=None, desired_pace=None,
                sleep_hours=None, stress_level=None,
            )

    @pytest.mark.parametrize(
        ("field", "bad_value", "expected_loc"),
        [
            ("age", 17, ("age",)),         # ge=18
            ("age", 121, ("age",)),        # le=120
            ("height_cm", 0, ("height_cm",)),    # gt=0
            ("height_cm", 300, ("height_cm",)),  # lt=300
            ("weight_kg", 0, ("weight_kg",)),    # gt=0
            ("weight_kg", 500, ("weight_kg",)),  # lt=500
            ("sleep_hours", -1, ("sleep_hours",)),  # ge=0
            ("sleep_hours", 25, ("sleep_hours",)),  # le=24
            ("sex", "other", ("sex",)),
            ("activity_level", "invalid", ("activity_level",)),
            ("desired_pace", "slow", ("desired_pace",)),
            ("stress_level", "extreme", ("stress_level",)),
        ],
    )
    def test_rejects_out_of_range(
        self, field: str, bad_value: object, expected_loc: tuple[str, ...]
    ):
        """境界値・不正値は ValidationError で該当フィールドに紐付く。"""
        with pytest.raises(ValidationError) as exc_info:
            UpdateUserProfileInput(**{field: bad_value})
        error_locs = {e["loc"] for e in exc_info.value.errors()}
        assert expected_loc in error_locs

    def test_unknown_fields_ignored(self):
        """未知のフィールドは無視される。"""
        result = UpdateUserProfileInput(name="太郎", unknown_field="value")
        assert result.name == "太郎"

    def test_json_schema_fields_are_optional(self):
        """JSON Schema で全フィールドが optional (required リストなし)。"""
        schema = UpdateUserProfileInput.model_json_schema()
        # model_validator で at-least-one を強制するが、
        # JSON Schema 上は required なし (全 optional)
        required = schema.get("required", [])
        assert len(required) == 0


# ── LogMealInput ─────────────────────────────────────────────────────


class TestLogMealInput:
    """LogMealInput のバリデーションテスト。"""

    def test_valid(self):
        result = LogMealInput(
            date="2026-04-13",
            food_id="01001",
            amount_g=150.0,
            meal_type="breakfast",
        )
        from datetime import date as date_type
        assert result.date == date_type(2026, 4, 13)
        assert result.food_id == "01001"
        assert result.amount_g == 150.0
        assert result.meal_type == "breakfast"

    @pytest.mark.parametrize(
        ("field", "bad_value", "expected_loc"),
        [
            ("date", "2026-4-13", ("date",)),       # 不正フォーマット
            ("date", "20260413", ("date",)),         # ハイフンなし
            ("date", "", ("date",)),                 # 空文字
            ("date", "2026-99-01", ("date",)),       # 不存在月
            ("date", "2026-02-30", ("date",)),       # 不存在日
            ("food_id", "", ("food_id",)),           # 空文字 (min_length=1)
            ("amount_g", 0, ("amount_g",)),          # gt=0
            ("amount_g", -1, ("amount_g",)),         # 負数
            ("meal_type", "brunch", ("meal_type",)), # 不正値
        ],
    )
    def test_rejects_invalid(
        self, field: str, bad_value: object, expected_loc: tuple[str, ...]
    ):
        base = {
            "date": "2026-04-13",
            "food_id": "01001",
            "amount_g": 150.0,
            "meal_type": "breakfast",
        }
        base[field] = bad_value
        with pytest.raises(ValidationError) as exc_info:
            LogMealInput(**base)
        error_locs = {e["loc"] for e in exc_info.value.errors()}
        assert expected_loc in error_locs


# ── LogWeightInput ───────────────────────────────────────────────────


class TestLogWeightInput:
    """LogWeightInput のバリデーションテスト。"""

    def test_valid(self):
        from datetime import date as date_type
        result = LogWeightInput(date="2026-04-13", weight_kg=70.5)
        assert result.date == date_type(2026, 4, 13)
        assert result.weight_kg == 70.5

    @pytest.mark.parametrize(
        ("field", "bad_value", "expected_loc"),
        [
            ("date", "2026/04/13", ("date",)),   # 不正フォーマット
            ("date", "2026-99-01", ("date",)),   # 不存在月
            ("weight_kg", 0, ("weight_kg",)),    # gt=0
            ("weight_kg", 500, ("weight_kg",)),  # lt=500
            ("weight_kg", -1, ("weight_kg",)),   # 負数
        ],
    )
    def test_rejects_invalid(
        self, field: str, bad_value: object, expected_loc: tuple[str, ...]
    ):
        base = {"date": "2026-04-13", "weight_kg": 70.5}
        base[field] = bad_value
        with pytest.raises(ValidationError) as exc_info:
            LogWeightInput(**base)
        error_locs = {e["loc"] for e in exc_info.value.errors()}
        assert expected_loc in error_locs
```

- [ ] **Step 5: テスト実行 — 全パス確認**

Run: `.venv/bin/pytest packages/contracts-py/tests/test_crud_inputs.py -v`
Expected: 全テストが PASS

- [ ] **Step 6: コミット**

```bash
git add packages/contracts-py/src/fitness_contracts/models/update_user_profile_input.py \
       packages/contracts-py/src/fitness_contracts/models/log_meal_input.py \
       packages/contracts-py/src/fitness_contracts/models/log_weight_input.py \
       packages/contracts-py/tests/test_crud_inputs.py
git commit -m "feat(contracts-py): add CRUD input DTOs (UpdateUserProfile, LogMeal, LogWeight)"
```

---

## Task 2: Schema パイプライン更新

**Files:**

- Modify: `packages/contracts-py/src/fitness_contracts/schema_export.py`
- Regenerate: `packages/contracts-ts/schemas/*.schema.json`
- Regenerate: `packages/contracts-ts/generated/types.d.ts`
- Regenerate: `packages/contracts-ts/generated/zod.ts`

- [ ] **Step 1: schema_export.py に 3 モデルを登録**

`packages/contracts-py/src/fitness_contracts/schema_export.py` の import セクションに追加:

```python
from fitness_contracts.models.update_user_profile_input import (
    UpdateUserProfileInput,
)
from fitness_contracts.models.log_meal_input import LogMealInput
from fitness_contracts.models.log_weight_input import LogWeightInput
```

`MODEL_REGISTRY` リストの末尾に追加:

```python
    ("UpdateUserProfileInput", UpdateUserProfileInput),
    ("LogMealInput", LogMealInput),
    ("LogWeightInput", LogWeightInput),
```

- [ ] **Step 2: JSON Schema エクスポート**

Run: `.venv/bin/python -m fitness_contracts.schema_export packages/contracts-ts/schemas`
Expected: `UpdateUserProfileInput.schema.json`, `LogMealInput.schema.json`, `LogWeightInput.schema.json` が生成される

- [ ] **Step 3: contracts-ts 再生成**

Run: `cd packages/contracts-ts && pnpm run generate`
Expected: `generated/types.d.ts` と `generated/zod.ts` が更新され、新しい型 (`UpdateUserProfileInput`, `LogMealInput`, `LogWeightInput`) が含まれる

- [ ] **Step 4: 生成結果を確認**

`generated/types.d.ts` に以下が含まれることを確認:

- `export interface UpdateUserProfileInput` (全フィールド optional)
- `export interface LogMealInput` (date, food_id, amount_g, meal_type)
- `export interface LogWeightInput` (date, weight_kg)

`generated/zod.ts` に以下が含まれることを確認:

- `export const UpdateUserProfileInputSchema`
- `export const LogMealInputSchema`
- `export const LogWeightInputSchema`

- [ ] **Step 5: コミット**

```bash
git add packages/contracts-py/src/fitness_contracts/schema_export.py \
       packages/contracts-ts/schemas/UpdateUserProfileInput.schema.json \
       packages/contracts-ts/schemas/LogMealInput.schema.json \
       packages/contracts-ts/schemas/LogWeightInput.schema.json \
       packages/contracts-ts/generated/types.d.ts \
       packages/contracts-ts/generated/zod.ts
git commit -m "feat(contracts): register CRUD DTOs and regenerate TS types/Zod"
```

---

## Task 3: 共通 Lambda モジュール + テスト基盤

**Files:**

- Modify: `infra/package.json`
- Modify: `infra/vitest.config.ts`
- Create: `infra/lambdas/shared/auth.ts`
- Create: `infra/lambdas/shared/types.ts`
- Create: `infra/lambdas/shared/keys.ts`
- Create: `infra/lambdas/shared/dynamo.ts`
- Create: `infra/lambdas/shared/response.ts`
- Create: `infra/lambdas/shared/validation.ts`
- Create: `infra/test/lambdas/helpers/api-event.ts`
- Create: `infra/test/lambdas/shared/auth.test.ts`
- Create: `infra/test/lambdas/shared/keys.test.ts`
- Create: `infra/test/lambdas/shared/response.test.ts`
- Create: `infra/test/lambdas/shared/validation.test.ts`

- [ ] **Step 1: devDependencies を追加**

`infra/package.json` の `devDependencies` に以下を追加:

```json
"@aws-sdk/client-dynamodb": "^3.700.0",
"@aws-sdk/lib-dynamodb": "^3.700.0",
"aws-sdk-client-mock": "^4.1.0"
```

Run: `cd infra && pnpm install`

- [ ] **Step 1b: vitest.config.ts に TABLE_NAME を追加**

`infra/vitest.config.ts` を修正し、Lambda テストで dynamo.ts が import 時に throw しないよう `env` でセットする:

```typescript
// infra/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      TABLE_NAME: "test-table",
    },
  },
});
```

- [ ] **Step 2: shared/types.ts を作成**

```typescript
// infra/lambdas/shared/types.ts
import type {
  LogMealInput,
  UpdateUserProfileInput,
} from "../../../packages/contracts-ts/generated/types";

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type MealId = Brand<string, "MealId">;
export type FoodId = Brand<string, "FoodId">;
export type IsoDateString = Brand<string, "IsoDateString">;

export const toUserId = (value: string): UserId => value as UserId;
export const toMealId = (value: string): MealId => value as MealId;
export const toFoodId = (value: string): FoodId => value as FoodId;
export const toIsoDateString = (value: string): IsoDateString =>
  value as IsoDateString;

export const PROFILE_FIELDS = [
  "name",
  "age",
  "sex",
  "height_cm",
  "weight_kg",
  "activity_level",
  "desired_pace",
  "sleep_hours",
  "stress_level",
] as const satisfies readonly (keyof UpdateUserProfileInput)[];

export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfilePatch = Partial<Record<ProfileField, unknown>>;

export const VALID_MEAL_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
] as const satisfies readonly LogMealInput["meal_type"][];

export type MealType = (typeof VALID_MEAL_TYPES)[number];
```

- [ ] **Step 2b: shared/keys.ts を作成**

```typescript
// infra/lambdas/shared/keys.ts
import type { IsoDateString, MealId, UserId } from "./types";

export function profileKey(userId: UserId) {
  return { pk: `user#${userId}`, sk: "profile" };
}

export function mealKey(userId: UserId, date: IsoDateString, mealId: MealId) {
  return { pk: `user#${userId}`, sk: `meal#${date}#${mealId}` };
}

export function weightKey(userId: UserId, date: IsoDateString) {
  return { pk: `user#${userId}`, sk: `weight#${date}` };
}

export function planKey(userId: UserId, weekStart: IsoDateString) {
  return { pk: `user#${userId}`, sk: `plan#${weekStart}` };
}
```

- [ ] **Step 2c: auth.ts を作成**

```typescript
// infra/lambdas/shared/auth.ts
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { unauthorized } from "./response";
import { toUserId, type UserId } from "./types";

type AuthResult = { ok: true; userId: UserId } | { ok: false };
type RequireUserResult =
  | { ok: true; userId: UserId }
  | { ok: false; response: APIGatewayProxyResultV2 };

/**
 * JWT claims から Cognito sub (ユーザーID) を抽出する。
 * API Gateway の JWT Authorizer が検証済みの claims を渡す前提。
 * 例外ではなく Result 型で返す (呼び出し側の try-catch を排除)。
 */
export function getUserId(event: APIGatewayProxyEventV2): AuthResult {
  const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    return { ok: false };
  }
  return { ok: true, userId: toUserId(sub) };
}

export function requireUserId(
  event: APIGatewayProxyEventV2,
): RequireUserResult {
  const auth = getUserId(event);
  if (!auth.ok) {
    return { ok: false, response: unauthorized() };
  }
  return auth;
}
```

- [ ] **Step 3: dynamo.ts を作成**

```typescript
// infra/lambdas/shared/dynamo.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const tableName = process.env.TABLE_NAME;
if (!tableName) {
  throw new Error("TABLE_NAME environment variable is required");
}

/** DynamoDB テーブル名。CDK が環境変数で注入。 */
export const TABLE_NAME: string = tableName;

const client = new DynamoDBClient({});
/** DocumentClient (コンテナ再利用時にコネクション使い回し)。 */
export const docClient = DynamoDBDocumentClient.from(client);

/**
 * DynamoDB アイテムから pk/sk を除去する。
 * handler がレスポンスを組み立てる際に使う。
 */
export function stripKeys<T extends Record<string, unknown>>(
  item: T,
): Omit<T, "pk" | "sk"> {
  const { pk, sk, ...rest } = item;
  return rest;
}
```

- [ ] **Step 4: response.ts を作成**

```typescript
// infra/lambdas/shared/response.ts
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";

const JSON_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "application/json",
};

export function ok(body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function badRequest(message: string): APIGatewayProxyResultV2 {
  return {
    statusCode: 400,
    headers: JSON_HEADERS,
    body: JSON.stringify({ message }),
  };
}

export function unauthorized(): APIGatewayProxyResultV2 {
  return {
    statusCode: 401,
    headers: JSON_HEADERS,
    body: JSON.stringify({ message: "Unauthorized" }),
  };
}

export function notFound(): APIGatewayProxyResultV2 {
  return {
    statusCode: 404,
    headers: JSON_HEADERS,
    body: JSON.stringify({ message: "Not found" }),
  };
}

export function serverError(): APIGatewayProxyResultV2 {
  return {
    statusCode: 500,
    headers: JSON_HEADERS,
    body: JSON.stringify({ message: "Internal server error" }),
  };
}

type ParseJsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; reason: "missing_body" | "invalid_json" };

type RequireJsonBodyResult =
  | { ok: true; body: unknown }
  | { ok: false; response: APIGatewayProxyResultV2 };

/**
 * リクエストボディを JSON パースする。
 * body 未送信と JSON 壊れを別 reason で返す。
 */
export function parseJsonBody(
  event: APIGatewayProxyEventV2,
): ParseJsonBodyResult {
  if (!event.body) {
    return { ok: false, reason: "missing_body" };
  }
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf-8")
    : event.body;
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

export function requireJsonBody(
  event: APIGatewayProxyEventV2,
): RequireJsonBodyResult {
  const parsed = parseJsonBody(event);
  if (!parsed.ok) {
    return {
      ok: false,
      response:
        parsed.reason === "missing_body"
          ? badRequest("Request body is required")
          : badRequest("Request body must be valid JSON"),
    };
  }
  return parsed;
}

export async function withServerError(
  label: string,
  work: () => Promise<APIGatewayProxyResultV2>,
): Promise<APIGatewayProxyResultV2> {
  try {
    return await work();
  } catch (error) {
    console.error(`${label} error:`, error);
    return serverError();
  }
}
```

- [ ] **Step 4b: shared/validation.ts を作成**

日付パース・enum チェック・数値範囲チェックを共通化。logMeal, logWeight, fetchWeeklyPlan, updateUserProfile で使い回す。

```typescript
// infra/lambdas/shared/validation.ts
import { type FoodId, type IsoDateString } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * YYYY-MM-DD 形式かつ実在する日付であることを検証する。
 * regex だけだと 2026-99-99 を通すため、Date パースで実日付を確認。
 */
export function isValidDate(value: unknown): value is IsoDateString {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function isValidFoodId(value: unknown): value is FoodId {
  return typeof value === "string" && value.length > 0;
}

/**
 * unknown を Record<string, unknown> に narrowing する型ガード。
 * `as Record<string, unknown>` を排除するために使う。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 値が指定 Set に含まれるか検証する。
 */
export function isValidEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
): value is T {
  return typeof value === "string" && allowed.has(value);
}

/**
 * 数値が (gt, lt) 範囲内か検証する。境界は含まない。
 */
export function isInRange(
  value: unknown,
  opts: { gt?: number; lt?: number; ge?: number; le?: number },
): value is number {
  if (typeof value !== "number" || Number.isNaN(value)) return false;
  if (opts.gt !== undefined && value <= opts.gt) return false;
  if (opts.lt !== undefined && value >= opts.lt) return false;
  if (opts.ge !== undefined && value < opts.ge) return false;
  if (opts.le !== undefined && value > opts.le) return false;
  return true;
}
```

- [ ] **Step 5: テストヘルパー api-event.ts を作成**

```typescript
// infra/test/lambdas/helpers/api-event.ts
import type { APIGatewayProxyEventV2 } from "aws-lambda";

/**
 * テスト用イベント型。
 * @types/aws-lambda は authorizer を required にしているが、
 * 実ランタイムでは Authorizer 未設定/未通過時に undefined になりうる。
 * handler は authorizer?.jwt?.claims?.sub と optional chaining しているため
 * undefined を安全に処理できる。テストでその経路を再現するためにこの型を使う。
 */
/**
 * Lambda テスト用のイベントビルダー。
 * 必須フィールドにデフォルト値を入れ、テスト側は差分だけ指定する。
 *
 * noAuth: true の場合、authorizer に空の claims (sub なし) を設定する。
 * @types/aws-lambda は authorizer を required にしているため、
 * undefined を渡すと型エラーになる。代わりに claims を空にすることで
 * getUserId が { ok: false } を返す経路を型安全にテストする。
 */
export function makeEvent(overrides: {
  method?: string;
  path?: string;
  pathParameters?: Record<string, string>;
  body?: string;
  sub?: string;
  noAuth?: boolean;
}): APIGatewayProxyEventV2 {
  const method = overrides.method ?? "GET";
  const path = overrides.path ?? "/";
  const sub = overrides.sub ?? "user-123";

  return {
    version: "2.0",
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: {},
    requestContext: {
      accountId: "123456789012",
      apiId: "test-api",
      authorizer: {
        jwt: {
          claims: overrides.noAuth ? {} : { sub },
          scopes: [],
        },
      },
      domainName: "test.execute-api.us-east-1.amazonaws.com",
      domainPrefix: "test",
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "test-request-id",
      routeKey: `${method} ${path}`,
      stage: "$default",
      time: "13/Apr/2026:00:00:00 +0000",
      timeEpoch: 1776211200000,
    },
    pathParameters: overrides.pathParameters,
    body: overrides.body,
    isBase64Encoded: false,
  };
}
```

- [ ] **Step 6: auth.test.ts を作成**

```typescript
// infra/test/lambdas/shared/auth.test.ts
import { describe, expect, it } from "vitest";
import { getUserId, requireUserId } from "../../../lambdas/shared/auth";
import { makeEvent } from "../helpers/api-event";

describe("getUserId", () => {
  it("returns ok with userId when sub exists", () => {
    const result = getUserId(makeEvent({ sub: "abc-123" }));
    expect(result).toEqual({ ok: true, userId: "abc-123" });
  });

  it("returns ok: false when sub claim is missing", () => {
    const result = getUserId(makeEvent({ noAuth: true }));
    expect(result).toEqual({ ok: false });
  });

  it("returns ok: false when sub is empty string", () => {
    const result = getUserId(makeEvent({ sub: "" }));
    expect(result).toEqual({ ok: false });
  });
});

describe("requireUserId", () => {
  it("returns 401 response when sub claim is missing", () => {
    const result = requireUserId(makeEvent({ noAuth: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.statusCode).toBe(401);
    }
  });
});
```

- [ ] **Step 6b: keys.test.ts を作成**

```typescript
// infra/test/lambdas/shared/keys.test.ts
import { describe, expect, it } from "vitest";
import {
  mealKey,
  planKey,
  profileKey,
  weightKey,
} from "../../../lambdas/shared/keys";
import {
  toIsoDateString,
  toMealId,
  toUserId,
} from "../../../lambdas/shared/types";

describe("keys", () => {
  it("builds profile key", () => {
    expect(profileKey(toUserId("user-123"))).toEqual({
      pk: "user#user-123",
      sk: "profile",
    });
  });

  it("builds meal key", () => {
    expect(
      mealKey(
        toUserId("user-123"),
        toIsoDateString("2026-04-13"),
        toMealId("00000000-0000-0000-0000-000000000001"),
      ),
    ).toEqual({
      pk: "user#user-123",
      sk: "meal#2026-04-13#00000000-0000-0000-0000-000000000001",
    });
  });

  it("builds weight and plan keys", () => {
    const userId = toUserId("user-123");
    const date = toIsoDateString("2026-04-13");
    expect(weightKey(userId, date)).toEqual({
      pk: "user#user-123",
      sk: "weight#2026-04-13",
    });
    expect(planKey(userId, date)).toEqual({
      pk: "user#user-123",
      sk: "plan#2026-04-13",
    });
  });
});
```

- [ ] **Step 7: response.test.ts を作成**

```typescript
// infra/test/lambdas/shared/response.test.ts
import { describe, expect, it } from "vitest";
import {
  ok,
  badRequest,
  unauthorized,
  notFound,
  serverError,
  parseJsonBody,
  requireJsonBody,
  withServerError,
} from "../../../lambdas/shared/response";
import { makeEvent } from "../helpers/api-event";

describe("response helpers", () => {
  it("ok returns 200 with JSON body", () => {
    const result = ok({ data: "test" });
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(String(result.body))).toEqual({ data: "test" });
    expect(result.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("badRequest returns 400 with message", () => {
    const result = badRequest("invalid input");
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(String(result.body))).toEqual({
      message: "invalid input",
    });
  });

  it("unauthorized returns 401", () => {
    const result = unauthorized();
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(String(result.body))).toEqual({
      message: "Unauthorized",
    });
  });

  it("notFound returns 404", () => {
    const result = notFound();
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(String(result.body))).toEqual({ message: "Not found" });
  });

  it("serverError returns 500 without internal details", () => {
    const result = serverError();
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(String(result.body))).toEqual({
      message: "Internal server error",
    });
  });
});

describe("parseJsonBody", () => {
  it("parses valid JSON body", () => {
    const event = makeEvent({ body: JSON.stringify({ name: "test" }) });
    expect(parseJsonBody(event)).toEqual({
      ok: true,
      body: { name: "test" },
    });
  });

  it("returns reason=missing_body for missing body", () => {
    const event = makeEvent({});
    expect(parseJsonBody(event)).toEqual({
      ok: false,
      reason: "missing_body",
    });
  });

  it("returns reason=invalid_json for invalid JSON", () => {
    const event = makeEvent({ body: "not json" });
    expect(parseJsonBody(event)).toEqual({
      ok: false,
      reason: "invalid_json",
    });
  });

  it("decodes base64-encoded body", () => {
    const event = makeEvent({
      body: Buffer.from(JSON.stringify({ name: "test" })).toString("base64"),
    });
    event.isBase64Encoded = true;
    expect(parseJsonBody(event)).toEqual({
      ok: true,
      body: { name: "test" },
    });
  });
});

describe("requireJsonBody", () => {
  it("returns 400 when body is missing", () => {
    const result = requireJsonBody(makeEvent({}));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.statusCode).toBe(400);
      expect(JSON.parse(String(result.response.body))).toEqual({
        message: "Request body is required",
      });
    }
  });

  it("returns 400 when body is invalid JSON", () => {
    const result = requireJsonBody(makeEvent({ body: "not json" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(JSON.parse(String(result.response.body))).toEqual({
        message: "Request body must be valid JSON",
      });
    }
  });
});

describe("withServerError", () => {
  it("returns handler result on success", async () => {
    const result = await withServerError("test", async () => ok({ ok: true }));
    expect(result.statusCode).toBe(200);
  });

  it("returns 500 on thrown error", async () => {
    const result = await withServerError("test", async () => {
      throw new Error("boom");
    });
    expect(result.statusCode).toBe(500);
  });
});
```

- [ ] **Step 7b: validation.test.ts を作成**

```typescript
// infra/test/lambdas/shared/validation.test.ts
import { describe, expect, it } from "vitest";
import {
  isValidDate,
  isValidFoodId,
  isValidEnum,
  isInRange,
  isRecord,
} from "../../../lambdas/shared/validation";

describe("isValidDate", () => {
  it("accepts valid date", () => {
    expect(isValidDate("2026-04-13")).toBe(true);
  });

  it("rejects invalid format (no hyphens)", () => {
    expect(isValidDate("20260413")).toBe(false);
  });

  it("rejects impossible date (month 99)", () => {
    expect(isValidDate("2026-99-01")).toBe(false);
  });

  it("rejects impossible date (day 32)", () => {
    expect(isValidDate("2026-01-32")).toBe(false);
  });

  it("rejects non-string", () => {
    expect(isValidDate(123)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(isValidDate(undefined)).toBe(false);
  });
});

describe("isValidFoodId", () => {
  it("accepts non-empty string", () => {
    expect(isValidFoodId("01001")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidFoodId("")).toBe(false);
  });

  it("rejects non-string", () => {
    expect(isValidFoodId(1001)).toBe(false);
  });
});

describe("isValidEnum", () => {
  const allowed = new Set(["a", "b", "c"]);

  it("accepts valid value", () => {
    expect(isValidEnum("a", allowed)).toBe(true);
  });

  it("rejects invalid value", () => {
    expect(isValidEnum("d", allowed)).toBe(false);
  });

  it("rejects non-string", () => {
    expect(isValidEnum(123, allowed)).toBe(false);
  });
});

describe("isInRange", () => {
  it("accepts value within gt/lt range", () => {
    expect(isInRange(50, { gt: 0, lt: 100 })).toBe(true);
  });

  it("rejects value at gt boundary (exclusive)", () => {
    expect(isInRange(0, { gt: 0 })).toBe(false);
  });

  it("rejects value at lt boundary (exclusive)", () => {
    expect(isInRange(100, { lt: 100 })).toBe(false);
  });

  it("accepts value at ge boundary (inclusive)", () => {
    expect(isInRange(0, { ge: 0 })).toBe(true);
  });

  it("accepts value at le boundary (inclusive)", () => {
    expect(isInRange(24, { le: 24 })).toBe(true);
  });

  it("rejects NaN", () => {
    expect(isInRange(NaN, { gt: 0 })).toBe(false);
  });

  it("rejects non-number", () => {
    expect(isInRange("50", { gt: 0 })).toBe(false);
  });
});

describe("isRecord", () => {
  it("accepts plain object", () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("rejects null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("rejects array", () => {
    expect(isRecord([1, 2])).toBe(false);
  });

  it("rejects string", () => {
    expect(isRecord("test")).toBe(false);
  });
});
```

- [ ] **Step 8: テスト実行**

Run: `cd infra && pnpm test`
Expected: 既存テスト + 新テストが全て PASS

- [ ] **Step 9: コミット**

```bash
git add infra/package.json infra/pnpm-lock.yaml \
       infra/vitest.config.ts \
       infra/lambdas/shared/types.ts \
       infra/lambdas/shared/auth.ts \
       infra/lambdas/shared/keys.ts \
       infra/lambdas/shared/dynamo.ts \
       infra/lambdas/shared/response.ts \
       infra/lambdas/shared/validation.ts \
       infra/test/lambdas/helpers/api-event.ts \
       infra/test/lambdas/shared/auth.test.ts \
       infra/test/lambdas/shared/keys.test.ts \
       infra/test/lambdas/shared/response.test.ts \
       infra/test/lambdas/shared/validation.test.ts
git commit -m "feat(infra): add typed shared Lambda modules and key helpers"
```

---

## Task 4: fetchUserProfile Lambda

**Files:**

- Create: `infra/lambdas/fetch-user-profile/index.ts`
- Create: `infra/test/lambdas/fetch-user-profile.test.ts`

- [ ] **Step 1: テストを作成**

```typescript
// infra/test/lambdas/fetch-user-profile.test.ts
// TABLE_NAME は vitest.config.ts の env で設定済み

import { beforeEach, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../lambdas/fetch-user-profile/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe("fetchUserProfile", () => {
  it("returns profile when found", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        pk: "user#user-123",
        sk: "profile",
        name: "太郎",
        age: 30,
      },
    });

    const event = makeEvent({
      method: "GET",
      path: "/users/me/profile",
      sub: "user-123",
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(String(result.body));
    expect(body.profile).toEqual({ name: "太郎", age: 30 });
    // pk/sk がレスポンスに含まれないこと
    expect(body.profile.pk).toBeUndefined();
    expect(body.profile.sk).toBeUndefined();
  });

  it("returns 404 when profile not found", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const event = makeEvent({ sub: "user-123" });
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
  });

  it("uses correct DynamoDB key", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const event = makeEvent({ sub: "abc-def" });
    await handler(event);

    const call = ddbMock.commandCalls(GetCommand)[0];
    expect(call.args[0].input).toEqual({
      TableName: "test-table",
      Key: { pk: "user#abc-def", sk: "profile" },
    });
  });

  it("returns 401 when sub is missing", async () => {
    const result = await handler(makeEvent({ noAuth: true }));
    expect(result.statusCode).toBe(401);
  });

  it("returns 500 when DynamoDB throws", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));
    const result = await handler(makeEvent({ sub: "user-123" }));
    expect(result.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: テスト実行 — FAIL 確認**

Run: `cd infra && pnpm test -- test/lambdas/fetch-user-profile.test.ts`
Expected: FAIL (handler が存在しない)

- [ ] **Step 3: handler を実装**

```typescript
// infra/lambdas/fetch-user-profile/index.ts
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { profileKey } from "../shared/keys";
import { ok, notFound, withServerError } from "../shared/response";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = requireUserId(event);
  if (!auth.ok) return auth.response;

  return withServerError("fetchUserProfile", async () => {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: profileKey(auth.userId),
      }),
    );

    if (!Item) {
      return notFound();
    }

    return ok({ profile: stripKeys(Item) });
  });
}
```

- [ ] **Step 4: テスト実行 — PASS 確認**

Run: `cd infra && pnpm test -- test/lambdas/fetch-user-profile.test.ts`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add infra/lambdas/fetch-user-profile/index.ts \
       infra/test/lambdas/fetch-user-profile.test.ts
git commit -m "feat(lambda): add fetchUserProfile handler with tests"
```

---

## Task 5: updateUserProfile Lambda

**Files:**

- Create: `infra/lambdas/update-user-profile/index.ts`
- Create: `infra/test/lambdas/update-user-profile.test.ts`

これは最も複雑な Lambda。PATCH セマンティクス、バリデーション、動的 UpdateExpression を含む。

- [ ] **Step 1: テストを作成**

```typescript
// infra/test/lambdas/update-user-profile.test.ts
// TABLE_NAME は vitest.config.ts の env で設定済み

import { beforeEach, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { PROFILE_FIELDS } from "../../lambdas/shared/types";
import {
  handler,
  validateUpdateProfileInput,
  buildUpdateExpression,
} from "../../lambdas/update-user-profile/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

// ── validateUpdateProfileInput ──────────────────────────────────────

describe("validateUpdateProfileInput", () => {
  it("accepts valid single field", () => {
    const result = validateUpdateProfileInput({ name: "太郎" });
    expect(result.valid).toBe(true);
  });

  it("accepts valid multiple fields", () => {
    const result = validateUpdateProfileInput({
      name: "太郎",
      age: 30,
      sex: "male",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects non-object body", () => {
    const result = validateUpdateProfileInput("string");
    expect(result.valid).toBe(false);
  });

  it("rejects null body", () => {
    const result = validateUpdateProfileInput(null);
    expect(result.valid).toBe(false);
  });

  it("rejects empty object", () => {
    const result = validateUpdateProfileInput({});
    expect(result.valid).toBe(false);
  });

  it("rejects all-null fields", () => {
    const result = validateUpdateProfileInput({
      name: null,
      age: null,
    });
    expect(result.valid).toBe(false);
  });

  // ── schema ↔ TS ガード一致の自動検証 ───────────────────────────
  // UpdateUserProfileInput.schema.json の properties と
  // TS 側の PROFILE_FIELDS が一致することを確認
  it("PROFILE_FIELDS matches JSON Schema properties", async () => {
    const schema =
      await import("../../../packages/contracts-ts/schemas/UpdateUserProfileInput.schema.json");
    const schemaFields = new Set(Object.keys(schema.properties ?? {}));
    const tsFields = new Set(PROFILE_FIELDS);
    expect(tsFields).toEqual(schemaFields);
  });

  // 境界値 — JSON Schema と一致することを担保するテスト群
  it("rejects age below minimum (17 < 18)", () => {
    const result = validateUpdateProfileInput({ age: 17 });
    expect(result.valid).toBe(false);
  });

  it("accepts age at minimum (18)", () => {
    const result = validateUpdateProfileInput({ age: 18 });
    expect(result.valid).toBe(true);
  });

  it("accepts age at maximum (120)", () => {
    const result = validateUpdateProfileInput({ age: 120 });
    expect(result.valid).toBe(true);
  });

  it("rejects age above maximum (121 > 120)", () => {
    const result = validateUpdateProfileInput({ age: 121 });
    expect(result.valid).toBe(false);
  });

  it("rejects height_cm at zero (gt=0)", () => {
    const result = validateUpdateProfileInput({ height_cm: 0 });
    expect(result.valid).toBe(false);
  });

  it("rejects height_cm at 300 (lt=300)", () => {
    const result = validateUpdateProfileInput({ height_cm: 300 });
    expect(result.valid).toBe(false);
  });

  it("rejects weight_kg at zero (gt=0)", () => {
    const result = validateUpdateProfileInput({ weight_kg: 0 });
    expect(result.valid).toBe(false);
  });

  it("rejects weight_kg at 500 (lt=500)", () => {
    const result = validateUpdateProfileInput({ weight_kg: 500 });
    expect(result.valid).toBe(false);
  });

  it("rejects sleep_hours below zero (ge=0)", () => {
    const result = validateUpdateProfileInput({ sleep_hours: -1 });
    expect(result.valid).toBe(false);
  });

  it("rejects sleep_hours above 24 (le=24)", () => {
    const result = validateUpdateProfileInput({ sleep_hours: 25 });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid sex value", () => {
    const result = validateUpdateProfileInput({ sex: "other" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid activity_level", () => {
    const result = validateUpdateProfileInput({ activity_level: "invalid" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid desired_pace", () => {
    const result = validateUpdateProfileInput({ desired_pace: "slow" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid stress_level", () => {
    const result = validateUpdateProfileInput({ stress_level: "extreme" });
    expect(result.valid).toBe(false);
  });

  it("ignores unknown fields", () => {
    const result = validateUpdateProfileInput({
      name: "太郎",
      unknown: "value",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data).not.toHaveProperty("unknown");
    }
  });
});

// ── buildUpdateExpression ───────────────────────────────────────────

describe("buildUpdateExpression", () => {
  it("builds SET expression for single field", () => {
    const expr = buildUpdateExpression({ name: "太郎" });
    expect(expr.UpdateExpression).toBe("SET #name = :name");
    expect(expr.ExpressionAttributeNames).toEqual({ "#name": "name" });
    expect(expr.ExpressionAttributeValues).toEqual({ ":name": "太郎" });
  });

  it("builds SET expression for multiple fields", () => {
    const expr = buildUpdateExpression({ name: "太郎", age: 30 });
    expect(expr.UpdateExpression).toContain("#name = :name");
    expect(expr.UpdateExpression).toContain("#age = :age");
    expect(expr.ExpressionAttributeNames).toEqual({
      "#name": "name",
      "#age": "age",
    });
    expect(expr.ExpressionAttributeValues).toEqual({
      ":name": "太郎",
      ":age": 30,
    });
  });

  it("assumes caller already filtered null/undefined values", () => {
    const expr = buildUpdateExpression({ name: "太郎", updated_at: "2026-04-13T00:00:00Z" });
    expect(expr.UpdateExpression).toContain("#name = :name");
    expect(expr.UpdateExpression).toContain("#updated_at = :updated_at");
  });
});

// ── handler ─────────────────────────────────────────────────────────

describe("updateUserProfile handler", () => {
  it("updates profile and returns ALL_NEW without pk/sk", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        pk: "user#user-123",
        sk: "profile",
        name: "太郎",
        age: 30,
      },
    });

    const event = makeEvent({
      method: "PATCH",
      path: "/users/me/profile",
      body: JSON.stringify({ name: "太郎" }),
      sub: "user-123",
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(String(result.body));
    expect(body.profile).toEqual({ name: "太郎", age: 30 });
    expect(body.profile.pk).toBeUndefined();
  });

  it("returns 400 for empty body", async () => {
    const event = makeEvent({
      method: "PATCH",
      path: "/users/me/profile",
      body: JSON.stringify({}),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for missing body", async () => {
    const event = makeEvent({ method: "PATCH", path: "/users/me/profile" });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for invalid field value", async () => {
    const event = makeEvent({
      method: "PATCH",
      path: "/users/me/profile",
      body: JSON.stringify({ age: 17 }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("sends UpdateItem with correct key and expression", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { pk: "user#u1", sk: "profile", name: "花子" },
    });

    const event = makeEvent({
      method: "PATCH",
      path: "/users/me/profile",
      body: JSON.stringify({ name: "花子" }),
      sub: "u1",
    });
    await handler(event);

    const call = ddbMock.commandCalls(UpdateCommand)[0];
    expect(call.args[0].input.Key).toEqual({ pk: "user#u1", sk: "profile" });
    expect(call.args[0].input.ReturnValues).toBe("ALL_NEW");
  });

  it("excludes null fields from update", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { pk: "user#u1", sk: "profile", name: "花子" },
    });

    const event = makeEvent({
      method: "PATCH",
      path: "/users/me/profile",
      body: JSON.stringify({ name: "花子", age: null }),
      sub: "u1",
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(String(result.body));
    // age が null で送られても、応答は DynamoDB の ALL_NEW 結果そのまま
    expect(body.profile).toEqual({ name: "花子" });
  });

  it("returns 401 when sub is missing", async () => {
    const result = await handler(
      makeEvent({
        method: "PATCH",
        path: "/users/me/profile",
        body: JSON.stringify({ name: "太郎" }),
        noAuth: true,
      }),
    );
    expect(result.statusCode).toBe(401);
  });

  it("returns 500 when DynamoDB throws", async () => {
    ddbMock.on(UpdateCommand).rejects(new Error("DynamoDB unavailable"));
    const event = makeEvent({
      method: "PATCH",
      path: "/users/me/profile",
      body: JSON.stringify({ name: "太郎" }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: テスト実行 — FAIL 確認**

Run: `cd infra && pnpm test -- test/lambdas/update-user-profile.test.ts`
Expected: FAIL

- [ ] **Step 3: handler + validation + expression builder を実装**

```typescript
// infra/lambdas/update-user-profile/index.ts
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { profileKey } from "../shared/keys";
import {
  ok,
  badRequest,
  serverError,
  requireJsonBody,
  withServerError,
} from "../shared/response";
import { isRecord, isValidEnum, isInRange } from "../shared/validation";
import { PROFILE_FIELDS, type ProfilePatch } from "../shared/types";

// ── 定数 ────────────────────────────────────────────────────────────

const VALID_SEX: ReadonlySet<string> = new Set(["male", "female"]);
const VALID_ACTIVITY_LEVEL: ReadonlySet<string> = new Set([
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "extremely_active",
]);
const VALID_DESIRED_PACE: ReadonlySet<string> = new Set([
  "steady",
  "aggressive",
]);
const VALID_STRESS_LEVEL: ReadonlySet<string> = new Set([
  "low",
  "moderate",
  "high",
]);

// ── バリデーション (exported for testing) ────────────────────────────

type ValidationResult =
  | { valid: true; data: ProfilePatch }
  | { valid: false; message: string };

/**
 * 手書き if ガード。参照元: UpdateUserProfileInput.schema.json
 * contracts-py 側の Pydantic モデルと同じ境界値を強制する。
 */
export function validateUpdateProfileInput(body: unknown): ValidationResult {
  if (!isRecord(body)) {
    return { valid: false, message: "Request body must be a JSON object" };
  }

  // 許可フィールドだけ抽出し、null/undefined を除外
  const data: ProfilePatch = {};
  for (const key of PROFILE_FIELDS) {
    const value = body[key];
    if (value !== undefined && value !== null) {
      data[key] = value;
    }
  }

  if (Object.keys(data).length === 0) {
    return { valid: false, message: "At least one field must be provided" };
  }

  // 個別フィールドの型・範囲バリデーション
  if (data.name !== undefined && typeof data.name !== "string") {
    return { valid: false, message: "name must be a string" };
  }
  if (data.age !== undefined) {
    if (typeof data.age !== "number" || !Number.isInteger(data.age)) {
      return { valid: false, message: "age must be an integer" };
    }
    if (data.age < 18 || data.age > 120) {
      return { valid: false, message: "age must be between 18 and 120" };
    }
  }
  if (data.sex !== undefined && !isValidEnum(data.sex, VALID_SEX)) {
    return { valid: false, message: "sex must be 'male' or 'female'" };
  }
  if (
    data.height_cm !== undefined &&
    !isInRange(data.height_cm, { gt: 0, lt: 300 })
  ) {
    return { valid: false, message: "height_cm must be > 0 and < 300" };
  }
  if (
    data.weight_kg !== undefined &&
    !isInRange(data.weight_kg, { gt: 0, lt: 500 })
  ) {
    return { valid: false, message: "weight_kg must be > 0 and < 500" };
  }
  if (
    data.activity_level !== undefined &&
    !isValidEnum(data.activity_level, VALID_ACTIVITY_LEVEL)
  ) {
    return { valid: false, message: "Invalid activity_level" };
  }
  if (
    data.desired_pace !== undefined &&
    !isValidEnum(data.desired_pace, VALID_DESIRED_PACE)
  ) {
    return { valid: false, message: "Invalid desired_pace" };
  }
  if (
    data.sleep_hours !== undefined &&
    !isInRange(data.sleep_hours, { ge: 0, le: 24 })
  ) {
    return { valid: false, message: "sleep_hours must be between 0 and 24" };
  }
  if (
    data.stress_level !== undefined &&
    !isValidEnum(data.stress_level, VALID_STRESS_LEVEL)
  ) {
    return { valid: false, message: "Invalid stress_level" };
  }

  return { valid: true, data };
}

// ── UpdateExpression ビルダー (exported for testing) ─────────────────

/**
 * validator 済みの非 null フィールドから DynamoDB UpdateExpression を組み立てる。
 * null/undefined 除外は validateUpdateProfileInput の責務。
 */
type ExpressionFields = ProfilePatch & { updated_at?: string };

export function buildUpdateExpression(fields: ExpressionFields): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
} {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setClauses: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    const nameKey = `#${key}`;
    const valueKey = `:${key}`;
    names[nameKey] = key;
    values[valueKey] = value;
    setClauses.push(`${nameKey} = ${valueKey}`);
  }

  return {
    UpdateExpression: `SET ${setClauses.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

// ── handler ─────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = requireUserId(event);
  if (!auth.ok) return auth.response;

  const parsed = requireJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const validation = validateUpdateProfileInput(parsed.body);
  if (!validation.valid) {
    return badRequest(validation.message);
  }

  // updated_at を監査用に自動付与
  const dataWithTimestamp = {
    ...validation.data,
    updated_at: new Date().toISOString(),
  };
  const expr = buildUpdateExpression(dataWithTimestamp);

  return withServerError("updateUserProfile", async () => {
    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: profileKey(auth.userId),
        UpdateExpression: expr.UpdateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
        ReturnValues: "ALL_NEW",
      }),
    );

    if (!Attributes) {
      return serverError();
    }

    return ok({ profile: stripKeys(Attributes) });
  });
}
```

- [ ] **Step 4: テスト実行 — PASS 確認**

Run: `cd infra && pnpm test -- test/lambdas/update-user-profile.test.ts`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add infra/lambdas/update-user-profile/index.ts \
       infra/test/lambdas/update-user-profile.test.ts
git commit -m "feat(lambda): add updateUserProfile handler with PATCH validation"
```

---

## Task 6: logMeal Lambda

**Files:**

- Create: `infra/lambdas/log-meal/index.ts`
- Create: `infra/test/lambdas/log-meal.test.ts`

- [ ] **Step 1: テストを作成**

```typescript
// infra/test/lambdas/log-meal.test.ts
// TABLE_NAME は vitest.config.ts の env で設定済み

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../lambdas/log-meal/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  vi.stubGlobal("crypto", {
    randomUUID: () => "00000000-0000-0000-0000-000000000001",
  });
});

describe("logMeal", () => {
  const validBody = {
    date: "2026-04-13",
    food_id: "01001",
    amount_g: 150,
    meal_type: "breakfast",
  };

  it("creates meal log and returns meal object", async () => {
    ddbMock.on(PutCommand).resolves({});

    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify(validBody),
      sub: "user-123",
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(String(result.body));
    expect(body.meal.meal_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(body.meal.date).toBe("2026-04-13");
    expect(body.meal.food_id).toBe("01001");
    expect(body.meal.amount_g).toBe(150);
    expect(body.meal.meal_type).toBe("breakfast");
    expect(body.meal.logged_at).toBeDefined();
    // pk/sk がレスポンスに含まれないこと
    expect(body.meal.pk).toBeUndefined();
    expect(body.meal.sk).toBeUndefined();
  });

  it("sends PutItem with correct pk/sk", async () => {
    ddbMock.on(PutCommand).resolves({});

    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify(validBody),
      sub: "user-123",
    });
    await handler(event);

    const call = ddbMock.commandCalls(PutCommand)[0];
    const item = call.args[0].input.Item;
    expect(item?.pk).toBe("user#user-123");
    expect(item?.sk).toBe(
      "meal#2026-04-13#00000000-0000-0000-0000-000000000001",
    );
  });

  it("returns 400 for missing body", async () => {
    const event = makeEvent({ method: "POST", path: "/users/me/meals" });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify({ ...validBody, date: "2026/04/13" }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for empty food_id", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify({ ...validBody, food_id: "" }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for amount_g <= 0", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify({ ...validBody, amount_g: 0 }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for invalid meal_type", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify({ ...validBody, meal_type: "brunch" }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 401 when sub is missing", async () => {
    const result = await handler(
      makeEvent({
        method: "POST",
        path: "/users/me/meals",
        body: JSON.stringify(validBody),
        noAuth: true,
      }),
    );
    expect(result.statusCode).toBe(401);
  });

  it("returns 500 when DynamoDB throws", async () => {
    ddbMock.on(PutCommand).rejects(new Error("DynamoDB unavailable"));
    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify(validBody),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: テスト実行 — FAIL 確認**

Run: `cd infra && pnpm test -- test/lambdas/log-meal.test.ts`
Expected: FAIL

- [ ] **Step 3: handler を実装**

```typescript
// infra/lambdas/log-meal/index.ts
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { LogMealInput } from "../../../packages/contracts-ts/generated/types";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { mealKey } from "../shared/keys";
import {
  ok,
  badRequest,
  requireJsonBody,
  withServerError,
} from "../shared/response";
import {
  isRecord,
  isValidDate,
  isValidEnum,
  isInRange,
  isValidFoodId,
} from "../shared/validation";
import {
  VALID_MEAL_TYPES,
  toMealId,
  type FoodId,
  type IsoDateString,
  type MealId,
  type MealType,
} from "../shared/types";

const VALID_MEAL_TYPE: ReadonlySet<MealType> = new Set(VALID_MEAL_TYPES);

type ValidatedLogMealInput = {
  date: IsoDateString;
  food_id: FoodId;
  amount_g: LogMealInput["amount_g"];
  meal_type: MealType;
};

function validateLogMealInput(
  body: unknown,
):
  | { valid: true; data: ValidatedLogMealInput }
  | { valid: false; message: string } {
  if (!isRecord(body)) {
    return { valid: false, message: "Request body must be a JSON object" };
  }

  // ローカル変数に取り出して型ガードで narrowing (as 不要)
  const { date, food_id, amount_g, meal_type } = body;

  if (!isValidDate(date)) {
    return { valid: false, message: "date must be a valid YYYY-MM-DD date" };
  }
  if (!isValidFoodId(food_id)) {
    return { valid: false, message: "food_id must be a non-empty string" };
  }
  if (!isInRange(amount_g, { gt: 0 })) {
    return { valid: false, message: "amount_g must be > 0" };
  }
  if (!isValidEnum(meal_type, VALID_MEAL_TYPE)) {
    return {
      valid: false,
      message: "meal_type must be breakfast, lunch, dinner, or snack",
    };
  }

  return { valid: true, data: { date, food_id, amount_g, meal_type } };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = requireUserId(event);
  if (!auth.ok) return auth.response;

  const parsed = requireJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const validation = validateLogMealInput(parsed.body);
  if (!validation.valid) {
    return badRequest(validation.message);
  }

  const mealId: MealId = toMealId(crypto.randomUUID());
  const loggedAt = new Date().toISOString();

  const item = {
    ...mealKey(auth.userId, validation.data.date, mealId),
    meal_id: mealId,
    date: validation.data.date,
    food_id: validation.data.food_id,
    amount_g: validation.data.amount_g,
    meal_type: validation.data.meal_type,
    logged_at: loggedAt,
  };

  return withServerError("logMeal", async () => {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    return ok({ meal: stripKeys(item) });
  });
}
```

- [ ] **Step 4: テスト実行 — PASS 確認**

Run: `cd infra && pnpm test -- test/lambdas/log-meal.test.ts`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add infra/lambdas/log-meal/index.ts \
       infra/test/lambdas/log-meal.test.ts
git commit -m "feat(lambda): add logMeal handler with validation and tests"
```

---

## Task 7: logWeight Lambda

**Files:**

- Create: `infra/lambdas/log-weight/index.ts`
- Create: `infra/test/lambdas/log-weight.test.ts`

- [ ] **Step 1: テストを作成**

```typescript
// infra/test/lambdas/log-weight.test.ts
// TABLE_NAME は vitest.config.ts の env で設定済み

import { beforeEach, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../lambdas/log-weight/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe("logWeight", () => {
  const validBody = { date: "2026-04-13", weight_kg: 70.5 };

  it("creates weight log and returns weight object", async () => {
    ddbMock.on(PutCommand).resolves({});

    const event = makeEvent({
      method: "POST",
      path: "/users/me/weight",
      body: JSON.stringify(validBody),
      sub: "user-123",
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(String(result.body));
    expect(body.weight.date).toBe("2026-04-13");
    expect(body.weight.weight_kg).toBe(70.5);
    expect(body.weight.logged_at).toBeDefined();
    expect(body.weight.pk).toBeUndefined();
    expect(body.weight.sk).toBeUndefined();
  });

  it("sends PutItem with correct pk/sk (same date = idempotent overwrite)", async () => {
    ddbMock.on(PutCommand).resolves({});

    const event = makeEvent({
      method: "POST",
      path: "/users/me/weight",
      body: JSON.stringify(validBody),
      sub: "user-123",
    });
    await handler(event);

    const call = ddbMock.commandCalls(PutCommand)[0];
    const item = call.args[0].input.Item;
    expect(item?.pk).toBe("user#user-123");
    expect(item?.sk).toBe("weight#2026-04-13");
  });

  it("returns 400 for missing body", async () => {
    const event = makeEvent({ method: "POST", path: "/users/me/weight" });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/weight",
      body: JSON.stringify({ date: "20260413", weight_kg: 70 }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for weight_kg <= 0", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/weight",
      body: JSON.stringify({ date: "2026-04-13", weight_kg: 0 }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for weight_kg >= 500", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/weight",
      body: JSON.stringify({ date: "2026-04-13", weight_kg: 500 }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 401 when sub is missing", async () => {
    const result = await handler(
      makeEvent({
        method: "POST",
        path: "/users/me/weight",
        body: JSON.stringify(validBody),
        noAuth: true,
      }),
    );
    expect(result.statusCode).toBe(401);
  });

  it("returns 500 when DynamoDB throws", async () => {
    ddbMock.on(PutCommand).rejects(new Error("DynamoDB unavailable"));
    const event = makeEvent({
      method: "POST",
      path: "/users/me/weight",
      body: JSON.stringify(validBody),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: テスト実行 — FAIL 確認**

Run: `cd infra && pnpm test -- test/lambdas/log-weight.test.ts`
Expected: FAIL

- [ ] **Step 3: handler を実装**

```typescript
// infra/lambdas/log-weight/index.ts
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { LogWeightInput } from "../../../packages/contracts-ts/generated/types";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { weightKey } from "../shared/keys";
import {
  ok,
  badRequest,
  requireJsonBody,
  withServerError,
} from "../shared/response";
import { isRecord, isValidDate, isInRange } from "../shared/validation";
import type { IsoDateString } from "../shared/types";

type ValidatedLogWeightInput = {
  date: IsoDateString;
  weight_kg: LogWeightInput["weight_kg"];
};

function validateLogWeightInput(
  body: unknown,
):
  | { valid: true; data: ValidatedLogWeightInput }
  | { valid: false; message: string } {
  if (!isRecord(body)) {
    return { valid: false, message: "Request body must be a JSON object" };
  }

  const { date, weight_kg } = body;

  if (!isValidDate(date)) {
    return { valid: false, message: "date must be a valid YYYY-MM-DD date" };
  }
  if (!isInRange(weight_kg, { gt: 0, lt: 500 })) {
    return { valid: false, message: "weight_kg must be > 0 and < 500" };
  }

  return { valid: true, data: { date, weight_kg } };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = requireUserId(event);
  if (!auth.ok) return auth.response;

  const parsed = requireJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const validation = validateLogWeightInput(parsed.body);
  if (!validation.valid) {
    return badRequest(validation.message);
  }

  const loggedAt = new Date().toISOString();

  const item = {
    ...weightKey(auth.userId, validation.data.date),
    date: validation.data.date,
    weight_kg: validation.data.weight_kg,
    logged_at: loggedAt,
  };

  return withServerError("logWeight", async () => {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    const weight = stripKeys(item);
    return ok({ weight });
  });
}
```

- [ ] **Step 4: テスト実行 — PASS 確認**

Run: `cd infra && pnpm test -- test/lambdas/log-weight.test.ts`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add infra/lambdas/log-weight/index.ts \
       infra/test/lambdas/log-weight.test.ts
git commit -m "feat(lambda): add logWeight handler with idempotent overwrite"
```

---

## Task 8: fetchWeeklyPlan Lambda

**Files:**

- Create: `infra/lambdas/fetch-weekly-plan/index.ts`
- Create: `infra/test/lambdas/fetch-weekly-plan.test.ts`

- [ ] **Step 1: テストを作成**

```typescript
// infra/test/lambdas/fetch-weekly-plan.test.ts
// TABLE_NAME は vitest.config.ts の env で設定済み

import { beforeEach, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../lambdas/fetch-weekly-plan/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe("fetchWeeklyPlan", () => {
  it("returns plan when found", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        pk: "user#user-123",
        sk: "plan#2026-04-13",
        meals: [{ day: "mon", recipe: "chicken_salad" }],
      },
    });

    const event = makeEvent({
      method: "GET",
      path: "/users/me/plans/2026-04-13",
      pathParameters: { weekStart: "2026-04-13" },
      sub: "user-123",
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(String(result.body));
    expect(body.plan.meals).toEqual([{ day: "mon", recipe: "chicken_salad" }]);
    expect(body.plan.pk).toBeUndefined();
    expect(body.plan.sk).toBeUndefined();
  });

  it("returns 404 when plan not found", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const event = makeEvent({
      method: "GET",
      path: "/users/me/plans/2026-04-13",
      pathParameters: { weekStart: "2026-04-13" },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
  });

  it("uses correct DynamoDB key", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const event = makeEvent({
      method: "GET",
      path: "/users/me/plans/2026-04-13",
      pathParameters: { weekStart: "2026-04-13" },
      sub: "abc-def",
    });
    await handler(event);

    const call = ddbMock.commandCalls(GetCommand)[0];
    expect(call.args[0].input).toEqual({
      TableName: "test-table",
      Key: { pk: "user#abc-def", sk: "plan#2026-04-13" },
    });
  });

  it("returns 400 when weekStart path parameter is missing", async () => {
    const event = makeEvent({
      method: "GET",
      path: "/users/me/plans/",
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 when weekStart format is invalid", async () => {
    const event = makeEvent({
      method: "GET",
      path: "/users/me/plans/20260413",
      pathParameters: { weekStart: "20260413" },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 401 when sub is missing", async () => {
    const result = await handler(
      makeEvent({
        method: "GET",
        path: "/users/me/plans/2026-04-13",
        pathParameters: { weekStart: "2026-04-13" },
        noAuth: true,
      }),
    );
    expect(result.statusCode).toBe(401);
  });

  it("returns 500 when DynamoDB throws", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));
    const event = makeEvent({
      method: "GET",
      path: "/users/me/plans/2026-04-13",
      pathParameters: { weekStart: "2026-04-13" },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: テスト実行 — FAIL 確認**

Run: `cd infra && pnpm test -- test/lambdas/fetch-weekly-plan.test.ts`
Expected: FAIL

- [ ] **Step 3: handler を実装**

```typescript
// infra/lambdas/fetch-weekly-plan/index.ts
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { planKey } from "../shared/keys";
import {
  ok,
  badRequest,
  notFound,
  withServerError,
} from "../shared/response";
import { isValidDate } from "../shared/validation";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = requireUserId(event);
  if (!auth.ok) return auth.response;

  const weekStart: string | undefined = event.pathParameters?.weekStart;
  if (!isValidDate(weekStart)) {
    return badRequest("weekStart must be a valid YYYY-MM-DD date");
  }

  return withServerError("fetchWeeklyPlan", async () => {
    const { Item } = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: planKey(auth.userId, weekStart),
      }),
    );

    if (!Item) {
      return notFound();
    }

    return ok({ plan: stripKeys(Item) });
  });
}
```

- [ ] **Step 4: テスト実行 — PASS 確認**

Run: `cd infra && pnpm test -- test/lambdas/fetch-weekly-plan.test.ts`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add infra/lambdas/fetch-weekly-plan/index.ts \
       infra/test/lambdas/fetch-weekly-plan.test.ts
git commit -m "feat(lambda): add fetchWeeklyPlan handler with tests"
```

---

## Task 9: CrudLambdas CDK Construct + スタック統合 + CDK テスト

**Files:**

- Modify: `infra/lib/constructs/api.ts` (CORS に PATCH 追加)
- Create: `infra/lib/constructs/crud-lambdas.ts`
- Modify: `infra/lib/fitness-stack.ts` (CrudLambdas 追加)
- Modify: `infra/test/fitness-stack.test.ts` (CRUD ルートテスト追加)

- [ ] **Step 1: CORS に PATCH メソッドを追加**

`infra/lib/constructs/api.ts` の `allowMethods` 配列に `CorsHttpMethod.PATCH` を追加:

```typescript
allowMethods: [
  CorsHttpMethod.GET,
  CorsHttpMethod.POST,
  CorsHttpMethod.PUT,
  CorsHttpMethod.PATCH,
  CorsHttpMethod.DELETE,
  CorsHttpMethod.OPTIONS,
],
```

- [ ] **Step 2: CDK テストを先に書く (TDD)**

`infra/test/fitness-stack.test.ts` に以下のテストを追加 (既存の `describe("FitnessStack", ...)` ブロック内):

既存テストファイルの import に `Match` を追加: `import { Match, Template } from "aws-cdk-lib/assertions";`

```typescript
// ── CRUD Lambda ルート ──────────────────────────────────────────

it("creates a GET /users/me/profile route with JWT auth", () => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
    RouteKey: "GET /users/me/profile",
    AuthorizationType: "JWT",
  });
});

it("creates a PATCH /users/me/profile route with JWT auth", () => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
    RouteKey: "PATCH /users/me/profile",
    AuthorizationType: "JWT",
  });
});

it("creates a POST /users/me/meals route with JWT auth", () => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
    RouteKey: "POST /users/me/meals",
    AuthorizationType: "JWT",
  });
});

it("creates a POST /users/me/weight route with JWT auth", () => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
    RouteKey: "POST /users/me/weight",
    AuthorizationType: "JWT",
  });
});

it("creates a GET /users/me/plans/{weekStart} route with JWT auth", () => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
    RouteKey: "GET /users/me/plans/{weekStart}",
    AuthorizationType: "JWT",
  });
});

// construct ID ベースで各 CRUD Lambda を個別に検証 (spec line 247)
const crudConstructIds = [
  "FetchUserProfileFn",
  "UpdateUserProfileFn",
  "LogMealFn",
  "LogWeightFn",
  "FetchWeeklyPlanFn",
];

for (const constructId of crudConstructIds) {
  it(`creates ${constructId} with TABLE_NAME`, () => {
    const allFunctions = template.findResources("AWS::Lambda::Function");
    const matched = Object.entries(allFunctions).filter(([logicalId]) =>
      logicalId.includes(constructId),
    );
    expect(matched.length).toBeGreaterThanOrEqual(1);
    const [, resource] = matched[0];
    expect(resource.Properties.Environment.Variables).toHaveProperty(
      "TABLE_NAME",
    );
  });
}

it("includes PATCH in CORS allowed methods", () => {
  template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
    CorsConfiguration: {
      AllowMethods: expect.arrayContaining(["PATCH"]),
    },
  });
});
```

- [ ] **Step 3: テスト実行 — FAIL 確認**

Run: `cd infra && pnpm test -- test/fitness-stack.test.ts`
Expected: FAIL (CRUD ルートがまだ存在しない)

- [ ] **Step 4: CrudLambdas construct を作成**

```typescript
// infra/lib/constructs/crud-lambdas.ts
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { Construct } from "constructs";
import * as path from "node:path";

export interface CrudLambdasProps {
  readonly httpApi: HttpApi;
  readonly table: dynamodb.Table;
}

export class CrudLambdas extends Construct {
  constructor(scope: Construct, id: string, props: CrudLambdasProps) {
    super(scope, id);

    /**
     * CRUD Lambda を 1 本作成し、IAM 権限付与 + API ルート登録する。
     * 5 本の Lambda で共通する entry/runtime/env/bundling/grant/route の
     * ボイラープレートを集約。
     */
    const createCrudFunction = (opts: {
      constructId: string;
      lambdaDir: string;
      iamAction: string;
      routePath: string;
      method: HttpMethod;
    }) => {
      const fn = new lambda_nodejs.NodejsFunction(this, opts.constructId, {
        entry: path.join(__dirname, `../../lambdas/${opts.lambdaDir}/index.ts`),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        environment: { TABLE_NAME: props.table.tableName },
        bundling: { externalModules: ["@aws-sdk/*"] },
      });
      props.table.grant(fn, opts.iamAction);
      props.httpApi.addRoutes({
        path: opts.routePath,
        methods: [opts.method],
        integration: new HttpLambdaIntegration(
          `${opts.constructId}Integration`,
          fn,
        ),
      });
      return fn;
    };

    createCrudFunction({
      constructId: "FetchUserProfileFn",
      lambdaDir: "fetch-user-profile",
      iamAction: "dynamodb:GetItem",
      routePath: "/users/me/profile",
      method: HttpMethod.GET,
    });

    createCrudFunction({
      constructId: "UpdateUserProfileFn",
      lambdaDir: "update-user-profile",
      iamAction: "dynamodb:UpdateItem",
      routePath: "/users/me/profile",
      method: HttpMethod.PATCH,
    });

    createCrudFunction({
      constructId: "LogMealFn",
      lambdaDir: "log-meal",
      iamAction: "dynamodb:PutItem",
      routePath: "/users/me/meals",
      method: HttpMethod.POST,
    });

    createCrudFunction({
      constructId: "LogWeightFn",
      lambdaDir: "log-weight",
      iamAction: "dynamodb:PutItem",
      routePath: "/users/me/weight",
      method: HttpMethod.POST,
    });

    createCrudFunction({
      constructId: "FetchWeeklyPlanFn",
      lambdaDir: "fetch-weekly-plan",
      iamAction: "dynamodb:GetItem",
      routePath: "/users/me/plans/{weekStart}",
      method: HttpMethod.GET,
    });
  }
}
```

- [ ] **Step 5: fitness-stack.ts に CrudLambdas を追加**

`infra/lib/fitness-stack.ts` に import を追加:

```typescript
import { CrudLambdas } from "./constructs/crud-lambdas";
```

`new HelloLambda(...)` の後に追加:

```typescript
new CrudLambdas(this, "CrudLambdas", {
  httpApi: api.httpApi,
  table: database.table,
});
```

- [ ] **Step 6: テスト実行 — PASS 確認**

Run: `cd infra && pnpm test`
Expected: 既存テスト + 新 CRUD テストが全て PASS

- [ ] **Step 7: コミット**

```bash
git add infra/lib/constructs/api.ts \
       infra/lib/constructs/crud-lambdas.ts \
       infra/lib/fitness-stack.ts \
       infra/test/fitness-stack.test.ts
git commit -m "feat(infra): add CrudLambdas construct with 5 routes and minimum-privilege IAM"
```

---

## 完了チェックリスト

| 項目                                                                               | Task     |
| ---------------------------------------------------------------------------------- | -------- |
| UpdateUserProfileInput DTO (model_validator で空 {} 拒否)                          | Task 1   |
| LogMealInput DTO                                                                   | Task 1   |
| LogWeightInput DTO                                                                 | Task 1   |
| DTO テスト (境界値 parametrize)                                                    | Task 1   |
| JSON Schema エクスポート + TS 再生成                                               | Task 2   |
| shared/types.ts (Brand / UserId / MealId / FoodId / IsoDateString / ProfilePatch)  | Task 3   |
| shared/auth.ts (getUserId / requireUserId)                                         | Task 3   |
| shared/keys.ts (profileKey / mealKey / weightKey / planKey)                        | Task 3   |
| shared/dynamo.ts (TABLE_NAME fail fast)                                            | Task 3   |
| shared/response.ts (parseJsonBody / requireJsonBody / withServerError を含む)      | Task 3   |
| shared/validation.ts (isValidDate/isValidFoodId/isValidEnum/isInRange/isRecord)    | Task 3   |
| shared モジュールテスト (auth + keys + response + validation)                      | Task 3   |
| fetchUserProfile (GetItem → 200 or 404)                                            | Task 4   |
| updateUserProfile (PATCH + 手書き if ガード + 動的 UpdateExpression)               | Task 5   |
| logMeal (PutItem + crypto.randomUUID)                                              | Task 6   |
| logWeight (PutItem + 冪等上書き)                                                   | Task 7   |
| fetchWeeklyPlan (GetItem + pathParameter)                                          | Task 8   |
| CrudLambdas CDK construct (5 Lambda + 5 route + IAM 最小権限)                      | Task 9   |
| CORS に PATCH 追加                                                                 | Task 9   |
| CDK テスト (route key ベース)                                                      | Task 9   |
| TABLE_NAME 環境変数テスト                                                          | Task 9   |
| TS if ガードと JSON Schema の境界値一致テスト                                      | Task 5   |
| PROFILE_FIELDS ↔ schema.properties 自動一致テスト                                  | Task 5   |
| DynamoDB エラー → 500 テスト (全5 handler)                                         | Task 4-8 |
| createCrudFunction ヘルパーで construct 内の重複排除                               | Task 9   |
