"""SafePromptProfile / SafeAgentInput: AgentCore 境界型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.fitness_engine.calorie_macro_input import CalorieMacroInput
from fitness_contracts.models.fitness_engine.hydration import HydrationInput
from fitness_contracts.models.fitness_engine.supplement import SupplementInput


class SafePromptProfile(BaseModel):
    """LLM prompt 露出対象。medical_*_note は含めない。"""

    model_config = ConfigDict(json_schema_extra={"title": "SafePromptProfile"})

    name: str | None = None
    age: int = Field(ge=18, le=120)
    sex: Literal["male", "female"]
    height_cm: float = Field(gt=0, lt=300)
    weight_kg: float = Field(gt=0, lt=500)
    goal_weight_kg: float | None = Field(default=None, gt=0, lt=500)
    goal_description: str | None = None
    desired_pace: Literal["steady", "aggressive"] | None = None

    favorite_meals: list[str] = Field(default_factory=list)
    hated_foods: list[str] = Field(default_factory=list)
    restrictions: list[str] = Field(default_factory=list)
    cooking_preference: str | None = None
    food_adventurousness: int | None = Field(default=None, ge=1, le=10)

    current_snacks: list[str] = Field(default_factory=list)
    snacking_reason: str | None = None
    snack_taste_preference: str | None = None
    late_night_snacking: bool | None = None

    eating_out_style: str | None = None
    budget_level: str | None = None
    meal_frequency_preference: int | None = Field(default=None, ge=1, le=8)
    location_region: str | None = None
    kitchen_access: str | None = None
    convenience_store_usage: str | None = None

    avoid_alcohol: bool = False
    avoid_supplements_without_consultation: bool = False


class SafeAgentInput(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "SafeAgentInput"})

    calorie_macro_input: CalorieMacroInput
    hydration_input: HydrationInput
    supplement_input: SupplementInput
