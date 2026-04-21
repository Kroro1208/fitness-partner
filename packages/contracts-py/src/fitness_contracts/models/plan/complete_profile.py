"""CompleteProfileForPlan: Adapter 入口 fail-fast parse.

onboarding_stage == "complete" だけに頼らず、plan 生成必須項目
(age/sex/height_cm/weight_kg/sleep_hours/stress_level/job_type/
workouts_per_week) を明示要求する。
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CompleteProfileForPlan(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={"title": "CompleteProfileForPlan"},
        extra="allow",  # UserProfile の他フィールドは保持
    )

    onboarding_stage: Literal["complete"]
    age: int = Field(ge=18, le=120)
    sex: Literal["male", "female"]
    height_cm: float = Field(gt=0, lt=300)
    weight_kg: float = Field(gt=0, lt=500)
    sleep_hours: float = Field(ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"]
    job_type: Literal["desk", "standing", "light_physical", "manual_labour", "outdoor"]
    workouts_per_week: int = Field(ge=0, le=14)
