"""GeneratedMealSwapCandidates: Strands の structured output 境界 (Plan 09)。

``plan_id`` / ``date`` / ``slot`` / ``revision`` / ``proposal_id`` は含めない
(adapter 側の責務)。厳密に 3 件の ``Meal`` のみを返す。
"""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.meal import Meal


class GeneratedMealSwapCandidates(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"title": "GeneratedMealSwapCandidates"}
    )

    candidates: list[Meal] = Field(min_length=3, max_length=3)
