# Plan 画面完全実装 + Meal Swap 設計書 (Plan 09)

> **ステータス**: レビュー待ち
> **関連**: `2026-04-11-design-decisions.md` §2.1 経路 A/B, §3.4 通信プロトコル / `2026-04-20-plan-08-plan-generation-design.md` (契約・配管再利用) / `docs/ui-architecture.md` §8 Home, §9 Plan 画面 §9.2〜9.5, §24 Phase 1
> **前提 Plan**: Plan 01-08 完了済み (contracts / fitness-engine / AWS bootstrap / food-catalog ETL / CRUD Lambdas / Next.js / Onboarding / Plan 生成 MVP)
> **メモ**: `tasks/memories/decisions.md` #plan08-scope #plan08-agentcore-minimal は継続、#plan09-scope / #plan09-meal-swap を本 spec 承認時に追加する

---

## 目的

Plan 08 で生成・永続化した `WeeklyPlan` の全 8 セクションをユーザーが使えるようにし、加えて **Meal swap (食事差し替え)** を経路 A 2 本目として実装する。本 Plan 完了時点で Phase 1 (ui-architecture §24) のうち **Meal swap** が完了し、`WeeklyPlan` の UI 表現が仕様通りに網羅される。

具体的に本 Plan で **ユーザーが新たにできるようになること**:

1. Plan 画面が `MacroTargetsCard + SevenDayMealList` の placeholder から、週 selector / 日別タブ / 日別詳細 (テーマ + daily totals + 4 meal) / 差し替えモーダルの本実装に置き換わる
2. Home 画面に snack swaps / hydration / supplement recommendations / personal rules / timeline notes の 5 セクション Card が追加され、Plan 08 で DDB に保存されたが VM に載っていなかった全情報が使えるようになる
3. Plan / Home から meal card をタップすると LLM が生成した 3 候補が表示され、1 つ選ぶと DDB の `WeeklyPlan` がその meal で上書きされる (permanent)

---

## スコープ

### 含む (Plan 09, スコープ A = Plan 画面完全実装 + Meal swap)

- **`WeeklyPlanVM` 拡張** — `SnackSwapVM` / `HydrationVM` / `SupplementRecommendationVM` / `personalRules: string[]` / `timelineNotes: string[]` / `weeklyNotes: string[]` を追加。`plan-mappers.ts` の Pydantic DTO → VM 変換を拡張 (snake_case → camelCase)
- **Pydantic 新規契約**:
  - `MealSwapCandidatesRequest` / `MealSwapCandidatesResponse`
  - `MealSwapApplyRequest` / `MealSwapApplyResponse`
  - `GeneratedMealSwapCandidates` (agent 出力境界)
  - `MealSwapContext` (Adapter Lambda が Strands に渡す context: target_meal / daily_context / safe_prompt_profile)
- **Adapter Lambda `swap-meal` (ap-northeast-1, 新規)** — 2 endpoint 処理 (mode 分岐):
  - `POST /users/me/plans/{weekStart}/meals/swap-candidates` — 候補 3 件を LLM 生成 (経路 A)
  - `POST /users/me/plans/{weekStart}/meals/swap-apply` — 選択 meal を DDB `WeeklyPlan` に上書き (経路 B)
- **Strands Agent 拡張** — 既存 `infra/agents/plan-generator/` container に `handler.py` 新 entrypoint `handle_swap_candidates` を追加。新 system prompt `prompts/system_swap.py`。既存 4 tools を再利用
- **Plan 画面完全実装** — `packages/web/src/app/(app)/plan/page.tsx` を以下で再構築:
  - WeekSelector (前週 / 今週 / 翌週ナビゲーション — 本 Plan では今週のみ有効、他週は disable で視覚化のみ)
  - DailyTabs (横スクロール Mon 〜 Sun、今日デフォルト選択、URL query `?day=YYYY-MM-DD` で状態保持)
  - DailyDetail (theme + daily totals P/F/C + 4 meal card、各 meal card に「差し替え」ボタン)
  - MealSwapModal (候補 3 件表示 + why suggested + P/F/C + 「この食事に変更」「別の候補を見る」CTA)
- **Home 画面 5 セクション追加** — `home-content.tsx` に以下 Card を縦並び追加:
  - SnackSwapsCard (list<SnackSwap>)
  - HydrationCard (target liters + breakdown list)
  - SupplementsCard (既存 `SupplementRecommendation` VM をリスト表示)
  - PersonalRulesCard (max 7 行の string[])
  - TimelineCard (string[] の箇条書き)
- **CDK 変更** — `FitnessStack` に `SwapMealLambda` construct 追加 + API Gateway 2 route 追加。PlanGeneratorStack は container 再 build のみ (`DockerImageAsset` が diff 検出で自動 push)

### 含まない (Plan 10+ に持ち越し)

- **Item 単位の差し替え** (meal 内の食材置換) — ui-architecture §9.5 に仕様なし、MVP は meal 単位のみ
- **過去週 / 翌週の差し替え** — 本 Plan は "今週の weeklyPlan" のみ操作対象。過去週の読み取りは Plan 10+
- **差し替え履歴** — Plan 08 §ロールアウトと同方針、DDB 上書きで plan_id は保持、履歴は取らない (将来必要なら S3 export + Athena)
- **差し替え候補の cache** (「別の候補を見る」で LLM 再呼出しが発生する) — 観測して重ければ Plan 10+ で 6 件初回生成 → 3+3 分割 cache に
- **Recipe template DB 投入** (`recipe#<id>` への手動キュレーション 100-200 件) — MVP は LLM 創作で代替、recipe DB は別 Plan
- **Shopping support** (§9.6 買い物補助) — Phase 2
- **ui-architecture §9.4 / §9.5 の契約拡張項目** — 下記は既存 Pydantic 契約 (`Meal` / `DayPlan`) に field を持たないため本 Plan では描画しない:
  - `alcohol allocation` (§9.4) — `DayPlan` に専用 field なし、契約拡張必須
  - `shopping notes` (§9.4) — 同上
  - `prep time` (§9.5 差し替えモーダル表示要素) — `Meal` に `prep_time_minutes` 等の field なし、契約拡張必須
  - 複数 `tags` (§9.5 の候補 meal に付ける複数 tag) — 既存 `Meal.prep_tag` は `"batch" / "quick" / "treat" / "none"` の 1 値のみ、複数タグ化は Plan 10+
  - `why suggested` は `Meal.notes: list[str] | None` を流用するので OK (契約拡張不要)
  - `batch indicator` は `Meal.prep_tag == "batch"` を Badge として描画するので OK
- **Coach Insight / Today Actions / Quick Actions (Home §8.5/§8.7/§8.9)** — 別案 B で扱う
- **体重入力モーダル / 食事ログ UI / WeeklyCheckIn / Chat / Progress** — 別 Plan

---

## 確定済み意思決定

| 決定 | 出典 |
|------|------|
| Plan 09 のスコープを案 A (Plan 画面完全実装 + Meal swap) に限定 | 本 spec §スコープ / 会話ログ |
| Meal swap 永続化は DDB 上書き (案 a) | 会話ログ |
| Meal swap 候補生成は LLM 都度生成 (案 a、経路 A 再利用) | 会話ログ |
| 差し替え粒度は meal 単位のみ | 会話ログ |
| 対象範囲は今週の全 7 日の任意 meal | 会話ログ |
| API は 2 endpoint (candidates / apply) | 会話ログ |
| 「別の候補を見る」は再 LLM 呼出し (MVP) | 会話ログ |
| 候補数は 3 件固定 | 会話ログ |
| Strands runtime は既存 `plan-generator` container に swap handler 追加 (新 container を作らない) | 会話ログ |
| `DayPlan.meals` の slot 一意性を Pydantic validator で強制 ({date, slot} で meal を一意に特定するため) | 本 spec レビュー #1 |
| swap-apply の入力を `{ proposal_id, chosen_index }` にし、candidates 生成時に DDB へ TTL 付き proposal を保存。任意 meal の書き込みを構造的に排除 | 本 spec レビュー #2 |
| swap 候補生成の予算は `plan.days[target_date].daily_total_*` (元のその日の配分) を基準にする。`plan.target_* / 7` の均等割りは使わない | 本 spec レビュー #4 |
| Home / Plan 両方から swap を呼べるよう、共通 `MealCard` に `onSwap` prop を追加 | 本 spec レビュー #6 |
| `WeeklyPlan` に `revision: int` (monotonic counter) を追加し、swap のたびに +1。optimistic concurrency は **revision 比較**で行う。`plan_id` は identity として不変、`generated_at` も不変 | 本 spec レビュー #7 |

---

## アーキテクチャ全体図

```
[Plan 画面 / Home]
  │ MealCard タップ → MealSwapModal 起動
  │ (1) POST /api/proxy/users/me/plans/{weekStart}/meals/swap-candidates
  │     body: { date, slot }
  ▼
[Next.js Route Handler /api/proxy/[...path]] (既存、変更なし)
  │ Cognito access_token を Authorization: Bearer に付与
  ▼
[API Gateway HTTP API @ ap-northeast-1] (既存)
  │ HttpJwtAuthorizer で Cognito JWT 検証 → sub=user_id
  │ 新規ルート × 2:
  │   POST /users/me/plans/{weekStart}/meals/swap-candidates
  │   POST /users/me/plans/{weekStart}/meals/swap-apply
  ▼
[Adapter Lambda swap-meal @ ap-northeast-1] (新規)
  │ - mode は path で分岐 (candidates / apply)
  │ - 共通: JWT claims の sub を user_id として取得
  │ - candidates mode:
  │     DDB GetItem pk=user#<id> sk=profile / sk=plan#<weekStart>
  │     target_meal を plan.days[].meals[] から slot 一意性を前提に特定
  │     SafePromptProfile を既存 Plan 08 mapper で再生成
  │     DailyMacroContext = { original_day_total_* (= plan.days[i].daily_total_*), other_meals_total_* }
  │     MealSwapContext = { safe_prompt_profile, target_meal, daily_context }
  │     InvokeAgentRuntime (cross-region us-west-2, action="swap_candidates")
  │     → GeneratedMealSwapCandidatesSchema.strict().parse()
  │     → post-validate candidates[i].slot == target.slot
  │     → DDB PutItem sk=swap_proposal#<uuid>
  │        { candidates, current_plan_id, expected_revision=plan.revision,
  │          date, slot, ttl = now+600 }
  │     → 200 { proposal_id, proposal_expires_at, candidates }
  │ - apply mode:
  │     body: { proposal_id, chosen_index }  # meal 内容は含めない
  │     DDB GetItem sk=swap_proposal#<proposal_id> (ConsistentRead)
  │     TTL 超過検査 → 410 proposal_expired
  │     chosen_meal = proposal.candidates[chosen_index]
  │     DDB GetItem sk=plan#<weekStart> (ConsistentRead)
  │     plan.plan_id == proposal.current_plan_id && plan.revision == proposal.expected_revision を検査
  │     days[i].meals[j] 置換 + daily_total_* 再計算 + revision += 1
  │     DDB PutItem 全 WeeklyPlan、ConditionExpression "revision = :expected_revision"
  │       → ConditionalCheckFailedException → 409 plan_stale
  │     DDB DeleteItem sk=swap_proposal#<proposal_id> (one-shot 消費)
  │     → 200 { updated_day: DayPlan, plan_id, revision }
  ▼ (candidates 経路のみ)
[AgentCore Runtime @ us-west-2] (既存 container を更新)
  │ handler.py: action=="swap_candidates" なら handle_swap_candidates へ
  │ Strands Agent (別 system prompt, output_schema=GeneratedMealSwapCandidates)
  │ 既存 4 tools 再利用 (calorie_macro / hydration / supplements / get_food_by_id)
  │ return { "generated_candidates": GeneratedMealSwapCandidates JSON }
  ▼
[Web]
  const { proposal_id, candidates } = await swapCandidates.mutateAsync({ weekStart, date, slot })
  // モーダル内で 3 候補表示 → ユーザー選択 (chosen_index: 0|1|2)
  const { updated_day, revision } = await swapApply.mutateAsync({ proposal_id, chosen_index })
  queryClient.setQueryData(["weekly-plan", weekStart], (prev) =>
    prev ? { ...replaceDay(prev, updated_day), revision } : prev)
```

### 経路マッピング

| 通信 | 経路 | 理由 |
|------|------|------|
| swap-candidates (生成) | **A** (AgentCore Runtime) | LLM 推論が必要 |
| swap-apply (確定) | **B** (Lambda → DDB のみ) | 決定論計算・永続化のみ、LLM 不要 |
| Plan 取得 (既存) | B | 変更なし |
| Plan 生成 (既存 Plan 08) | A | 変更なし |

---

## データモデル (契約)

すべて Pydantic v2 で定義 → `MODEL_REGISTRY` 登録 → JSON Schema → Zod 自動生成。TS 側は生成物を import。

### 既存契約の拡張 1: `DayPlan.meals` の slot 一意性

`packages/contracts-py/src/fitness_contracts/models/plan/day_plan.py` に `model_validator(mode="after")` を追加し、`meals[].slot` の重複を拒否する。

```py
from pydantic import BaseModel, Field, model_validator

class DayPlan(BaseModel):
    # 既存 field (date / theme / meals / daily_total_*) は変更なし
    ...

    @model_validator(mode="after")
    def _enforce_unique_slots(self) -> "DayPlan":
        slots = [m.slot for m in self.meals]
        if len(slots) != len(set(slots)):
            raise ValueError(
                f"DayPlan.meals must have unique slots, got {slots}"
            )
        return self
```

**影響**:
- Plan 08 で生成された既存 plan は `Meal.slot` が `Literal["breakfast", "lunch", "dinner", "dessert"]` + `min=3 max=4` なので、実質的に slot は常に一意。回帰は発生しない (ただし LLM のまれな misbehavior 防止として validator を明示する)
- Plan 09 以降は Adapter Lambda が `{date, slot}` で meal を一意に特定できる (本 Plan の swap 対象識別が曖昧にならない)

### 既存契約の拡張 2: `WeeklyPlan.revision` (optimistic concurrency token)

`packages/contracts-py/src/fitness_contracts/models/plan/weekly_plan.py` に `revision: int = Field(..., ge=0)` field を追加する。

```py
class WeeklyPlan(BaseModel):
    plan_id: str         # 既存、identity として不変
    week_start: str      # 既存
    generated_at: str    # 既存、plan 生成時刻で不変
    revision: int = Field(..., ge=0)  # 新規: swap のたびに +1
    # 以下既存 field …
```

**採用理由**:
- `plan_id` は plan の identity (どの週の plan か) を表し、swap で中身が更新されても identity は変わらない前提で設計した
- しかし同じ plan_id のまま内容だけ変わる場合、concurrency token として plan_id は使えない (同じ plan_id から作られた 2 つの proposal が両方 valid に見えてしまう)
- `revision` を monotonic counter として追加し、swap-apply のたびに +1 することで:
  - candidates 時に記録した `expected_revision` と apply 時の実 `plan.revision` が一致しないと 409 になる
  - DeleteItem が失敗して proposal が残っても、再 apply は revision 比較で必ず 409 になるため one-shot 性が担保される
- 代替案として `updated_at` ISO timestamp も検討したが、monotonic int の方が比較が atomic で意味が明確なため採用

**Plan 08 との互換**:
- Plan 08 は **未 deploy** (context-log より) なので、DDB 上に既存 `WeeklyPlan` item は存在しない。backfill 不要
- Plan 08 の Strands Agent が出力する `GeneratedWeeklyPlan` には **`revision` を含めない** (Adapter Lambda が `plan_id` / `generated_at` と同様に `revision=0` を付与する責務分離を維持)
- Plan 08 の Adapter Lambda (`infra/lambdas/generate-plan/index.ts`) を本 Plan で **小幅修正**: 新規 plan の PutItem 時に `revision: 0` を付与する変更を含める (Plan 09 の作業範囲)

### 新規 1: `MealSwapContext` (Adapter → Strands 境界)

`packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_context.py`

```py
class DailyMacroContext(BaseModel):
    """対象日の配分と他 meal の合計マクロ。LLM が "この日にとるべき残り" を正しく推定するため。"""
    date: str  # ISO YYYY-MM-DD
    # 元の plan におけるその日の daily totals (alcohol day / treat day の配分を保持するため、
    # 週平均 plan.target_*/7 ではなく plan.days[target_date].daily_total_* を使う)
    original_day_total_calories_kcal: int
    original_day_total_protein_g: float
    original_day_total_fat_g: float
    original_day_total_carbs_g: float
    # target 以外の meal の合計 (breakfast/lunch/dinner/dessert のうち swap 対象を除いた 2〜3 個)
    other_meals_total_calories_kcal: int
    other_meals_total_protein_g: float
    other_meals_total_fat_g: float
    other_meals_total_carbs_g: float

class MealSwapContext(BaseModel):
    """Strands に渡す swap 専用 payload。"""
    safe_prompt_profile: SafePromptProfile  # 既存契約を再利用 (medical_*_note 除去済み)
    target_meal: Meal                        # 差し替え対象 (既存契約)
    daily_context: DailyMacroContext
```

LLM が候補を生成するときの "target 予算" は `original_day_total_* - other_meals_total_*` で算出される (system prompt に計算手順を明記)。これにより alcohol day / treat day / batch day で異なる日次配分がそのまま維持される。

### 新規 2: `GeneratedMealSwapCandidates` (agent 出力境界)

`packages/contracts-py/src/fitness_contracts/models/plan/generated_meal_swap.py`

```py
class GeneratedMealSwapCandidates(BaseModel):
    """Strands の structured output。plan_id 等は含まない (Adapter は付与しない、状態なし)。"""
    candidates: list[Meal] = Field(..., min_length=3, max_length=3)
```

- `Meal` は既存契約を再利用
- 3 件固定 (`min=max=3`) で Strands の structured output 検証が決定的に失敗する場合に Adapter が 502 を返せる
- `slot` は 3 件とも target と同じである必要があるが Pydantic 側では縛らず、Adapter Lambda が post-validate で検査 (mismatch → 502 `{ error: "invalid_swap_shape" }`)

### 新規 3: Swap API 契約 (proposal 方式)

`packages/contracts-py/src/fitness_contracts/models/plan/meal_swap_api.py`

swap-apply 時に client が任意 meal を書き込めないよう、candidates 生成時に **DDB に short-TTL な proposal を保存**し、apply では `proposal_id + chosen_index` だけを受ける。

```py
MealSlot = Literal["breakfast", "lunch", "dinner", "dessert"]

class MealSwapCandidatesRequest(BaseModel):
    date: str  # ISO YYYY-MM-DD, plan.days[].date のいずれか
    slot: MealSlot

class MealSwapCandidatesResponse(BaseModel):
    proposal_id: str           # uuid v4。client は apply 時にこれを返す
    proposal_expires_at: str   # ISO timestamp (生成時刻 + 10 分)
    candidates: list[Meal] = Field(..., min_length=3, max_length=3)

class MealSwapApplyRequest(BaseModel):
    proposal_id: str
    chosen_index: int = Field(..., ge=0, le=2)
    # date / slot / chosen_meal は client から受けない (proposal 側に保管されている)

class MealSwapApplyResponse(BaseModel):
    updated_day: DayPlan
    plan_id: str  # 不変 (plan identity)
    revision: int  # +1 された新しい revision。client は VM に反映して次の swap の expected_revision として使う
```

#### DDB 上の proposal item

`pk=user#<id>, sk=swap_proposal#<proposal_id>` に下記 shape で保存:

```
{
  "pk": "user#<id>",
  "sk": "swap_proposal#<uuid>",
  "week_start": "2026-04-27",
  "date": "2026-04-27",
  "slot": "breakfast",
  "current_plan_id": "...",          # 生成時の plan.plan_id (identity 確認)
  "expected_revision": 2,            # 生成時の plan.revision (concurrency token)
  "candidates": [Meal, Meal, Meal],
  "created_at": "2026-04-24T12:00:00Z",
  "ttl": 1745503800                  # created_at + 10 分 (unix seconds)
}
```

- DynamoDB の TTL 属性を有効化済み (既存 FitnessTable、Plan 08 で PITR + RETAIN は設定済み。TTL は本 Plan で有効化する)
- apply は proposal を `DeleteItem` (成功時) で消費する → **one-shot**。二重 apply 不可
- Web が apply せず閉じた proposal は TTL で自動削除 (10 分)

Plan 画面 / Home 画面が直接読み取る API ではなく、swap-meal Lambda 内部で GetItem/DeleteItem するため、`fetch-weekly-plan` 等の既存 Lambda には影響しない。

### 新規 4: `WeeklyPlanVM` 拡張

`packages/web/src/lib/plan/plan-mappers.ts` を拡張。

```ts
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
  dose: string;          // 既存 Pydantic SupplementRecommendation.dose
  timing: string;        // 既存 .timing (Plan 09 初版で欠落していたため追加)
  whyRelevant: string;   // 既存 .why_relevant の camelCase 射影
  caution: string | null; // 既存 .caution
  // ↑ packages/contracts-py/.../fitness_engine/supplement.py の shape と
  //   docs/architecture.md §11.7 / §9.8 の field 構成に整合
}

export interface WeeklyPlanVM {
  // 既存
  planId: string;
  weekStart: string;
  generatedAt: string;
  targetCaloriesKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
  days: DayPlanVM[];
  // 新規
  revision: number;  // optimistic concurrency token。apply 成功時に server から +1 された値が返る
  snackSwaps: SnackSwapVM[];
  hydration: HydrationVM;
  supplementRecommendations: SupplementRecommendationVM[];
  personalRules: string[];
  timelineNotes: string[];
  weeklyNotes: string[];
}
```

### 変更

| ファイル | 変更内容 |
|---|---|
| `packages/contracts-py/src/fitness_contracts/models/plan/weekly_plan.py` | `revision: int = Field(..., ge=0)` field を追加 |
| `packages/contracts-py/src/fitness_contracts/models/plan/day_plan.py` | `model_validator(mode="after")` で slot 一意性を強制 |
| `packages/contracts-py/src/fitness_contracts/schema_export.py` | `MODEL_REGISTRY` に `MealSwapContext` / `DailyMacroContext` / `GeneratedMealSwapCandidates` / `MealSwapCandidatesRequest` / `MealSwapCandidatesResponse` / `MealSwapApplyRequest` / `MealSwapApplyResponse` を追加 |
| `infra/lambdas/generate-plan/index.ts` | **Plan 08 Adapter の小幅修正**: 新規 plan の PutItem 時に `revision: 0` を付与 (既存の `plan_id` / `generated_at` と同じ extrapolation 責務) |
| `infra/lambdas/shared/db-schemas.ts` | `WeeklyPlanRowSchema` が生成 Zod 経由で自動的に `revision: number` を持つようになるため、既存スキーマ参照は再生成で追従 (手修正不要) |
| `packages/web/src/lib/plan/plan-mappers.ts` | 5 セクション分の DTO → VM 変換を追加 + `revision` を VM に追加。`weeklyPlanToVM` を拡張 |
| `packages/web/src/lib/plan/plan-mappers.test.ts` | 既存テストに 5 セクション変換検証 + revision を追加 |

---

## コンポーネント設計

### A. Strands Agent 拡張 (`infra/agents/plan-generator/`)

既存 container に **追加のみ**、削除/置換はしない。

```
infra/agents/plan-generator/
├── src/plan_generator/
│   ├── handler.py            # 変更: action による分岐を追加
│   ├── agent.py              # 変更: build_swap_agent() を追加 (既存 build_agent は維持)
│   ├── prompts/
│   │   ├── system.py         # 変更なし (plan 生成用、既存)
│   │   ├── system_swap.py    # 新規 (meal swap 用 system prompt)
│   │   └── food_hints.py     # 変更なし (再利用)
│   └── tools/                # 変更なし (4 tools 再利用)
└── tests/
    ├── test_handler.py                  # 変更: action 分岐のテストを追加
    ├── test_agent_e2e.py                # 変更なし (既存は plan 生成用、維持)
    ├── test_agent_swap_e2e.py           # 新規 (swap e2e)
    └── test_prompts_system_swap.py      # 新規 (system prompt 検証)
```

**`handler.py` 変更点** (疑似コード):

```py
def handle(event, context):
    action = event.get("action", "generate_plan")  # 互換性: 指定なしは既存フロー
    if action == "generate_plan":
        return handle_generate_plan(event)
    elif action == "swap_candidates":
        return handle_swap_candidates(event)
    raise ValueError(f"unknown action: {action}")

def handle_swap_candidates(event):
    ctx = MealSwapContext.model_validate(event["swap_context"])
    agent = build_swap_agent()
    result: GeneratedMealSwapCandidates = agent.run(ctx)
    return {"generated_candidates": result.model_dump()}
```

**`system_swap.py` 要旨**:

```
You are a personal fitness nutrition planner.
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
```

**Meal plan 組み立て**: orchestrator LLM の structured output (`Agent(output_schema=GeneratedMealSwapCandidates)`) で候補を直 return する。plan_id / date / slot は Adapter 側の管理、Strands は渡されない。

### B. Adapter Lambda `swap-meal` (`infra/lambdas/swap-meal/`)

```
infra/lambdas/swap-meal/
├── index.ts              # 2 path の handler (candidates / apply の mode 分岐)
├── swap-mappers.ts       # DailyMacroContext 算出 (original_day_total_* / other_meals_total_*) / recalcDailyTotals / proposal item 構築
├── agentcore-client.ts   # 既存 generate-plan/agentcore-client.ts の pattern を再利用
├── README.md
```

**責務** (candidates mode):

1. JWT claims から `user_id`
2. `MealSwapCandidatesRequestSchema.safeParse(body)` で検証
3. DDB GetItem `pk=user#<id>, sk=profile` → `CompleteProfileForPlanSchema.safeParse` fail-fast
4. DDB GetItem `pk=user#<id>, sk=plan#<weekStart>` → `WeeklyPlanSchema.strict().parse`
5. target_meal を `plan.days[date].meals` から **slot 完全一致** で特定。`DayPlan` の slot 一意性 validator により `find` で決定論的に 1 件取得できる。見つからなければ 404 `{ error: "meal_not_found" }`
6. `DailyMacroContext` を TS 純粋関数で算出:
   - `original_day_total_*` = `plan.days[i].daily_total_*` (plan.target_*/7 は使わない)
   - `other_meals_total_*` = target 以外の meal totals 合計
7. 既存 `generate-plan/mappers.ts` を **import 共有** して `SafePromptProfile` を生成
8. `{ action: "swap_candidates", swap_context: MealSwapContext }` を AgentCore InvokeAgentRuntime
9. Strands response `{ generated_candidates: {...} }` を `GeneratedMealSwapCandidatesSchema.strict().parse()`
10. post-validate: `candidates[i].slot === target_meal.slot` を 3 件全て検査、mismatch なら 502 `{ error: "invalid_swap_shape" }`
11. **proposal を DDB に保存** (`PutItem pk=user#<id>, sk=swap_proposal#<uuid>`):
    - `ConditionExpression: "attribute_not_exists(pk)"` (uuid 衝突の ultra edge case 防止)
    - `ttl` = `now + 600` (10 分、unix seconds)
    - `current_plan_id` = 生成時の `plan.plan_id` (identity 確認用)
    - `expected_revision` = 生成時の `plan.revision` (apply 時の optimistic concurrency token)
    - `date` / `slot` / `week_start` / `candidates` も保存
12. 200 `{ proposal_id, proposal_expires_at, candidates }` (`MealSwapCandidatesResponseSchema` で再 parse)
13. Lambda timeout は **25 秒** (API GW 30 秒 - margin。candidates のワーストケース。apply は共通 Lambda 内の別 path で短時間で抜ける)

**責務** (apply mode):

1. JWT claims から `user_id`
2. `MealSwapApplyRequestSchema.safeParse(body)` で検証 (`proposal_id` + `chosen_index`)
3. DDB GetItem `pk=user#<id>, sk=swap_proposal#<proposal_id>` (`ConsistentRead: true`)。存在しなければ 404 `{ error: "proposal_expired_or_missing" }` (TTL 切れ or 他リクエストで消費済み or 改ざん想定)
4. proposal の `ttl` 属性を server 側でも検査 (DynamoDB TTL はベストエフォートで遅延削除あり、期限切れ item が読めるため、アプリ側で明示的に past-deadline を弾く)。切れていたら 410 `{ error: "proposal_expired" }`
5. `chosen_meal` = `proposal.candidates[chosen_index]` を取り出す
6. DDB GetItem `pk=user#<id>, sk=plan#<weekStart>` (`ConsistentRead: true`) → `WeeklyPlanSchema.strict().parse`
7. **Concurrency 検査** (2 段):
   - `plan.plan_id === proposal.current_plan_id` を検査 → mismatch なら 409 `{ error: "plan_stale" }` (plan 全体が再生成された)
   - `plan.revision === proposal.expected_revision` を検査 → mismatch なら 409 `{ error: "plan_stale" }` (同 plan_id の下で別 swap が先着)
8. target (date, slot) 位置の meal を `chosen_meal` で置換、`days[i].daily_total_*` を再計算 (純粋関数 `recalcDailyTotals(day)`)
9. **`new_plan.revision = plan.revision + 1`** を設定。`plan_id` / `generated_at` は不変
10. `WeeklyPlanSchema.strict().parse(new_plan)` で最終検証 (shape 守れているか、slot 一意性 validator も通る)
11. DDB PutItem 全上書き、`ConditionExpression: "plan_id = :current_plan_id AND revision = :expected_revision"` で optimistic concurrency
    - `ConditionalCheckFailedException` → 409 `{ error: "plan_stale" }`
    - **この conditional write が本 Plan の concurrency 担保の要**: step 7 の application-level チェックと合わせた二重防御、ただし真の atomic 性は DDB 側の ConditionExpression が提供する
12. DDB DeleteItem `sk=swap_proposal#<proposal_id>` (one-shot 消費、成功後)。delete 失敗は warning ログのみで成功レスポンスを妨げない — **再 apply されても revision が既に +1 されているため必ず 409 になる**ので one-shot 性は担保される
13. 200 `{ updated_day: DayPlan, plan_id, revision: new_plan.revision }`
14. `generated_at` / `plan_id` は更新しない (plan identity 維持)。`revision` のみが swap のたびに +1 される

この proposal + revision 方式により:
- **任意 meal の書き込みが構造的に不可能**: client は `proposal_id + chosen_index` だけを送るため、server が生成した候補以外は DDB に入らない
- **同 plan_id 下の並行 swap を正しく弾く**: revision は swap のたびに +1、ConditionExpression で DDB が atomic に検出するため「後勝ち上書き」が発生しない。先着が revision を進めた瞬間、残りの proposal は全て 409 になる
- **DeleteItem 失敗時の再実行も安全**: proposal item が残っても、次の apply は revision 比較で必ず 409。二重 apply / リプレイ攻撃は成立しない
- **slot / 嗜好 / 制限の再検査は不要**: candidates 生成時に LLM + Strands system prompt + post-validate で担保済み、apply 側は proposal を信頼する
- **マクロ範囲検査も不要**: LLM が `original_day_total_*` ベースで生成、ユーザーが目視確認したうえで選ぶため、±10% 縛りは apply 側で再検査しない

**共通 IAM**:

- `bedrock-agentcore:InvokeAgentRuntime` on Runtime ARN (candidates のみ必要、apply は使わない。Lambda 1 本に統合するため両方付与)
- `dynamodb:GetItem` / `dynamodb:PutItem` / `dynamodb:DeleteItem` on FitnessTable, condition `dynamodb:LeadingKeys=["user#*"]`
  - GetItem: profile / plan / proposal
  - PutItem: plan (apply 時) / proposal (candidates 時)
  - DeleteItem: proposal (apply 成功時の one-shot 消費)
- env: `AGENTCORE_RUNTIME_ARN` (既存 `generate-plan` と同じ値を注入)

### C. CDK 変更

`infra/lib/constructs/swap-meal-lambda.ts` (新規) + `infra/lib/fitness-stack.ts` (変更)

```ts
// swap-meal-lambda.ts
export interface SwapMealLambdaProps {
  readonly httpApi: HttpApi;
  readonly table: dynamodb.Table;
  readonly agentcoreRuntimeArn: string;
}

// SwapMealLambda construct:
//   - NodejsFunction (timeout: 25s, memory: 512MB — candidates のワーストケース)
//     Lambda は 1 本、内部で path により candidates / apply 分岐
//   - env: AGENTCORE_RUNTIME_ARN
//   - IAM: bedrock-agentcore:InvokeAgentRuntime,
//          dynamodb:{GetItem, PutItem, DeleteItem} (LeadingKeys=user#*)
//          GetItem: profile / plan / swap_proposal
//          PutItem: plan (apply、ConditionExpression で revision 比較) / swap_proposal (candidates)
//          DeleteItem: swap_proposal (apply 成功時の one-shot 消費)
//   - API Gateway route:
//       POST /users/me/plans/{weekStart}/meals/swap-candidates
//       POST /users/me/plans/{weekStart}/meals/swap-apply
```

`FitnessStack`:
- `agentcoreRuntimeArn` context が未指定なら `SwapMealLambda` も skip (既存 `GeneratePlanLambda` と同じ挙動、Plan 08 のルールに従う)
- PlanGeneratorStack 側は **変更最小** (container source 変更で DockerImageAsset が diff 検出 → 自動 re-build & push)

### D. Web 側変更

| ファイル | 変更内容 |
|---|---|
| `packages/web/src/lib/plan/plan-mappers.ts` | `SnackSwapVM` / `HydrationVM` / `SupplementRecommendationVM` 型追加、`weeklyPlanToVM` を拡張 |
| `packages/web/src/lib/api/plans.ts` | `swapCandidatesDto()` / `swapApplyDto()` を追加 (既存 `apiClient<T>` 再利用) |
| `packages/web/src/hooks/use-meal-swap.ts` (新規) | `useSwapCandidates` / `useSwapApply` mutation。`onSuccess` で `queryClient.setQueryData(["weekly-plan", weekStart], ...)` 更新 |
| `packages/web/src/hooks/use-meal-swap.test.tsx` (新規) | candidates / apply / エラー / キャッシュ更新テスト |
| `packages/web/src/components/domain/week-selector.tsx` (新規) | 前週 / 今週 / 翌週ラベル。他週は disabled (Plan 10+) |
| `packages/web/src/components/domain/daily-tabs.tsx` (新規) | 横スクロール Mon〜Sun、URL query `?day=YYYY-MM-DD` と同期 (nuqs で扱うか、`useSearchParams`+`router.replace` で十分。後者採用) |
| `packages/web/src/components/domain/daily-detail.tsx` (新規) | 1 日分の theme / daily totals / 4 meal card を描画。各 meal に「差し替え」ボタン |
| `packages/web/src/components/domain/meal-swap-modal.tsx` (新規) | `shadcn/ui Dialog` ベース、候補 3 件表示 + `notes[]` を "why suggested" として表示 + CTA 2 種。apply 時は `{ proposal_id, chosen_index }` を送る |
| `packages/web/src/components/domain/meal-card.tsx` (**変更**) | 既存。`onSwap?: () => void` prop を追加し、渡された時だけ「差し替え」ボタンを表示。呼び出し側 (Home / Plan) が (date, slot) を bind した handler を渡す |
| `packages/web/src/components/domain/seven-day-meal-list.tsx` (**変更**) | `onSwap?: (date: string, slot: MealSlot) => void` prop を受け、各 `MealCard` に `() => onSwap(day.date, meal.slot)` を bind して渡す |
| `packages/web/src/components/domain/snack-swaps-card.tsx` (新規) | list<SnackSwap> |
| `packages/web/src/components/domain/hydration-card.tsx` (新規) | target liters + breakdown list |
| `packages/web/src/components/domain/supplements-card.tsx` (新規) | list<SupplementRecommendation>、caution 有無でスタイル変化 |
| `packages/web/src/components/domain/personal-rules-card.tsx` (新規) | `string[]` を numbered list で表示 |
| `packages/web/src/components/domain/timeline-card.tsx` (新規) | `string[]` を時系列風に表示 |
| `packages/web/src/app/(app)/plan/page.tsx` (再構築) | placeholder 撤去、WeekSelector + DailyTabs + DailyDetail + MealSwapModal 構成に置換 |
| `packages/web/src/app/(app)/plan/plan-content.tsx` (新規) | Client Component。`useWeeklyPlan` + `useMealSwap` を扱う |
| `packages/web/src/app/(app)/home/home-content.tsx` (変更) | (a) 既存 `SevenDayMealList` に `onSwap` を渡し、(b) `useMealSwap` mutation を接続、(c) `MealSwapModal` を mount、(d) 既存表示の下に 5 セクション Card を縦並び追加 — これで meal card → 差し替え → 候補 3 件 → 適用 → VM 更新の完全フローが Home でも動く |
| `packages/web/src/lib/plan/plan-mutations.ts` (新規) | `replaceDayInPlan(plan, updatedDay): WeeklyPlanVM` の純粋関数 |
| `packages/web/src/app/(app)/plan/plan-content.test.tsx` (新規) | 統合描画 / DailyTabs 選択 / swap フロー E2E mock |
| `packages/web/src/app/(app)/home/home-content.test.tsx` (変更) | 5 セクション描画の assertion 追加 |

---

## エラーハンドリング

### 失敗モードと対応

| 失敗モード | 検出箇所 | 対応 |
|---|---|---|
| JWT 失効 | API Gateway | 401 (既存挙動) |
| (candidates) 存在しない date / slot | Adapter (target 検索) | 404 `{ error: "meal_not_found" }` |
| (candidates) plan が存在しない weekStart | Adapter (DDB GetItem) | 404 `{ error: "plan_not_found" }` |
| (candidates) AgentCore invoke timeout | Adapter | 504 `{ error: "swap_timeout" }`、Web は再試行 CTA |
| (candidates) Strands の Schema 違反 | Adapter strict parse | 502 `{ error: "invalid_swap_shape" }` |
| (candidates) 候補の slot 不一致 | Adapter post-validate | 502 `{ error: "invalid_swap_shape" }` (同エラーコード、理由は CloudWatch へ) |
| (candidates) proposal PutItem 失敗 (throttle 等) | Adapter | 502 `{ error: "proposal_persistence_failed" }`。AgentCore は既に consumed なのでコスト損失、CloudWatch に critical log |
| (apply) proposal_id が見つからない | Adapter GetItem `sk=swap_proposal#<id>` 失敗 | 404 `{ error: "proposal_expired_or_missing" }` (TTL 切れ / 消費済み / 改ざん推測) |
| (apply) proposal が expired_at 超過 | Adapter server-side ttl 検査 | 410 `{ error: "proposal_expired" }` (GONE、Web は candidates 再生成に誘導) |
| (apply) chosen_index が range 外 | Adapter Schema (`ge=0, le=2`) | 400 `{ error: "invalid_chosen_index" }` |
| (apply) plan_id mismatch (candidates 後に plan 再生成された) | `proposal.current_plan_id !== plan.plan_id` | 409 `{ error: "plan_stale" }`、Web は plan 再 fetch → モーダル閉じて再操作誘導 |
| (apply) revision mismatch (同 plan_id 下で別 swap が先着した) | `proposal.expected_revision !== plan.revision` | 409 `{ error: "plan_stale" }` (同上) |
| (apply) DDB PutItem conditional 違反 (race、application-level チェック通過後の atomic race) | `ConditionalCheckFailedException` | 409 `{ error: "plan_stale" }` (同上) — DDB 側での最終防御 |
| (apply) DDB PutItem 失敗 (throttle 等、非 conditional) | PutItem 例外 | 502 `{ error: "persistence_failed" }` |
| (apply) proposal DeleteItem 失敗 | DeleteItem 例外 | warning log のみで 200 を返す (TTL で最終的に消える、one-shot 性は **revision monotonicity** で担保される。同 proposal_id の再 apply は `expected_revision` mismatch で必ず 409 になるため、proposal item が残存しても安全) |
| (両 mode) Bedrock rate limit | Strands 内 retry (2 回) → AgentCore 5xx | Adapter が 502 `{ error: "agent_upstream_error" }` |
| (apply) daily totals 整合性違反 (±10% 超) | — | **本 Plan では検査しない**。LLM が `original_day_total_*` ベースで生成 + ユーザーが目視選択した前提。Plan 10+ で運用観測して必要なら追加 |

### 観測

- Adapter Lambda: `{ user_id, week_start, date, slot, mode, latency_ms, status }` を CloudWatch JSON ログ
- candidates 失敗時は `error_code` / `invalid_reason` を追加出力 (PII は出さない)
- Strands container: 既存 Plan 08 の Observability を再利用 (swap も同じ trace 系統に乗る)

### Idempotency

- candidates 呼出し: 同じ (weekStart, date, slot) で複数回呼んでも **毎回 LLM 再生成** (UX 上の「別の候補を見る」と同じ挙動で一貫)
- apply 呼出し: **revision 比較で optimistic concurrency** (ConditionExpression `plan_id = :x AND revision = :r`)、race 時は 409 `plan_stale`。同 proposal を 2 回 apply しても、1 回目の成功で revision が +1 されるため 2 回目は必ず 409。Web 側は double-click ガード (mutation 中は「この食事に変更」ボタン disabled) + 409 時は plan 再 fetch してモーダル閉じる

---

## テスト戦略

### Unit テスト

| 対象 | テストファイル | 内容 |
|---|---|---|
| Pydantic 契約 | `packages/contracts-py/tests/test_day_plan_slot_uniqueness.py` | `DayPlan` の slot 重複時に `ValidationError` が出る (既存 test_weekly_plan に追加でも可) |
| Pydantic 契約 | `packages/contracts-py/tests/test_meal_swap_context.py` | `MealSwapContext` / `DailyMacroContext` の必須フィールド / `original_day_total_*` と `other_meals_total_*` の存在 |
| Pydantic 契約 | `packages/contracts-py/tests/test_generated_meal_swap.py` | `GeneratedMealSwapCandidates` の `len==3` 制約 |
| Pydantic 契約 | `packages/contracts-py/tests/test_meal_swap_api.py` | Request/Response round-trip、`chosen_index` が `0..2` 外で ValidationError |
| Strands handler 分岐 | `infra/agents/plan-generator/tests/test_handler.py` | action="swap_candidates" が `handle_swap_candidates` を呼ぶ / 未知 action で ValueError |
| Strands swap agent wiring | `infra/agents/plan-generator/tests/test_agent_swap_e2e.py` | BedrockModel だけ mock、`build_swap_agent()` が正しい system prompt / output_schema / 4 tools を wire していることを assert。LLM が `GeneratedMealSwapCandidates` を parse できる golden input で return できることを検証 |
| Swap system prompt | `infra/agents/plan-generator/tests/test_prompts_system_swap.py` | "EXACTLY 3" / "same slot" / "NEVER reference medical" が含まれる / FOOD_HINTS が連結される |
| Adapter mappers (daily context) | `infra/test/lambdas/swap-meal/mappers.test.ts` | `DailyMacroContext` の計算 (`original_day_total_*` = `days[i].daily_total_*` を採用 / `other_meals_total_*` の合算 / target 除外 / alcohol day のような高カロリー日が week 平均で潰れないこと) |
| Adapter mappers (days 再計算) | `infra/test/lambdas/swap-meal/mappers.test.ts` | `recalcDailyTotals(day)` の純粋関数テスト |
| Adapter Lambda handler (candidates) | `infra/test/lambdas/swap-meal/index.test.ts` | mode 分岐 / `meal_not_found` / `plan_not_found` / timeout / Strands shape 違反 / slot mismatch / proposal PutItem が `sk=swap_proposal#<uuid>` + ttl 属性で保存される / response に proposal_id が含まれる |
| Adapter Lambda handler (apply) | `infra/test/lambdas/swap-meal/index.test.ts` | `proposal_expired_or_missing` (404) / `proposal_expired` (ttl 超過、410) / `invalid_chosen_index` (400) / proposal.current_plan_id ≠ plan.plan_id → 409 / proposal.expected_revision ≠ plan.revision → 409 / ConsistentRead / 全 WeeklyPlan PutItem (ConditionExpression に `plan_id = :x AND revision = :r` が含まれる) / ConditionalCheckFailed → 409 / PutItem 失敗 → 502 / apply 成功時に `new_plan.revision === prev.revision + 1` / `plan_id` / `generated_at` 不変 / proposal が DeleteItem される / chosen_meal は body ではなく proposal.candidates[chosen_index] から取得される |
| Adapter Lambda (concurrency) | `infra/test/lambdas/swap-meal/index.test.ts` | 同 plan_id・同 revision から 2 つの proposal を作り、片方 apply 成功 → もう片方 apply は 409 になること (revision 進行による排他) / DeleteItem を mock で失敗させても再 apply が 409 になること (one-shot 担保は revision のおかげ) |
| Adapter security (任意 meal 書き込み不可) | `infra/test/lambdas/swap-meal/index.test.ts` | apply body に `chosen_meal` や `date` / `slot` を追加で渡しても **server が proposal を信頼し body の meal 内容を無視する** こと (proposal.candidates 以外が DDB に書かれないこと) |
| Plan 08 Adapter 回帰 | `infra/test/lambdas/generate-plan/index.test.ts` (既存拡張) | 新規 plan の PutItem が `revision: 0` を含むこと、`GeneratedWeeklyPlan` には `revision` が無いこと (agent 責務と adapter 責務の分離維持) |
| `plan-mappers.ts` 5 セクション追加 | `packages/web/src/lib/plan/plan-mappers.test.ts` | DTO → VM の 5 セクション変換 |
| `useMealSwap` hook | `packages/web/src/hooks/use-meal-swap.test.tsx` | candidates mutation / apply mutation (body は proposal_id + chosen_index のみ) / エラー (`proposal_expired` で適切な UI 誘導) / `setQueryData` での plan 更新 |
| `replaceDayInPlan` 純粋関数 | `packages/web/src/lib/plan/plan-mutations.test.ts` | decision table (対象日あり/なし、他日が変化しない等) |
| MealSwapModal UI | `packages/web/src/components/domain/meal-swap-modal.test.tsx` | 候補 3 件描画 / notes[] 表示 / 「別の候補を見る」で再生成 mutation (新 proposal_id を受け取る) / 「この食事に変更」で apply mutation (proposal_id + chosen_index のみ送る) / expired エラーでモーダル閉じ + 再生成 CTA |
| Home の swap フロー | `packages/web/src/app/(app)/home/home-content.test.tsx` | MealCard の「差し替え」ボタン → MealSwapModal open → candidates mock → 選択 → apply mock → plan VM 更新 (Home と Plan 両方で同じ導線が動くことを回帰テストとして残す) |
| DailyTabs URL sync | `packages/web/src/components/domain/daily-tabs.test.tsx` | ?day クエリと選択状態の双方向同期 |
| Plan page 統合 | `packages/web/src/app/(app)/plan/plan-content.test.tsx` | plan あり/なし / swap フロー (candidates → select → apply → VM 更新) mock |
| Home 5 セクション | `packages/web/src/app/(app)/home/home-content.test.tsx` | snack swaps / hydration / supplements / personal rules / timeline が VM を受けて描画される |

### Integration テスト

- Swap Agent E2E (LLM mock): `test_agent_swap_e2e.py` で Bedrock のみ mock、fixed profile + target_meal + daily_context から golden snapshot `candidates` を取得、Schema 適合 + slot 一致 + 3 件の diversity (全部同じ cuisine でない等、弱い不変条件) を assert
- Adapter Lambda → AgentCore (real): 手動検証手順を `infra/lambdas/swap-meal/README.md` に記載 (CI では実行しない)

### E2E テスト

- repo に Playwright 未導入方針は継続 (Plan 07/08 と同じ)
- 手動検証チェックリストを `infra/lambdas/swap-meal/README.md` に追加 (Plan 画面 → meal card タップ → 候補 3 件表示 → 1 件選択 → plan が更新され再表示)

---

## デプロイ手順

Plan 08 の 2 段階デプロイパターンを継承。container を新しくしないため **第 1 段の PlanGeneratorStack deploy で DockerImageAsset が diff を検出して自動 re-build & push** する。

1. `pnpm contracts:generate` → Pydantic → JSON Schema → TS/Zod 自動生成 (新 5 契約を反映)
2. `pnpm --filter infra test -- --run` / `pnpm --filter contracts-py test` / `pnpm --filter web test` 全部 green 確認
3. `cdk deploy PlanGeneratorStack` — container 再 build & push、Runtime 更新 (handler 追加のため必須)
4. `cdk deploy FitnessStack -c agentcoreRuntimeArn=<ARN>` — SwapMealLambda + 2 route 追加
5. `vercel deploy --prod` — Web 更新
6. 手動検証: Plan 画面で meal card タップ → 3 候補表示 → 選択 → 画面反映 / Home で 5 セクション描画確認

CI 化時は `pnpm deploy:plan09` で 2 段階を自動化 (既存 `deploy:plan08` と同構造)。

---

## セキュリティ

- Adapter Lambda の IAM は **既存 generate-plan Lambda + DeleteItem** で完結。swap-meal は同じ `LeadingKeys=["user#*"]` 条件下で Get/Put/Delete を行う
- candidates mode でも `medical_*_note` は Adapter の mapper で除去 (Plan 08 の `SafePromptProfile` を再利用、分離境界は変わらない)
- `MealSwapContext` / `target_meal` / `daily_context` を CloudWatch にフル出力しない (PII。エラー時も shape のみ)
- AgentCore container 側の IAM 変更なし (既存 `food#*` 読み取り + Bedrock InvokeModel のみで swap も動く。swap が新しく読む DB リソースはない)
- **任意 meal 書き込みの不可能性**: apply body は `{ proposal_id, chosen_index }` のみで、meal 内容は DDB 上の proposal item (server 生成 + TTL) からしか取り出さない。client からは DDB の `WeeklyPlan` に任意の `Meal` を書き込めない。これは Plan 09 の設計根拠であり、apply 側で slot 一致 / 嗜好逸脱 / マクロ逸脱を改めて検査していないことの前提
- **proposal の所有権**: pk に `user#<requester_sub>` を使うため、他ユーザーの proposal_id を guess しても IAM `LeadingKeys` で GetItem が通らない (横断漏洩なし)
- **proposal の one-shot 消費**: apply 成功時に DeleteItem、失敗時も DynamoDB TTL で最大 10 分で消える。**DeleteItem が失敗して proposal が残った場合でも、`plan.revision` は既に +1 されているため、同 proposal_id を使った再 apply は必ず `expected_revision` mismatch で 409 になる**。one-shot 性は DeleteItem ではなく **revision monotonicity** で担保される。リプレイ攻撃 / 二重決済は成立しない
- **同時 swap の決定性**: 同じ plan_id / 同じ revision から複数の proposal が生成されたとき、どれか 1 つだけが apply で成功し、残りは DDB の ConditionExpression で atomic に 409 になる。後勝ち上書きや失われた更新は発生しない

---

## ロールアウト

Plan 09 は Plan 08 **未 deploy** 前提で進む:

- `WeeklyPlan` の 5 セクション (`snack_swaps / hydration_* / supplement_recommendations / personal_rules / timeline_notes / weekly_notes`) は Plan 08 で Pydantic に存在、VM 側が使っていなかっただけ。契約としては拡張なし、VM 側のみ拡張する
- **新規追加**: `WeeklyPlan.revision: int` field。Plan 08 Adapter で `revision: 0` を付与。`DayPlan` に slot 一意性 validator 追加
- Plan 08 が未 deploy のため既存 DDB plan item は存在せず、backfill は不要。本 Plan deploy 後の初回 Plan 生成から revision=0 で書かれる
- もし Plan 09 コードが deploy される前に Plan 08 だけ deploy してしまった場合、 `revision` field を持たない plan item が DDB に入り Plan 09 の strict.parse が失敗する。**Plan 09 の契約変更を含む Adapter 修正は Plan 08 と同時 deploy する**運用とし、Plan 08 単独先行 deploy は許可しない (README / デプロイ手順に明記)
- Plan 画面 placeholder から本実装への置換はルート変わらず (`/plan`)、既存 URL 互換
- Feature flag は使わない (Plan 08 と同方針、Vercel Flags 導入コストに見合わない)

---

## 未解決 (Plan 10 以降)

- Item 単位の差し替え (meal 内の食材置換)
- 候補の cache (6 件初回生成 → 3+3 分割 cache)
- Recipe template DB 投入 + LLM が recipe を rerank するハイブリッド化
- 過去週 / 翌週の読取・差し替え
- 差し替え履歴の S3 export + Athena
- **ui-architecture §9.4 / §9.5 の契約拡張**: `alcohol allocation` / `shopping notes` / `prep time` / 複数 `tags` を表現する `DayPlan` / `Meal` の field 追加 (Plan 08 の契約と Plan 生成 prompt の両方に影響するため別 Plan)
- Shopping support (ui-architecture §9.6)
- Home の Today Actions / Coach Insight / Quick Actions (§8.5/§8.7/§8.9)
- 体重入力モーダル / 食事ログ UI / WeeklyCheckIn / Chat / Progress
- Playwright E2E の導入
- apply 時の daily totals ±10% 逸脱の server-side 検査 (運用観測で必要性が見えたら追加)

---

