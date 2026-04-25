"""MealSwapContext: Adapter Lambda → Strands の境界 payload (Plan 09)。"""

from pydantic import BaseModel, ConfigDict, Field

from fitness_contracts.models.plan.agent_io import SafePromptProfile
from fitness_contracts.models.plan.meal import Meal


class DailyMacroContext(BaseModel):
    """対象日の配分と他 meal の合計マクロ。

    ``plan.target_*/7`` の週平均は使わず、``plan.days[i].daily_total_*`` を
    ``original_day_total_*`` として採用する。これにより alcohol day / treat day /
    batch day などの日次配分の差異を swap 後も維持する。
    """

    model_config = ConfigDict(json_schema_extra={"title": "DailyMacroContext"})

    date: str = Field(description="ISO YYYY-MM-DD。")
    original_day_total_calories_kcal: int = Field(ge=0, le=10000)
    original_day_total_protein_g: float = Field(ge=0, le=600)
    original_day_total_fat_g: float = Field(ge=0, le=600)
    original_day_total_carbs_g: float = Field(ge=0, le=1200)
    other_meals_total_calories_kcal: int = Field(ge=0, le=10000)
    other_meals_total_protein_g: float = Field(ge=0, le=600)
    other_meals_total_fat_g: float = Field(ge=0, le=600)
    other_meals_total_carbs_g: float = Field(ge=0, le=1200)


class MealSwapContext(BaseModel):
    """Meal swap 候補生成のため Strands Agent に渡す payload。

    ``medical_*_note`` は ``SafePromptProfile`` の段階で既に除去されている。
    ``target_meal`` は ``plan.days[date].meals`` から slot 完全一致で取り出した
    1 件、``daily_context`` は ``DailyMacroContext`` で計算済み。
    """

    model_config = ConfigDict(json_schema_extra={"title": "MealSwapContext"})

    safe_prompt_profile: SafePromptProfile
    target_meal: Meal
    daily_context: DailyMacroContext
