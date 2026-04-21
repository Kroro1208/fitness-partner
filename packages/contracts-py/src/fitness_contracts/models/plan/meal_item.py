"""MealItem."""

from pydantic import BaseModel, ConfigDict, Field


class MealItem(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "MealItem"})

    food_id: str | None = Field(default=None, description="FoodCatalog の food_id。LLM 創作は null。")
    name: str = Field(min_length=1, max_length=120)
    grams: float = Field(gt=0, le=2000)
    calories_kcal: int = Field(ge=0, le=5000)
    protein_g: float = Field(ge=0, le=300)
    fat_g: float = Field(ge=0, le=300)
    carbs_g: float = Field(ge=0, le=600)
