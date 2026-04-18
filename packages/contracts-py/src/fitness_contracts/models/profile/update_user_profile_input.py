"""UpdateUserProfileInput: プロフィール部分更新の入力型。"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class UpdateUserProfileInput(BaseModel):
    """プロフィール部分更新の入力。全フィールド optional (PATCH セマンティクス)。

    - 最低 1 フィールドは必須 (空 {} は 400)。model_validator で検証
    - None 値は「フィールド未送信」と同義 (属性削除ではない)
    - 属性削除 API は未提供。MVP では一度設定した値は上書きのみ可能
    """

    model_config = ConfigDict(
        json_schema_extra={
            "title": "UpdateUserProfileInput",
            "description": "プロフィール部分更新の入力。",
            "x-at-least-one-not-null": [
                "name",
                "age",
                "sex",
                "height_cm",
                "weight_kg",
                "activity_level",
                "desired_pace",
                "sleep_hours",
                "stress_level",
            ],
        }
    )

    name: str | None = None
    age: int | None = Field(default=None, ge=18, le=120)
    sex: Literal["male", "female"] | None = None
    height_cm: float | None = Field(default=None, gt=0, lt=300)
    weight_kg: float | None = Field(default=None, gt=0, lt=500)
    activity_level: Literal[
        "sedentary",
        "lightly_active",
        "moderately_active",
        "very_active",
        "extremely_active",
    ] | None = None
    desired_pace: Literal["steady", "aggressive"] | None = None
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"] | None = None

    @model_validator(mode="before")
    @classmethod
    def check_at_least_one_field(cls, data: Any) -> Any:
        """空 {} や全フィールド null のリクエストを拒否する。"""
        if isinstance(data, dict):
            field_names = {
                "name", "age", "sex", "height_cm", "weight_kg",
                "activity_level", "desired_pace", "sleep_hours", "stress_level",
            }
            has_value = any(data.get(f) is not None for f in field_names)
            if not has_value:
                raise ValueError("At least one field must be provided")
        return data
