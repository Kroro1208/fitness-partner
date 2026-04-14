"""LogWeightInput: 体重ログの入力型。"""

import datetime

from pydantic import BaseModel, ConfigDict, Field


class LogWeightInput(BaseModel):
    """体重ログの入力。"""

    model_config = ConfigDict(
        json_schema_extra={
            "title": "LogWeightInput",
            "description": "体重ログの入力。",
        }
    )

    date: datetime.date = Field(
        description="YYYY-MM-DD",
    )
    weight_kg: float = Field(gt=0, lt=500, description="体重 (kg)")
