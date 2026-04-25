"""DayPlan."""

from pydantic import BaseModel, ConfigDict, Field, model_validator

from fitness_contracts.models.plan.meal import Meal


class DayPlan(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "DayPlan"})

    date: str = Field(description="ISO YYYY-MM-DD。")
    theme: str = Field(min_length=1, max_length=80)
    meals: list[Meal] = Field(min_length=3, max_length=4)
    daily_total_calories_kcal: int = Field(ge=0, le=10000)
    daily_total_protein_g: float = Field(ge=0, le=600)
    daily_total_fat_g: float = Field(ge=0, le=600)
    daily_total_carbs_g: float = Field(ge=0, le=1200)

    @model_validator(mode="after")
    def _enforce_unique_slots(self) -> "DayPlan":
        slots = [m.slot for m in self.meals]
        if len(slots) != len(set(slots)):
            raise ValueError(
                f"DayPlan.meals must have unique slots, got {slots}"
            )
        return self
