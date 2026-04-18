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
