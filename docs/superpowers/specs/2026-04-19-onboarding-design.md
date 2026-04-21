# Onboarding Flow 設計書 (Plan 07)

> **ステータス**: 承認待ち
> **関連**: `2026-04-11-design-decisions.md` §2.2 Onboarding 形態, §2.1 経路 B/C, §3.5 Memory マッピング
> **前提 Plan**: Plan 06 (Next.js Bootstrap) 完了済み
> **Revision**: 2026-04-19 初版での UserProfile 契約不足 / middleware 誤認 / contracts-ts パイプライン誤読 / stage cookie 矛盾 / UI 依存不足を修正

---

## 目的

`architecture.md` §6-7 の必須入力項目と `ui-architecture.md` §7 の 7 段会話風ステップフォームを実装し、ユーザーが UserProfile を段階的に構造化入力できる Onboarding フローを構築する。Safety Guard の決定的ルールにより医療リスクを遮断し、各画面の Coach prompt を LLM で動的生成する (経路 C)。

Plan 生成 (経路 A, AgentCore Runtime) は **Plan 08 以降**。Plan 07 完了時点では Onboarding 完了 → `/home` のプレースホルダー表示まで。

---

## スコープ

### 含む

- 7 画面の Onboarding フロー (Safety → Stats → Lifestyle → Preferences → Snacks → Feasibility → Review)
- Blocked 画面 (`/onboarding/blocked`)
- 中断→再開ロジック (`onboarding_stage` フィールドによる再開画面判定)
- Coach prompt 先読み生成 (経路 C, Vercel AI SDK `generateText`, Anthropic Haiku)
- Free-text parse (Preferences / Snacks / Lifestyle の 3 画面、Anthropic structured output)
- Safety 決定的ルール判定 (クライアント純粋関数 + サーバー二重防御)
- Review 画面の編集導線 (各セクション画面への redirect back)
- 画面遷移ごとの `PATCH /users/me/profile` autosave
- **contracts-py の UserProfile / UpdateUserProfileInput の大幅拡張**（全 Onboarding フィールド）
- **`UserProfile` を `MODEL_REGISTRY` に登録**（現状は手書き管理のため自動生成対象外）
- **Lambda 側 `PROFILE_FIELDS` / `ProfilePatch` / `ProfileRowSchema` の拡張**
- Onboarding 専用 auth gate (Server Component layout + 各 page での redirect)
- shadcn UI primitives の追加導入 (Progress / ToggleGroup / Slider / Alert / Skeleton / Textarea)
- 対応する Radix UI 依存追加

### 含まない

- Plan 生成 (経路 A, `generateMealPlan` / `suggestSnackSwaps`) → Plan 08
- Home の実コンテンツ (Daily Summary / Meal Cards / Coach Insight / Progress Ring) → Plan 07 後続または Plan 08
- Chat (SSE streaming, AI SDK `useChat`) → Plan 08+
- WeeklyCheckIn 画面 + 体重入力モーダル → Plan 09 以降 (Phase 1 後半)
- invite code 検証 → Plan 03 の pre-signup Lambda で完結済み
- `proxy.ts` (Edge Middleware) の本格 gate 化 → 現状パススルーのままとし、auth/stage gate は Server Component 側で実施

---

## アーキテクチャ

### データフロー

```
Browser (React)
  │
  ├─ 画面マウント時 (Server Component layout)
  │    └─ getSession() で cookie 認証
  │    └─ fetch('/users/me/profile') 経由 (内部的に getValidAccessToken → API Gateway)
  │    └─ profile.onboardingStage に応じて redirect
  │         ├─ 未認証                    → /signin
  │         ├─ blocked + path != blocked → /onboarding/blocked
  │         ├─ complete + path が /onboarding → /home
  │         └─ stage !== current path    → 該当 stage へ
  │
  ├─ 画面マウント時 (Client Component)
  │    └─ CoachPromptCard: queryKey ["coach-prompt", currentStage] で先読みキャッシュを subscribe
  │
  ├─ 画面「次へ」押下時
  │    ├─ 1. クライアント Zod バリデーション (UpdateUserProfileInputSchema 拡張)
  │    ├─ 2. Safety 画面のみ: evaluateSafetyRisk(inputs) で blocked 判定
  │    ├─ 3. PATCH /api/proxy/users/me/profile
  │    │       body: 当画面フィールド + onboarding_stage: <次画面> [+ blocked_reason]
  │    ├─ 4. POST /api/onboarding/coach-prompt (次画面分 先読み、バックグラウンド)
  │    ├─ 5. Preferences / Snacks / Lifestyle のみ: POST /api/onboarding/free-text-parse (バックグラウンド)
  │    └─ 6. router.push(<次画面>)
  │
  └─ 3-5 は並列実行、6 は 3 の完了を待つ。4-5 は fire-and-forget
```

### 経路マッピング

| 通信                                 | 経路 | 実装                                                                    |
| ------------------------------------ | ---- | ----------------------------------------------------------------------- |
| `PATCH /users/me/profile` (autosave) | B    | Route Handler プロキシ (既存) → API Gateway → `update-user-profile` Lambda |
| `GET /users/me/profile` (初回取得)   | B    | Route Handler プロキシ (既存) → API Gateway → `fetch-user-profile` Lambda  |
| Coach prompt 生成                    | C    | 新規 Route Handler → Anthropic API (Vercel AI SDK `generateText`)       |
| Free-text parse                      | C    | 新規 Route Handler → Anthropic API (Vercel AI SDK `generateObject`)     |

### 責務分離

| レイヤー                                | 責務                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `app/onboarding/layout.tsx` (Server)    | 認証必須 + profile 取得 + stage に基づく redirect (唯一の gate)                   |
| `app/onboarding/*/page.tsx` (Client 中心) | UI 描画と `useOnboarding` 経由の操作のみ。React 内部では camelCase のみを扱う      |
| Client hook `useOnboarding`             | camelCase ViewModel を参照し、boundary で DTO 変換して `patch()` / `prefetchCoachPrompt` / `parseFreeText` |
| Route Handler (`/api/onboarding/*`)     | Anthropic API 呼び出し (server-only secret 使用)                                  |
| Route Handler (`/api/proxy/*`)          | Plan 06 で実装済み、**変更なし**                                                  |
| Lambda `update-user-profile`            | 拡張された `ProfileField` を Zod で受理、Dynamo PATCH                              |
| Lambda `fetch-user-profile`             | `ProfileRowSchema` の拡張に追従                                                   |
| Client 純粋関数 `evaluateSafetyRisk`    | Safety 決定的ルール判定                                                           |
| Lambda 共有 `evaluateSafetyGuard`       | サーバー二重防御 (TypeScript 再実装、`fitness_engine.onboarding_safety` adapter と等価テスト)  |

### Middleware (`packages/web/proxy.ts`) の扱い

**現状: 完全パススルー**（`NextResponse.next()` のみ）。Plan 07 でも **パススルーのまま変更しない**。

理由:

- 現行の auth gate は `(app)/layout.tsx` の Server Component パターン（`getSession()` → `redirect("/signin")`）で成立
- 同じパターンで `app/onboarding/layout.tsx` を作れば、追加の middleware ロジックなしで gate 可能
- middleware で `__fitness_stage` cookie を読む設計は cookie 発行経路の新設を要し、proxy route に cookie 更新フックを追加する侵襲的変更が必要（現行 proxy route は upstream を透過転送するだけ）
- Server Component で profile を fetch して stage を判定する方が、cookie 鮮度問題（PATCH 後の stage cookie 再セット）がなく、単一の真実に基づく

### 命名境界

- contracts-py / contracts-ts / Lambda / HTTP body / Route Handler は **snake_case**
- web の boundary (`getProfileServerSide`, `useProfile`, `useUpdateProfile`, `useOnboarding`) で DTO を **camelCase ViewModel** に変換
- React Component / Server Component / hook / props / local state は **camelCase**
- 送信時は ViewModel→DTO mapper を通して `UpdateUserProfileInput` / Route Handler body の `snake_case` に戻す

---

## 契約変更 (contracts-py / contracts-ts 生成パイプライン)

### パイプライン現状の確認

- `packages/contracts-py/src/fitness_contracts/schema_export.py` の `MODEL_REGISTRY` にある Pydantic model のみが JSON Schema として出力される
- **`UserProfile` は現状 `MODEL_REGISTRY` に未登録**（`packages/contracts-ts/schemas/UserProfile.schema.json` は手書きと想定される）
- `UpdateUserProfileInput` は登録済み
- TypeScript の型生成は `packages/contracts-ts/scripts/*.mjs` が `schemas/*.json` を入力として `generated/types.d.ts` を出力
- Zod スキーマは `json-schema-to-zod` で `schemas/*.ts` に出力される想定

### Plan 07 で追加するアクション

1. **新規 Pydantic モデル `UserProfile` を作成** し `MODEL_REGISTRY` に登録する
   - 配置: `packages/contracts-py/src/fitness_contracts/models/profile/user_profile.py`
   - 既存 `packages/contracts-ts/schemas/UserProfile.schema.json` (手書き) は削除し、自動生成に置き換える
   - `schema_export.py` の `MODEL_REGISTRY` に `("UserProfile", UserProfile)` を追加
2. **`UpdateUserProfileInput` を拡張** し、全 Onboarding フィールド + `onboarding_stage` + `blocked_reason` + `*_note` を optional で追加
   - `x-at-least-one-not-null` リストも拡張
3. **`UserProfile` も同じフィールドを optional で持つ** (DynamoDB の形状を保証)

### 追加フィールド一覧

#### Safety セクション (6 boolean + 2 free text)

| フィールド                      | 型                           | 用途                                   |
| ------------------------------- | ---------------------------- | -------------------------------------- |
| `has_medical_condition`         | `bool \| None`               | 持病あり                               |
| `is_under_treatment`            | `bool \| None`               | 通院中                                 |
| `on_medication`                 | `bool \| None`               | 服薬中                                 |
| `is_pregnant_or_breastfeeding`  | `bool \| None`               | 妊娠/授乳中 (blocked 条件)             |
| `has_doctor_diet_restriction`   | `bool \| None`               | 医師から食事制限 (blocked 条件)        |
| `has_eating_disorder_history`   | `bool \| None`               | 摂食障害既往 (blocked 条件)            |
| `medical_condition_note`        | `str \| None`                | 持病詳細 (条件付き Textarea)           |
| `medication_note`               | `str \| None`                | 服薬詳細 (条件付き Textarea)           |

#### Stats セクション (goal 系 2 個が追加)

既存: `age` / `sex` / `height_cm` / `weight_kg` / `desired_pace`

| フィールド            | 型                                                    | 用途            |
| --------------------- | ----------------------------------------------------- | --------------- |
| `goal_weight_kg`      | `float \| None` (gt=0, lt=500)                        | 目標体重        |
| `goal_description`    | `str \| None`                                         | 目標の感覚記述  |

#### Lifestyle セクション (既存: `sleep_hours` / `stress_level`)

| フィールド             | 型                                                                          | 用途                       |
| ---------------------- | --------------------------------------------------------------------------- | -------------------------- |
| `job_type`             | `Literal["desk", "standing", "light_physical", "manual_labour", "outdoor"] \| None` | 仕事タイプ          |
| `workouts_per_week`    | `int \| None` (ge=0, le=14)                                                 | 運動頻度                   |
| `workout_types`        | `list[str] \| None`                                                         | 運動種別                   |
| `alcohol_per_week`     | `str \| None`                                                               | 飲酒量 (週当たり記述)      |
| `lifestyle_note`       | `str \| None`                                                               | Free-text parse 結果       |

`activity_level` は既存だが Onboarding では直接入力せず、`workouts_per_week` + `job_type` から派生させる (Plan 08 の engine 側で計算)。Plan 07 では入力 UI を持たず、`activity_level` は null のまま保存される。

#### Preferences セクション

| フィールド                 | 型                                                           | 用途                   |
| -------------------------- | ------------------------------------------------------------ | ---------------------- |
| `favorite_meals`           | `list[str] \| None` (max 5)                                  | 好きな料理 5 つ        |
| `hated_foods`              | `list[str] \| None`                                          | 嫌いな食材             |
| `restrictions`             | `list[str] \| None`                                          | アレルギー・制限       |
| `cooking_preference`       | `Literal["scratch", "quick", "batch", "mixed"] \| None`      | 調理スタイル           |
| `food_adventurousness`     | `int \| None` (ge=1, le=10)                                  | 食の冒険度             |
| `preferences_note`         | `str \| None`                                                | Free-text parse 結果   |

#### Snacks セクション

| フィールド                | 型                                                                 | 用途                   |
| ------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `current_snacks`          | `list[str] \| None`                                                | 現在の間食             |
| `snacking_reason`         | `Literal["hunger", "boredom", "habit", "mixed"] \| None`           | 間食理由               |
| `snack_taste_preference`  | `Literal["sweet", "savory", "both"] \| None`                       | 味の好み               |
| `late_night_snacking`     | `bool \| None`                                                     | 夜食の有無             |
| `snacks_note`             | `str \| None`                                                      | Free-text parse 結果   |

#### Feasibility セクション

| フィールド                   | 型                                                             | 用途                   |
| ---------------------------- | -------------------------------------------------------------- | ---------------------- |
| `eating_out_style`           | `Literal["mostly_home", "mostly_eating_out", "mixed"] \| None` | 外食中心か自炊中心か   |
| `budget_level`               | `Literal["low", "medium", "high"] \| None`                     | 月の食費感             |
| `meal_frequency_preference`  | `int \| None` (ge=1, le=6)                                     | 1 日の食事回数         |
| `location_region`            | `str \| None`                                                  | 居住国                 |
| `kitchen_access`             | `str \| None`                                                  | キッチン設備 (自由記述) |
| `convenience_store_usage`    | `Literal["low", "medium", "high"] \| None`                     | コンビニ利用頻度       |

#### Meta (Onboarding 進行管理)

| フィールド          | 型                                                                                                                                            | 用途                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `onboarding_stage`  | `Literal["safety", "stats", "lifestyle", "preferences", "snacks", "feasibility", "review", "complete", "blocked"] \| None`                  | 中断→再開・Review 編集時の制御  |
| `blocked_reason`    | `str \| None`                                                                                                                                 | Safety blocked 時の理由 (監査用) |

### 新規モデル (Coach prompt / Free-text parse)

```python
# packages/contracts-py/src/fitness_contracts/models/onboarding/coach_prompt.py

class CoachPromptRequest(BaseModel):
    target_stage: OnboardingStage
    profile_snapshot: dict[str, Any]

class CoachPromptResponse(BaseModel):
    prompt: str
    cached: bool

# packages/contracts-py/src/fitness_contracts/models/onboarding/free_text_parse.py

class FreeTextParseRequest(BaseModel):
    stage: Literal["lifestyle", "preferences", "snacks"]
    free_text: str
    structured_snapshot: dict[str, Any]

class FreeTextParseResponse(BaseModel):
    note_field: Literal["lifestyle_note", "preferences_note", "snacks_note"]
    extracted_note: str
    suggested_tags: list[str]
```

いずれも `MODEL_REGISTRY` に追加する。

### Lambda 側の追従作業

- `infra/lambdas/shared/profile-types.ts` の `PROFILE_FIELDS` / `ProfilePatch` を新フィールド全数分拡張する
- `infra/lambdas/shared/db-schemas.ts` の `ProfileRowSchema` を新フィールドを含めて再生成（Zod 生成パイプラインが自動で更新する前提。失敗する場合は手動追記）
- `infra/lambdas/shared/dynamo-expression.ts` の `buildProfileUpdateExpression` は field 名ベースなので変更不要 (動作確認のみ)
- `update-user-profile/index.ts` の `toProfileMutation` は `PROFILE_FIELDS` を反復するため、フィールド追加だけで自動追従

### 生成パイプラインの実行

`packages/contracts-py` は pnpm workspace package ではなく、uv / pyproject.toml 管理の Python パッケージ。以下のいずれかを使う：

```bash
# 方法 A: Makefile (推奨、repo 標準)
make contracts            # contracts-py + contracts-ts を連続実行

# 方法 B: 個別実行
.venv/bin/python -m fitness_contracts.schema_export packages/contracts-ts/schemas
pnpm --filter @fitness/contracts-ts generate
```

Plan 07 の実装計画では `make contracts` を 1 タスクとして明示的に含める（Pydantic 追加 → schema_export → TS 型 + Zod 再生成の順序）。

---

## ルーティング

```
/onboarding                  → layout で profile.onboardingStage を読み該当画面へ redirect
/onboarding/safety           → Safety 画面 (LLM parse 無効)
/onboarding/stats            → 身体情報
/onboarding/lifestyle        → 生活パターン + free-text
/onboarding/preferences      → 食の嗜好 + free-text
/onboarding/snacks           → 間食傾向 + free-text
/onboarding/feasibility      → 実現可能性
/onboarding/review           → 全セクション summary + 編集 + 「プランを作成する」CTA
/onboarding/blocked          → Safety blocked 時の停止画面
```

### ディレクトリ配置

Next.js App Router の route group (`(...)`) は **URL には出ない**。`/onboarding/...` という URL を実現するには、実 URL セグメント `onboarding/` を持つディレクトリが必要。本 Plan では route group を使わず、素直に以下の構成とする：

```
packages/web/src/app/
├── (app)/                         ← 既存 (route group、URL には出ない)
│   ├── layout.tsx                 ← AppShell + 認証 + stage=complete ガード
│   ├── home/page.tsx
│   ├── plan/page.tsx
│   └── ...
├── (auth)/                        ← 既存 (route group)
│   ├── layout.tsx
│   ├── signin/page.tsx
│   └── signup/page.tsx
└── onboarding/                    ← 新規 (実 URL セグメント)
    ├── layout.tsx                 ← OnboardingShell + 認証 + stage ガード
    ├── page.tsx                   ← /onboarding エントリ (stage から該当画面へ redirect)
    ├── safety/page.tsx
    ├── stats/page.tsx
    ├── lifestyle/page.tsx
    ├── preferences/page.tsx
    ├── snacks/page.tsx
    ├── feasibility/page.tsx
    ├── review/page.tsx
    └── blocked/page.tsx
```

### `app/onboarding/layout.tsx` の実装 (Server Component)

`(app)/layout.tsx` と同パターンで、以下を実装する:

```ts
// packages/web/src/app/onboarding/layout.tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { getProfileServerSide } from "@/lib/profile/server";
import { stageForPath, pathForStage } from "@/lib/onboarding/stage-routing";

export default async function OnboardingLayout({
  children,
}: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/signin");

  const profile = await getProfileServerSide();
  const stage = profile?.onboardingStage ?? "safety";

  // `complete` は /home へ (Onboarding 不要)
  if (stage === "complete") redirect("/home");

  const pathname = (await headers()).get("x-next-pathname") ?? "";
  const pathStage = stageForPath(pathname);

  if (pathname === "/onboarding") {
    return <OnboardingShell profile={profile}>{children}</OnboardingShell>;
  }

  // blocked は専用画面に固定
  if (stage === "blocked" && pathStage !== "blocked") {
    redirect("/onboarding/blocked");
  }

  // review 到達後は任意セクション編集を許可し、各 Form が review に戻す
  if (stage !== "review" && stage !== "blocked" && pathStage !== stage) {
    redirect(pathForStage(stage));
  }

  return <OnboardingShell profile={profile}>{children}</OnboardingShell>;
}
```

`x-next-pathname` は `proxy.ts` (現状パススルー) に 1 行追加する軽微な変更で header 経由に露出させる。これは既存の pass-through 方針を壊さない拡張 (proxy.ts の `NextResponse.next({ request: { headers } })` パターン)。

### ガードは layout 一元化、page は UI に専念

**方針**: stage 整合性ガードは **layout のみが正** とし、page 側では重複 redirect を書かない。

理由:

- App Router の page は layout の props を直接受け取れないため、page で再度 `getProfileServerSide()` を呼ぶと重複 fetch が発生する
- React `cache()` で共有する手もあるが、Plan 07 の規模では YAGNI
- layout は path 書き換えも含めて強制するため、page に到達した時点で stage 整合性は保証されている
- page は自身の stage 固有 UI 実装（入力コンポーネント + `useOnboarding` hook 呼び出し）に集中する

### `lib/onboarding/stage-routing.ts`

```ts
// 純粋関数。Unit テスト対象
export type OnboardingStage = "safety" | "stats" | "lifestyle"
  | "preferences" | "snacks" | "feasibility" | "review" | "blocked";

export function pathForStage(stage: OnboardingStage): string {
  // "safety" → "/onboarding/safety"
}

export function stageForPath(pathname: string): OnboardingStage | null {
  // "/onboarding/stats" → "stats"
}
```

### `(app)/layout.tsx` 側の追加ガード

現状の `(app)/layout.tsx` は未認証のみ redirect している。`onboardingStage !== "complete"` のユーザーが `/home` に直接アクセスしたら `/onboarding` へ redirect するガードを追加する:

```ts
const profile = await getProfileServerSide();
if (profile?.onboardingStage !== "complete") {
  redirect("/onboarding");
}
```

### `lib/profile/server.ts` の新設

Server Component から profile を取るための薄いラッパー。既存の `/api/proxy/users/me/profile` をサーバー内 fetch するか、`getAccessToken` + `fetch(API_GATEWAY_URL/...)` を直接叩く。後者の方が proxy の Route Handler を介さない分高速。web ではこの fetch の直後に `profile-mappers.ts` で DTO→ViewModel 変換を行い、以後の React コードは camelCase だけを見る。

---

## 画面仕様

### 共通レイアウト (ui-architecture.md §7.1)

```
┌──────────────────────────────┐
│ ←   セットアップ        X/7   │ TopBar
├──────────────────────────────┤
│ [====----]                   │ ProgressBar (X/7 * 100%)
│                              │
│ ┌ CoachPromptCard ──────────┐│
│ │ (LLM 生成 2-4 文)         ││
│ └───────────────────────────┘│
│                              │
│ [Input region]               │
│                              │
│ [戻る]           [次へ →]    │
└──────────────────────────────┘
```

### 各画面の入力項目

| 画面          | 項目                                                                                                           | UI 部品                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Safety        | 持病 / 通院中 / 服薬 / 妊娠授乳 / 医師制限 / 摂食障害既往                                                       | `SegmentedControl` (Yes/No) ×6 + 条件付き `Textarea` ×2                                                          |
| Stats         | age / sex / height_cm / weight_kg / (goal_weight_kg or goal_description) / desired_pace                         | `NumberField` ×3 + `ChoiceChips` (sex) + 切替 `NumberField` or `Textarea` + `SegmentedControl` (pace)            |
| Lifestyle     | job_type / workouts_per_week / workout_types / sleep_hours / stress_level / alcohol_per_week + **free-text**   | `ChoiceChips` + `Stepper` + `MultiTagInput` + `NumberField` + `SegmentedControl` + `Textarea` + `Textarea`       |
| Preferences   | favorite_meals (5つ) / hated_foods / restrictions / cooking_preference / food_adventurousness + **free-text**  | `MultiTagInput` ×3 + `ChoiceChips` + `Slider` (1-10) + `Textarea`                                                |
| Snacks        | current_snacks / snacking_reason / snack_taste_preference / late_night_snacking + **free-text**                | `MultiTagInput` + `SegmentedControl` ×2 + `SegmentedControl` (Yes/No) + `Textarea`                               |
| Feasibility   | eating_out_style / budget_level / meal_frequency_preference / location_region / kitchen_access / convenience_store_usage | `SegmentedControl` + `ChoiceChips` + `Stepper` + `Autocomplete` + `Textarea` + `SegmentedControl`                |
| Review        | 全セクション summary card + 編集ボタン                                                                         | `SectionSummaryCard` ×6 + 「プランを作成する」CTA                                                                |

### Review 画面の編集導線

- 各 `SectionSummaryCard` に「編集」ボタン
- クリック → 該当セクション画面へ遷移 (`/onboarding/stats` 等)
- `profile.onboardingStage === "review"` のユーザーは layout で任意セクション画面への進入を許可する
- 該当画面の「次へ」押下時、`profile.onboardingStage === "review"` なら通常の次 stage ではなく `/onboarding/review` へ戻る
- `PATCH` 時は `onboarding_stage` を `review` のまま維持 (通常遷移時の stage 更新ロジックを分岐させる)
- Safety 画面で再編集した結果 blocked になった場合は `/onboarding/blocked` へ遷移 (review への復帰より優先)

### 「プランを作成する」CTA (Review 画面)

Plan 07 時点では Plan 生成 (経路 A) がないため、押下時の挙動：

1. `PATCH /users/me/profile` で `onboarding_stage: "complete"` に更新
2. `router.push("/home")`
3. `/home` は既存プレースホルダー (Plan 06 で実装済み)。Plan 08 で経路 A 呼び出しに差し替え

---

## Safety 判定

### クライアント側純粋関数 (`lib/onboarding/safety.ts`)

```ts
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
  | { level: "safe"; blockedReason: null }
  | { level: "caution"; blockedReason: null; warnings: string[] }
  | { level: "blocked"; blockedReason: string; reasons: string[] };

export function evaluateSafetyRisk(input: SafetyInput): SafetyResult;
```

### Blocked 判定ルール (architecture.md §15.1)

以下のいずれかに該当 → `blocked`:

1. `isPregnantOrBreastfeeding === true`
2. `hasEatingDisorderHistory === true`
3. `hasDoctorDietRestriction === true`

### Caution 判定 (architecture.md §15.2)

以下に該当 → `caution` (Onboarding は継続、UI 上で `CautionBanner` 表示):

- `hasMedicalCondition === true` かつ上記 blocked 条件非該当
- `onMedication === true` かつ上記 blocked 条件非該当

### サーバー側二重防御

`update-user-profile` Lambda (TypeScript) で以下検証：

- `onboarding_stage === "blocked"` の PATCH 時、`blocked_reason` が必須
- `is_pregnant_or_breastfeeding / has_eating_disorder_history / has_doctor_diet_restriction` のいずれかが true で `onboarding_stage !== "blocked"` → 400 BadRequest

Lambda は TypeScript のため、決定的ルールを `infra/lambdas/shared/onboarding-safety.ts` に再実装する。既存 `fitness_engine.safety` は Plan 生成用の broader contract を扱うため、Plan 07 では `packages/fitness-engine/src/fitness_engine/onboarding_safety.py` に Onboarding bool subset 用 adapter を追加し、共有 fixture で TypeScript 実装との等価性を担保する。

---

## Coach Prompt 生成 (経路 C)

### エンドポイント

`POST /api/onboarding/coach-prompt`

### 入出力

入力: `CoachPromptRequest` (contracts-py 新規モデル) の Zod 版
出力: `CoachPromptResponse`

### Route Handler 実装

1. Cookie 認証 (`getSession()` 使用)
2. 入力を Zod バリデーション
3. Vercel AI SDK `generateText` で Anthropic Haiku を呼び出し
4. System prompt: Coach トーン指示 (温かい / 前向き / 命令しない / 2-4 文 / 日本語)
5. User prompt: `targetStage` と `profileSnapshot` を structured context として渡す
6. 出力をそのまま返却 (cached: false)

### キャッシュ戦略

- クライアント側 TanStack Query `queryKey: ["coach-prompt", targetStage]`
- 先読み: 前画面「次へ」送信直後に `queryClient.prefetchQuery()`
- 画面マウント時: 同 queryKey を `useQuery()` で subscribe、先読み済みなら即表示
- 先読み失敗時: マウント時に自動で API 呼び出し (フォールバック)
- `staleTime: Infinity`、戻るボタン時も再生成しない

### 環境変数

`ANTHROPIC_API_KEY` — Route Handler server-only secret。Varlock の CloudFormation 参照は使わない（Stack Outputs ではなく外部サービスのキーのため）。`.env.schema` には静的環境変数として定義し、ローカルは `.env.local` (git ignore)、デプロイ先は AWS SSM Parameter Store / Vercel Env (Phase 2 で Secrets Manager 統合検討)。

---

## Free-text Parse (経路 C)

### エンドポイント

`POST /api/onboarding/free-text-parse`

### 入出力

入力: `FreeTextParseRequest` (contracts-py 新規モデル) の Zod 版
出力: `FreeTextParseResponse`

### Route Handler 実装

1. Cookie 認証
2. 入力 Zod バリデーション
3. Vercel AI SDK `generateObject` で Anthropic Haiku + structured output schema
4. System prompt: 自然文から要点抽出、嗜好・生活パターンを 1-3 文に要約する指示
5. 出力の `extractedNote` を該当 `*_note` フィールドに保存すべく、クライアントが次の `PATCH /users/me/profile` で設定
6. `suggestedTags` は UI 上で「もしかして？」表示に使う (Plan 08 で Plan 生成時の Orchestrator にも渡す想定だが、Plan 07 では表示のみ)

### 衝突回避

構造化フィールド (`favorite_meals` / `hated_foods` など) は **絶対に上書きしない**。`*_note` と `suggestedTags` のみ。design-decisions.md §3.5「UI で編集できる項目は DynamoDB が source」原則を遵守。

### バックグラウンド実行

- 画面「次へ」押下時に `fetch()` を `await` せず fire-and-forget で起動
- 完了時に追加の `PATCH /users/me/profile` で `*_note` のみ更新 (追加の画面遷移をブロックしない)
- 失敗時: silent fail + `console.error`、次画面遷移は継続。`*_note` は null のまま (Plan 08 の Orchestrator は note 欠損に耐える設計にする)

---

## `useOnboarding` Hook

ここでの `OnboardingProfile` / `OnboardingProfilePatch` は、`profile-mappers.ts` が `UserProfile` / `UpdateUserProfileInput` DTO から変換する **camelCase ViewModel** を指す。

```ts
// packages/web/src/hooks/use-onboarding.ts

export type UseOnboardingReturn = {
  currentStage: OnboardingStage;
  profile: OnboardingProfile | null;
  isLoading: boolean;
  patch: (input: Partial<OnboardingProfilePatch>, nextStage: OnboardingStage) => Promise<void>;
  prefetchCoachPrompt: (nextStage: OnboardingStage, snapshot: Partial<OnboardingProfile>) => void;
  parseFreeText: (stage: "lifestyle" | "preferences" | "snacks", freeText: string) => void;  // fire-and-forget
};

export function useOnboarding(): UseOnboardingReturn;
```

実装ポイント:

- 内部で `useProfile()` を利用するが、React へ公開するのは `profile-mappers.ts` で変換した camelCase ViewModel
- `patch` は TanStack `useMutation` で PATCH → `invalidateQueries(["profile", "me"])`
- `prefetchCoachPrompt` は `queryClient.prefetchQuery()`
- Review 画面編集時の復帰先は `profile.onboardingStage === "review"` で判定するため、hook の内部 state は持たない

---

## コンポーネント追加 (`components/domain/` と `components/ui/`)

### 既存 (Plan 06)

- `AppShell` / `TopBar` / `BottomTabBar` → Onboarding 画面では **非表示** (`/onboarding/*` は `OnboardingShell` を使う専用 layout)
- shadcn 済み: `Button` / `Card` / `Input` / `Label` (これらは Plan 06 で追加済みと想定、未追加なら合わせて追加)

### Plan 07 で新規追加する shadcn UI primitives (`components/ui/`)

| コンポーネント   | shadcn CLI コマンド                              | 依存 Radix             |
| ---------------- | ------------------------------------------------ | ---------------------- |
| `Progress`       | `npx shadcn@latest add progress`                 | `@radix-ui/react-progress` |
| `ToggleGroup`    | `npx shadcn@latest add toggle-group`             | `@radix-ui/react-toggle-group` |
| `Toggle`         | `npx shadcn@latest add toggle`                   | `@radix-ui/react-toggle` |
| `Slider`         | `npx shadcn@latest add slider`                   | `@radix-ui/react-slider` |
| `Alert`          | `npx shadcn@latest add alert`                    | (Radix 非依存、div ベース) |
| `Skeleton`       | `npx shadcn@latest add skeleton`                 | (Radix 非依存) |
| `Textarea`       | `npx shadcn@latest add textarea`                 | (Radix 非依存) |
| `Dialog`         | `npx shadcn@latest add dialog` (条件付き Textarea 表示で使う可能性あり) | `@radix-ui/react-dialog` |

### Plan 07 で新規追加する domain コンポーネント (`components/domain/`)

| コンポーネント            | 用途                                              | 基盤                                    |
| ------------------------- | ------------------------------------------------- | --------------------------------------- |
| `OnboardingShell`         | TopBar + ProgressBar + Coach + 子 slot + 戻る/次へ | `div` + shadcn `Progress`               |
| `CoachPromptCard`         | LLM 生成 prompt 表示                               | shadcn `Card` + `Skeleton`              |
| `SectionSummaryCard`      | Review 画面のセクション summary + 編集ボタン       | shadcn `Card` + `Button`                |
| `SegmentedControl`        | Yes/No や 3 択                                    | shadcn `ToggleGroup`                    |
| `ChoiceChips`             | 単一選択 chip 群                                  | shadcn `ToggleGroup variant="outline"`  |
| `MultiTagInput`           | 複数 tag 自由入力                                 | 独自 (input + 管理済みタグ配列)          |
| `NumberField`             | 単位表示付き数値入力                              | shadcn `Input type="number"` + `Label`  |
| `Stepper`                 | ±ボタン付き数値                                   | shadcn `Button` ×2 + 表示               |
| `Slider` (wrapper)        | 1-10 スライダー + 値表示                          | shadcn `Slider`                         |
| `CautionBanner`           | 注意事項の帯                                      | shadcn `Alert`                          |
| `BlockedNoticeCard`       | Blocked 画面のメイン表示                          | shadcn `Card` + warning palette         |

### `/onboarding/layout.tsx`

- `AppShell` を使わず、`OnboardingShell` で包む
- 認証ガード + stage ガードを Server Component で実施

---

## 状態・ローディング・エラー

| 状態                  | UI                                                                   |
| --------------------- | -------------------------------------------------------------------- |
| Loading               | `CoachPromptCard` は `Skeleton`、input は `Skeleton` 行              |
| Empty / 初回          | 空の input、Coach prompt は「ようこそ」系の固定フォールバック         |
| PATCH 中              | 「次へ」ボタン disabled + spinner                                    |
| PATCH エラー          | `Alert` で表示 + retry ボタン、ユーザー入力は保持                     |
| Free-text parse エラー | silent (次画面遷移を阻害しない)                                      |
| Coach prompt 取得失敗 | フォールバック文言「ここではあなたのことをもう少し教えてください」   |

---

## テスト戦略

### Unit (vitest)

- `evaluateSafetyRisk` の decision table テスト (blocked / caution / safe の全組み合わせ)
- Lambda 側 `evaluateSafetyGuard` の同等テスト（Python 版と input → output が一致することの cross-validation）
- `components/domain/*` の describe 単位テスト (必要最小限)

### Integration (vitest + MSW)

- 画面遷移「次へ」フロー: Zod バリデーション → PATCH → prefetch → router.push の順序検証
- Coach prompt prefetch → 画面マウント時の即時表示
- Free-text parse fire-and-forget が遷移を阻害しないこと
- Server Component layout の redirect ロジック（stage に応じた遷移）のユニットテスト

### E2E (Playwright, 別 Plan でセットアップが必要な場合は後続)

- 新規ユーザー signup → Onboarding 7 画面 → `/home` 到達
- Safety で blocked → `/onboarding/blocked` 到達、他画面アクセス不可
- 中断 (ブラウザ閉じ) → 再ログイン → 該当画面から再開
- Review 画面で Stats 編集 → 次へで Review に戻る

### contracts

- `make contracts-py` (= `.venv/bin/python -m fitness_contracts.schema_export packages/contracts-ts/schemas`) で新モデル（拡張済み `UserProfile` / `UpdateUserProfileInput` / `CoachPromptRequest` / `CoachPromptResponse` / `FreeTextParseRequest` / `FreeTextParseResponse`）が `packages/contracts-ts/schemas/` に出力されることの確認
- `make contracts-ts` (= `pnpm --filter @fitness/contracts-ts generate`) で TS types と Zod が生成できることの確認
- `make contracts` 1 発で上記 2 ステップが連続実行され、exit 0 で完了することの確認
- `UpdateUserProfileInputSchema` の Zod で新フィールドすべてが optional として扱えることの型テスト
- `packages/contracts-py` は pnpm workspace package ではないため `pnpm --filter @fitness/contracts-py ...` は使用不可。Python 実行パスは uv が管理する `.venv/` 経由で統一する

---

## 依存パッケージ追加

```
dependencies:
  ai: ^4                                    # Vercel AI SDK v4+
  @ai-sdk/anthropic: ^1                     # Anthropic provider
  @radix-ui/react-progress: ^1              # shadcn Progress
  @radix-ui/react-toggle-group: ^1          # shadcn ToggleGroup
  @radix-ui/react-toggle: ^1                # shadcn Toggle
  @radix-ui/react-slider: ^1                # shadcn Slider
  @radix-ui/react-dialog: ^1                # shadcn Dialog (条件付き表示)
```

shadcn CLI の `add` コマンドが Radix 依存を自動で package.json に追加するため、上記は shadcn 実行後に確認する形で十分。明示記載は実装計画のタスクで `pnpm install` 結果のチェックに使う。

`@ai-sdk/react` は Plan 08 (Chat) で追加。Plan 07 は `generateText` / `generateObject` のみ使用、server-only。

---

## 環境変数追加

| 変数名              | 取得元                            |
| ------------------- | --------------------------------- |
| `ANTHROPIC_API_KEY` | Vercel dashboard / AWS SSM (手動) |

`.env.schema` には静的に定義。Varlock の CloudFormation 参照は使わない（Stack Outputs ではないため）。

---

## 既存ドキュメントへの反映

### `ui-architecture.md`

- §5 ルーティング: `/onboarding/blocked` を追記
- §7 Onboarding UI 仕様: Coach prompt 先読み / Free-text parse / Safety 決定的ルールを追記

### `architecture.md`

- §15 安全ポリシー: blocked 画面遷移のフローを追記

### `docs/superpowers/specs/2026-04-11-design-decisions.md`

- §6 反映済みセクションのチェックを更新 (本 spec で Onboarding 側の決定を具体化したため)

---

## 未解決 (Plan 08 以降)

- Review 画面の「プランを作成する」CTA が Plan 08 で AgentCore Runtime 呼び出しに差し替わる
- `suggestedTags` を Plan 生成時の Orchestrator context に渡す経路
- Blocked ユーザー向けの「専門家相談」リンク先 (現時点ではプレースホルダーテキストのみ)
- Onboarding 中の PostHog 分析イベント送信 (Plan 09+, Phase 2 analytics)
- WeeklyCheckInScreen / 体重入力モーダル (Phase 1 後半)
- `activity_level` を `workouts_per_week` + `job_type` から派生する engine 側ロジック (Plan 08 の CalorieMacro Engine 呼び出し時に実装)
