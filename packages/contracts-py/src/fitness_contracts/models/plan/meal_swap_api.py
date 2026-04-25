"""Meal swap API の Request / Response 契約 (Plan 09)。

``apply`` は client から meal 内容を受けない。``proposal_id`` + ``chosen_index``
だけを受け、server が proposal 経由で ``Meal`` を取り出す。これにより任意
meal 書き込みを構造的に排除する。
"""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.meal import Meal, MealSlot


class MealSwapCandidatesRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"title": "MealSwapCandidatesRequest"}
    )
    date: str = Field(description="ISO YYYY-MM-DD。plan.days[].date のいずれか。")
    slot: MealSlot


class MealSwapCandidatesResponse(BaseModel):
    """candidates 生成結果。``proposal_id`` を client が apply で返す。"""

    model_config = ConfigDict(
        json_schema_extra={"title": "MealSwapCandidatesResponse"}
    )
    proposal_id: str = Field(description="uuid v4。")
    proposal_expires_at: str = Field(description="ISO 8601 (生成時刻 + 10 分)。")
    candidates: list[Meal] = Field(min_length=3, max_length=3)


class MealSwapApplyRequest(BaseModel):
    """apply は meal 内容を持たず、server 側の proposal を信頼する。"""

    model_config = ConfigDict(json_schema_extra={"title": "MealSwapApplyRequest"})
    proposal_id: str
    chosen_index: int = Field(ge=0, le=2)


class MealSwapApplyResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"title": "MealSwapApplyResponse"}
    )
    updated_day: DayPlan
    plan_id: str = Field(description="plan identity として不変。")
    revision: int = Field(
        ge=0,
        description="apply 成功で +1 された新 revision。次の swap 時の expected_revision として使う。",
    )
