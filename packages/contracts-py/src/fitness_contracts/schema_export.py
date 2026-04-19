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

from fitness_contracts.models.fitness_engine.calorie_macro import CalorieMacroResult
from fitness_contracts.models.fitness_engine.calorie_macro_input import (
    CalorieMacroInput,
)
from fitness_contracts.models.fitness_engine.hydration import (
    HydrationInput,
    HydrationResult,
)
from fitness_contracts.models.fitness_engine.safety import SafetyInput, SafetyResult
from fitness_contracts.models.fitness_engine.supplement import (
    SupplementInput,
    SupplementRecommendation,
    SupplementRecommendationList,
)
from fitness_contracts.models.food_catalog.food_item import FoodItem
from fitness_contracts.models.food_catalog.nutrient import NutrientValue
from fitness_contracts.models.food_catalog.recipe_template import (
    Ingredient,
    RecipeTemplate,
)
from fitness_contracts.models.logging.log_meal_input import LogMealInput
from fitness_contracts.models.logging.log_weight_input import LogWeightInput
from fitness_contracts.models.onboarding.coach_prompt import (
    CoachPromptRequest,
    CoachPromptResponse,
)
from fitness_contracts.models.onboarding.free_text_parse import (
    FreeTextParseRequest,
    FreeTextParseResponse,
)
from fitness_contracts.models.profile.update_user_profile_input import (
    UpdateUserProfileInput,
)
from fitness_contracts.models.profile.user_profile import UserProfile

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
    # NutrientQuality は Enum → 単体登録不要 (NutrientValue の JSON Schema $defs に含まれる)
    ("NutrientValue", NutrientValue),
    ("FoodItem", FoodItem),
    ("Ingredient", Ingredient),
    ("RecipeTemplate", RecipeTemplate),
    ("UpdateUserProfileInput", UpdateUserProfileInput),
    ("UserProfile", UserProfile),
    ("CoachPromptRequest", CoachPromptRequest),
    ("CoachPromptResponse", CoachPromptResponse),
    ("FreeTextParseRequest", FreeTextParseRequest),
    ("FreeTextParseResponse", FreeTextParseResponse),
    ("LogMealInput", LogMealInput),
    ("LogWeightInput", LogWeightInput),
]


def normalize_schema(schema: dict) -> dict:
    """生成した JSON Schema を公開契約向けに補正する。"""
    fields = schema.get("x-at-least-one-not-null")
    properties = schema.get("properties")
    if isinstance(fields, list) and isinstance(properties, dict):
        for field in fields:
            prop = properties.get(field)
            if isinstance(prop, dict) and prop.get("default") is None:
                prop.pop("default", None)
    return schema


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
        schema = normalize_schema(model_cls.model_json_schema())
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
