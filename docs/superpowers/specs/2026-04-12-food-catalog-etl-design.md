# Food Catalog ETL 設計書

> **ステータス**: 承認済み
> **関連**: design-decisions.md Section 3.3 (Food/Nutrition DB のソース)

---

## 目的

文科省「日本食品標準成分表2020（八訂）」(FCT2020) の食品データを DynamoDB FitnessTable に投入し、Agent が食品の栄養情報を参照できるようにする。あわせて RecipeTemplate のデータモデルを定義する（データ投入は後続プラン）。

---

## データモデル

### NutrientValue (栄養値の品質表現)

FCT2020 の栄養値は欠損・微量・ゼロを区別する必要がある。全栄養フィールドに以下の構造を適用する。

```python
class NutrientQuality(str, Enum):
    EXACT = "exact"      # 分析値・計算値
    TRACE = "trace"      # Tr (微量: 含まれるが定量限界未満)
    MISSING = "missing"  # - (未測定・該当なし)

class NutrientValue(BaseModel):
    value: float          # EXACT → 分析値, TRACE → 0.0, MISSING → 0.0
    quality: NutrientQuality
```

Agent が計算に使うときは `value` をそのまま使い、`quality` はログ・監査・UI 表示で活用する。

### FoodItem

contracts-py に追加する Pydantic モデル。

```python
class FoodItem(BaseModel):
    food_id: str              # FCT2020 の食品番号 (例: "01001")
    name_ja: str              # 日本語名 (例: "アマランサス 玄穀")
    category: str             # 食品群 (例: "01: 穀類")
    energy_kcal: NutrientValue
    protein_g: NutrientValue
    fat_g: NutrientValue
    carbs_g: NutrientValue
    fiber_g: NutrientValue
    sodium_mg: NutrientValue
    serving_g: float = 100.0  # デフォルト 1食分 (g)
    source_version: str = "FCT2020"  # データソースバージョン
    source_row_number: int    # Excel の行番号 (bad row 追跡・再取込用)
```

全値は 100g あたりで統一。

### FCT2020 列マッピング

FCT2020 Excel は列の解釈に注意が必要。以下を採用する。

| FoodItem フィールド | FCT2020 列名      | 選択理由                                           |
| ------------------- | ----------------- | -------------------------------------------------- |
| `energy_kcal`       | エネルギー (kcal) | Atwater 係数ベース                                 |
| `protein_g`         | たんぱく質        | アミノ酸組成ではなく総たんぱく質                   |
| `fat_g`             | 脂質              | 総脂質                                             |
| `carbs_g`           | 炭水化物          | 差引き法による炭水化物（利用可能炭水化物ではない） |
| `fiber_g`           | 食物繊維総量      | 水溶性+不溶性の合計                                |
| `sodium_mg`         | ナトリウム        | 食塩相当量ではなくナトリウム (mg)                  |

### RecipeTemplate (モデル定義のみ、データ投入はスコープ外)

```python
class Ingredient(BaseModel):
    food_id: str    # FoodItem への参照
    amount_g: float # グラム数

class RecipeTemplate(BaseModel):
    recipe_id: str              # 例: "recipe_chicken_salad"
    name_ja: str                # "鶏むね肉のサラダ"
    ingredients: list[Ingredient]
    total_energy_kcal: float
    total_protein_g: float
    total_fat_g: float
    total_carbs_g: float
    tags: list[str]             # ["高タンパク", "低脂質", "サラダ"]
```

RecipeTemplate のモデル定義は Plan 04 で contracts-py に追加し、schema export + contracts-ts 再生成まで行う。データ投入は後続プラン。

---

## DynamoDB 格納パターン

Plan 03 で作成済みの FitnessTable (single-table) に格納。

### FoodItem

| pk           | sk     | 属性                                                                          |
| ------------ | ------ | ----------------------------------------------------------------------------- |
| `food#01001` | `meta` | FoodItem の全フィールド + pk/sk。NutrientValue は DynamoDB Map 型でネスト保存 |

#### 保存形の擬似コード

```python
# Write: FoodItem → DynamoDB item
item = {"pk": f"food#{food.food_id}", "sk": "meta", **food.model_dump()}
table.put_item(Item=item)

# Read: DynamoDB item → FoodItem
raw = table.get_item(Key={"pk": ..., "sk": "meta"})["Item"]
raw.pop("pk"); raw.pop("sk")
food = FoodItem.model_validate(raw)
```

### RecipeTemplate

| pk                     | sk     | 属性                                                            |
| ---------------------- | ------ | --------------------------------------------------------------- |
| `recipe#chicken_salad` | `meta` | RecipeTemplate の全フィールド。`ingredients` は List 型でネスト |

### アクセスパターン

| 操作               | パターン                           | GSI  |
| ------------------ | ---------------------------------- | ---- |
| Agent が食品取得   | `GetItem(pk=food#<id>, sk=meta)`   | 不要 |
| Agent がレシピ取得 | `GetItem(pk=recipe#<id>, sk=meta)` | 不要 |

MVP では GSI なし。全アクセスは pk/sk 完全一致。

---

## ETL パイプライン

### パッケージ構成

fitness-engine は純粋計算ライブラリとして維持し、ETL は独立パッケージに分離する。

```
packages/food-catalog-etl/       # 新規パッケージ
├── pyproject.toml               # openpyxl, boto3 を依存に
├── src/food_catalog_etl/
│   ├── __init__.py
│   ├── fct2020_parser.py        # Excel パース + FoodItem 変換
│   └── dynamodb_writer.py       # batch_write + retry
└── tests/
    ├── test_fct2020_parser.py
    ├── test_dynamodb_writer.py
    └── fixtures/
        └── fct2020_sample.xlsx  # 最小 fixture (5-10 行)
```

### データソース

文科省公式 Excel ファイル（FCT2020 の公式配布形式）。ユーザーが手動でダウンロードし `data/fct2020.xlsx` に配置。`data/` は `.gitignore` に追加。

### パイプライン構成

```
data/fct2020.xlsx (ユーザーが配置)
    ↓
food_catalog_etl.fct2020_parser  ← Excel パース + Pydantic バリデーション
    ↓
list[FoodItem]  (バリデーション済み)
    ↓
food_catalog_etl.dynamodb_writer  ← Table.batch_writer() で書き込み
    ↓
DynamoDB FitnessTable (food#<id> / meta)
    ↓
food_catalog_etl.dynamodb_writer  ← import_manifest を記録
    ↓
DynamoDB FitnessTable (etl#import#<timestamp> / meta)
```

### パーサの責務

1. openpyxl で Excel を読む
2. ヘッダー行から列マッピングを特定（上記 FCT2020 列マッピングに従う）
3. 各行を FoodItem に変換:
   - 数値 → `NutrientValue(value=x, quality=EXACT)`
   - `Tr` → `NutrientValue(value=0.0, quality=TRACE)`
   - `-` → `NutrientValue(value=0.0, quality=MISSING)`
   - `(0)` → `NutrientValue(value=0.0, quality=EXACT)` (推定値ゼロ)
4. バリデーションエラーの行はスキップしログに記録（全体を止めない）

### DynamoDB Writer の責務

1. `list[FoodItem]` を受け取り `Table.batch_writer()` (boto3 高レベル API) で書き込み。batch_writer は 25 件チャンク分割と UnprocessedItems の自動 retry を内包する
2. **flush 後の未処理確認**: batch_writer の context manager 終了後にエラーがないことを確認
3. 冪等性: 同じ food_id で再実行しても上書き (PutItem)
4. 最終結果: 書き込み成功件数・失敗件数・所要時間をログ出力
5. **未書込 > 0 の場合は exit code 1** で終了
6. **import_manifest の記録**: ETL 完了時に以下を `pk=etl#import#<timestamp>, sk=meta` に保存
   - source_file: ファイル名
   - executed_at: 実行日時 (ISO 8601)
   - total_rows / success_count / skip_count / failed_count
   - dataset_version: "FCT2020"
   - file_hash: SHA-256 (再取込時の差分検出用)

### ETL 成功条件

- bad row (パースエラー) が全体の **5% 以下**: 正常終了 (exit 0)、スキップ行をログ出力
- bad row が **5% 超**: エラー終了 (exit 1)。データ品質に問題がある可能性
- DynamoDB 未書込 > 0: エラー終了 (exit 1)

### エントリポイント

```bash
python scripts/import_fct2020.py --file data/fct2020.xlsx --table-name <TableName> --region <Region>
```

`--table-name` は Plan 03 の CfnOutput `TableName`、`--region` はスタックのリージョン。

---

## テスト戦略

### 3 層テスト構成

#### Layer 1: 純粋変換テスト (単体)

- 入力: 行データ (dict) → 出力: FoodItem
- `pytest.mark.parametrize` で境界値を網羅
- 正常行 → FoodItem (quality=EXACT)
- `Tr` → quality=TRACE, value=0.0
- `-` → quality=MISSING, value=0.0
- 必須フィールド欠損 → None 返却 (スキップ対象)
- 数値が文字列 → float 変換

#### Layer 2: フォーマット契約テスト (統合)

- `tests/fixtures/fct2020_sample.xlsx` (実データから 5-10 行抽出した最小 fixture)
- ヘッダー行から期待列が読めること
- fixture → `list[FoodItem]` に変換できること
- **FCT2020 のフォーマット変更を検出する最前線**

#### Layer 3: Writer テスト (単体、boto3 モック)

- boto3 は外部境界のためモック許容 (testing-guidelines Step 1 OK)
- 25 件以下 → 1 回の batch_write
- 26 件以上 → 複数回に分割
- 空リスト → 書き込みなし
- UnprocessedItems 返却 → retry が呼ばれること

### カバレッジ目標: 80%+

---

## 変更が必要な既存ファイル

- `pyproject.toml` (ルート): workspace members に `packages/food-catalog-etl` を追加
- `packages/contracts-py/`: FoodItem, NutrientValue, RecipeTemplate, Ingredient モデルを追加
- `packages/contracts-py/`: schema_export.py の MODEL_REGISTRY に追加
- `packages/contracts-ts/`: schema 再生成 (FoodItem, RecipeTemplate の JSON Schema + TS types + Zod)
- `.gitignore`: `data/` を追加
- `docs/superpowers/specs/2026-04-11-design-decisions.md`: Section 3.3 の「CSV」を「Excel」に修正

---

## スコープ外

- RecipeTemplate のデータ投入 (手動キュレーション) → 後続プラン
- 食品名キーワード検索 / GSI → Phase 2
- コンビニ商品データ → Phase 2
- Agent の food_id 解決ロジック → Plan 05/06
