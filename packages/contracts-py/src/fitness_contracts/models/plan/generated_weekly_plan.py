"""GeneratedWeeklyPlan: Strands Agent が返す shape。"""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.fitness_engine.supplement import SupplementRecommendation
from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.snack_swap import SnackSwap


class GeneratedWeeklyPlan(BaseModel):
    """agent の責務領域。plan_id / generated_at は adapter が付与。"""

    model_config = ConfigDict(json_schema_extra={"title": "GeneratedWeeklyPlan"})

    target_calories_kcal: int = Field(ge=800, le=5000)
    target_protein_g: float = Field(ge=20, le=400)
    target_fat_g: float = Field(ge=20, le=300)
    target_carbs_g: float = Field(ge=20, le=800)

    days: list[DayPlan] = Field(min_length=7, max_length=7)
    weekly_notes: list[str] = Field(default_factory=list)

    snack_swaps: list[SnackSwap] = Field(default_factory=list)
    hydration_target_liters: float = Field(ge=0, le=10)
    hydration_breakdown: list[str] = Field(default_factory=list)
    supplement_recommendations: list[SupplementRecommendation] = Field(default_factory=list)
    personal_rules: list[str] = Field(min_length=3, max_length=7)
    timeline_notes: list[str] = Field(default_factory=list)
