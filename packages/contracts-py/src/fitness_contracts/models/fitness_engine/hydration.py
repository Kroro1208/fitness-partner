"""Hydration: 水分計算の入出力型。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

JobType = Literal[
    "desk",
    "standing",
    "light_physical",
    "manual_labour",
    "outdoor",
]


class HydrationInput(BaseModel):
    """Hydration Engine への入力。"""

    model_config = ConfigDict(json_schema_extra={"title": "HydrationInput"})

    weight_kg: float = Field(gt=0, lt=500, description="現在体重 (kg)。")
    workouts_per_week: int = Field(
        ge=0, le=14, description="週の運動頻度 (回)。"
    )
    avg_workout_minutes: int = Field(
        ge=0, le=300, description="1 回あたりの平均運動時間 (分)。"
    )
    job_type: JobType = Field(description="仕事の身体負荷タイプ。")


class HydrationResult(BaseModel):
    """Hydration Engine の出力。

    architecture.md 11.6 に合わせて target_liters / formula_breakdown に加え、
    practical_tips (生活導線に乗るアクション提案) と why_it_matters (理由) を返す。
    """

    model_config = ConfigDict(json_schema_extra={"title": "HydrationResult"})

    target_liters: float = Field(
        ge=0, description="1 日の水分目標 (リットル)。"
    )
    formula_breakdown: list[str] = Field(
        default_factory=list,
        description="計算の内訳 (base + workout + job)。",
    )
    practical_tips: list[str] = Field(
        default_factory=list,
        description="生活導線に乗せるための実務的なヒント (例: 朝起きてすぐ 1 杯)。",
    )
    why_it_matters: list[str] = Field(
        default_factory=list,
        description="なぜ水分が重要かの簡潔な説明 (1-3 項目)。",
    )
