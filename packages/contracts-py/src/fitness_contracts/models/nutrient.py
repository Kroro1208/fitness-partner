"""栄養値の品質表現モデル。"""

from enum import Enum

from pydantic import BaseModel


class NutrientQuality(str, Enum):
    """FCT2020 の栄養値の品質区分。"""

    EXACT = "exact"
    TRACE = "trace"
    MISSING = "missing"


class NutrientValue(BaseModel):
    """品質付き栄養値。value は常に float (TRACE/MISSING は 0.0)。"""

    value: float
    quality: NutrientQuality
