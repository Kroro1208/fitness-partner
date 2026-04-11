# Plan 02: Deterministic Math Library (fitness-engine)

> **エージェント実行者向け**: 本計画は `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` でタスク単位に実行してください。ステップはチェックボックス (`- [ ]`) 形式で進捗管理します。

**目標**: `architecture.md` で "deterministic code にやらせる" と明記された 4 つの純粋関数 (`calculate_calories_and_macros` / `calculate_hydration_target` / `recommend_supplements` / `evaluate_safety`) を、Pydantic 入出力モデル付きで Python パッケージ `fitness-engine` として実装する。テストカバレッジ 80%+ を担保する。

**アーキテクチャ**: 仕様書 Section 2.1 の Hybrid 方針に従い、すべて I/O なしの**純粋関数**として実装する。将来 Strands Agents が in-process tool として import する。Lambda ツール化は行わない (ネットワーク越えの価値がないため)。契約は Plan 01 の Pydantic single source of truth を使う — 入力モデルは `contracts-py` に追加し、TS/Zod を再生成する。

**技術スタック**: Python 3.11 + uv + Pydantic v2 + pytest + pytest-cov / Plan 01 で確立した contracts パイプライン。

**仕様書参照**:

- `docs/architecture.md` 9.4-9.8 (Calorie Macro Engine / Meal Plan Generator / Snack Swap Generator / Hydration Engine / Supplement Recommender)
- `docs/architecture.md` 9.2 (Safety Guard)
- `docs/architecture.md` 11.3-11.7 (ツール設計)
- `docs/architecture.md` 15 (安全ポリシー)
- `docs/architecture.md` 19 (実装方針 LLM vs コード vs DB)
- `docs/superpowers/specs/2026-04-11-design-decisions.md` Section 2.1 (Hybrid Runtime 境界)

---

## 実行環境メモ (Plan 01 で確立した sandbox 制約)

以下は **macOS sandbox (Claude Code 実行環境) 限定の制約**。CI (GitHub Actions Linux ランナー) ではこれらの制約は **一切発生しない**。

**sandbox 内 (ローカル Claude Code)**:

- **`uv run` は panic** (SCDynamicStore NULL) → `.venv/bin/pytest` / `.venv/bin/python` を直接呼ぶ
- **`uv sync` も panic** → ユーザーがご自身のターミナルで手動実行が必要
- **`/usr/bin/make` は動かない** (xcrun cache 問題) → 各コマンドを直接呼ぶ

**CI (GitHub Actions / Linux) 内**:

- `uv run pytest` / `uv sync` / `make` すべて正常動作する
- CI ワークフロー (`.github/workflows/ci.yml`) では従来どおり `uv run` を使用する

本計画のタスク内コマンドは sandbox 前提で `.venv/bin/` 直接呼出しを使うが、Makefile と CI は Linux 前提で書く (両者を混同しないこと)。

---

## 言語方針

- タスク名・説明・コメント本文: 日本語
- コード (識別子・関数名・フィールド名): 英語
- コミットメッセージ: Conventional Commits (英語)
- ファイルパス・コマンド: 英語

---

## ファイル構成 (本計画で作成)

```
ai-fitness-partner/
├── packages/
│   ├── contracts-py/                    # 既存、入力モデルを追加
│   │   └── src/fitness_contracts/models/
│   │       ├── calorie_macro.py         # 既存 (出力)
│   │       ├── calorie_macro_input.py   # 新規 (入力)
│   │       ├── hydration.py             # 新規 (入出力)
│   │       ├── supplement.py            # 新規 (入出力)
│   │       └── safety.py                # 新規 (入出力)
│   ├── contracts-ts/                    # 既存、schemas/generated を再生成
│   └── fitness-engine/                  # 新規パッケージ
│       ├── pyproject.toml
│       ├── src/fitness_engine/
│       │   ├── __init__.py
│       │   ├── calorie_macro.py         # BMR/TDEE/deficit/macros
│       │   ├── hydration.py             # 水分計算
│       │   ├── supplements.py           # サプリ推奨ルール
│       │   └── safety.py                # Safety Guard (決定的ルール)
│       └── tests/
│           ├── __init__.py
│           ├── test_calorie_macro.py
│           ├── test_hydration.py
│           ├── test_supplements.py
│           └── test_safety.py
├── pyproject.toml                       # workspace members を更新
└── Makefile                             # test-py / contracts-py ターゲットを更新
```

---

## 設計原則 (重要)

### 1. 純粋関数のみ

- 副作用禁止 (print / logger / I/O / 時刻取得 すべて禁止)
- 乱数禁止 (決定論性を担保)
- グローバル状態への依存禁止
- 入力 Pydantic モデル → 出力 Pydantic モデル / プリミティブ のみ

### 2. Mifflin-St Jeor 式は仕様書通り厳守

```
男性: BMR = (10 × weight_kg) + (6.25 × height_cm) - (5 × age) + 5
女性: BMR = (10 × weight_kg) + (6.25 × height_cm) - (5 × age) - 161
```

`sex` は MVP 段階では `"male" | "female"` のみ受け付ける (`"other"` / `"prefer_not_to_say"` は UI で別途処理する想定 — 本計画スコープ外)。

### 3. 活動係数も仕様書通り

```
sedentary: 1.2
lightly_active: 1.375
moderately_active: 1.55
very_active: 1.725
extremely_active: 1.9
```

### 4. deficit ルール (Plan 02 時点の MVP 版)

- 通常: TDEE - 400 kcal (範囲 -300〜-500 の中央値)
- 高活動者 (very_active 以上): TDEE - 500 kcal を上限、つまり本計画では一律 -500
- caution 条件 (低体重 BMI<20 / 睡眠 <6h / ストレス high): TDEE - 300 kcal に緩和
- `target_calories` の**下限 guard**: BMR × 1.1 を下回らない (極端低カロリー防止)

### 5. Macro ルール (Plan 02 時点の MVP 版)

- **Protein**: 1.8 g/kg (固定、将来 1.6-2.2 の範囲調整予定)
- **Fat**: 0.8 g/kg (固定、将来 0.6-1.0 予定)
- **Carbs**: 残りカロリー / 4 kcal/g

### 6. Hydration ルール (仕様書 9.7 そのまま)

- 基本: 35 ml × weight_kg
- 運動 +500ml × hours_per_day (workouts_per_week から 1日換算)
- 肉体労働 / 屋外仕事: +750ml (500-1000 の中央値)

### 7. Supplement ルール (architecture.md 11.7 全 6 種)

- **whey** (ホエイ): `protein_gap_g > 20` — タンパク質不足時
- **creatine** (クレアチン): `workouts_per_week >= 3` — 週 3 回以上トレーニング
- **caffeine** (カフェイン): `early_morning_training == True` — 早朝トレや眠気対策
- **vitamin_d** (ビタミン D): `low_sunlight_exposure == True` — 日照不足・冬場・屋内労働
- **omega3** (オメガ 3): `fish_per_week == 0` — 魚摂取少
- **magnesium** (マグネシウム): `sleep_hours < 7` — 睡眠の質課題

**MVP 逸脱の明示**: architecture.md 11.7 のシグネチャは `recommendSupplements(profile, targets) -> SupplementRecommendation[]` だが、本計画では `recommend_supplements(SupplementInput) -> SupplementRecommendationList` に簡略化する。理由は (a) Pydantic v2 の JSON Schema で top-level array を素直に扱えない (b) 入力を `SupplementInput` に集約することで純粋関数のテスト容易性を高める。フロントエンドは UserProfile + CalorieMacroResult から SupplementInput への変換を行う責務を持つ。

### 8. Safety Guard の分類ルール

**スコープ限定**: 本計画の Safety Guard は **構造化 UserProfile フィールドのみを入力とする決定論的ルール**のみを担当する。architecture.md 9.2 / 15.1 / 15.2 のうち、以下は **Plan 02 スコープ外** として LLM/orchestrator 層 (Plan 06 Strands Agents 以降) に委ねる:

- 会話本文からの危険信号検知 (嘔吐・下剤・過食嘔吐の示唆、急性痛/胸痛/失神などの訴え)
- 自傷・飢餓レベルの意図表明
- 「1 週間で体重の 5% 超を減らしたい」等の数値ベース会話発言

本計画の `evaluate_safety` は **構造化入力から決定論的に判定できる条件のみ** を実装する。

**block 条件** (以下いずれかで `responseMode: "medical_redirect"`):

- `age < 18` (architecture.md 3.2「18 歳未満は除外対象」)
- `pregnancy_or_breastfeeding == True`
- `eating_disorder_history == True`
- `medical_conditions` に `["diabetes_insulin", "severe_kidney", "severe_hypertension", "heart_condition_acute"]` のいずれか
- `bmi < 17.0` (極端低体重、減量希望の有無を問わず通常プラン生成を停止)

**caution 条件** (`responseMode: "limited"`):

- `desired_pace == "aggressive"` (architecture.md 15.2「早すぎる減量希望」)
- `sleep_hours < 6` かつ `stress_level == "high"`
- `alcohol_per_week >= 10` (週 10 杯以上)
- BMI 17-19 (低体重だが運動改善など減量以外の目的も OK)

**safe**: 上記以外

**MVP 逸脱の明示**: architecture.md は「1 週間で体重の 5% 超を減らそうとする」のような量的 block 基準も示唆するが、Plan 02 では `desired_pace: "steady" | "aggressive"` の enum のみで判定する。数値ベースの block は Plan 03 以降で検討する。そのため `goal_weight_kg` は SafetyInput から除外して Plan 02 のスコープを絞る。

---

## タスク 1: `contracts-py` に入力モデルを追加

**対象ファイル**:

- 作成: `packages/contracts-py/src/fitness_contracts/models/calorie_macro_input.py`
- 作成: `packages/contracts-py/src/fitness_contracts/models/hydration.py`
- 作成: `packages/contracts-py/src/fitness_contracts/models/supplement.py`
- 作成: `packages/contracts-py/src/fitness_contracts/models/safety.py`
- 変更: `packages/contracts-py/src/fitness_contracts/schema_export.py` (MODEL_REGISTRY に追加)

- [ ] **ステップ 1: `calorie_macro_input.py` を作成**

内容:

```python
"""CalorieMacroInput: Calorie Macro Engine への入力型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Sex = Literal["male", "female"]
ActivityLevel = Literal[
    "sedentary",
    "lightly_active",
    "moderately_active",
    "very_active",
    "extremely_active",
]
StressLevel = Literal["low", "moderate", "high"]


class CalorieMacroInput(BaseModel):
    """Calorie Macro Engine への入力。

    architecture.md 11.3 の入力仕様 (`job_type`, `workouts_per_week`,
    `training_type`, `preferred_rate`, `safety_constraints`) を **MVP では
    `activity_level` 1 フィールドに集約**する。フロントエンド (BFF) が
    UserProfile → CalorieMacroInput の変換時に job_type と workouts_per_week
    から activity_level を導出する責務を持つ。
    減量ペース (`desired_pace`) は本入力には含めない — ペース妥当性は Safety
    Guard (SafetyInput.desired_pace) で扱い、Calorie Engine はペースに応じた
    deficit 増減はしない (aggressive で deficit を大きくすると安全限界を
    超えうるため、architecture.md の 11.3「TDEE-500 上限」方針を厳守)。
    """

    model_config = ConfigDict(
        json_schema_extra={
            "title": "CalorieMacroInput",
            "description": "Calorie Macro Engine の入力。",
        }
    )

    age: int = Field(ge=18, le=120, description="年齢 (成人のみ)。")
    sex: Sex = Field(description="生物学的性別 (BMR 計算に必要)。")
    height_cm: float = Field(gt=0, lt=300, description="身長 (cm)。")
    weight_kg: float = Field(gt=0, lt=500, description="現在体重 (kg)。")
    activity_level: ActivityLevel = Field(
        description="PAL 活動係数を決める活動レベル。"
    )
    sleep_hours: float = Field(
        ge=0, le=24, description="平均睡眠時間 (caution 条件判定に使う)。"
    )
    stress_level: StressLevel = Field(
        description="ストレスレベル (caution 条件判定に使う)。"
    )
```

- [ ] **ステップ 2: `hydration.py` を作成**

内容:

```python
"""Hydration: 水分計算の入出力型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

JobType = Literal[
    "desk",
    "standing",
    "light_physical",
    "manual_labour",
    "outdoor",
]


class HydrationInput(BaseModel):
    """Hydration Engine への入力。"""

    model_config = ConfigDict(json_schema_extra={"title": "HydrationInput"})

    weight_kg: float = Field(gt=0, lt=500, description="現在体重 (kg)。")
    workouts_per_week: int = Field(
        ge=0, le=14, description="週の運動頻度 (回)。"
    )
    avg_workout_minutes: int = Field(
        ge=0, le=300, description="1 回あたりの平均運動時間 (分)。"
    )
    job_type: JobType = Field(description="仕事の身体負荷タイプ。")


class HydrationResult(BaseModel):
    """Hydration Engine の出力。

    architecture.md 11.6 に合わせて target_liters / formula_breakdown に加え、
    practical_tips (生活導線に乗るアクション提案) と why_it_matters (理由) を返す。
    """

    model_config = ConfigDict(json_schema_extra={"title": "HydrationResult"})

    target_liters: float = Field(
        ge=0, description="1 日の水分目標 (リットル)。"
    )
    formula_breakdown: list[str] = Field(
        default_factory=list,
        description="計算の内訳 (base + workout + job)。",
    )
    practical_tips: list[str] = Field(
        default_factory=list,
        description="生活導線に乗せるための実務的なヒント (例: 朝起きてすぐ 1 杯)。",
    )
    why_it_matters: list[str] = Field(
        default_factory=list,
        description="なぜ水分が重要かの簡潔な説明 (1-3 項目)。",
    )
```

- [ ] **ステップ 3: `supplement.py` を作成**

内容:

```python
"""Supplement: サプリ推奨の入出力型。"""

from pydantic import BaseModel, ConfigDict, Field


class SupplementInput(BaseModel):
    """Supplement Recommender への入力。"""

    model_config = ConfigDict(json_schema_extra={"title": "SupplementInput"})

    protein_gap_g: float = Field(
        description=(
            "タンパク質目標と食事からの推定摂取量の差 (g)。"
            "正なら不足 (ホエイ推奨トリガー)、負なら過剰。"
        )
    )
    workouts_per_week: int = Field(ge=0, le=14)
    sleep_hours: float = Field(ge=0, le=24)
    fish_per_week: int = Field(
        ge=0, le=21, description="週の魚摂取回数 (オメガ3 推奨トリガー)。"
    )
    early_morning_training: bool = Field(
        default=False,
        description="早朝トレーニング習慣または眠気対策のニーズ (カフェイン推奨トリガー)。",
    )
    low_sunlight_exposure: bool = Field(
        default=False,
        description="日照不足・冬場・屋内労働中心 (ビタミン D 推奨トリガー)。",
    )


class SupplementRecommendation(BaseModel):
    """1 件のサプリ推奨。"""

    model_config = ConfigDict(
        json_schema_extra={"title": "SupplementRecommendation"}
    )

    name: str = Field(description="サプリ名 (whey / creatine / magnesium / omega3 等)。")
    dose: str = Field(description="推奨用量 (人間が読める形式)。")
    timing: str = Field(description="摂取タイミング。")
    why_relevant: str = Field(description="なぜこのユーザーに関係があるか。")
    caution: str | None = Field(
        default=None, description="注意事項 (ある場合)。"
    )


class SupplementRecommendationList(BaseModel):
    """Supplement Recommender の出力 (0 件以上の推奨)。"""

    model_config = ConfigDict(
        json_schema_extra={"title": "SupplementRecommendationList"}
    )

    items: list[SupplementRecommendation] = Field(default_factory=list)
```

- [ ] **ステップ 4: `safety.py` を作成**

内容:

```python
"""Safety: Safety Guard の入出力型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SafetyLevel = Literal["safe", "caution", "blocked"]
ResponseMode = Literal["normal", "limited", "medical_redirect"]


class SafetyInput(BaseModel):
    """Safety Guard への入力 (UserProfile の安全関連サブセット)。

    Note: Plan 02 では `goal_weight_kg` は入力に含めない。数値ベースの
    体重ギャップ判定 (例: 1 週間で 5% 減) は Plan 03 以降で扱う。
    """

    model_config = ConfigDict(json_schema_extra={"title": "SafetyInput"})

    age: int = Field(
        ge=0, le=120, description="年齢。18 歳未満は block される。"
    )
    weight_kg: float = Field(gt=0, lt=500)
    height_cm: float = Field(gt=0, lt=300)
    desired_pace: Literal["steady", "aggressive"] = Field(
        description="減量ペース希望。aggressive は caution として扱う。"
    )
    sleep_hours: float = Field(ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"]
    alcohol_per_week: int = Field(
        ge=0, le=100, description="週の飲酒杯数。"
    )
    pregnancy_or_breastfeeding: bool = Field(default=False)
    eating_disorder_history: bool = Field(default=False)
    medical_conditions: list[str] = Field(
        default_factory=list,
        description=(
            "既往症の列挙。diabetes_insulin / severe_kidney / "
            "severe_hypertension / heart_condition_acute 等。"
        ),
    )


class SafetyResult(BaseModel):
    """Safety Guard の出力。"""

    model_config = ConfigDict(json_schema_extra={"title": "SafetyResult"})

    level: SafetyLevel
    reasons: list[str] = Field(default_factory=list)
    allowed_to_generate_plan: bool
    response_mode: ResponseMode
```

- [ ] **ステップ 5: `schema_export.py` の MODEL_REGISTRY を更新**

既存の Import 行に追加し、`MODEL_REGISTRY` に新規モデルを登録:

```python
from fitness_contracts.models.calorie_macro import CalorieMacroResult
from fitness_contracts.models.calorie_macro_input import CalorieMacroInput
from fitness_contracts.models.hydration import HydrationInput, HydrationResult
from fitness_contracts.models.safety import SafetyInput, SafetyResult
from fitness_contracts.models.supplement import (
    SupplementInput,
    SupplementRecommendation,
    SupplementRecommendationList,
)

MODEL_REGISTRY: list[tuple[str, type[BaseModel]]] = [
    ("CalorieMacroInput", CalorieMacroInput),
    ("CalorieMacroResult", CalorieMacroResult),
    ("HydrationInput", HydrationInput),
    ("HydrationResult", HydrationResult),
    ("SupplementInput", SupplementInput),
    ("SupplementRecommendation", SupplementRecommendation),
    ("SupplementRecommendationList", SupplementRecommendationList),
    ("SafetyInput", SafetyInput),
    ("SafetyResult", SafetyResult),
]
```

- [ ] **ステップ 6: contracts 再生成**

```bash
.venv/bin/python -m fitness_contracts.schema_export packages/contracts-ts/schemas
pnpm --filter @fitness/contracts-ts generate
```

期待結果: `packages/contracts-ts/schemas/` に 9 個の `.schema.json` が生成され、`generated/types.d.ts` と `generated/zod.ts` が新モデルを含む形で再生成される。

- [ ] **ステップ 7: テスト再実行**

```bash
.venv/bin/pytest packages/contracts-py -v
pnpm --filter @fitness/contracts-ts test
```

期待結果: 既存の Python 14 件 + TS 8 件がすべて pass (roundtrip test は既存の CalorieMacroResult をそのまま検証するので変更なし)。

- [ ] **ステップ 8: コミット**

```bash
git add packages/contracts-py/src/fitness_contracts/models/calorie_macro_input.py \
        packages/contracts-py/src/fitness_contracts/models/hydration.py \
        packages/contracts-py/src/fitness_contracts/models/supplement.py \
        packages/contracts-py/src/fitness_contracts/models/safety.py \
        packages/contracts-py/src/fitness_contracts/schema_export.py \
        packages/contracts-ts/schemas \
        packages/contracts-ts/generated
git commit -m "feat(contracts): add input/output models for fitness-engine"
```

---

## タスク 2: `fitness-engine` パッケージ骨格作成

**対象ファイル**:

- 作成: `packages/fitness-engine/pyproject.toml`
- 作成: `packages/fitness-engine/src/fitness_engine/__init__.py`
- 作成: `packages/fitness-engine/tests/__init__.py`
- 変更: `pyproject.toml` (ルート) の `[tool.uv.workspace].members` に追加
- 変更: `pyproject.toml` (ルート) の `[tool.pytest.ini_options].testpaths` に追加

- [ ] **ステップ 1: `packages/fitness-engine/pyproject.toml` を作成**

内容:

```toml
[project]
name = "fitness-engine"
version = "0.0.0"
description = "ai-fitness-partner の決定論的計算エンジン (純粋関数)"
requires-python = ">=3.11"
dependencies = [
  "fitness-contracts",
  "pydantic>=2.8,<3",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
  "pytest-cov>=5.0",
  "ruff>=0.6",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/fitness_engine"]

[tool.uv.sources]
fitness-contracts = { workspace = true }
```

- [ ] **ステップ 2: `src/fitness_engine/__init__.py` を作成**

```python
"""fitness-engine: 決定論的計算の純粋関数コレクション。"""

__version__ = "0.0.0"
```

- [ ] **ステップ 3: 空の `tests/__init__.py` を作成**

```bash
mkdir -p packages/fitness-engine/tests
touch packages/fitness-engine/tests/__init__.py
```

- [ ] **ステップ 4: ルート `pyproject.toml` を更新**

既存の `[tool.uv.workspace].members` と `[tool.pytest.ini_options].testpaths` を拡張:

```toml
[tool.uv.workspace]
members = ["packages/contracts-py", "packages/fitness-engine"]

[tool.pytest.ini_options]
testpaths = [
  "packages/contracts-py/tests",
  "packages/fitness-engine/tests",
]
python_files = ["test_*.py"]
```

- [ ] **ステップ 5: ユーザー側で `uv sync` を実行してもらう**

Claude Code の sandbox では `uv sync` が panic するため、実装者 (subagent) は `BLOCKED` で報告し、ユーザーに以下を依頼する:

```bash
cd /Users/naoya/Desktop/ai-fitness-partner
UV_CACHE_DIR=.cache/uv uv sync --all-packages --extra dev
```

期待結果: `fitness-engine` + `pytest-cov` 等の依存が追加インストールされ、`.venv/bin/` に `fitness_engine` が editable install される。

- [ ] **ステップ 6: インストール確認**

```bash
.venv/bin/python -c "import fitness_engine; print(fitness_engine.__version__)"
```

期待結果: `0.0.0` が出力される。

- [ ] **ステップ 7: コミット**

```bash
git add packages/fitness-engine pyproject.toml uv.lock
git commit -m "feat(fitness-engine): add package skeleton"
```

---

## タスク 3: BMR 計算 (TDD)

**対象ファイル**:

- 作成: `packages/fitness-engine/src/fitness_engine/calorie_macro.py`
- 作成: `packages/fitness-engine/tests/test_calorie_macro.py`

- [ ] **ステップ 1: 失敗するテストを書く**

`packages/fitness-engine/tests/test_calorie_macro.py`:

```python
"""calorie_macro モジュールのテスト (Mifflin-St Jeor)。"""

import pytest

from fitness_engine.calorie_macro import calculate_bmr


@pytest.mark.parametrize(
    ("sex", "age", "height_cm", "weight_kg", "expected"),
    [
        # Mifflin-St Jeor 公式の既知値 (手計算確認済み)
        # 男性 30歳 170cm 70kg: 10*70 + 6.25*170 - 5*30 + 5 = 700+1062.5-150+5 = 1617.5 → round 1618
        ("male", 30, 170.0, 70.0, 1618),
        # 女性 30歳 160cm 55kg: 10*55 + 6.25*160 - 5*30 - 161 = 550+1000-150-161 = 1239
        ("female", 30, 160.0, 55.0, 1239),
        # 男性 25歳 180cm 80kg: 800+1125-125+5 = 1805
        ("male", 25, 180.0, 80.0, 1805),
        # 女性 45歳 155cm 50kg: 500+968.75-225-161 = 1082.75 → round 1083
        ("female", 45, 155.0, 50.0, 1083),
    ],
)
def test_calculate_bmr_mifflin_st_jeor(
    sex: str, age: int, height_cm: float, weight_kg: float, expected: int
):
    result = calculate_bmr(
        sex=sex, age=age, height_cm=height_cm, weight_kg=weight_kg
    )
    assert result == expected


def test_calculate_bmr_rejects_unknown_sex():
    """sex が male/female 以外なら ValueError。エラーメッセージ文言には依存しない。"""
    with pytest.raises(ValueError):
        calculate_bmr(sex="other", age=30, height_cm=170.0, weight_kg=70.0)
```

- [ ] **ステップ 2: 失敗を確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

期待結果: `ModuleNotFoundError: No module named 'fitness_engine.calorie_macro'`。

- [ ] **ステップ 3: `calorie_macro.py` に BMR 実装**

```python
"""Calorie Macro Engine: BMR / TDEE / deficit / macros の決定論的計算。

純粋関数のみ。I/O なし。将来 Strands Agents から in-process tool として
呼ばれる。
"""

from typing import Literal

Sex = Literal["male", "female"]


def calculate_bmr(*, sex: Sex, age: int, height_cm: float, weight_kg: float) -> int:
    """Mifflin-St Jeor 式で BMR (kcal/day) を計算する。

    - 男性: (10 × weight_kg) + (6.25 × height_cm) - (5 × age) + 5
    - 女性: (10 × weight_kg) + (6.25 × height_cm) - (5 × age) - 161

    Args:
        sex: "male" または "female"。MVP では二択のみ。
        age: 年齢 (18 以上を想定)。
        height_cm: 身長 (cm)。
        weight_kg: 体重 (kg)。

    Returns:
        BMR (kcal/day, 整数に丸める)。

    Raises:
        ValueError: sex が "male" / "female" 以外の場合。
    """
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    if sex == "male":
        bmr = base + 5
    elif sex == "female":
        bmr = base - 161
    else:
        raise ValueError(
            f"sex must be 'male' or 'female' (MVP limitation), got {sex!r}"
        )
    return round(bmr)
```

- [ ] **ステップ 4: テストパスを確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

期待結果: 5 件すべて pass (4 parametrize + 1 error case)。

- [ ] **ステップ 5: コミット**

```bash
git add packages/fitness-engine/src/fitness_engine/calorie_macro.py \
        packages/fitness-engine/tests/test_calorie_macro.py
git commit -m "feat(fitness-engine): add calculate_bmr (Mifflin-St Jeor)"
```

---

## タスク 4: TDEE 計算 (TDD)

**対象ファイル**:

- 変更: `packages/fitness-engine/src/fitness_engine/calorie_macro.py`
- 変更: `packages/fitness-engine/tests/test_calorie_macro.py`

- [ ] **ステップ 1: 失敗するテストを追加**

既存の `test_calorie_macro.py` に追記:

```python
from fitness_engine.calorie_macro import ACTIVITY_MULTIPLIERS, calculate_tdee


def test_activity_multipliers_match_spec():
    assert ACTIVITY_MULTIPLIERS == {
        "sedentary": 1.2,
        "lightly_active": 1.375,
        "moderately_active": 1.55,
        "very_active": 1.725,
        "extremely_active": 1.9,
    }


@pytest.mark.parametrize(
    ("bmr", "activity_level", "expected"),
    [
        (1500, "sedentary", 1800),  # 1500 * 1.2 = 1800
        # Note: Python 3 の round() は banker's rounding (偶数丸め) を使うため
        # 1500 * 1.375 = 2062.5 は 2062 になる (2062 が偶数)
        (1500, "lightly_active", 2062),
        (1618, "moderately_active", 2508),  # 1618 * 1.55 = 2507.9 → 2508
        (2000, "very_active", 3450),  # 2000 * 1.725 = 3450
        (2000, "extremely_active", 3800),
    ],
)
def test_calculate_tdee(bmr: int, activity_level: str, expected: int):
    assert calculate_tdee(bmr=bmr, activity_level=activity_level) == expected


def test_calculate_tdee_rejects_unknown_level():
    """未知の activity_level は ValueError。メッセージ文言には依存しない。"""
    with pytest.raises(ValueError):
        calculate_tdee(bmr=1500, activity_level="super_active")
```

- [ ] **ステップ 2: 失敗を確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

期待結果: 新規 7 件が `ImportError: cannot import name 'calculate_tdee'` で失敗。

- [ ] **ステップ 3: `calculate_tdee` を実装**

`calorie_macro.py` に追加:

```python
ActivityLevel = Literal[
    "sedentary",
    "lightly_active",
    "moderately_active",
    "very_active",
    "extremely_active",
]

ACTIVITY_MULTIPLIERS: dict[str, float] = {
    "sedentary": 1.2,
    "lightly_active": 1.375,
    "moderately_active": 1.55,
    "very_active": 1.725,
    "extremely_active": 1.9,
}


def calculate_tdee(*, bmr: int, activity_level: ActivityLevel) -> int:
    """BMR と活動レベルから TDEE (kcal/day) を計算する。

    Raises:
        ValueError: activity_level が ACTIVITY_MULTIPLIERS のキー以外の場合。
    """
    try:
        multiplier = ACTIVITY_MULTIPLIERS[activity_level]
    except KeyError as exc:
        raise ValueError(
            f"activity_level must be one of {list(ACTIVITY_MULTIPLIERS)}, "
            f"got {activity_level!r}"
        ) from exc
    return round(bmr * multiplier)
```

- [ ] **ステップ 4: テストパスを確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

期待結果: 12 件すべて pass (5 既存 + 7 新規)。

- [ ] **ステップ 5: コミット**

```bash
git add packages/fitness-engine/src/fitness_engine/calorie_macro.py \
        packages/fitness-engine/tests/test_calorie_macro.py
git commit -m "feat(fitness-engine): add calculate_tdee with activity multipliers"
```

---

## タスク 5: 目標カロリー (deficit) 計算 (TDD)

**対象ファイル**:

- 変更: `packages/fitness-engine/src/fitness_engine/calorie_macro.py`
- 変更: `packages/fitness-engine/tests/test_calorie_macro.py`

- [ ] **ステップ 1: 失敗するテストを追加**

```python
from fitness_engine.calorie_macro import calculate_target_calories


@pytest.mark.parametrize(
    ("tdee", "bmr", "activity_level", "sleep_hours", "stress_level", "bmi", "expected"),
    [
        # 通常条件: TDEE - 400
        (2500, 1600, "moderately_active", 7.5, "moderate", 22.0, 2100),
        # 高活動: TDEE - 500 (very_active 以上)
        (3000, 1800, "very_active", 8.0, "low", 23.0, 2500),
        # caution (睡眠不足+高ストレス): TDEE - 300
        (2500, 1600, "moderately_active", 5.5, "high", 22.0, 2200),
        # caution (低体重 BMI<20): TDEE - 300
        (2200, 1500, "lightly_active", 8.0, "low", 19.0, 1900),
        # guard: BMR*1.1 を下回らない
        # BMR=1500, BMR*1.1=1650, TDEE=1800, TDEE-400=1400 → guard で 1650
        (1800, 1500, "sedentary", 8.0, "moderate", 22.0, 1650),
    ],
)
def test_calculate_target_calories(
    tdee: int,
    bmr: int,
    activity_level: str,
    sleep_hours: float,
    stress_level: str,
    bmi: float,
    expected: int,
):
    result = calculate_target_calories(
        tdee=tdee,
        bmr=bmr,
        activity_level=activity_level,
        sleep_hours=sleep_hours,
        stress_level=stress_level,
        bmi=bmi,
    )
    assert result == expected
```

- [ ] **ステップ 2: 失敗を確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

- [ ] **ステップ 3: `calculate_target_calories` を実装**

```python
def calculate_target_calories(
    *,
    tdee: int,
    bmr: int,
    activity_level: ActivityLevel,
    sleep_hours: float,
    stress_level: Literal["low", "moderate", "high"],
    bmi: float,
) -> int:
    """TDEE から deficit ルールに従って目標カロリーを決定する。

    ルール:
    - caution 条件 (睡眠<6h かつ stress=high / BMI<20): TDEE - 300
    - 高活動 (very_active, extremely_active): TDEE - 500
    - 通常: TDEE - 400
    - 下限 guard: BMR * 1.1 を下回らない
    """
    is_caution = (sleep_hours < 6 and stress_level == "high") or bmi < 20.0
    is_high_activity = activity_level in ("very_active", "extremely_active")

    if is_caution:
        deficit = 300
    elif is_high_activity:
        deficit = 500
    else:
        deficit = 400

    target = tdee - deficit
    floor = round(bmr * 1.1)
    return max(target, floor)
```

- [ ] **ステップ 4: テストパスを確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

期待結果: 全件 pass (12 + 5 = 17 件)。

- [ ] **ステップ 5: コミット**

```bash
git add packages/fitness-engine/src/fitness_engine/calorie_macro.py \
        packages/fitness-engine/tests/test_calorie_macro.py
git commit -m "feat(fitness-engine): add calculate_target_calories with deficit rules"
```

---

## タスク 6: マクロ計算 (TDD)

**対象ファイル**:

- 変更: `packages/fitness-engine/src/fitness_engine/calorie_macro.py`
- 変更: `packages/fitness-engine/tests/test_calorie_macro.py`

- [ ] **ステップ 1: 失敗するテストを追加**

```python
from fitness_engine.calorie_macro import calculate_macros


def test_calculate_macros_basic():
    # weight 70kg, target 2100 kcal
    # protein: 70 * 1.8 = 126g → 126 * 4 = 504 kcal
    # fat: 70 * 0.8 = 56g → 56 * 9 = 504 kcal
    # carbs: (2100 - 504 - 504) / 4 = 273g
    result = calculate_macros(target_calories=2100, weight_kg=70.0)
    assert result == {"protein_g": 126, "fat_g": 56, "carbs_g": 273}


def test_calculate_macros_low_carb_positive():
    # 低めのターゲットで carbs が少量残るケース
    # weight 100kg, target 1500: protein 180g*4=720, fat 80g*9=720, remaining=60 → carbs 15
    result = calculate_macros(target_calories=1500, weight_kg=100.0)
    assert result["protein_g"] == 180
    assert result["fat_g"] == 80
    assert result["carbs_g"] == 15


def test_calculate_macros_clips_negative_carbs_to_zero():
    # 極端低ターゲットで remaining が負 (< 0) になるケース
    # weight 100kg, target 1000: protein 180g*4=720, fat 80g*9=720, remaining=1000-1440=-440 → 0 にクリップ
    result = calculate_macros(target_calories=1000, weight_kg=100.0)
    assert result["protein_g"] == 180
    assert result["fat_g"] == 80
    assert result["carbs_g"] == 0
```

- [ ] **ステップ 2: 失敗を確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

- [ ] **ステップ 3: `calculate_macros` を実装**

```python
def calculate_macros(*, target_calories: int, weight_kg: float) -> dict[str, int]:
    """目標カロリーと体重から protein / fat / carbs の g を決める。

    MVP ルール:
    - protein: 1.8 g/kg
    - fat: 0.8 g/kg
    - carbs: 残り / 4 kcal/g (負になったら 0 にクリップ)
    """
    protein_g = round(weight_kg * 1.8)
    fat_g = round(weight_kg * 0.8)
    protein_kcal = protein_g * 4
    fat_kcal = fat_g * 9
    carbs_kcal = max(0, target_calories - protein_kcal - fat_kcal)
    carbs_g = round(carbs_kcal / 4)
    return {"protein_g": protein_g, "fat_g": fat_g, "carbs_g": carbs_g}
```

- [ ] **ステップ 4: テストパスを確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

- [ ] **ステップ 5: コミット**

```bash
git add packages/fitness-engine/src/fitness_engine/calorie_macro.py \
        packages/fitness-engine/tests/test_calorie_macro.py
git commit -m "feat(fitness-engine): add calculate_macros"
```

---

## タスク 7: オーケストレータ `calculate_calories_and_macros` (TDD)

**対象ファイル**:

- 変更: `packages/fitness-engine/src/fitness_engine/calorie_macro.py`
- 変更: `packages/fitness-engine/tests/test_calorie_macro.py`

- [ ] **ステップ 1: 失敗するテストを追加**

```python
from fitness_contracts.models.calorie_macro import CalorieMacroResult
from fitness_contracts.models.calorie_macro_input import CalorieMacroInput

from fitness_engine.calorie_macro import calculate_calories_and_macros


def test_calculate_calories_and_macros_full_pipeline():
    input_ = CalorieMacroInput(
        age=30,
        sex="male",
        height_cm=170.0,
        weight_kg=70.0,
        activity_level="moderately_active",
        sleep_hours=7.5,
        stress_level="moderate",
    )
    result = calculate_calories_and_macros(input_)

    assert isinstance(result, CalorieMacroResult)
    assert result.bmr == 1618
    assert result.activity_multiplier == pytest.approx(1.55)
    assert result.tdee == 2508  # 1618 * 1.55 = 2507.9 → 2508
    # 通常条件なので TDEE - 400 = 2108
    assert result.target_calories == 2108
    assert result.protein_g == 126
    assert result.fat_g == 56
    # 2108 - 504 - 504 = 1100, / 4 = 275
    assert result.carbs_g == 275
    assert len(result.explanation) >= 3  # 最低でも BMR / TDEE / deficit の説明がある


def test_calculate_calories_and_macros_result_is_valid_pydantic():
    """出力が CalorieMacroResult の制約を満たすこと。"""
    input_ = CalorieMacroInput(
        age=25,
        sex="female",
        height_cm=160.0,
        weight_kg=55.0,
        activity_level="lightly_active",
        sleep_hours=8.0,
        stress_level="low",
    )
    result = calculate_calories_and_macros(input_)
    # Pydantic の検証を通過していることは constructor 時点で確認済み
    # 追加の振る舞い検証: 全フィールドが非負
    assert result.bmr >= 0
    assert result.tdee >= 0
    assert result.target_calories >= 0
    assert 1.0 <= result.activity_multiplier <= 2.0
```

- [ ] **ステップ 2: 失敗を確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

- [ ] **ステップ 3: `calculate_calories_and_macros` を実装**

```python
from fitness_contracts.models.calorie_macro import CalorieMacroResult
from fitness_contracts.models.calorie_macro_input import CalorieMacroInput


def calculate_calories_and_macros(
    input_: CalorieMacroInput,
) -> CalorieMacroResult:
    """4 ステップ計算をまとめて CalorieMacroResult を返すオーケストレータ。

    1. BMR を Mifflin-St Jeor で計算
    2. TDEE を活動係数で計算
    3. deficit ルールで目標カロリーを決定
    4. 体重から macros を算出

    副作用なし、純粋関数。
    """
    bmr = calculate_bmr(
        sex=input_.sex,
        age=input_.age,
        height_cm=input_.height_cm,
        weight_kg=input_.weight_kg,
    )
    tdee = calculate_tdee(bmr=bmr, activity_level=input_.activity_level)
    bmi = input_.weight_kg / ((input_.height_cm / 100) ** 2)
    target_calories = calculate_target_calories(
        tdee=tdee,
        bmr=bmr,
        activity_level=input_.activity_level,
        sleep_hours=input_.sleep_hours,
        stress_level=input_.stress_level,
        bmi=bmi,
    )
    macros = calculate_macros(
        target_calories=target_calories, weight_kg=input_.weight_kg
    )

    multiplier = ACTIVITY_MULTIPLIERS[input_.activity_level]
    explanation = [
        f"BMR: Mifflin-St Jeor ({input_.sex}, {input_.age}y, "
        f"{input_.height_cm}cm, {input_.weight_kg}kg) = {bmr} kcal",
        f"TDEE: BMR × {multiplier} ({input_.activity_level}) = {tdee} kcal",
        f"Target: {tdee} - deficit = {target_calories} kcal",
        (
            f"Macros: P={macros['protein_g']}g / "
            f"F={macros['fat_g']}g / C={macros['carbs_g']}g"
        ),
    ]

    return CalorieMacroResult(
        bmr=bmr,
        activity_multiplier=multiplier,
        tdee=tdee,
        target_calories=target_calories,
        protein_g=macros["protein_g"],
        fat_g=macros["fat_g"],
        carbs_g=macros["carbs_g"],
        explanation=explanation,
    )
```

- [ ] **ステップ 4: テストパスを確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_calorie_macro.py -v
```

期待結果: 全件 pass。

- [ ] **ステップ 5: コミット**

```bash
git add packages/fitness-engine/src/fitness_engine/calorie_macro.py \
        packages/fitness-engine/tests/test_calorie_macro.py
git commit -m "feat(fitness-engine): add calculate_calories_and_macros orchestrator"
```

---

## タスク 8: Hydration 計算 (TDD)

**対象ファイル**:

- 作成: `packages/fitness-engine/src/fitness_engine/hydration.py`
- 作成: `packages/fitness-engine/tests/test_hydration.py`

- [ ] **ステップ 1: 失敗するテストを書く**

`tests/test_hydration.py`:

```python
"""Hydration Engine のテスト。"""

import pytest

from fitness_contracts.models.hydration import HydrationInput, HydrationResult

from fitness_engine.hydration import calculate_hydration_target


@pytest.mark.parametrize(
    ("weight_kg", "workouts_per_week", "avg_workout_minutes", "job_type", "expected_liters"),
    [
        # 基本: 35ml × 70kg = 2.45 L
        (70.0, 0, 0, "desk", 2.45),
        # 運動: 週3 × 60分 = 平均 ~26分/day → +500 × 0.43 = +215ml → 2.665 L
        # 仕様書: +500ml per hour of exercise
        # 週180分 = 3時間/週 = 0.4286時間/日 → +500*0.4286 = +214 → 2.664
        (70.0, 3, 60, "desk", 2.66),
        # 肉体労働: +750ml
        (70.0, 0, 0, "manual_labour", 3.20),
        # 屋外: +750ml
        (70.0, 0, 0, "outdoor", 3.20),
        # light_physical は加算なし (デスク扱い)
        (70.0, 0, 0, "light_physical", 2.45),
    ],
)
def test_calculate_hydration_target_breakdown(
    weight_kg: float,
    workouts_per_week: int,
    avg_workout_minutes: int,
    job_type: str,
    expected_liters: float,
):
    input_ = HydrationInput(
        weight_kg=weight_kg,
        workouts_per_week=workouts_per_week,
        avg_workout_minutes=avg_workout_minutes,
        job_type=job_type,
    )
    result = calculate_hydration_target(input_)
    assert isinstance(result, HydrationResult)
    # 小数第2位まで許容
    assert abs(result.target_liters - expected_liters) < 0.01


def test_calculate_hydration_breakdown_has_three_components():
    """breakdown は base / workout / job の 3 要素を含む (文言の具体は問わない)。

    narrative テキストの言い回しに依存しない構造検証。
    """
    input_ = HydrationInput(
        weight_kg=70.0,
        workouts_per_week=3,
        avg_workout_minutes=60,
        job_type="manual_labour",
    )
    result = calculate_hydration_target(input_)
    assert len(result.formula_breakdown) == 3


def test_calculate_hydration_returns_practical_tips_and_why():
    """architecture.md 11.6 に合わせて practical_tips と why_it_matters を返すこと。"""
    input_ = HydrationInput(
        weight_kg=65.0,
        workouts_per_week=2,
        avg_workout_minutes=30,
        job_type="desk",
    )
    result = calculate_hydration_target(input_)
    assert len(result.practical_tips) >= 1
    assert len(result.why_it_matters) >= 1
```

- [ ] **ステップ 2: 失敗を確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_hydration.py -v
```

- [ ] **ステップ 3: `hydration.py` を実装**

```python
"""Hydration Engine: 水分目標の決定論的計算。"""

from fitness_contracts.models.hydration import HydrationInput, HydrationResult

_BASE_ML_PER_KG = 35
_WORKOUT_BONUS_ML_PER_HOUR = 500
_MANUAL_LABOUR_BONUS_ML = 750


def calculate_hydration_target(input_: HydrationInput) -> HydrationResult:
    """体重・運動量・仕事タイプから 1 日の水分目標を計算する。

    - base = 35 ml × weight_kg
    - workout bonus = 500 ml × (週運動時間 / 7) (= 1日平均の運動時間)
    - job bonus = 750 ml (manual_labour / outdoor のみ)

    戻り値: 0.01 L 単位に丸めた目標リットル数と breakdown メッセージ。
    """
    base_ml = _BASE_ML_PER_KG * input_.weight_kg

    weekly_workout_hours = (input_.workouts_per_week * input_.avg_workout_minutes) / 60
    daily_workout_hours = weekly_workout_hours / 7
    workout_bonus_ml = _WORKOUT_BONUS_ML_PER_HOUR * daily_workout_hours

    if input_.job_type in ("manual_labour", "outdoor"):
        job_bonus_ml = _MANUAL_LABOUR_BONUS_ML
        job_label = f"job ({input_.job_type}): +{_MANUAL_LABOUR_BONUS_ML} ml"
    else:
        job_bonus_ml = 0
        job_label = f"job ({input_.job_type}): +0 ml"

    total_ml = base_ml + workout_bonus_ml + job_bonus_ml
    total_liters = round(total_ml / 1000, 2)

    breakdown = [
        f"base: 35 ml × {input_.weight_kg} kg = {base_ml:.0f} ml",
        (
            f"workout: +500 ml/h × {daily_workout_hours:.2f} h/day "
            f"= {workout_bonus_ml:.0f} ml"
        ),
        job_label,
    ]

    practical_tips = [
        "起床直後にコップ 1 杯 (200-300 ml) を飲む",
        "食事ごとに 1 杯を組み合わせる",
        "運動前・運動中・運動後にそれぞれ 200 ml を目安に補給",
    ]
    why_it_matters = [
        "適切な水分は代謝と集中力、空腹感のコントロールを支える",
        "運動時の発汗損失を補わないとパフォーマンスが落ちる",
    ]

    return HydrationResult(
        target_liters=total_liters,
        formula_breakdown=breakdown,
        practical_tips=practical_tips,
        why_it_matters=why_it_matters,
    )
```

- [ ] **ステップ 4: テストパスを確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_hydration.py -v
```

- [ ] **ステップ 5: コミット**

```bash
git add packages/fitness-engine/src/fitness_engine/hydration.py \
        packages/fitness-engine/tests/test_hydration.py
git commit -m "feat(fitness-engine): add calculate_hydration_target"
```

---

## タスク 9: Supplement 推奨 (TDD)

**対象ファイル**:

- 作成: `packages/fitness-engine/src/fitness_engine/supplements.py`
- 作成: `packages/fitness-engine/tests/test_supplements.py`

- [ ] **ステップ 1: 失敗するテストを書く**

`tests/test_supplements.py`:

```python
"""Supplement Recommender のテスト。"""

import pytest

from fitness_contracts.models.supplement import (
    SupplementInput,
    SupplementRecommendationList,
)

from fitness_engine.supplements import recommend_supplements


def _input(**overrides) -> SupplementInput:
    base = dict(
        protein_gap_g=0.0,
        workouts_per_week=3,
        sleep_hours=7.5,
        fish_per_week=2,
        early_morning_training=False,
        low_sunlight_exposure=False,
    )
    base.update(overrides)
    return SupplementInput(**base)


def test_recommend_whey_when_protein_gap_large():
    result = recommend_supplements(_input(protein_gap_g=30.0))
    names = [item.name for item in result.items]
    assert "whey" in names


def test_no_whey_when_protein_gap_small():
    result = recommend_supplements(_input(protein_gap_g=10.0))
    names = [item.name for item in result.items]
    assert "whey" not in names


def test_recommend_creatine_when_training_frequent():
    result = recommend_supplements(_input(workouts_per_week=4))
    names = [item.name for item in result.items]
    assert "creatine" in names


def test_no_creatine_when_training_rare():
    result = recommend_supplements(_input(workouts_per_week=1))
    names = [item.name for item in result.items]
    assert "creatine" not in names


def test_recommend_magnesium_when_sleep_short():
    result = recommend_supplements(_input(sleep_hours=6.0))
    names = [item.name for item in result.items]
    assert "magnesium" in names


def test_recommend_omega3_when_no_fish():
    result = recommend_supplements(_input(fish_per_week=0))
    names = [item.name for item in result.items]
    assert "omega3" in names


def test_recommend_caffeine_when_early_morning():
    result = recommend_supplements(_input(early_morning_training=True))
    names = [item.name for item in result.items]
    assert "caffeine" in names


def test_no_caffeine_when_not_early_morning():
    result = recommend_supplements(_input(early_morning_training=False))
    names = [item.name for item in result.items]
    assert "caffeine" not in names


def test_recommend_vitamin_d_when_low_sunlight():
    result = recommend_supplements(_input(low_sunlight_exposure=True))
    names = [item.name for item in result.items]
    assert "vitamin_d" in names


def test_no_vitamin_d_when_normal_sunlight():
    result = recommend_supplements(_input(low_sunlight_exposure=False))
    names = [item.name for item in result.items]
    assert "vitamin_d" not in names


def test_no_recommendations_when_all_conditions_ideal():
    result = recommend_supplements(
        _input(
            protein_gap_g=0.0,
            workouts_per_week=1,
            sleep_hours=8.0,
            fish_per_week=3,
            early_morning_training=False,
            low_sunlight_exposure=False,
        )
    )
    assert isinstance(result, SupplementRecommendationList)
    assert result.items == []


def test_result_is_pydantic_model():
    result = recommend_supplements(_input())
    assert isinstance(result, SupplementRecommendationList)


# ---- 境界値 ----


@pytest.mark.parametrize(
    ("field", "value", "supplement", "should_include"),
    [
        # protein_gap: > 20 で whey (>, 境界は 20.0)
        ("protein_gap_g", 20.0, "whey", False),
        ("protein_gap_g", 20.01, "whey", True),
        # workouts_per_week: >= 3 で creatine (境界は 3)
        ("workouts_per_week", 2, "creatine", False),
        ("workouts_per_week", 3, "creatine", True),
        # sleep_hours: < 7 で magnesium (境界は 7.0)
        ("sleep_hours", 7.0, "magnesium", False),
        ("sleep_hours", 6.99, "magnesium", True),
        # fish_per_week: < 1 (= 0) で omega3 (境界は 1)
        ("fish_per_week", 1, "omega3", False),
        ("fish_per_week", 0, "omega3", True),
    ],
)
def test_supplement_trigger_boundaries(
    field: str, value: object, supplement: str, should_include: bool
):
    """各サプリのトリガー閾値ちょうどの境界を検証する。"""
    result = recommend_supplements(_input(**{field: value}))
    names = [item.name for item in result.items]
    if should_include:
        assert supplement in names
    else:
        assert supplement not in names
```

- [ ] **ステップ 2: 失敗を確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_supplements.py -v
```

- [ ] **ステップ 3: `supplements.py` を実装**

```python
"""Supplement Recommender: ルールベースのサプリ推奨。"""

from fitness_contracts.models.supplement import (
    SupplementInput,
    SupplementRecommendation,
    SupplementRecommendationList,
)

_PROTEIN_GAP_THRESHOLD = 20.0
_CREATINE_MIN_WORKOUTS = 3
_MAGNESIUM_SLEEP_THRESHOLD = 7.0
_OMEGA3_FISH_THRESHOLD = 1  # fish_per_week < 1 (= 0) でトリガー


def recommend_supplements(input_: SupplementInput) -> SupplementRecommendationList:
    """ルールに従ってサプリを推奨する (architecture.md 11.7 の 6 種)。

    条件:
    - protein_gap_g > 20: whey
    - workouts_per_week >= 3: creatine
    - early_morning_training == True: caffeine
    - low_sunlight_exposure == True: vitamin_d
    - fish_per_week == 0: omega3
    - sleep_hours < 7: magnesium
    """
    items: list[SupplementRecommendation] = []

    if input_.protein_gap_g > _PROTEIN_GAP_THRESHOLD:
        items.append(
            SupplementRecommendation(
                name="whey",
                dose="20-30 g/回",
                timing="運動後または食事でタンパク質が不足する日",
                why_relevant=(
                    f"1 日のタンパク質が目標より約 {input_.protein_gap_g:.0f} g 不足"
                ),
                caution="乳製品アレルギーがある場合は植物性代替品を検討",
            )
        )

    if input_.workouts_per_week >= _CREATINE_MIN_WORKOUTS:
        items.append(
            SupplementRecommendation(
                name="creatine",
                dose="3-5 g/day",
                timing="毎日、タイミングは問わない",
                why_relevant="週 3 回以上のトレーニングで筋力・回復サポートが期待できる",
            )
        )

    if input_.early_morning_training:
        items.append(
            SupplementRecommendation(
                name="caffeine",
                dose="100-200 mg",
                timing="運動 30-45 分前 (就寝 6 時間前以降は避ける)",
                why_relevant="早朝トレや眠気対策でパフォーマンス・覚醒度を上げる",
                caution="不眠傾向がある場合は午後以降の摂取は避ける",
            )
        )

    if input_.low_sunlight_exposure:
        items.append(
            SupplementRecommendation(
                name="vitamin_d",
                dose="1000-2000 IU/day",
                timing="食事と一緒に (脂溶性)",
                why_relevant="日照不足・屋内生活・冬場ではビタミン D 合成が不足しがち",
                caution="腎疾患がある場合は医師に相談",
            )
        )

    if input_.fish_per_week < _OMEGA3_FISH_THRESHOLD:
        items.append(
            SupplementRecommendation(
                name="omega3",
                dose="1-2 g/day (EPA+DHA)",
                timing="食事と一緒に",
                why_relevant="魚摂取が週 0 回のため必須脂肪酸が不足しがち",
            )
        )

    if input_.sleep_hours < _MAGNESIUM_SLEEP_THRESHOLD:
        items.append(
            SupplementRecommendation(
                name="magnesium",
                dose="200-400 mg/day",
                timing="就寝前",
                why_relevant="睡眠時間が短く、睡眠の質改善が期待できる",
            )
        )

    return SupplementRecommendationList(items=items)
```

- [ ] **ステップ 4: テストパスを確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_supplements.py -v
```

- [ ] **ステップ 5: コミット**

```bash
git add packages/fitness-engine/src/fitness_engine/supplements.py \
        packages/fitness-engine/tests/test_supplements.py
git commit -m "feat(fitness-engine): add recommend_supplements"
```

---

## タスク 10: Safety Guard 実装 (TDD)

**対象ファイル**:

- 作成: `packages/fitness-engine/src/fitness_engine/safety.py`
- 作成: `packages/fitness-engine/tests/test_safety.py`

- [ ] **ステップ 1: 失敗するテストを書く**

`tests/test_safety.py`:

```python
"""Safety Guard のテスト (block / caution / safe の分類ルール)。"""

import pytest

from fitness_contracts.models.safety import SafetyInput, SafetyResult

from fitness_engine.safety import evaluate_safety


def _input(**overrides) -> SafetyInput:
    base = dict(
        age=30,
        weight_kg=65.0,
        height_cm=170.0,
        desired_pace="steady",
        sleep_hours=7.5,
        stress_level="moderate",
        alcohol_per_week=2,
        pregnancy_or_breastfeeding=False,
        eating_disorder_history=False,
        medical_conditions=[],
    )
    base.update(overrides)
    return SafetyInput(**base)


# ---- block 条件 ----


@pytest.mark.parametrize(
    "overrides",
    [
        {"age": 17},
        {"age": 15},
        {"pregnancy_or_breastfeeding": True},
        {"eating_disorder_history": True},
        {"medical_conditions": ["diabetes_insulin"]},
        {"medical_conditions": ["severe_kidney"]},
        {"medical_conditions": ["severe_hypertension"]},
        {"medical_conditions": ["heart_condition_acute"]},
    ],
)
def test_block_cases(overrides: dict):
    result = evaluate_safety(_input(**overrides))
    assert isinstance(result, SafetyResult)
    assert result.level == "blocked"
    assert result.allowed_to_generate_plan is False
    assert result.response_mode == "medical_redirect"
    assert len(result.reasons) >= 1


def test_block_bmi_extreme_low():
    """weight 40kg / height 170cm → BMI 13.84 (<17.0) → block。"""
    result = evaluate_safety(_input(weight_kg=40.0, height_cm=170.0))
    assert result.level == "blocked"
    assert result.allowed_to_generate_plan is False


def test_adult_boundary_not_blocked():
    """18 歳ちょうどは block されない (境界値)。"""
    result = evaluate_safety(_input(age=18))
    assert result.level != "blocked"


# ---- caution 条件 ----


def test_caution_sleep_deprived_and_stressed():
    result = evaluate_safety(
        _input(sleep_hours=5.0, stress_level="high")
    )
    assert result.level == "caution"
    assert result.allowed_to_generate_plan is True
    assert result.response_mode == "limited"


def test_caution_high_alcohol():
    result = evaluate_safety(_input(alcohol_per_week=15))
    assert result.level == "caution"


def test_caution_aggressive_pace():
    """architecture.md 15.2「早すぎる減量希望」は caution 扱い。"""
    result = evaluate_safety(_input(desired_pace="aggressive"))
    assert result.level == "caution"
    assert result.allowed_to_generate_plan is True


@pytest.mark.parametrize(
    ("weight_kg", "height_cm", "expected_level"),
    [
        # BMI = 16.99 (weight 49.1 / height 170) → blocked (< 17.0)
        (49.1, 170.0, "blocked"),
        # BMI = 17.0 ちょうど (weight 49.13 / height 170) → caution (境界: >= 17.0)
        # weight 49.13 / (1.7^2) = 49.13 / 2.89 = 17.0
        (49.13, 170.0, "caution"),
        # BMI = 19.99 → caution (< 20.0)
        (57.77, 170.0, "caution"),
        # BMI = 20.0 ちょうど → safe (境界: >= 20.0)
        # weight 57.8 / 2.89 = 20.0
        (57.8, 170.0, "safe"),
    ],
)
def test_safety_bmi_boundaries(
    weight_kg: float, height_cm: float, expected_level: str
):
    """BMI の block/caution/safe 境界を正確に検証する。"""
    result = evaluate_safety(
        _input(weight_kg=weight_kg, height_cm=height_cm)
    )
    assert result.level == expected_level


def test_caution_bmi_17_to_19():
    # weight 50kg / height 170cm → BMI 17.30
    result = evaluate_safety(
        _input(weight_kg=50.0, height_cm=170.0, desired_pace="steady")
    )
    assert result.level == "caution"


# ---- safe 条件 ----


def test_safe_normal_case():
    result = evaluate_safety(_input())
    assert result.level == "safe"
    assert result.allowed_to_generate_plan is True
    assert result.response_mode == "normal"
    assert result.reasons == []


# ---- block が caution より優先されること ----


def test_block_takes_precedence_over_caution():
    result = evaluate_safety(
        _input(
            pregnancy_or_breastfeeding=True,
            sleep_hours=4.0,  # caution 条件も同時に満たす
            stress_level="high",
        )
    )
    assert result.level == "blocked"
```

- [ ] **ステップ 2: 失敗を確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_safety.py -v
```

- [ ] **ステップ 3: `safety.py` を実装**

```python
"""Safety Guard: 決定論的ルールによる安全度分類。

LLM を使わず、Pydantic 入力のフィールドに対するルール評価だけで
safe / caution / blocked を判定する。
"""

from fitness_contracts.models.safety import SafetyInput, SafetyResult

_BLOCKING_MEDICAL_CONDITIONS = frozenset(
    {
        "diabetes_insulin",
        "severe_kidney",
        "severe_hypertension",
        "heart_condition_acute",
    }
)

_BLOCK_BMI_THRESHOLD = 17.0
_CAUTION_BMI_UPPER = 20.0


def _bmi(weight_kg: float, height_cm: float) -> float:
    return weight_kg / ((height_cm / 100) ** 2)


_MIN_ADULT_AGE = 18


def _check_block(input_: SafetyInput) -> list[str]:
    reasons: list[str] = []

    if input_.age < _MIN_ADULT_AGE:
        reasons.append(
            f"18 歳未満 (age={input_.age}) は本サービスの対象外"
        )

    if input_.pregnancy_or_breastfeeding:
        reasons.append("妊娠中または授乳中のため通常の減量プラン生成を停止")

    if input_.eating_disorder_history:
        reasons.append("摂食障害の既往があるため専門家への相談を推奨")

    blocking_conditions = (
        set(input_.medical_conditions) & _BLOCKING_MEDICAL_CONDITIONS
    )
    if blocking_conditions:
        reasons.append(
            "病状管理を要する既往症 "
            f"({', '.join(sorted(blocking_conditions))}) があるため医師相談が先"
        )

    bmi = _bmi(input_.weight_kg, input_.height_cm)
    if bmi < _BLOCK_BMI_THRESHOLD:
        reasons.append(
            f"BMI が極端に低い ({bmi:.1f}) ため減量は推奨できない"
        )

    return reasons


def _check_caution(input_: SafetyInput) -> list[str]:
    reasons: list[str] = []

    if input_.desired_pace == "aggressive":
        reasons.append("aggressive pace は早すぎる減量希望 (architecture.md 15.2)")

    if input_.sleep_hours < 6 and input_.stress_level == "high":
        reasons.append("睡眠不足とストレス高値の組み合わせ")

    if input_.alcohol_per_week >= 10:
        reasons.append("週 10 杯以上の飲酒頻度")

    bmi = _bmi(input_.weight_kg, input_.height_cm)
    if _BLOCK_BMI_THRESHOLD <= bmi < _CAUTION_BMI_UPPER:
        reasons.append(f"BMI が低め ({bmi:.1f})")

    return reasons


def evaluate_safety(input_: SafetyInput) -> SafetyResult:
    """SafetyInput を評価して SafetyResult を返す。

    block が 1 件でもあれば level=blocked。block なしで caution が
    1 件でもあれば level=caution。どちらもなければ safe。
    """
    block_reasons = _check_block(input_)
    if block_reasons:
        return SafetyResult(
            level="blocked",
            reasons=block_reasons,
            allowed_to_generate_plan=False,
            response_mode="medical_redirect",
        )

    caution_reasons = _check_caution(input_)
    if caution_reasons:
        return SafetyResult(
            level="caution",
            reasons=caution_reasons,
            allowed_to_generate_plan=True,
            response_mode="limited",
        )

    return SafetyResult(
        level="safe",
        reasons=[],
        allowed_to_generate_plan=True,
        response_mode="normal",
    )
```

- [ ] **ステップ 4: テストパスを確認**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_safety.py -v
```

- [ ] **ステップ 5: コミット**

```bash
git add packages/fitness-engine/src/fitness_engine/safety.py \
        packages/fitness-engine/tests/test_safety.py
git commit -m "feat(fitness-engine): add evaluate_safety rule engine"
```

---

## タスク 11: エンドツーエンド統合テスト

**対象ファイル**:

- 作成: `packages/fitness-engine/tests/test_e2e_pipeline.py`

- [ ] **ステップ 1: 統合テストを書く**

```python
"""4 つのエンジンを組み合わせた end-to-end パイプラインのスモークテスト。"""

from fitness_contracts.models.calorie_macro_input import CalorieMacroInput
from fitness_contracts.models.hydration import HydrationInput
from fitness_contracts.models.safety import SafetyInput
from fitness_contracts.models.supplement import SupplementInput

from fitness_engine.calorie_macro import calculate_calories_and_macros
from fitness_engine.hydration import calculate_hydration_target
from fitness_engine.safety import evaluate_safety
from fitness_engine.supplements import recommend_supplements


def test_full_pipeline_for_typical_user():
    """典型的なデスクワーク女性ユーザーのフルパイプラインを一貫実行する。"""
    # Safety first
    safety = evaluate_safety(
        SafetyInput(
            age=32,
            weight_kg=62.0,
            height_cm=162.0,
            desired_pace="steady",
            sleep_hours=7.0,
            stress_level="moderate",
            alcohol_per_week=3,
            pregnancy_or_breastfeeding=False,
            eating_disorder_history=False,
            medical_conditions=[],
        )
    )
    assert safety.allowed_to_generate_plan is True

    # Calorie & macros
    macros = calculate_calories_and_macros(
        CalorieMacroInput(
            age=32,
            sex="female",
            height_cm=162.0,
            weight_kg=62.0,
            activity_level="lightly_active",
            sleep_hours=7.0,
            stress_level="moderate",
        )
    )
    assert macros.target_calories > 1200
    assert macros.target_calories < 2500

    # Hydration
    hydration = calculate_hydration_target(
        HydrationInput(
            weight_kg=62.0,
            workouts_per_week=3,
            avg_workout_minutes=45,
            job_type="desk",
        )
    )
    assert hydration.target_liters >= 2.0

    # Supplements
    supps = recommend_supplements(
        SupplementInput(
            protein_gap_g=15.0,
            workouts_per_week=3,
            sleep_hours=7.0,
            fish_per_week=2,
            early_morning_training=False,
            low_sunlight_exposure=False,
        )
    )
    # creatine は推奨される (workouts=3)、whey は推奨されない (gap=15)
    names = [item.name for item in supps.items]
    assert "creatine" in names
    assert "whey" not in names
    assert "caffeine" not in names
    assert "vitamin_d" not in names


def test_full_pipeline_blocked_user():
    """妊娠中ユーザーは safety でブロックされる (後続は呼ばれない想定)。"""
    safety = evaluate_safety(
        SafetyInput(
            age=29,
            weight_kg=60.0,
            height_cm=165.0,
            desired_pace="steady",
            sleep_hours=7.0,
            stress_level="low",
            alcohol_per_week=0,
            pregnancy_or_breastfeeding=True,
        )
    )
    assert safety.level == "blocked"
    assert safety.allowed_to_generate_plan is False
```

- [ ] **ステップ 2: テストを実行**

```bash
.venv/bin/pytest packages/fitness-engine/tests/test_e2e_pipeline.py -v
```

期待結果: 2 件 pass。

- [ ] **ステップ 3: コミット**

```bash
git add packages/fitness-engine/tests/test_e2e_pipeline.py
git commit -m "test(fitness-engine): add end-to-end pipeline smoke test"
```

---

## タスク 12: カバレッジ計測と 80%+ 検証

**対象ファイル**:

- 変更: `pyproject.toml` (ルート) — カバレッジ設定追加

- [ ] **ステップ 1: `pyproject.toml` (ルート) にカバレッジ設定を追加**

```toml
[tool.coverage.run]
source = ["packages/fitness-engine/src/fitness_engine"]
branch = true

[tool.coverage.report]
fail_under = 80
show_missing = true
skip_covered = false
```

- [ ] **ステップ 2: カバレッジ付きで全テスト実行**

```bash
.venv/bin/pytest packages/fitness-engine \
  --cov=fitness_engine \
  --cov-report=term-missing \
  --cov-fail-under=80
```

期待結果: fitness_engine の全モジュールで合計カバレッジ 80% 以上、失敗なし。

- [ ] **ステップ 3: 未カバー行があれば追加テストを書いてカバー**

ループ:

1. `term-missing` 報告を読む
2. 未カバー行に対応する追加テストケースを書く (異常系がほとんどのはず)
3. 再実行

80% を超えたら次のステップへ。

- [ ] **ステップ 4: コミット**

```bash
git add pyproject.toml
# 追加テストがあれば含める
git add packages/fitness-engine/tests
git commit -m "chore(fitness-engine): enforce 80% test coverage"
```

---

## タスク 13: Makefile と CI を更新

**対象ファイル**:

- 変更: `Makefile`
- 変更: `.github/workflows/ci.yml`

- [ ] **ステップ 1: Makefile に `test-py` の coverage 呼出を追加**

現在:

```makefile
test-py:
	.venv/bin/pytest packages/contracts-py -v
```

変更後:

```makefile
test-py:
	.venv/bin/pytest packages/contracts-py packages/fitness-engine -v \
	  --cov=fitness_engine --cov-report=term-missing --cov-fail-under=80
```

- [ ] **ステップ 2: CI ワークフローの pytest ステップを更新**

`.github/workflows/ci.yml` の `python` ジョブで:

```yaml
- name: Run pytest with coverage
  run: |
    uv run pytest packages/contracts-py packages/fitness-engine -v \
      --cov=fitness_engine --cov-report=term-missing --cov-fail-under=80
```

`typescript` ジョブの schema 再生成ステップも同様に両パッケージの pytest を含むように確認。

- [ ] **ステップ 3: コミット**

```bash
git add Makefile .github/workflows/ci.yml
git commit -m "ci: run fitness-engine tests with 80% coverage gate"
```

---

## タスク 14: 最終スモークテスト

- [ ] **ステップ 1: クリーン再生成 + 全テスト**

```bash
# clean は Plan 01 と同じ手順で生成物を削除
rm packages/contracts-ts/generated/types.d.ts
rm packages/contracts-ts/generated/zod.ts
rm packages/contracts-ts/schemas/*.schema.json
touch packages/contracts-ts/generated/.gitkeep

# 再生成
.venv/bin/python -m fitness_contracts.schema_export packages/contracts-ts/schemas
pnpm --filter @fitness/contracts-ts generate

# 全テスト
.venv/bin/pytest packages/contracts-py packages/fitness-engine -v \
  --cov=fitness_engine --cov-report=term-missing --cov-fail-under=80
pnpm --filter @fitness/contracts-ts test
```

期待結果:

- JSON Schema が 9 件生成される
- `types.d.ts` と `zod.ts` が再生成され、9 モデル分の型を含む
- Python テスト: 全件 pass、fitness_engine カバレッジ 80%+
- TypeScript テスト: 全 8 件 pass

- [ ] **ステップ 2: git status が clean であることを確認**

```bash
git status
```

期待結果: `nothing to commit, working tree clean`

- [ ] **ステップ 3: コミット履歴を確認**

```bash
git log --oneline | head -20
```

期待結果: Plan 02 の 13 個前後のコミットが Plan 01 の上に積まれている。

---

## 完了条件

以下がすべて満たされたとき、本計画は完了とする。

- [ ] `fitness-engine` パッケージが editable install されている
- [ ] 4 つの純粋関数がすべて実装され、入出力が Pydantic モデルで型付けされている
  - [ ] `calculate_calories_and_macros(CalorieMacroInput) -> CalorieMacroResult`
  - [ ] `calculate_hydration_target(HydrationInput) -> HydrationResult`
  - [ ] `recommend_supplements(SupplementInput) -> SupplementRecommendationList`
  - [ ] `evaluate_safety(SafetyInput) -> SafetyResult`
- [ ] pytest 全件 pass、`fitness_engine` モジュールのブランチカバレッジが 80% 以上
- [ ] contracts パイプラインの再生成が deterministic (`git status` clean)
- [ ] CI ワークフロー (`.github/workflows/ci.yml`) がカバレッジ閾値を強制する
- [ ] 統合テスト (`test_e2e_pipeline.py`) が典型ユーザーと block ユーザー両方のフローを検証

---

## 本計画のスコープ外 (後続プランで扱う)

- LLM による献立生成 (`generateMealPlan`) — Plan 06 (Strands Agents) 以降
- 食品DB連携 (`suggestSnackSwaps` の候補取得) — Plan 04 (Food Catalog)
- UserProfile の完全な Pydantic 化 — Plan 03 以降 (必要時)
- パーソナルルール生成 (`buildPersonalRules`) / timeline 生成 — LLM 側の責務
- 祝日・妊娠経過日数・薬剤との個別相互作用 — 医療助言の領域、スコープ外
- **Safety Guard の会話由来信号検知** — 嘔吐・下剤・急性症状・自傷・飢餓レベルの意図表明など、**会話本文の意味解析**が必要な分類は Plan 06 (Strands Agents + LLM 分類器) で実装する。本計画の `evaluate_safety` は構造化 UserProfile フィールドに基づく決定論的ルールのみ扱う

---

## BFF / Orchestrator に委ねる責務 (後続プランへの申し送り)

本計画の「MVP 逸脱」注記から暗黙的に発生している責務を明示する。これらは **fitness-engine の責務ではなく、Plan 06 (Strands Agents) / Plan 07 (Next.js BFF) で実装する**。**後続プランを書くときに本セクションを必ず読み返し、責務が fitness-engine に戻ってこないこと**を確認する。

### 責務 1: CalorieMacroInput の `activity_level` 導出

- **背景**: architecture.md 9.4 / 11.3 は `job_type`, `workouts_per_week`, `training_type`, `preferred_rate` を Calorie Engine の入力としているが、Plan 02 はこれを `activity_level: ActivityLevel` 1 フィールドに集約している
- **どこが担当するか**: BFF (Next.js Route Handler) または Strands Orchestrator が UserProfile から CalorieMacroInput への変換時に `activity_level` を導出する
- **導出ルール例** (Plan 06/07 で確定する):
  - `job_type == "desk"` かつ `workouts_per_week <= 1` → `sedentary`
  - `workouts_per_week == 2-3` → `lightly_active`
  - `workouts_per_week == 3-5` → `moderately_active`
  - `workouts_per_week == 6-7` または `job_type in ("manual_labour", "outdoor")` → `very_active`
  - 競技レベル (1日2回) → `extremely_active`

### 責務 2: Safety Guard 前段の会話由来ゲート

- **背景**: fitness-engine の `evaluate_safety` は構造化 UserProfile フィールドしか見ない。会話本文の危険信号は検知できない
- **どこが担当するか**: **Plan 06 の Strands Agents Orchestrator** が、Plan 02 の `evaluate_safety` を呼ぶ**前段**で会話本文を LLM 分類器に通し、以下を検知する:
  - 嘔吐・下剤・過食嘔吐の示唆
  - 急性痛・胸痛・失神・動悸の訴え
  - 自傷・飢餓レベルの意図表明
  - 未宣言の妊娠・既往症の示唆
- **接続方式**: LLM 分類器が `blocked` を返したら Strands Orchestrator は `evaluate_safety` を呼ばず、`SafetyResult(level="blocked", response_mode="medical_redirect", reasons=[会話由来の理由])` を直接返す。`evaluate_safety` の結果と合成する場合は、より重い判定 (block > caution > safe) を優先する
- **絶対にやってはいけないこと**: fitness-engine の `evaluate_safety` シグネチャに会話テキスト (`user_message: str` 等) を追加する。fitness-engine は純粋関数の決定論性を担保する契約なので、LLM 呼出が必要になる責務を持ち込まない

### 責務 3: SupplementInput の補助フィールドの推定

- **背景**: `early_morning_training` / `low_sunlight_exposure` は onboarding の直接入力ではなく、他の情報からの派生が前提
- **どこが担当するか**: BFF または Strands Orchestrator が onboarding 応答 + chat 履歴 + Memory から推定する
- **推定ルール例** (Plan 07 onboarding で確定する):
  - `early_morning_training`: 起床時刻と typical workout time を聞いて 2 時間以内なら True
  - `low_sunlight_exposure`: 居住地緯度 + 季節 + 屋内労働時間から判定、または onboarding で明示的に聞く
- **fallback**: 推定できない場合は両方 `False` にする (保守的、推奨されない = 安全側)

---

## 実装者向け注意

- **sandbox 内では `uv run` を使わない**。`.venv/bin/pytest` / `.venv/bin/python` を直接呼出し。ただしこれは **sandbox 内ローカル実行の制約**であり、CI (Linux) 側の Makefile / ワークフローは従来どおり `uv run` を使ってよい (実際タスク 13 の CI 更新では `uv run pytest` を使用する)
- **TDD ステップを飛ばさない** (テスト先 → 失敗確認 → 実装 → 成功確認 → コミット)
- **`git add .` / `git add -A` 禁止**。各タスクで指定されたファイルを明示 add
- **Pydantic モデルの内容は完全一致で作成** (フィールド名や制約を勝手に変えない)
- **Mifflin-St Jeor 等の式は仕様書厳守**。「より精度の高い式」への勝手な差し替え禁止
- **純粋関数原則**を守る。print / logger / datetime.now() / random は禁止
- **タスク間の依存**: タスク 1 → 2 は `uv sync` をユーザー依頼するため中断が入る。タスク 3 以降は計算順に依存する
- **カバレッジ未達**は本物の品質問題として扱う。閾値を下げて回避しない
