"""Safety: Safety Guard の入出力型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SafetyLevel = Literal["safe", "caution", "blocked"]
ResponseMode = Literal["normal", "limited", "medical_redirect"]


class SafetyInput(BaseModel):
    """Safety Guard への入力 (UserProfile の安全関連サブセット)。

    Note: Plan 02 では `goal_weight_kg` は入力に含めない。数値ベースの
    体重ギャップ判定 (例: 1 週間で 5% 減) は Plan 03 以降で扱う。
    """

    model_config = ConfigDict(json_schema_extra={"title": "SafetyInput"})

    age: int = Field(
        ge=0, le=120, description="年齢。18 歳未満は block される。"
    )
    weight_kg: float = Field(gt=0, lt=500)
    height_cm: float = Field(gt=0, lt=300)
    desired_pace: Literal["steady", "aggressive"] = Field(
        description="減量ペース希望。aggressive は caution として扱う。"
    )
    sleep_hours: float = Field(ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"]
    alcohol_per_week: int = Field(
        ge=0, le=100, description="週の飲酒杯数。"
    )
    pregnancy_or_breastfeeding: bool = Field(default=False)
    eating_disorder_history: bool = Field(default=False)
    medical_conditions: list[str] = Field(
        default_factory=list,
        description=(
            "既往症の列挙。diabetes_insulin / severe_kidney / "
            "severe_hypertension / heart_condition_acute 等。"
        ),
    )


class SafetyResult(BaseModel):
    """Safety Guard の出力。"""

    model_config = ConfigDict(json_schema_extra={"title": "SafetyResult"})

    level: SafetyLevel
    reasons: list[str] = Field(default_factory=list)
    allowed_to_generate_plan: bool
    response_mode: ResponseMode
