"""食品マスタの契約モデル。"""

from pydantic import BaseModel, Field

from fitness_contracts.models.food_catalog.nutrient import NutrientValue


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
