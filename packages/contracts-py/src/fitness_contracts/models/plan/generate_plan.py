"""GeneratePlanRequest / GeneratePlanResponse."""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.weekly_plan import WeeklyPlan


class GeneratePlanRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "GeneratePlanRequest"})

    week_start: str = Field(description="ISO 月曜。")
    force_regenerate: bool = False


class GeneratePlanResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "GeneratePlanResponse"})

    plan_id: str
    week_start: str
    generated_at: str
    weekly_plan: WeeklyPlan
