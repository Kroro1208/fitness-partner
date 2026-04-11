"""CalorieMacroInput: Calorie Macro Engine への入力型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Sex = Literal["male", "female"]
ActivityLevel = Literal[
    "sedentary",
    "lightly_active",
    "moderately_active",
    "very_active",
    "extremely_active",
]
StressLevel = Literal["low", "moderate", "high"]


class CalorieMacroInput(BaseModel):
    """Calorie Macro Engine への入力。

    architecture.md 11.3 の入力仕様 (`job_type`, `workouts_per_week`,
    `training_type`, `preferred_rate`, `safety_constraints`) を **MVP では
    `activity_level` 1 フィールドに集約**する。フロントエンド (BFF) が
    UserProfile → CalorieMacroInput の変換時に job_type と workouts_per_week
    から activity_level を導出する責務を持つ。
    減量ペース (`desired_pace`) は本入力には含めない — ペース妥当性は Safety
    Guard (SafetyInput.desired_pace) で扱い、Calorie Engine はペースに応じた
    deficit 増減はしない (aggressive で deficit を大きくすると安全限界を
    超えうるため、architecture.md の 11.3「TDEE-500 上限」方針を厳守)。
    """

    model_config = ConfigDict(
        json_schema_extra={
            "title": "CalorieMacroInput",
            "description": "Calorie Macro Engine の入力。",
        }
    )

    age: int = Field(ge=18, le=120, description="年齢 (成人のみ)。")
    sex: Sex = Field(description="生物学的性別 (BMR 計算に必要)。")
    height_cm: float = Field(gt=0, lt=300, description="身長 (cm)。")
    weight_kg: float = Field(gt=0, lt=500, description="現在体重 (kg)。")
    activity_level: ActivityLevel = Field(
        description="PAL 活動係数を決める活動レベル。"
    )
    sleep_hours: float = Field(
        ge=0, le=24, description="平均睡眠時間 (caution 条件判定に使う)。"
    )
    stress_level: StressLevel = Field(
        description="ストレスレベル (caution 条件判定に使う)。"
    )
