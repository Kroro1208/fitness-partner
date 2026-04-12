# Plan 04: Food Catalog ETL

> **エージェント実行者向け**: `superpowers:subagent-driven-development` でタスク単位に実行してください。

**目標**: FCT2020 (日本食品標準成分表2020) の食品データを DynamoDB FitnessTable に投入する ETL パイプラインを構築する。あわせて FoodItem / RecipeTemplate の Pydantic モデルを contracts-py に追加し、TS 側の JSON Schema + Zod を再生成する。

**アーキテクチャ**: ETL は独立パッケージ `packages/food-catalog-etl/` に分離し、fitness-engine の純粋計算境界を維持する。パーサ (openpyxl) と DynamoDB Writer (boto3 `Table.batch_writer()`) の 2 モジュール構成。栄養値は `NutrientValue(value, quality)` で EXACT/TRACE/MISSING を区別して保存する。

**技術スタック**: Python 3.11+ / Pydantic v2 / openpyxl / boto3 / pytest / uv workspace

**仕様書参照**: `docs/superpowers/specs/2026-04-12-food-catalog-etl-design.md`

---

## 前提条件

- Plan 01 (contracts pipeline) と Plan 03 (CDK bootstrap) が完了していること
- `uv sync --all-packages --extra dev` が実行済みであること
- Task 7 の ETL 実行時のみ: AWS 認証済み + DynamoDB テーブルがデプロイ済み

---

## ファイル構成

```
ai-fitness-partner/
├── packages/
│   ├── contracts-py/src/fitness_contracts/models/
│   │   ├── nutrient.py              # NutrientQuality, NutrientValue (新規)
│   │   ├── food_item.py             # FoodItem (新規)
│   │   └── recipe_template.py       # Ingredient, RecipeTemplate (新規)
│   ├── contracts-py/src/fitness_contracts/
│   │   └── schema_export.py         # MODEL_REGISTRY に追加 (変更)
│   ├── contracts-ts/schemas/         # JSON Schema 再生成 (変更)
│   ├── contracts-ts/generated/       # types.d.ts + zod.ts 再生成 (変更)
│   └── food-catalog-etl/            # 新規パッケージ
│       ├── pyproject.toml
│       ├── src/food_catalog_etl/
│       │   ├── __init__.py
│       │   ├── cli.py                   # ETL エントリポイント (python -m food_catalog_etl.cli)
│       │   ├── fct2020_parser.py
│       │   └── dynamodb_writer.py
│       └── tests/
│           ├── test_fct2020_parser.py
│           ├── test_dynamodb_writer.py
│           └── fixtures/
│               └── fct2020_sample.xlsx
├── pyproject.toml                   # workspace members 追加 (変更)
├── .gitignore                       # data/ 追加 (変更)
└── data/                            # ユーザーが FCT2020 Excel を配置 (gitignore)
```

---

## タスク 1: Pydantic モデル定義 (contracts-py)

**対象ファイル**:

- 作成: `packages/contracts-py/src/fitness_contracts/models/nutrient.py`
- 作成: `packages/contracts-py/src/fitness_contracts/models/food_item.py`
- 作成: `packages/contracts-py/src/fitness_contracts/models/recipe_template.py`

**ステップ**:

- [ ] `nutrient.py` を作成:

```python
"""栄養値の品質表現モデル。"""

from enum import Enum

from pydantic import BaseModel


class NutrientQuality(str, Enum):
    """FCT2020 の栄養値の品質区分。"""

    EXACT = "exact"
    TRACE = "trace"
    MISSING = "missing"


class NutrientValue(BaseModel):
    """品質付き栄養値。value は常に float (TRACE/MISSING は 0.0)。"""

    value: float
    quality: NutrientQuality
```

- [ ] `food_item.py` を作成:

```python
"""食品マスタの契約モデル。"""

from pydantic import BaseModel, Field

from fitness_contracts.models.nutrient import NutrientValue


class FoodItem(BaseModel):
    """FCT2020 ベースの食品データ。全栄養値は 100g あたり。"""

    food_id: str = Field(description="FCT2020 食品番号 (例: 01001)")
    name_ja: str = Field(description="日本語名")
    category: str = Field(description="食品群 (例: 01: 穀類)")
    energy_kcal: NutrientValue
    protein_g: NutrientValue
    fat_g: NutrientValue
    carbs_g: NutrientValue
    fiber_g: NutrientValue
    sodium_mg: NutrientValue
    serving_g: float = Field(default=100.0, description="デフォルト 1食分 (g)")
    source_version: str = Field(default="FCT2020", description="データソースバージョン")
    source_row_number: int = Field(description="Excel の行番号")
```

- [ ] `recipe_template.py` を作成:

```python
"""レシピテンプレートの契約モデル。"""

from pydantic import BaseModel, Field


class Ingredient(BaseModel):
    """レシピの構成食材。"""

    food_id: str = Field(description="FoodItem.food_id への参照")
    amount_g: float = Field(gt=0, description="グラム数")


class RecipeTemplate(BaseModel):
    """手動キュレーションされたレシピテンプレート。"""

    recipe_id: str = Field(description="レシピ ID (例: recipe_chicken_salad)")
    name_ja: str = Field(description="日本語名")
    ingredients: list[Ingredient]
    total_energy_kcal: float = Field(ge=0)
    total_protein_g: float = Field(ge=0)
    total_fat_g: float = Field(ge=0)
    total_carbs_g: float = Field(ge=0)
    tags: list[str] = Field(default_factory=list)
```

- [ ] テストを実行して Pydantic モデルが正しく動作することを確認:

```bash
.venv/bin/python -c "
from fitness_contracts.models.nutrient import NutrientQuality, NutrientValue
from fitness_contracts.models.food_item import FoodItem
from fitness_contracts.models.recipe_template import Ingredient, RecipeTemplate
nv = NutrientValue(value=1.5, quality=NutrientQuality.EXACT)
print(f'NutrientValue OK: {nv}')
fi = FoodItem(
    food_id='01001', name_ja='テスト', category='穀類',
    energy_kcal=nv, protein_g=nv, fat_g=nv, carbs_g=nv,
    fiber_g=nv, sodium_mg=nv, source_row_number=2,
)
print(f'FoodItem OK: {fi.food_id}')
print(f'model_dump keys: {list(fi.model_dump().keys())}')
"
```

- [ ] コミット: `feat(contracts-py): add FoodItem, NutrientValue, RecipeTemplate models`

---

## タスク 2: Schema export + contracts-ts 再生成

**対象ファイル**:

- 変更: `packages/contracts-py/src/fitness_contracts/schema_export.py`
- 再生成: `packages/contracts-ts/schemas/*.schema.json`
- 再生成: `packages/contracts-ts/generated/types.d.ts`
- 再生成: `packages/contracts-ts/generated/zod.ts`

**ステップ**:

- [ ] `schema_export.py` の import と MODEL_REGISTRY に追加:

```python
# 既存 import の後に追加
from fitness_contracts.models.food_item import FoodItem
from fitness_contracts.models.nutrient import NutrientQuality, NutrientValue
from fitness_contracts.models.recipe_template import (
    Ingredient,
    RecipeTemplate,
)

# MODEL_REGISTRY に追加 (既存エントリの後)
# NutrientQuality は Enum → 単体登録不要 (NutrientValue の JSON Schema $defs に含まれる)
    ("NutrientValue", NutrientValue),
    ("FoodItem", FoodItem),
    ("Ingredient", Ingredient),
    ("RecipeTemplate", RecipeTemplate),
```

- [ ] JSON Schema を再生成:

```bash
.venv/bin/python -m fitness_contracts.schema_export packages/contracts-ts/schemas
```

- [ ] TS types + Zod を再生成:

```bash
cd packages/contracts-ts && pnpm run generate
```

- [ ] 既存テストが壊れていないことを確認:

```bash
.venv/bin/pytest packages/contracts-py/tests/ -v
cd packages/contracts-ts && pnpm test
```

- [ ] コミット: `feat(contracts): add FoodItem/RecipeTemplate schemas and TS types`

---

## タスク 3: food-catalog-etl パッケージ初期化

**対象ファイル**:

- 作成: `packages/food-catalog-etl/pyproject.toml`
- 作成: `packages/food-catalog-etl/src/food_catalog_etl/__init__.py`
- 変更: `pyproject.toml` (ルート workspace)

**ステップ**:

- [ ] `packages/food-catalog-etl/pyproject.toml` を作成:

```toml
[project]
name = "food-catalog-etl"
version = "0.0.0"
description = "FCT2020 食品データを DynamoDB に投入する ETL パイプライン"
requires-python = ">=3.11"
dependencies = [
  "fitness-contracts",
  "openpyxl>=3.1",
  "boto3>=1.35",
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
packages = ["src/food_catalog_etl"]

[tool.uv.sources]
fitness-contracts = { workspace = true }
```

- [ ] `packages/food-catalog-etl/src/food_catalog_etl/__init__.py` を作成:

```python
"""FCT2020 食品データを DynamoDB に投入する ETL パイプライン。"""
```

- [ ] ルート `pyproject.toml` の workspace members に追加:

```toml
[tool.uv.workspace]
members = ["packages/contracts-py", "packages/fitness-engine", "packages/food-catalog-etl"]
```

- [ ] ルート `pyproject.toml` の testpaths に追加:

```toml
[tool.pytest.ini_options]
testpaths = [
  "packages/contracts-py/tests",
  "packages/fitness-engine/tests",
  "packages/food-catalog-etl/tests",
]
```

- [ ] `.gitignore` に `data/` を追加 (CDK セクションの後):

```
# ETL データ (ユーザーがローカルに配置)
data/
```

- [ ] ユーザーに `uv sync --all-packages --extra dev` の実行を依頼
- [ ] コミット: `feat(food-catalog-etl): initialize ETL package`

---

## タスク 4: FCT2020 パーサ — 純粋変換 (Layer 1 テスト)

**対象ファイル**:

- 作成: `packages/food-catalog-etl/src/food_catalog_etl/fct2020_parser.py`
- 作成: `packages/food-catalog-etl/tests/test_fct2020_parser.py`

**ステップ**:

- [ ] テストを先に書く (`test_fct2020_parser.py`):

```python
"""FCT2020 パーサの純粋変換テスト (Layer 1)。"""

import pytest

from fitness_contracts.models.nutrient import NutrientQuality

from food_catalog_etl.fct2020_parser import parse_nutrient, parse_row


class TestParseNutrient:
    """セル値 → NutrientValue の変換テスト。"""

    @pytest.mark.parametrize(
        ("raw", "expected_value", "expected_quality"),
        [
            (12.5, 12.5, NutrientQuality.EXACT),
            (0, 0.0, NutrientQuality.EXACT),
            ("Tr", 0.0, NutrientQuality.TRACE),
            ("(Tr)", 0.0, NutrientQuality.TRACE),
            ("-", 0.0, NutrientQuality.MISSING),
            ("(0)", 0.0, NutrientQuality.EXACT),
            ("3.2", 3.2, NutrientQuality.EXACT),
        ],
    )
    def test_parse_nutrient(self, raw, expected_value, expected_quality):
        result = parse_nutrient(raw)
        assert result.value == pytest.approx(expected_value)
        assert result.quality == expected_quality

    def test_parse_nutrient_none_returns_missing(self):
        result = parse_nutrient(None)
        assert result.quality == NutrientQuality.MISSING


class TestParseRow:
    """行 dict → FoodItem の変換テスト。"""

    def _make_row(self, **overrides):
        base = {
            "食品番号": "01001",
            "食品名": "アマランサス 玄穀",
            "食品群": "01: 穀類",
            "エネルギー (kcal)": 358,
            "たんぱく質": 12.7,
            "脂質": 6.0,
            "炭水化物": 64.9,
            "食物繊維総量": 7.4,
            "ナトリウム": 1,
        }
        base.update(overrides)
        return base

    def test_normal_row(self):
        result = parse_row(self._make_row(), row_number=2)
        assert result is not None
        assert result.food_id == "01001"
        assert result.name_ja == "アマランサス 玄穀"
        assert result.energy_kcal.value == pytest.approx(358.0)
        assert result.energy_kcal.quality == NutrientQuality.EXACT
        assert result.source_row_number == 2

    def test_trace_values(self):
        result = parse_row(self._make_row(**{"ナトリウム": "Tr"}), row_number=3)
        assert result is not None
        assert result.sodium_mg.quality == NutrientQuality.TRACE

    def test_missing_values(self):
        result = parse_row(self._make_row(**{"食物繊維総量": "-"}), row_number=4)
        assert result is not None
        assert result.fiber_g.quality == NutrientQuality.MISSING

    def test_missing_food_id_returns_none(self):
        result = parse_row(self._make_row(**{"食品番号": None}), row_number=5)
        assert result is None

    def test_missing_food_name_returns_none(self):
        result = parse_row(self._make_row(**{"食品名": None}), row_number=6)
        assert result is None
```

- [ ] テスト実行 → FAIL を確認:

```bash
.venv/bin/pytest packages/food-catalog-etl/tests/test_fct2020_parser.py -v
```

- [ ] `fct2020_parser.py` を実装:

```python
"""FCT2020 Excel のパースと FoodItem への変換。"""

from __future__ import annotations

import logging
from typing import Any

from fitness_contracts.models.food_item import FoodItem
from fitness_contracts.models.nutrient import NutrientQuality, NutrientValue

logger = logging.getLogger(__name__)

# FCT2020 列名 → FoodItem フィールド名
COLUMN_MAP: dict[str, str] = {
    "エネルギー (kcal)": "energy_kcal",
    "たんぱく質": "protein_g",
    "脂質": "fat_g",
    "炭水化物": "carbs_g",
    "食物繊維総量": "fiber_g",
    "ナトリウム": "sodium_mg",
}


def parse_nutrient(raw: Any) -> NutrientValue:
    """セル値を NutrientValue に変換する。"""
    if raw is None:
        return NutrientValue(value=0.0, quality=NutrientQuality.MISSING)

    s = str(raw).strip()

    if s == "-":
        return NutrientValue(value=0.0, quality=NutrientQuality.MISSING)

    if s in ("Tr", "(Tr)"):
        return NutrientValue(value=0.0, quality=NutrientQuality.TRACE)

    # (0) は推定値ゼロ
    cleaned = s.strip("()")

    try:
        return NutrientValue(value=float(cleaned), quality=NutrientQuality.EXACT)
    except ValueError:
        return NutrientValue(value=0.0, quality=NutrientQuality.MISSING)


def parse_row(row: dict[str, Any], *, row_number: int) -> FoodItem | None:
    """行 dict を FoodItem に変換する。必須フィールド欠損時は None を返す。"""
    food_id = row.get("食品番号")
    name_ja = row.get("食品名")

    if not food_id or not name_ja:
        logger.warning("Row %d: missing food_id or name_ja, skipping", row_number)
        return None

    nutrients = {
        field: parse_nutrient(row.get(col))
        for col, field in COLUMN_MAP.items()
    }

    try:
        return FoodItem(
            food_id=str(food_id).strip(),
            name_ja=str(name_ja).strip(),
            category=str(row.get("食品群", "")).strip(),
            **nutrients,
            source_row_number=row_number,
        )
    except Exception:
        logger.warning("Row %d: validation failed, skipping", row_number, exc_info=True)
        return None


def parse_workbook(file_path: str) -> tuple[list[FoodItem], list[int]]:
    """Excel ファイルを読み込み、FoodItem リストとスキップ行番号リストを返す。"""
    from openpyxl import load_workbook

    wb = load_workbook(file_path, read_only=True, data_only=True)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=False))
    if not rows:
        return [], []

    # ヘッダー行を特定
    header_row = rows[0]
    headers = [cell.value for cell in header_row]

    items: list[FoodItem] = []
    skipped: list[int] = []

    # read_only=True では None セルが EmptyCell になり .row がない。
    # enumerate で行番号を管理する。
    for idx, row in enumerate(rows[1:], start=2):
        row_number = idx
        row_dict = dict(zip(headers, [cell.value for cell in row]))
        item = parse_row(row_dict, row_number=row_number)
        if item is not None:
            items.append(item)
        else:
            skipped.append(row_number)

    wb.close()
    return items, skipped
```

- [ ] テスト実行 → PASS を確認:

```bash
.venv/bin/pytest packages/food-catalog-etl/tests/test_fct2020_parser.py -v
```

- [ ] コミット: `feat(food-catalog-etl): add FCT2020 parser with nutrient quality`

---

## タスク 5: フォーマット契約テスト (Layer 2)

**対象ファイル**:

- 作成: `packages/food-catalog-etl/tests/fixtures/fct2020_sample.xlsx`
- 変更: `packages/food-catalog-etl/tests/test_fct2020_parser.py` にテスト追加

**ステップ**:

- [ ] openpyxl で最小 fixture Excel を生成するヘルパースクリプトを作成・実行:

```bash
.venv/bin/python -c "
from openpyxl import Workbook
wb = Workbook()
ws = wb.active
# ヘッダー
ws.append(['食品番号', '食品名', '食品群', 'エネルギー (kcal)', 'たんぱく質', '脂質', '炭水化物', '食物繊維総量', 'ナトリウム'])
# 正常行
ws.append(['01001', 'アマランサス 玄穀', '01: 穀類', 358, 12.7, 6.0, 64.9, 7.4, 1])
# Tr を含む行
ws.append(['01002', 'あわ 精白粒', '01: 穀類', 364, 10.5, 2.7, 73.1, 3.3, 'Tr'])
# - を含む行
ws.append(['01003', 'あわ あわもち', '01: 穀類', 212, 4.4, 0.7, 48.3, '-', 2])
# (0) を含む行
ws.append(['01004', 'テスト食品', '01: 穀類', 100, 5.0, 1.0, 20.0, '(0)', 3])
# 食品番号欠損 (スキップ対象)
ws.append([None, 'スキップ対象', '01: 穀類', 100, 5.0, 1.0, 20.0, 1.0, 1])
wb.save('packages/food-catalog-etl/tests/fixtures/fct2020_sample.xlsx')
print('fixture created')
"
```

- [ ] Layer 2 テストを追加 (`test_fct2020_parser.py` の末尾):

```python
from pathlib import Path

from food_catalog_etl.fct2020_parser import parse_workbook

FIXTURE_PATH = str(
    Path(__file__).parent / "fixtures" / "fct2020_sample.xlsx"
)


class TestParseWorkbook:
    """fixture Excel からの統合テスト (Layer 2)。"""

    def test_parses_expected_columns(self):
        items, skipped = parse_workbook(FIXTURE_PATH)
        assert len(items) == 4  # 正常 4 行 (5行目は食品番号欠損でスキップ)
        assert len(skipped) == 1

    def test_first_item_values(self):
        items, _ = parse_workbook(FIXTURE_PATH)
        first = items[0]
        assert first.food_id == "01001"
        assert first.name_ja == "アマランサス 玄穀"
        assert first.energy_kcal.value == pytest.approx(358.0)

    def test_trace_quality(self):
        items, _ = parse_workbook(FIXTURE_PATH)
        awamochi = next(i for i in items if i.food_id == "01002")
        assert awamochi.sodium_mg.quality == NutrientQuality.TRACE

    def test_missing_quality(self):
        items, _ = parse_workbook(FIXTURE_PATH)
        awamochi = next(i for i in items if i.food_id == "01003")
        assert awamochi.fiber_g.quality == NutrientQuality.MISSING
```

- [ ] テスト実行 → PASS:

```bash
.venv/bin/pytest packages/food-catalog-etl/tests/test_fct2020_parser.py -v
```

- [ ] コミット: `test(food-catalog-etl): add fixture-based format contract test`

---

## タスク 6: DynamoDB Writer (Layer 3 テスト)

**対象ファイル**:

- 作成: `packages/food-catalog-etl/src/food_catalog_etl/dynamodb_writer.py`
- 作成: `packages/food-catalog-etl/tests/test_dynamodb_writer.py`

**ステップ**:

- [ ] テストを先に書く (`test_dynamodb_writer.py`):

```python
"""DynamoDB Writer のテスト (Layer 3, boto3 モック)。"""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from fitness_contracts.models.food_item import FoodItem
from fitness_contracts.models.nutrient import NutrientQuality, NutrientValue

from food_catalog_etl.dynamodb_writer import write_food_items, write_import_manifest


def _nv(v: float = 1.0) -> NutrientValue:
    return NutrientValue(value=v, quality=NutrientQuality.EXACT)


def _food(food_id: str = "01001") -> FoodItem:
    return FoodItem(
        food_id=food_id,
        name_ja="テスト食品",
        category="穀類",
        energy_kcal=_nv(100),
        protein_g=_nv(10),
        fat_g=_nv(5),
        carbs_g=_nv(20),
        fiber_g=_nv(3),
        sodium_mg=_nv(1),
        source_row_number=2,
    )


class TestWriteFoodItems:
    def test_writes_items_with_pk_sk(self):
        mock_table = MagicMock()
        mock_writer = MagicMock()
        mock_table.batch_writer.return_value.__enter__ = MagicMock(return_value=mock_writer)
        mock_table.batch_writer.return_value.__exit__ = MagicMock(return_value=False)

        written, failed = write_food_items(mock_table, [_food("01001"), _food("01002")])

        assert written == 2
        assert failed == 0
        calls = mock_writer.put_item.call_args_list
        assert len(calls) == 2
        assert calls[0].kwargs["Item"]["pk"] == "food#01001"
        assert calls[0].kwargs["Item"]["sk"] == "meta"

    def test_empty_list_writes_nothing(self):
        mock_table = MagicMock()
        mock_writer = MagicMock()
        mock_table.batch_writer.return_value.__enter__ = MagicMock(return_value=mock_writer)
        mock_table.batch_writer.return_value.__exit__ = MagicMock(return_value=False)

        written, failed = write_food_items(mock_table, [])

        assert written == 0
        assert failed == 0
        mock_writer.put_item.assert_not_called()

    def test_flush_exception_returns_all_as_failed(self):
        mock_table = MagicMock()
        mock_writer = MagicMock()
        mock_table.batch_writer.return_value.__enter__ = MagicMock(return_value=mock_writer)
        mock_table.batch_writer.return_value.__exit__ = MagicMock(side_effect=Exception("flush failed"))

        items = [_food("01001"), _food("01002")]
        written, failed = write_food_items(mock_table, items)

        assert written == 0
        assert failed == len(items)


class TestWriteImportManifest:
    def test_writes_manifest_with_etl_pk(self):
        mock_table = MagicMock()

        write_import_manifest(
            table=mock_table,
            source_file="fct2020.xlsx",
            file_hash="abc123",
            total_rows=100,
            success_count=95,
            skip_count=5,
            failed_count=0,
        )

        mock_table.put_item.assert_called_once()
        item = mock_table.put_item.call_args.kwargs["Item"]
        assert item["pk"].startswith("etl#import#")
        assert item["sk"] == "meta"
        assert item["dataset_version"] == "FCT2020"
        assert item["total_rows"] == 100
        assert item["success_count"] == 95
```

- [ ] テスト実行 → FAIL:

```bash
.venv/bin/pytest packages/food-catalog-etl/tests/test_dynamodb_writer.py -v
```

- [ ] `dynamodb_writer.py` を実装:

```python
"""DynamoDB への食品データ書き込みと import manifest 記録。"""

from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from fitness_contracts.models.food_item import FoodItem

logger = logging.getLogger(__name__)


def write_food_items(table, items: list[FoodItem]) -> tuple[int, int]:
    """FoodItem リストを DynamoDB に書き込む。

    Table.batch_writer() を使用し、チャンク分割と UnprocessedItems の
    自動 retry は boto3 に委譲する。flush 例外時は永続化状態が不明の
    ため全件を失敗扱いとする。

    Returns:
        (成功件数, 失敗件数) のタプル。flush 例外時は (0, len(items))。
    """
    if not items:
        return 0, 0

    written = 0
    try:
        with table.batch_writer() as writer:
            for food in items:
                item = {"pk": f"food#{food.food_id}", "sk": "meta", **food.model_dump()}
                writer.put_item(Item=item)
                written += 1
    except Exception:
        # flush 失敗時は全件を失敗扱い (どこまで永続化されたか不明)
        logger.error("batch_writer flush failed: %d items may be lost", len(items), exc_info=True)
        return 0, len(items)

    return written, 0


def write_import_manifest(
    *,
    table,
    source_file: str,
    file_hash: str,
    total_rows: int,
    success_count: int,
    skip_count: int,
    failed_count: int,
) -> None:
    """ETL 実行の監査ログを DynamoDB に記録する。"""
    now = datetime.now(timezone.utc)
    pk = f"etl#import#{now.strftime('%Y%m%dT%H%M%SZ')}"

    table.put_item(Item={
        "pk": pk,
        "sk": "meta",
        "source_file": source_file,
        "executed_at": now.isoformat(),
        "total_rows": total_rows,
        "success_count": success_count,
        "skip_count": skip_count,
        "failed_count": failed_count,
        "dataset_version": "FCT2020",
        "file_hash": file_hash,
    })

    logger.info(
        "Import manifest recorded: %s (total=%d, success=%d, skip=%d, failed=%d)",
        pk, total_rows, success_count, skip_count, failed_count,
    )


def compute_file_hash(file_path: str) -> str:
    """ファイルの SHA-256 ハッシュを返す。"""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()
```

- [ ] テスト実行 → PASS:

```bash
.venv/bin/pytest packages/food-catalog-etl/tests/test_dynamodb_writer.py -v
```

- [ ] コミット: `feat(food-catalog-etl): add DynamoDB writer with import manifest`

---

## タスク 7: ETL CLI エントリポイント

**対象ファイル**:

- 作成: `packages/food-catalog-etl/src/food_catalog_etl/cli.py`
- 作成: `packages/food-catalog-etl/src/food_catalog_etl/__main__.py`

**ステップ**:

- [ ] `cli.py` を作成:

```python
"""FCT2020 Excel → DynamoDB FitnessTable インポート CLI。

Usage:
    python -m food_catalog_etl.cli --file data/fct2020.xlsx --table-name <TableName> --region <Region>
"""

from __future__ import annotations

import argparse
import logging
import time

import boto3

from food_catalog_etl.dynamodb_writer import (
    compute_file_hash,
    write_food_items,
    write_import_manifest,
)
from food_catalog_etl.fct2020_parser import parse_workbook

logger = logging.getLogger(__name__)

BAD_ROW_THRESHOLD = 0.05  # 5%


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="FCT2020 → DynamoDB importer")
    parser.add_argument("--file", required=True, help="FCT2020 Excel ファイルパス")
    parser.add_argument("--table-name", required=True, help="DynamoDB テーブル名")
    parser.add_argument("--region", required=True, help="AWS リージョン")
    args = parser.parse_args()

    logger.info("Parsing %s ...", args.file)
    items, skipped = parse_workbook(args.file)
    total_rows = len(items) + len(skipped)

    logger.info("Parsed: %d items, %d skipped (total %d rows)", len(items), len(skipped), total_rows)

    if total_rows > 0 and len(skipped) / total_rows > BAD_ROW_THRESHOLD:
        logger.error(
            "Bad row ratio %.1f%% exceeds threshold %.0f%%. Aborting.",
            len(skipped) / total_rows * 100,
            BAD_ROW_THRESHOLD * 100,
        )
        return 1

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table_name)

    logger.info("Writing %d items to %s ...", len(items), args.table_name)
    start = time.monotonic()
    written, failed = write_food_items(table, items)
    elapsed = time.monotonic() - start

    logger.info("Wrote %d items in %.1fs (failed: %d)", written, elapsed, failed)

    file_hash = compute_file_hash(args.file)
    write_import_manifest(
        table=table,
        source_file=args.file,
        file_hash=file_hash,
        total_rows=total_rows,
        success_count=written,
        skip_count=len(skipped),
        failed_count=failed,
    )

    if failed > 0:
        logger.error("DynamoDB write failures: %d items lost", failed)
        return 1

    logger.info("Done. %d food items imported.", written)
    return 0
```

- [ ] `__main__.py` を作成 (`python -m food_catalog_etl` で実行可能にする):

```python
"""python -m food_catalog_etl で CLI を起動する。"""

from food_catalog_etl.cli import main

raise SystemExit(main())
```

- [ ] 構文チェック:

```bash
.venv/bin/python -c "import food_catalog_etl.cli; print('import OK')"
```

- [ ] コミット: `feat(food-catalog-etl): add CLI entrypoint (python -m food_catalog_etl)`

---

## タスク 8: 既存ドキュメント修正

**対象ファイル**:

- 変更: `docs/superpowers/specs/2026-04-11-design-decisions.md`

**ステップ**:

- [ ] design-decisions.md Section 3.3 の「CSV」を「Excel」に修正。該当箇所を検索して置換:

```
変更前: FCT2020 CSV ダウンロード
変更後: FCT2020 Excel ダウンロード
```

- [ ] コミット: `docs: update design-decisions to reflect FCT2020 Excel format`

---

## タスク 9: 全テスト実行 + カバレッジ確認

**ステップ**:

- [ ] food-catalog-etl のテストを全実行:

```bash
.venv/bin/pytest packages/food-catalog-etl/tests/ -v --tb=short
```

- [ ] 全パッケージのテストを実行:

```bash
.venv/bin/pytest -v
```

- [ ] contracts-ts のテスト:

```bash
cd packages/contracts-ts && pnpm test
```

- [ ] 全テストが pass したらコミット: `test(food-catalog-etl): verify all tests pass`
- [ ] テスト失敗がある場合は修正してから再実行し、pass を確認してコミット

---

## 完了条件

- [ ] contracts-py に NutrientQuality, NutrientValue, FoodItem, Ingredient, RecipeTemplate が定義されている
- [ ] JSON Schema + TS types + Zod が再生成されている
- [ ] `packages/food-catalog-etl/` が独立パッケージとして存在する
- [ ] パーサのテスト (Layer 1 + Layer 2) が pass する
- [ ] DynamoDB Writer のテスト (Layer 3) が pass する
- [ ] `python -m food_catalog_etl.cli` エントリポイントが存在する (git 追跡対象)
- [ ] design-decisions.md の CSV → Excel 修正が完了している
- [ ] 全パッケージのテストが pass する

---

## スコープ外

- RecipeTemplate のデータ投入 (手動キュレーション) → 後続プラン
- 食品名キーワード検索 / GSI → Phase 2
- コンビニ商品データ → Phase 2
- Agent の food_id 解決ロジック → Plan 05/06
- 実際の DynamoDB への import 実行 → ユーザーが AWS 認証済み環境で手動実行

---

## 実装者向け注意

- **openpyxl の `read_only=True`** を使うこと。メモリ効率が大幅に改善される
- **`data_only=True`**: 数式ではなく計算済みの値を取得する
- **FCT2020 のヘッダー行**: Excel のバージョンによって行位置が変わる可能性がある。ヘッダー特定ロジックをテストで保護する
- **NutrientValue の DynamoDB 格納**: `model_dump()` で dict 化すると `{"value": 1.0, "quality": "exact"}` の Map 型になる。boto3 は Python dict をネイティブに Map 型として書き込む
- **sandbox 制約**: `uv run` は sandbox で動かないため `.venv/bin/pytest` を直接実行する
- **CLI は package 内**: `python -m food_catalog_etl.cli` で実行。git 追跡対象のため再現可能
