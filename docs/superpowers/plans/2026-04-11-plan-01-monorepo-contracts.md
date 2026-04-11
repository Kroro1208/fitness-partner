# Plan 01: モノレポ基盤 + 契約 (Contracts) パイプライン

> **エージェント実行者向け**: 本計画は `superpowers:subagent-driven-development`（推奨）または `superpowers:executing-plans` でタスク単位に実行してください。ステップはチェックボックス (`- [ ]`) 形式で進捗管理します。

**目標**: Pydantic → JSON Schema → TypeScript + Zod の契約生成パイプラインが、代表モデル 1 つで end-to-end に動くモノレポを構築し、CI をグリーンにする。

**アーキテクチャ**: パッケージマネージャを 2 つ並列運用する。TypeScript は `pnpm` workspace、Python は `uv` workspace。Pydantic v2 モデル (`CalorieMacroResult`) を Python スクリプトで JSON Schema に書き出し、TypeScript 側の 2 本の生成スクリプト (`json-schema-to-typescript` で型、`json-schema-to-zod` で runtime validator) が消費する。round-trip テストで、生成された Zod スキーマにサンプルペイロードを通し、生成された TypeScript 型との互換性を検証する。

**技術スタック**: Python 3.11 + uv + Pydantic v2 + pytest / Node 24 LTS + pnpm 10 + TypeScript 5.6 + vitest + json-schema-to-typescript + json-schema-to-zod / GitHub Actions / Makefile。

**仕様書参照**: `docs/superpowers/specs/2026-04-11-design-decisions.md` Section 2.1 (生成パイプライン)

---

## 実行環境メモ (sandbox 前提)

本計画はローカル開発環境の sandbox 内で実行される前提。sandbox は以下の書き込み制約を持つ。

- リポジトリルート (`.`) は書き込み可能
- `$HOME/.cache/uv/` や `$HOME/.local/share/pnpm/store/` は **書き込み不可**
- `$TMPDIR` は書き込み可能

そのため uv と pnpm のキャッシュ先をリポジトリ内 `.cache/` に退避する。具体的には:

- `UV_CACHE_DIR=.cache/uv`
- `PNPM_STORE_DIR=.cache/pnpm-store`

これらは Makefile で export 済みのため `make install` 等の経由では意識不要。**ただしコマンドラインで直接 `uv sync` / `pnpm install` を叩く場合は、本計画の各ステップのコマンドプレフィックスを尊重すること**。

---

## 事前確認 (実装前に必ず読む)

npm / PyPI パッケージをインストールする前に、**upstream の最新 README で API を確認**してください (`pnpm view <pkg>` でバージョン確認 → README を読む)。下記コードブロックは以下のバージョンを前提にしています。

- `pydantic` >= 2.8, < 3
- `json-schema-to-typescript` >= 15
- `json-schema-to-zod` >= 2.5
- `zod` >= 3.23

計画書作成時点から API が変わっている場合は、**該当タスク内で最小限に修正**してください。周辺コードのリファクタはしないこと。

**言語方針**:

- タスク名・説明・コメント本文: 日本語
- コード (識別子・関数名・フィールド名): 英語のまま
- コミットメッセージ: Conventional Commits 形式 (英語の type + 英語の短い description)
- ファイルパス・コマンド: 英語のまま

---

## 本計画で作成されるファイル構成

```
ai-fitness-partner/
├── .github/workflows/ci.yml
├── .gitignore
├── Makefile
├── README.md
├── package.json                     # pnpm workspace root
├── pnpm-workspace.yaml
├── pyproject.toml                   # uv workspace root
├── packages/
│   ├── contracts-py/
│   │   ├── pyproject.toml
│   │   ├── src/fitness_contracts/
│   │   │   ├── __init__.py
│   │   │   ├── models/
│   │   │   │   ├── __init__.py
│   │   │   │   └── calorie_macro.py
│   │   │   └── schema_export.py
│   │   └── tests/
│   │       ├── __init__.py
│   │       ├── test_calorie_macro.py
│   │       └── test_schema_export.py
│   └── contracts-ts/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── scripts/
│       │   ├── generate-types.mjs
│       │   └── generate-zod.mjs
│       ├── schemas/                 # 入力: Python 側から出される JSON Schema
│       ├── generated/               # 出力: TS 型 + Zod スキーマ
│       │   └── .gitkeep
│       ├── src/
│       │   └── index.ts
│       └── tests/
│           └── roundtrip.test.ts
└── docs/                            # 既存、触らない
```

`packages/contracts-ts/schemas/` と `packages/contracts-ts/generated/` 配下の生成ファイルは **git にコミット**する (PR レビューで差分が見えるように)。Phase 2 以降でファイルが増えた場合は git 管理から外すことを検討する。

---

## タスク 1: git 初期化 + .gitignore

**対象ファイル**:

- 作成: `.gitignore`

- [ ] **ステップ 1: git リポジトリを初期化**

リポジトリルートで実行:

```bash
cd /Users/naoya/Desktop/ai-fitness-partner
git init
git config user.name "$(git config --global user.name)"
git config user.email "$(git config --global user.email)"
```

期待結果: `Initialized empty Git repository in /Users/naoya/Desktop/ai-fitness-partner/.git/`

- [ ] **ステップ 2: `.gitignore` を作成**

内容:

```gitignore
# Node / pnpm
node_modules/
.pnpm-store/
*.tsbuildinfo
.next/
dist/

# Python / uv
__pycache__/
*.py[cod]
*$py.class
.venv/
venv/
.mypy_cache/
.pytest_cache/
.ruff_cache/
*.egg-info/

# 退避キャッシュ (sandbox 制約対応: UV_CACHE_DIR / PNPM_STORE_DIR の出力先)
.cache/

# OS
.DS_Store
Thumbs.db

# エディタ
.vscode/
.idea/
*.swp

# 環境変数
.env
.env.local
.env.*.local

# ログ
*.log
npm-debug.log*
pnpm-debug.log*

# カバレッジ
coverage/
.coverage
htmlcov/
```

- [ ] **ステップ 3: コミット**

```bash
git add .gitignore
git commit -m "chore: initialize repo with gitignore"
```

期待結果: `1 file changed, ... insertions(+)` が含まれる出力。

---

## タスク 2: pnpm workspace ルート作成

**対象ファイル**:

- 作成: `package.json`
- 作成: `pnpm-workspace.yaml`

- [ ] **ステップ 1: pnpm が利用可能か確認**

実行:

```bash
pnpm --version
```

期待結果: `9.x.x` 以上。未インストールの場合は `npm install -g pnpm@latest` を先に実行。

- [ ] **ステップ 2: ルート `package.json` を作成**

内容:

```json
{
  "name": "ai-fitness-partner",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@10.21.0",
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "contracts:generate": "pnpm --filter @fitness/contracts-ts generate",
    "contracts:test": "pnpm --filter @fitness/contracts-ts test",
    "test": "pnpm -r test"
  }
}
```

- [ ] **ステップ 3: `pnpm-workspace.yaml` を作成**

内容:

```yaml
packages:
  - "packages/*"
```

- [ ] **ステップ 4: コミット**

```bash
git add package.json pnpm-workspace.yaml
git commit -m "chore: add pnpm workspace root"
```

---

## タスク 3: uv workspace ルート作成

**対象ファイル**:

- 作成: `pyproject.toml`

- [ ] **ステップ 1: uv が利用可能か確認**

実行:

```bash
uv --version
```

期待結果: `uv 0.5.x` 以上。未インストールの場合は https://docs.astral.sh/uv/getting-started/installation/ に従ってインストール。

- [ ] **ステップ 2: ルート `pyproject.toml` を作成**

内容:

```toml
[project]
name = "ai-fitness-partner-workspace"
version = "0.0.0"
description = "ai-fitness-partner Python パッケージの workspace ルート"
requires-python = ">=3.11"

[tool.uv.workspace]
members = ["packages/contracts-py"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP", "N"]
ignore = ["E501"]

[tool.pytest.ini_options]
testpaths = ["packages/contracts-py/tests"]
python_files = ["test_*.py"]
```

- [ ] **ステップ 3: コミット**

```bash
git add pyproject.toml
git commit -m "chore: add uv workspace root"
```

---

## タスク 4: contracts-py パッケージ骨格作成

**対象ファイル**:

- 作成: `packages/contracts-py/pyproject.toml`
- 作成: `packages/contracts-py/src/fitness_contracts/__init__.py`
- 作成: `packages/contracts-py/src/fitness_contracts/models/__init__.py`
- 作成: `packages/contracts-py/tests/__init__.py`

- [ ] **ステップ 1: `packages/contracts-py/pyproject.toml` を作成**

内容:

```toml
[project]
name = "fitness-contracts"
version = "0.0.0"
description = "ai-fitness-partner で共有する Pydantic v2 契約モデル"
requires-python = ">=3.11"
dependencies = [
  "pydantic>=2.8,<3",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
  "ruff>=0.6",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/fitness_contracts"]
```

- [ ] **ステップ 2: 空の **init**.py 群を作成**

```bash
mkdir -p packages/contracts-py/src/fitness_contracts/models
mkdir -p packages/contracts-py/tests
```

`packages/contracts-py/src/fitness_contracts/__init__.py`:

```python
"""ai-fitness-partner で共有する Pydantic v2 契約モデル。"""

__version__ = "0.0.0"
```

`packages/contracts-py/src/fitness_contracts/models/__init__.py`:

```python
"""Pydantic モデル定義。"""
```

`packages/contracts-py/tests/__init__.py` は空ファイル:

```python

```

- [ ] **ステップ 3: workspace をインストール (contracts-py を editable で解決)**

```bash
UV_CACHE_DIR=.cache/uv uv sync --all-packages --extra dev
```

期待結果: リポジトリルートに `.venv/` が作成され、pydantic / pytest / ruff がインストールされる。最後に `Installed N packages` 相当の出力。`.cache/uv/` にダウンロードキャッシュが作られる。

補足: `UV_CACHE_DIR=.cache/uv` は sandbox 制約対応。`~/.cache/uv/` が書き込めないため、リポジトリ内にキャッシュを作る。タスク 11 で Makefile に export する。

- [ ] **ステップ 4: pytest が空のテストツリーで動くことを確認**

```bash
UV_CACHE_DIR=.cache/uv uv run pytest packages/contracts-py
```

期待結果: `no tests ran in ...s` (exit code 5 は想定内。タスク 5 で解消)。

- [ ] **ステップ 5: コミット**

```bash
git add packages/contracts-py pyproject.toml
# uv sync が uv.lock を作るので、再現性のためコミットする
git add uv.lock
# .cache/ は .gitignore 済みなので追跡されない (念のため status で確認する)
git commit -m "feat(contracts-py): add package skeleton with pydantic v2"
```

---

## タスク 5: CalorieMacroResult モデル追加 (TDD)

**対象ファイル**:

- 作成: `packages/contracts-py/src/fitness_contracts/models/calorie_macro.py`
- 作成: `packages/contracts-py/tests/test_calorie_macro.py`

- [ ] **ステップ 1: 失敗するテストを書く**

`packages/contracts-py/tests/test_calorie_macro.py` を作成:

```python
"""CalorieMacroResult モデルのテスト。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.calorie_macro import CalorieMacroResult


def test_valid_calorie_macro_result():
    """妥当な値で正しくインスタンス化できること。"""
    result = CalorieMacroResult(
        bmr=1500,
        activity_multiplier=1.55,
        tdee=2325,
        target_calories=1825,
        protein_g=140,
        fat_g=60,
        carbs_g=180,
        explanation=["BMR via Mifflin-St Jeor", "TDEE = BMR * 1.55"],
    )
    assert result.bmr == 1500
    assert result.activity_multiplier == 1.55
    assert result.tdee == 2325
    assert result.target_calories == 1825
    assert len(result.explanation) == 2


def test_negative_bmr_rejected():
    """BMR が負の値なら拒否されること。"""
    with pytest.raises(ValidationError) as exc_info:
        CalorieMacroResult(
            bmr=-100,
            activity_multiplier=1.2,
            tdee=2000,
            target_calories=1500,
            protein_g=100,
            fat_g=50,
            carbs_g=200,
        )
    assert "bmr" in str(exc_info.value).lower()


def test_activity_multiplier_out_of_range_rejected():
    """activity_multiplier が範囲外 (>2.0) なら拒否されること。"""
    with pytest.raises(ValidationError):
        CalorieMacroResult(
            bmr=1500,
            activity_multiplier=3.0,
            tdee=2000,
            target_calories=1500,
            protein_g=100,
            fat_g=50,
            carbs_g=200,
        )


def test_explanation_defaults_to_empty_list():
    """explanation は未指定時は空リストになること。"""
    result = CalorieMacroResult(
        bmr=1500,
        activity_multiplier=1.2,
        tdee=1800,
        target_calories=1500,
        protein_g=100,
        fat_g=50,
        carbs_g=180,
    )
    assert result.explanation == []


def test_model_json_schema_is_emitted():
    """model_json_schema() が必須フィールドを含む JSON Schema を返すこと。"""
    schema = CalorieMacroResult.model_json_schema()
    assert schema["type"] == "object"
    assert "bmr" in schema["properties"]
    assert "activity_multiplier" in schema["properties"]
    assert "explanation" in schema["properties"]
    assert set(schema["required"]) >= {
        "bmr",
        "activity_multiplier",
        "tdee",
        "target_calories",
        "protein_g",
        "fat_g",
        "carbs_g",
    }
```

- [ ] **ステップ 2: テストを実行して失敗することを確認**

```bash
UV_CACHE_DIR=.cache/uv uv run pytest packages/contracts-py/tests/test_calorie_macro.py -v
```

期待結果: `ModuleNotFoundError: No module named 'fitness_contracts.models.calorie_macro'` などのインポートエラーで失敗。

- [ ] **ステップ 3: `calorie_macro.py` を実装**

`packages/contracts-py/src/fitness_contracts/models/calorie_macro.py` を作成:

```python
"""カロリー/マクロ計算結果の契約モデル。

Plan 02 で実装する deterministic な Calorie Macro Engine の出力型。
Python (Strands / Lambda) と TypeScript (Next.js) の両方が参照する
唯一の真実 (source of truth) モデル。
"""

from pydantic import BaseModel, ConfigDict, Field


class CalorieMacroResult(BaseModel):
    """BMR / TDEE / 目標カロリー / マクロ計算の結果。"""

    model_config = ConfigDict(
        json_schema_extra={
            "title": "CalorieMacroResult",
            "description": (
                "Calorie Macro Engine の deterministic 出力。"
                "整数値は kcal またはグラム単位 (注記がない限り)。"
            ),
        }
    )

    bmr: int = Field(
        ge=0,
        description="Mifflin-St Jeor 式で計算した Basal Metabolic Rate (kcal)。",
    )
    activity_multiplier: float = Field(
        ge=1.0,
        le=2.0,
        description="TDEE 計算に使う PAL 活動係数。",
    )
    tdee: int = Field(
        ge=0,
        description="Total Daily Energy Expenditure (kcal) = BMR * activity_multiplier。",
    )
    target_calories: int = Field(
        ge=0,
        description="deficit ルール適用後の 1 日目標カロリー。",
    )
    protein_g: int = Field(ge=0, description="1 日のタンパク質目標 (g)。")
    fat_g: int = Field(ge=0, description="1 日の脂質目標 (g)。")
    carbs_g: int = Field(ge=0, description="1 日の炭水化物目標 (g)。")
    explanation: list[str] = Field(
        default_factory=list,
        description="人間が読める計算根拠を step-by-step で列挙したもの。",
    )
```

- [ ] **ステップ 4: テストを実行して成功することを確認**

```bash
UV_CACHE_DIR=.cache/uv uv run pytest packages/contracts-py/tests/test_calorie_macro.py -v
```

期待結果: 5 件のテストがすべてパス。

- [ ] **ステップ 5: コミット**

```bash
git add packages/contracts-py/src/fitness_contracts/models/calorie_macro.py \
        packages/contracts-py/tests/test_calorie_macro.py
git commit -m "feat(contracts-py): add CalorieMacroResult pydantic model"
```

---

## タスク 6: JSON Schema export スクリプト追加 (TDD)

**対象ファイル**:

- 作成: `packages/contracts-py/src/fitness_contracts/schema_export.py`
- 作成: `packages/contracts-py/tests/test_schema_export.py`

- [ ] **ステップ 1: 失敗するテストを書く**

`packages/contracts-py/tests/test_schema_export.py` を作成:

```python
"""schema_export モジュールのテスト。"""

import json
from pathlib import Path

import pytest

from fitness_contracts.schema_export import (
    MODEL_REGISTRY,
    export_all_schemas,
)


def test_registry_contains_calorie_macro_result():
    """レジストリに CalorieMacroResult が登録されていること。"""
    names = [name for name, _ in MODEL_REGISTRY]
    assert "CalorieMacroResult" in names


def test_export_all_schemas_writes_files(tmp_path: Path):
    """export_all_schemas が JSON ファイルを出力すること。"""
    written = export_all_schemas(tmp_path)
    assert len(written) == len(MODEL_REGISTRY)

    target = tmp_path / "CalorieMacroResult.schema.json"
    assert target.exists()

    schema = json.loads(target.read_text())
    assert schema["type"] == "object"
    assert "bmr" in schema["properties"]


def test_export_all_schemas_creates_directory(tmp_path: Path):
    """存在しないネストディレクトリも作成されること。"""
    nested = tmp_path / "deeply" / "nested"
    export_all_schemas(nested)
    assert nested.is_dir()
    assert (nested / "CalorieMacroResult.schema.json").exists()


def test_export_all_schemas_overwrites_existing(tmp_path: Path):
    """既存ファイルは上書きされること。"""
    target = tmp_path / "CalorieMacroResult.schema.json"
    target.write_text("{}")
    export_all_schemas(tmp_path)
    reloaded = json.loads(target.read_text())
    assert reloaded != {}
```

- [ ] **ステップ 2: テストを実行して失敗することを確認**

```bash
UV_CACHE_DIR=.cache/uv uv run pytest packages/contracts-py/tests/test_schema_export.py -v
```

期待結果: `ModuleNotFoundError: No module named 'fitness_contracts.schema_export'`。

- [ ] **ステップ 3: `schema_export.py` を実装**

`packages/contracts-py/src/fitness_contracts/schema_export.py` を作成:

```python
"""登録済みの Pydantic モデルを JSON Schema ファイルに書き出す。

このモジュールを実行すると、MODEL_REGISTRY に登録された各モデルに対して
`<ModelName>.schema.json` を出力ディレクトリに書き込む。出力先は
`packages/contracts-ts/schemas/` を想定しており、TypeScript 側の生成
スクリプトが入力として消費する。

使い方:
    python -m fitness_contracts.schema_export <output_dir>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from pydantic import BaseModel

from fitness_contracts.models.calorie_macro import CalorieMacroResult

MODEL_REGISTRY: list[tuple[str, type[BaseModel]]] = [
    ("CalorieMacroResult", CalorieMacroResult),
]


def export_all_schemas(output_dir: Path) -> list[Path]:
    """登録モデルすべての JSON Schema を書き出す。

    Args:
        output_dir: 出力ディレクトリ。存在しなければ作成する。

    Returns:
        書き込んだファイルのパス一覧。
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for name, model_cls in MODEL_REGISTRY:
        schema = model_cls.model_json_schema()
        target = output_dir / f"{name}.schema.json"
        target.write_text(json.dumps(schema, indent=2, ensure_ascii=False) + "\n")
        written.append(target)
    return written


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: python -m fitness_contracts.schema_export <output_dir>", file=sys.stderr)
        return 2
    output_dir = Path(argv[1])
    written = export_all_schemas(output_dir)
    for p in written:
        print(f"wrote {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
```

- [ ] **ステップ 4: テストを実行して成功することを確認**

```bash
UV_CACHE_DIR=.cache/uv uv run pytest packages/contracts-py/tests/test_schema_export.py -v
```

期待結果: 4 件のテストがすべてパス。

- [ ] **ステップ 5: 実際に export を実行して出力ファイルを生成**

```bash
UV_CACHE_DIR=.cache/uv uv run python -m fitness_contracts.schema_export packages/contracts-ts/schemas
```

期待結果: `wrote packages/contracts-ts/schemas/CalorieMacroResult.schema.json`。

(`packages/contracts-ts/schemas` ディレクトリはこの時点でまだ存在しないが、`mkdir(parents=True, exist_ok=True)` により自動作成される。)

- [ ] **ステップ 6: コミット**

```bash
git add packages/contracts-py/src/fitness_contracts/schema_export.py \
        packages/contracts-py/tests/test_schema_export.py \
        packages/contracts-ts/schemas/CalorieMacroResult.schema.json
git commit -m "feat(contracts-py): add schema_export CLI that writes JSON Schema files"
```

---

## タスク 7: contracts-ts パッケージ骨格作成

**対象ファイル**:

- 作成: `packages/contracts-ts/package.json`
- 作成: `packages/contracts-ts/tsconfig.json`
- 作成: `packages/contracts-ts/vitest.config.ts`
- 作成: `packages/contracts-ts/src/index.ts`
- 作成: `packages/contracts-ts/generated/.gitkeep`

- [ ] **ステップ 1: `packages/contracts-ts/package.json` を作成**

内容:

```json
{
  "name": "@fitness/contracts-ts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "generate:types": "node scripts/generate-types.mjs",
    "generate:zod": "node scripts/generate-zod.mjs",
    "generate": "pnpm run generate:types && pnpm run generate:zod",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "json-schema-to-typescript": "^15.0.4",
    "json-schema-to-zod": "^2.5.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **ステップ 2: `packages/contracts-ts/tsconfig.json` を作成**

内容:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "tests", "generated"]
}
```

- [ ] **ステップ 3: `packages/contracts-ts/vitest.config.ts` を作成**

内容:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **ステップ 4: `packages/contracts-ts/src/index.ts` を作成**

内容:

```ts
/**
 * パッケージエントリポイント。生成済みの型と Zod スキーマを再エクスポートする。
 *
 * 生成ファイルは `pnpm run generate` で作られる
 * (`generate-types.mjs` → `generate-zod.mjs` の順)。
 */
export * from "../generated/zod.ts";
export type * from "../generated/types";
```

補足: `types.d.ts` は拡張子なしで TypeScript の module resolution に任せる。`zod.ts` は `tsconfig.json` で `allowImportingTsExtensions: true` を有効にしているので `.ts` 拡張子を明示する。

- [ ] **ステップ 5: `generated/` 用の `.gitkeep` を作成**

```bash
touch packages/contracts-ts/generated/.gitkeep
```

(`packages/contracts-ts/schemas/` はタスク 6 で `CalorieMacroResult.schema.json` が既に作られているので `.gitkeep` は不要。)

- [ ] **ステップ 6: 依存パッケージをインストール**

```bash
PNPM_STORE_DIR=.cache/pnpm-store pnpm install
```

期待結果: `pnpm-lock.yaml` が書き出され、上記 devDependencies がインストールされる。最後に `Done in ...` と出る。`.cache/pnpm-store/` にパッケージが展開される。

補足: `PNPM_STORE_DIR` は sandbox 制約対応。pnpm のデフォルト store (`~/.local/share/pnpm/store/`) が書き込めないため、リポジトリ内に退避する。タスク 11 で Makefile に export する。

- [ ] **ステップ 7: コミット**

```bash
git add packages/contracts-ts/package.json \
        packages/contracts-ts/tsconfig.json \
        packages/contracts-ts/vitest.config.ts \
        packages/contracts-ts/src/index.ts \
        packages/contracts-ts/generated/.gitkeep \
        pnpm-lock.yaml
git commit -m "feat(contracts-ts): add package skeleton with deps"
```

---

## タスク 8: TypeScript 型生成スクリプト実装 (TDD)

**対象ファイル**:

- 作成: `packages/contracts-ts/scripts/generate-types.mjs`
- 作成: `packages/contracts-ts/tests/generate-types.test.ts`

- [ ] **ステップ 1: 失敗するテストを書く**

`packages/contracts-ts/tests/generate-types.test.ts` を作成:

```ts
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedTypes = join(pkgRoot, "generated", "types.d.ts");

describe("generate-types 出力", () => {
  it("generated/types.d.ts を出力すること", () => {
    expect(existsSync(generatedTypes)).toBe(true);
  });

  it("CalorieMacroResult インターフェースを宣言すること", () => {
    const contents = readFileSync(generatedTypes, "utf8");
    expect(contents).toMatch(/CalorieMacroResult/);
    expect(contents).toMatch(/bmr\s*:\s*number/);
    expect(contents).toMatch(/activity_multiplier\s*:\s*number/);
    expect(contents).toMatch(/explanation\s*:\s*string\[\]/);
  });
});
```

- [ ] **ステップ 2: テストを実行して失敗することを確認**

```bash
pnpm --filter @fitness/contracts-ts test
```

期待結果: `generated/types.d.ts` が存在せずテストが失敗。

- [ ] **ステップ 3: `scripts/generate-types.mjs` を実装**

`packages/contracts-ts/scripts/generate-types.mjs` を作成:

```js
// @ts-check
/**
 * JSON Schema ファイルから TypeScript 型宣言を生成する。
 *
 * 入力:  packages/contracts-ts/schemas/*.schema.json
 * 出力:  packages/contracts-ts/generated/types.d.ts
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const schemasDir = join(pkgRoot, "schemas");
const outFile = join(pkgRoot, "generated", "types.d.ts");

async function main() {
  const schemaFiles = readdirSync(schemasDir)
    .filter((f) => f.endsWith(".schema.json"))
    .sort();

  if (schemaFiles.length === 0) {
    throw new Error(`no *.schema.json files found in ${schemasDir}`);
  }

  const parts = [
    "/**",
    " * AUTO-GENERATED by scripts/generate-types.mjs — DO NOT EDIT.",
    " * Source: packages/contracts-ts/schemas/*.schema.json",
    " */",
    "",
  ];

  for (const file of schemaFiles) {
    const schemaPath = join(schemasDir, file);
    const schemaText = readFileSync(schemaPath, "utf8");
    const schema = JSON.parse(schemaText);
    const modelName = file.replace(/\.schema\.json$/, "");

    const ts = await compile(schema, modelName, {
      bannerComment: "",
      additionalProperties: false,
      style: { singleQuote: false },
    });

    parts.push(ts);
  }

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, parts.join("\n"));
  console.log(`wrote ${resolve(outFile)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **ステップ 4: 生成スクリプトを実行**

```bash
pnpm --filter @fitness/contracts-ts generate:types
```

期待結果: `wrote /Users/naoya/Desktop/ai-fitness-partner/packages/contracts-ts/generated/types.d.ts`。

- [ ] **ステップ 5: テストを実行して成功することを確認**

```bash
pnpm --filter @fitness/contracts-ts test
```

期待結果: `generate-types.test.ts` の 2 件がパス。

- [ ] **ステップ 6: コミット**

```bash
git add packages/contracts-ts/scripts/generate-types.mjs \
        packages/contracts-ts/tests/generate-types.test.ts \
        packages/contracts-ts/generated/types.d.ts
git commit -m "feat(contracts-ts): add generate-types.mjs (JSON Schema -> TS)"
```

---

## タスク 9: Zod スキーマ生成スクリプト実装 (TDD)

**対象ファイル**:

- 作成: `packages/contracts-ts/scripts/generate-zod.mjs`
- 作成: `packages/contracts-ts/tests/generate-zod.test.ts`

- [ ] **ステップ 1: 失敗するテストを書く**

`packages/contracts-ts/tests/generate-zod.test.ts` を作成:

```ts
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedZod = join(pkgRoot, "generated", "zod.ts");

describe("generate-zod 出力", () => {
  it("generated/zod.ts を出力すること", () => {
    expect(existsSync(generatedZod)).toBe(true);
  });

  it("CalorieMacroResultSchema を Zod スキーマとして export すること", () => {
    const contents = readFileSync(generatedZod, "utf8");
    expect(contents).toMatch(/export const CalorieMacroResultSchema/);
    expect(contents).toMatch(/z\.object/);
  });
});
```

- [ ] **ステップ 2: テストを実行して失敗することを確認**

```bash
pnpm --filter @fitness/contracts-ts test
```

期待結果: `generate-zod.test.ts` が失敗 (タスク 8 の 2 件はパス)。

- [ ] **ステップ 3: `scripts/generate-zod.mjs` を実装**

`packages/contracts-ts/scripts/generate-zod.mjs` を作成:

```js
// @ts-check
/**
 * JSON Schema ファイルから Zod スキーマを生成する。
 *
 * 入力:  packages/contracts-ts/schemas/*.schema.json
 * 出力:  packages/contracts-ts/generated/zod.ts
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonSchemaToZod } from "json-schema-to-zod";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const schemasDir = join(pkgRoot, "schemas");
const outFile = join(pkgRoot, "generated", "zod.ts");

function main() {
  const schemaFiles = readdirSync(schemasDir)
    .filter((f) => f.endsWith(".schema.json"))
    .sort();

  if (schemaFiles.length === 0) {
    throw new Error(`no *.schema.json files found in ${schemasDir}`);
  }

  const parts = [
    "/**",
    " * AUTO-GENERATED by scripts/generate-zod.mjs — DO NOT EDIT.",
    " * Source: packages/contracts-ts/schemas/*.schema.json",
    " */",
    'import { z } from "zod";',
    "",
  ];

  for (const file of schemaFiles) {
    const schemaPath = join(schemasDir, file);
    const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
    const modelName = file.replace(/\.schema\.json$/, "");
    const exportName = `${modelName}Schema`;

    const zodCode = jsonSchemaToZod(schema, {
      name: exportName,
      module: "none",
    });

    // `jsonSchemaToZod` を `module: "none"` で呼ぶと、返ってくる文字列は
    // `const CalorieMacroResultSchema = z.object({ ... })` の形になる。
    // export するために先頭に `export ` を付与する。
    parts.push(`export ${zodCode}`);
    parts.push("");
  }

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, parts.join("\n"));
  console.log(`wrote ${resolve(outFile)}`);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
```

- [ ] **ステップ 4: 生成スクリプトを実行**

```bash
pnpm --filter @fitness/contracts-ts generate:zod
```

期待結果: `wrote /Users/naoya/Desktop/ai-fitness-partner/packages/contracts-ts/generated/zod.ts`。

- [ ] **ステップ 5: テストを実行して成功することを確認**

```bash
pnpm --filter @fitness/contracts-ts test
```

期待結果: 合計 4 件のテストがすべてパス (タスク 8 の 2 件 + 新規 2 件)。

- [ ] **ステップ 6: コミット**

```bash
git add packages/contracts-ts/scripts/generate-zod.mjs \
        packages/contracts-ts/tests/generate-zod.test.ts \
        packages/contracts-ts/generated/zod.ts
git commit -m "feat(contracts-ts): add generate-zod.mjs (JSON Schema -> Zod)"
```

---

## タスク 10: end-to-end round-trip テスト

**対象ファイル**:

- 作成: `packages/contracts-ts/tests/roundtrip.test.ts`

- [ ] **ステップ 1: round-trip テストを書く**

`packages/contracts-ts/tests/roundtrip.test.ts` を作成:

```ts
import { describe, expect, it } from "vitest";
import { CalorieMacroResultSchema } from "../generated/zod.ts";
import type { CalorieMacroResult } from "../generated/types";

describe("Pydantic → JSON Schema → TS + Zod の round trip", () => {
  it("Python モデルから生成された妥当なペイロードを受け入れる", () => {
    const payload = {
      bmr: 1500,
      activity_multiplier: 1.55,
      tdee: 2325,
      target_calories: 1825,
      protein_g: 140,
      fat_g: 60,
      carbs_g: 180,
      explanation: ["BMR via Mifflin-St Jeor", "TDEE = BMR * 1.55"],
    };

    const parsed = CalorieMacroResultSchema.parse(payload);

    // 型アサーション: parse 結果が生成された TS 型に代入可能であること。
    const typed: CalorieMacroResult = parsed as CalorieMacroResult;
    expect(typed.bmr).toBe(1500);
    expect(typed.explanation).toHaveLength(2);
  });

  it("必須フィールドが欠けているペイロードを拒否する", () => {
    const bad = {
      bmr: 1500,
      activity_multiplier: 1.55,
      // tdee が欠けている
      target_calories: 1825,
      protein_g: 140,
      fat_g: 60,
      carbs_g: 180,
    };
    expect(() => CalorieMacroResultSchema.parse(bad)).toThrow();
  });

  it("activity_multiplier が範囲外のペイロードを拒否する", () => {
    const bad = {
      bmr: 1500,
      activity_multiplier: 3.0,
      tdee: 2325,
      target_calories: 1825,
      protein_g: 140,
      fat_g: 60,
      carbs_g: 180,
    };
    expect(() => CalorieMacroResultSchema.parse(bad)).toThrow();
  });

  it("bmr が負のペイロードを拒否する", () => {
    const bad = {
      bmr: -100,
      activity_multiplier: 1.2,
      tdee: 2000,
      target_calories: 1500,
      protein_g: 100,
      fat_g: 50,
      carbs_g: 200,
    };
    expect(() => CalorieMacroResultSchema.parse(bad)).toThrow();
  });
});
```

- [ ] **ステップ 2: テストを実行**

```bash
pnpm --filter @fitness/contracts-ts test
```

期待結果: 合計 8 件のテストがすべてパス (generate-types 2 件 + generate-zod 2 件 + roundtrip 4 件)。

3 つの「reject 系」テストが失敗した場合、`json-schema-to-zod` が Pydantic の `ge`/`le` 制約または `required` リストを引き継げていないことを意味する。`packages/contracts-ts/generated/zod.ts` を開いて `.int().nonnegative()` / `.min(1.0).max(2.0)` / `.min(0)` / 必須キーが含まれているか確認する。欠けている場合は `scripts/generate-zod.mjs` の options を調整する (例: `module` の値を変える、`parserOverride` を渡す等、`json-schema-to-zod` の README を参照)。**テストを緩めてはいけない。ジェネレータ側を直す。**

- [ ] **ステップ 3: コミット**

```bash
git add packages/contracts-ts/tests/roundtrip.test.ts
git commit -m "test(contracts-ts): add end-to-end roundtrip test"
```

---

## タスク 11: Makefile 追加

**対象ファイル**:

- 作成: `Makefile`

- [ ] **ステップ 1: Makefile を作成**

内容:

```makefile
# sandbox 制約対応: キャッシュ先をリポジトリ内に寄せる
# (デフォルトの ~/.cache/uv と ~/.local/share/pnpm/store は書き込み不可)
export UV_CACHE_DIR := .cache/uv
export PNPM_STORE_DIR := .cache/pnpm-store

.PHONY: help install contracts contracts-py contracts-ts test test-py test-ts clean

help:
	@echo "利用可能ターゲット:"
	@echo "  install       - Python と Node の依存関係をインストール"
	@echo "  contracts     - JSON Schema + TS 型 + Zod スキーマを再生成"
	@echo "  contracts-py  - Pydantic から JSON Schema を書き出す"
	@echo "  contracts-ts  - JSON Schema から TS 型 + Zod スキーマを再生成"
	@echo "  test          - すべてのテストを実行"
	@echo "  test-py       - Python テストを実行"
	@echo "  test-ts       - TypeScript テストを実行"
	@echo "  clean         - 生成物を削除"

install:
	uv sync --all-packages --extra dev
	pnpm install

contracts-py:
	uv run python -m fitness_contracts.schema_export packages/contracts-ts/schemas

contracts-ts:
	pnpm --filter @fitness/contracts-ts generate

contracts: contracts-py contracts-ts

test-py:
	uv run pytest packages/contracts-py -v

test-ts:
	pnpm --filter @fitness/contracts-ts test

test: test-py test-ts

clean:
	rm -rf packages/contracts-ts/generated/*.ts packages/contracts-ts/generated/*.d.ts
	rm -rf packages/contracts-ts/schemas/*.schema.json
	touch packages/contracts-ts/generated/.gitkeep
```

- [ ] **ステップ 2: `contracts` ターゲットがクリーンな状態から再生成できることを確認**

```bash
make clean
make contracts
```

期待結果 (末尾):

- `wrote packages/contracts-ts/schemas/CalorieMacroResult.schema.json`
- `wrote .../packages/contracts-ts/generated/types.d.ts`
- `wrote .../packages/contracts-ts/generated/zod.ts`

- [ ] **ステップ 3: 再生成後にすべてのテストがパスすることを確認**

```bash
make test
```

期待結果: Python テスト全件パス、TypeScript テスト全件パス。

- [ ] **ステップ 4: コミット**

```bash
git add Makefile
git commit -m "chore: add Makefile orchestration"
```

---

## タスク 12: GitHub Actions CI 追加

**対象ファイル**:

- 作成: `.github/workflows/ci.yml`

- [ ] **ステップ 1: workflow ファイルを作成**

```bash
mkdir -p .github/workflows
```

`.github/workflows/ci.yml` を作成:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  python:
    name: Python (contracts-py)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "0.5.x"

      - name: Set up Python
        run: uv python install 3.11

      - name: Install dependencies
        run: uv sync --all-packages --extra dev

      - name: Run pytest
        run: uv run pytest packages/contracts-py -v

  typescript:
    name: TypeScript (contracts-ts)
    runs-on: ubuntu-latest
    needs: python
    steps:
      - uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v3
        with:
          version: "0.5.x"

      - name: Set up Python (schema export 用)
        run: uv python install 3.11

      - name: Install Python deps
        run: uv sync --all-packages --extra dev

      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          version: "10.21.0"

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: "pnpm"

      - name: Install Node deps
        run: pnpm install --frozen-lockfile

      - name: Regenerate contracts (schemas + types + zod)
        run: |
          uv run python -m fitness_contracts.schema_export packages/contracts-ts/schemas
          pnpm --filter @fitness/contracts-ts generate

      - name: 生成ファイルがコミット済みコピーと一致するか検証
        run: |
          if ! git diff --exit-code -- packages/contracts-ts/schemas packages/contracts-ts/generated; then
            echo "ERROR: generated contracts are out of sync. Run 'make contracts' locally and commit." >&2
            exit 1
          fi

      - name: Run vitest
        run: pnpm --filter @fitness/contracts-ts test
```

- [ ] **ステップ 2: コミット**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions pipeline for python + typescript"
```

---

## タスク 13: README 追加

**対象ファイル**:

- 作成: `README.md`

- [ ] **ステップ 1: README を作成**

内容:

````markdown
# ai-fitness-partner

パーソナルフィットネストレーナーエージェント。アーキテクチャは `docs/superpowers/specs/2026-04-11-design-decisions.md` を参照。

## 前提ツール

- Node 22 LTS 以上
- pnpm 10 以上
- Python 3.11
- uv 0.5 以上
- GNU Make

## クイックスタート

```bash
make install       # Python と Node の依存関係をインストール
make contracts     # 契約生成パイプラインを実行 (Pydantic → JSON Schema → TS + Zod)
make test          # すべてのテストを実行
```

## ディレクトリ構成

- `packages/contracts-py/` — Pydantic v2 の source-of-truth モデル。JSON Schema を書き出す。
- `packages/contracts-ts/` — 生成された TypeScript 型と Zod スキーマ。Next.js フロントエンドから消費される。
- `docs/` — アーキテクチャ、UI 仕様、設計決定事項。

## 契約 (contracts) のワークフロー

契約の再生成は `make contracts` で行う。`packages/contracts-ts/schemas` または `packages/contracts-ts/generated` 配下のコミット済みファイルが Pydantic の source と食い違っていると、CI は失敗する。

新しい契約モデルを追加する手順:

1. `packages/contracts-py/src/fitness_contracts/models/` 配下に新しい Pydantic モデルを作る
2. `src/fitness_contracts/schema_export.py` 内の `MODEL_REGISTRY` に登録する
3. `make contracts` を実行して TS 型 + Zod スキーマを再生成する
4. 再生成されたファイルをコミットする
````

- [ ] **ステップ 2: コミット**

```bash
git add README.md
git commit -m "docs: add README with quickstart"
```

---

## タスク 14: 最終スモークテスト + クリーンな状態の検証

- [ ] **ステップ 1: ゼロからクリーン + 再生成**

```bash
make clean
make contracts
make test
```

期待結果:

- Schema + TS + Zod ファイルが再生成される
- Python テスト全件パス
- TypeScript テスト全件パス (計 8 件)

- [ ] **ステップ 2: git status がクリーンであることを確認**

```bash
git status
```

期待結果: `nothing to commit, working tree clean` — 再生成後のファイルがコミット済みコピーと完全に一致している。

- [ ] **ステップ 3: コミット履歴を確認**

```bash
git log --oneline
```

期待結果: タスク 1 〜 13 の順に ~13 個のコミットが並ぶ。

---

## 完了条件

以下がすべて満たされたとき、本計画は完了とする。

- [ ] `make install` がクリーンな状態で成功する
- [ ] `make contracts` が決定論的に再生成される (繰り返し実行して差分が出ない)
- [ ] `make test` が exit 0 で、Python + TypeScript すべてのテストがパス
- [ ] `make contracts` 実行後に `git status` がクリーン
- [ ] `.github/workflows/ci.yml` が存在し、同期チェックが有効
- [ ] `packages/contracts-ts/generated/zod.ts` に `CalorieMacroResultSchema` が含まれ、Pydantic の制約 (必須フィールド、数値境界) がすべて反映されている
- [ ] round-trip テスト (`tests/roundtrip.test.ts`) が Zod エラーを抑制せずにパスする

---

## Plan 01 のスコープ外 (後続プランで扱う)

意図的に後続プランに繰り延べるもの:

- 追加の Pydantic モデル (UserProfile, WeeklyPlan, MealLog など) — Plan 02 以降で必要になった時点で追加
- Ruff / ESLint / Prettier 設定 — Plan 02、または最初にスタイルドリフトが起きた時点
- Deterministic な計算関数 — **Plan 02**
- AWS インフラ — **Plan 03**
- Next.js フロントエンド — **Plan 07**

---

## 実装者向け注意

- **ステップは順番通りに実行する**。TDD ステップ (失敗するテストを書く → 実行して失敗を見る → 実装する → 実行して成功を見る) を飛ばすとセーフティネットが無くなる
- **依存のインストールが失敗した場合**、upstream レジストリで最新バージョンを確認する (`pnpm view <pkg>` / `uv pip show <pkg>`)。本計画書のバージョン pin は作成時点のもので、その後変わっている可能性がある
- **失敗するテストを緩めない**。Zod 生成で制約が失われた場合は、ジェネレータスクリプトまたはその options を直す
- **タスクごとにコミットする**。頻繁なコミットで `git log` が実装ジャーナル代わりになる
- **各タスクは自己完結している**。タスク間で休憩しても文脈を失わないように設計されている
