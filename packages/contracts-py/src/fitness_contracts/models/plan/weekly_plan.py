"""WeeklyPlan: 永続化 + API 応答用。GeneratedWeeklyPlan + plan_id/時刻/revision。"""

from pydantic import ConfigDict, Field

from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan


class WeeklyPlan(GeneratedWeeklyPlan):
    model_config = ConfigDict(json_schema_extra={"title": "WeeklyPlan"})

    plan_id: str = Field(description="uuid v4。adapter が生成。plan identity として不変。")
    week_start: str = Field(description="ISO 月曜。")
    generated_at: str = Field(description="ISO 8601 timestamp (UTC)。")
    revision: int = Field(
        ge=0,
        description="monotonic counter。新規 plan は 0、swap のたびに +1 される optimistic concurrency token。",
    )
