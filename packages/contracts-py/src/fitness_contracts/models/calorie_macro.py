"""カロリー/マクロ計算結果の契約モデル。

Plan 02 で実装する deterministic な Calorie Macro Engine の出力型。
Python (Strands / Lambda) と TypeScript (Next.js) の両方が参照する
唯一の真実 (source of truth) モデル。
"""

from pydantic import BaseModel, ConfigDict, Field


class CalorieMacroResult(BaseModel):
    """BMR / TDEE / 目標カロリー / マクロ計算の結果。"""

    model_config = ConfigDict(
        json_schema_extra={
            "title": "CalorieMacroResult",
            "description": (
                "Calorie Macro Engine の deterministic 出力。"
                "整数値は kcal またはグラム単位 (注記がない限り)。"
            ),
        }
    )

    bmr: int = Field(
        ge=0,
        description="Mifflin-St Jeor 式で計算した Basal Metabolic Rate (kcal)。",
    )
    activity_multiplier: float = Field(
        ge=1.0,
        le=2.0,
        description="TDEE 計算に使う PAL 活動係数。",
    )
    tdee: int = Field(
        ge=0,
        description="Total Daily Energy Expenditure (kcal) = BMR * activity_multiplier。",
    )
    target_calories: int = Field(
        ge=0,
        description="deficit ルール適用後の 1 日目標カロリー。",
    )
    protein_g: int = Field(ge=0, description="1 日のタンパク質目標 (g)。")
    fat_g: int = Field(ge=0, description="1 日の脂質目標 (g)。")
    carbs_g: int = Field(ge=0, description="1 日の炭水化物目標 (g)。")
    explanation: list[str] = Field(
        default_factory=list,
        description="人間が読める計算根拠を step-by-step で列挙したもの。",
    )
