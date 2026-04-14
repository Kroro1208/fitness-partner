"""LogMealInput: 食事ログの入力型。"""

import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class LogMealInput(BaseModel):
    """食事ログの入力。

    date は datetime.date 型。Pydantic v2 が YYYY-MM-DD 文字列を
    自動パースするため、JSON Schema 上は format: "date" になる。
    不存在日付 (2026-99-99) も Pydantic 側で弾かれ、
    Lambda 側の isValidDate() と同じ検証強度になる。
    """

    model_config = ConfigDict(
        json_schema_extra={
            "title": "LogMealInput",
            "description": "食事ログの入力。",
        }
    )

    date: datetime.date = Field(description="YYYY-MM-DD")
    food_id: str = Field(min_length=1, description="FCT2020 食品番号")
    amount_g: float = Field(gt=0, description="グラム数")
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] = Field(
        description="食事タイプ",
    )
