"""Meal."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.meal_item import MealItem

MealSlot = Literal["breakfast", "lunch", "dinner", "dessert"]
PrepTag = Literal["batch", "quick", "treat", "none"]


class Meal(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "Meal"})

    slot: MealSlot
    title: str = Field(min_length=1, max_length=120)
    items: list[MealItem] = Field(min_length=1, max_length=10)
    total_calories_kcal: int = Field(ge=0, le=5000)
    total_protein_g: float = Field(ge=0, le=300)
    total_fat_g: float = Field(ge=0, le=300)
    total_carbs_g: float = Field(ge=0, le=600)
    prep_tag: PrepTag | None = None
    notes: list[str] | None = None
