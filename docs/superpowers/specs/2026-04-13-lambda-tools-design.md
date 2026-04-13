# Lambda Tools (経路 B CRUD) 設計書

> **ステータス**: 承認済み
> **関連**: design-decisions.md Section 2.1 経路 B (単純 CRUD)

---

## 目的

経路 B (Next.js BFF → API Gateway → Lambda 直接) の CRUD Lambda を 5 本実装し、ユーザーデータの読み書きを API として提供する。Strands Agent 経由の経路 A とは独立して動作する。

---

## スコープ

### 含む

- fetchUserProfile / updateUserProfile / logMeal / logWeight / fetchWeeklyPlan の 5 Lambda
- API Gateway ルート追加 (Cognito JWT Authorizer で保護)
- 共通モジュール (JWT sub 抽出、Branded Type、DynamoDB key helper、DynamoDB client、レスポンス/Fail-Fast helper)
- CDK construct + テスト
- 入力 DTO を contracts-py 起点で定義 (UpdateUserProfileInput, LogMealInput, LogWeightInput)。schema export + contracts-ts 再生成まで含む

### 含まない

- generateMealPlan / suggestSnackSwaps (経路 A の Agent tool) → Plan 06
- Next.js BFF → Plan 07
- Cognito ユーザー管理 UI → Phase 2

---

## 入力 DTO (contracts-py 起点)

design-decisions.md の「DTO の唯一の真実は Pydantic v2」に従い、CRUD Lambda の入力を contracts-py で定義する。Lambda (TS) では生成された JSON Schema で手書き if ガードの参照元にし、生成された TS 型を field 名・literal union の single source of truth として参照する。Zod は Lambda バンドルに含めない。`userId` / `mealId` / `foodId` / `YYYY-MM-DD` は boundary parse 後に Branded Type へ昇格し、pk/sk は専用 helper で組み立てる。

### UpdateUserProfileInput

```python
class UpdateUserProfileInput(BaseModel):
    """プロフィール部分更新の入力。全フィールド optional (PATCH セマンティクス)。

    - 最低 1 フィールドは必須 (空 {} は 400)。model_validator で検証
    - None 値は「フィールド未送信」と同義 (属性削除ではない)。
      Lambda は None のフィールドを UpdateItem の更新式から除外する
    - 属性削除 API は未提供。MVP では一度設定した値は上書きのみ可能
    """

    name: str | None = None
    age: int | None = Field(default=None, ge=18, le=120)
    sex: Literal["male", "female"] | None = None
    height_cm: float | None = Field(default=None, gt=0, lt=300)
    weight_kg: float | None = Field(default=None, gt=0, lt=500)
    activity_level: Literal[
        "sedentary", "lightly_active", "moderately_active",
        "very_active", "extremely_active",
    ] | None = None
    desired_pace: Literal["steady", "aggressive"] | None = None
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"] | None = None
```

### LogMealInput

```python
class LogMealInput(BaseModel):
    """食事ログの入力。"""

    date: date = Field(description="YYYY-MM-DD (datetime.date — Pydantic が自動パース、不存在日付を拒否)")
    food_id: str = Field(min_length=1, description="FCT2020 食品番号")
    amount_g: float = Field(gt=0)
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
```

### LogWeightInput

```python
class LogWeightInput(BaseModel):
    """体重ログの入力。"""

    date: date = Field(description="YYYY-MM-DD (datetime.date — Pydantic が自動パース、不存在日付を拒否)")
    weight_kg: float = Field(gt=0, lt=500)
```

---

## Lambda 一覧と API Gateway ルート

| Lambda            | メソッド | パス                          | DynamoDB 操作 | IAM 権限            |
| ----------------- | -------- | ----------------------------- | ------------- | ------------------- |
| fetchUserProfile  | GET      | `/users/me/profile`           | GetItem       | dynamodb:GetItem    |
| updateUserProfile | PATCH    | `/users/me/profile`           | UpdateItem    | dynamodb:UpdateItem |
| logMeal           | POST     | `/users/me/meals`             | PutItem       | dynamodb:PutItem    |
| logWeight         | POST     | `/users/me/weight`            | PutItem       | dynamodb:PutItem    |
| fetchWeeklyPlan   | GET      | `/users/me/plans/{weekStart}` | GetItem       | dynamodb:GetItem    |

- パスは `/users/me/...` で統一。`me` は JWT の `sub` に解決 (IDOR 防止)
- 全ルートは Plan 03 の Cognito JWT Authorizer (defaultAuthorizer) で保護

---

## DynamoDB アクセスパターン

Plan 03 の FitnessTable (single-table) を使用。

| Lambda            | pk           | sk                   |
| ----------------- | ------------ | -------------------- |
| fetchUserProfile  | `user#<sub>` | `profile`            |
| updateUserProfile | `user#<sub>` | `profile`            |
| logMeal           | `user#<sub>` | `meal#<date>#<uuid>` |
| logWeight         | `user#<sub>` | `weight#<date>`      |
| fetchWeeklyPlan   | `user#<sub>` | `plan#<weekStart>`   |

---

## 各 Lambda の入出力仕様

### fetchUserProfile

- **入力**: なし (JWT sub のみ)
- **出力**: `{ profile: { ... } }` または 404
- **DynamoDB**: `GetItem(pk=user#<sub>, sk=profile)`
- **プロフィール未作成時**: 404

### updateUserProfile

- **入力**: リクエストボディに UpdateUserProfileInput の部分フィールド
- **バリデーション**: 手書き if ガード。参照元は contracts-py 生成の JSON Schema (UpdateUserProfileInput.schema.json)。空 `{}` は 400 (at least one field required)。`null` 値のフィールドは更新式から除外 (属性削除ではない)
- **出力**: `{ profile: { ... } }` (更新後の全フィールド。UpdateItem の ReturnValues=ALL_NEW)
- **DynamoDB**: `UpdateItem(pk=user#<sub>, sk=profile)` — リクエストに含まれる非 null フィールドのみ更新。未送信/null フィールドは既存値を保持。`updated_at` (ISO 8601) を自動付与 (監査・競合調査用)
- **セマンティクス**: PATCH (部分更新)。オンボーディングの段階保存と互換
- **プロフィール未作成時**: UpdateItem が自動的にアイテムを作成 (DynamoDB の挙動)

### logMeal

- **入力**: LogMealInput (`{ date, food_id, amount_g, meal_type }`)
- **出力**: `{ meal: { meal_id, date, food_id, amount_g, meal_type, logged_at } }`
- **DynamoDB**: `PutItem(pk=user#<sub>, sk=meal#<date>#<uuid>)`
- **meal_id**: Lambda 側で `crypto.randomUUID()` を生成

### logWeight

- **入力**: LogWeightInput (`{ date, weight_kg }`)
- **出力**: `{ weight: { date, weight_kg, logged_at } }`
- **DynamoDB**: `PutItem(pk=user#<sub>, sk=weight#<date>)`
- **同日再記録**: 上書き (sk=`weight#<date>` が同じなので冪等)。設計上の決定: 1 日 1 レコード。体重は朝の定点測定を想定し、日中の変動は記録しない。履歴が必要になった場合は sk を `weight#<date>#<time>` に拡張する (後方互換可)

### fetchWeeklyPlan

- **入力**: パスパラメータ `weekStart` (例: `2026-04-13` — 月曜日)
- **出力**: `{ plan: { ... } }` または 404
- **DynamoDB**: `GetItem(pk=user#<sub>, sk=plan#<weekStart>)`
- **weekStart 正規化ルール**: YYYY-MM-DD 形式、月曜起点、UTC。Lambda はパスパラメータをそのまま sk に使う。正規化 (入力日 → その週の月曜) は BFF 側 (Plan 07) の責務。Lambda は渡された値をそのまま key にする

---

## 共通モジュール

`infra/lambdas/shared/` に配置。esbuild が各 Lambda バンドル時にインライン化。

### types.ts — Branded Type と DTO 由来型

```typescript
type Brand<T, B extends string> = T & { readonly __brand: B };

type UserId = Brand<string, "UserId">;
type MealId = Brand<string, "MealId">;
type FoodId = Brand<string, "FoodId">;
type IsoDateString = Brand<string, "IsoDateString">;

// generated TS 型から field 名 / literal union を参照し、手書き string を減らす
type ProfilePatch = Partial<UpdateUserProfileInput>;
type MealType = LogMealInput["meal_type"];
```

Branded Type の `as` は生成関数の内部だけで許可する。handler・テスト・key 組み立てでは素の `string` を直接受け渡さない。

### auth.ts — JWT sub 抽出

```typescript
type AuthResult = { ok: true; userId: UserId } | { ok: false };
type RequireUserResult =
  | { ok: true; userId: UserId }
  | { ok: false; response: APIGatewayProxyResultV2 };

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
  return auth.ok ? auth : { ok: false, response: unauthorized() };
}
```

例外ではなく Result 型で返す。handler では `requireUserId()` を使って 401 fail-fast を共通化する。

### keys.ts — pk/sk 組み立て

```typescript
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

pk/sk のテンプレート文字列を各 handler に散らさず、userId/date/uuid の取り違えを型で防ぐ。

### dynamo.ts — DynamoDB client

```typescript
// Lambda の外で初期化 (コンテナ再利用時にコネクション使い回し)
// 環境変数 TABLE_NAME からテーブル名取得
```

### response.ts — HTTP レスポンスヘルパー

```typescript
export function ok(body: unknown) { ... }            // 200
export function badRequest(message: string) { ... }   // 400
export function unauthorized() { ... }                // 401
export function notFound() { ... }                    // 404
export function serverError() { ... }                 // 500
export function parseJsonBody(event) { ... }          // { ok: true, body } | { ok: false, reason }
export function requireJsonBody(event) { ... }        // 400 fail-fast
export function withServerError(label, work) { ... }  // 共通 try/catch
// エラーレスポンスに内部情報を含めない
```

`parseJsonBody()` は body 未送信と JSON 壊れを別 reason で返し、`requireJsonBody()` が 400 レスポンスへ変換する。これにより「missing body」と「invalid JSON」を黙って同一視しない。

---

## CDK 構成

### construct

```
infra/lib/constructs/crud-lambdas.ts
```

`CrudLambdas` construct が DynamoDB テーブルと HttpApi を受け取り、5 つの NodejsFunction + 5 つの API route を作成。

### IAM — 最小権限

- Lambda の実行ロールは CDK 自動生成 (AssumeRole: lambda.amazonaws.com)
- `table.grant()` で個別アクション指定:
  - fetchUserProfile, fetchWeeklyPlan: `dynamodb:GetItem` のみ
  - updateUserProfile: `dynamodb:UpdateItem` のみ
  - logMeal, logWeight: `dynamodb:PutItem` のみ
  - `grantReadData` / `grantWriteData` は使わない (不要な権限を付与しない)

### 環境変数

全 Lambda に `TABLE_NAME` を渡す (`database.table.tableName`)。

### ファイル構成

```
infra/lambdas/
├── shared/
│   ├── types.ts
│   ├── auth.ts
│   ├── keys.ts
│   ├── dynamo.ts
│   ├── response.ts
│   └── validation.ts
├── fetch-user-profile/
│   └── index.ts
├── update-user-profile/
│   └── index.ts
├── log-meal/
│   └── index.ts
├── log-weight/
│   └── index.ts
└── fetch-weekly-plan/
    └── index.ts
```

---

## テスト方針

### CDK テスト (infra/test/fitness-stack.test.ts)

既存テストに追加。route key と construct ID ベースで特定の CRUD Lambda を検証:

- `GET /users/me/profile` ルートが存在すること
- `PATCH /users/me/profile` ルートが存在すること
- `POST /users/me/meals` ルートが存在すること
- `POST /users/me/weight` ルートが存在すること
- `GET /users/me/plans/{weekStart}` ルートが存在すること
- 各 CRUD Lambda に `TABLE_NAME` 環境変数があること

### Lambda 単体テスト (infra/test/lambdas/)

- 各 Lambda の handler を直接 import して呼び出し
- DynamoDB DocumentClient をモック (外部境界のためモック許容)
- 正常系 + 404 + バリデーションエラーのケース
- updateUserProfile: 部分更新で未送信フィールドが保持されることを検証
- updateUserProfile: 空 `{}` で 400 が返ること
- updateUserProfile: `null` 値フィールドが更新式から除外されること

### shared モジュールテスト

- `getUserId`: 正常 (sub あり) / 異常 (sub なし、空文字)
- `requireUserId`: 401 fail-fast を返すこと
- `keys`: branded input から正しい pk/sk が組み立つこと
- `response`: 各ヘルパー (ok, badRequest, unauthorized, notFound, serverError, withServerError) のステータスコードとフォーマット
- `parseJsonBody` / `requireJsonBody`: missing body と invalid JSON を区別すること

---

## スコープ外

- generateMealPlan / suggestSnackSwaps (経路 A) → Plan 06
- Next.js BFF からの呼び出し → Plan 07
- weekStart の正規化ロジック (入力日 → 月曜) → Plan 07 (BFF 側)
- レート制限 → Phase 2
