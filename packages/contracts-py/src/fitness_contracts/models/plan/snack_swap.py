"""SnackSwap."""

from pydantic import BaseModel, ConfigDict, Field


class SnackSwap(BaseModel):
    model_config = ConfigDict(json_schema_extra={"title": "SnackSwap"})

    current_snack: str = Field(min_length=1, max_length=80)
    replacement: str = Field(min_length=1, max_length=120)
    calories_kcal: int = Field(ge=0, le=2000)
    why_it_works: str = Field(min_length=1, max_length=240)
