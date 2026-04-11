"""Calorie Macro Engine: BMR / TDEE / deficit / macros の決定論的計算。

純粋関数のみ。I/O なし。将来 Strands Agents から in-process tool として
呼ばれる。
"""

from typing import Literal

Sex = Literal["male", "female"]


def calculate_bmr(*, sex: Sex, age: int, height_cm: float, weight_kg: float) -> int:
    """Mifflin-St Jeor 式で BMR (kcal/day) を計算する。

    - 男性: (10 × weight_kg) + (6.25 × height_cm) - (5 × age) + 5
    - 女性: (10 × weight_kg) + (6.25 × height_cm) - (5 × age) - 161

    Args:
        sex: "male" または "female"。MVP では二択のみ。
        age: 年齢 (18 以上を想定)。
        height_cm: 身長 (cm)。
        weight_kg: 体重 (kg)。

    Returns:
        BMR (kcal/day, 整数に丸める)。

    Raises:
        ValueError: sex が "male" / "female" 以外の場合。
    """
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    if sex == "male":
        bmr = base + 5
    elif sex == "female":
        bmr = base - 161
    else:
        raise ValueError(
            f"sex must be 'male' or 'female' (MVP limitation), got {sex!r}"
        )
    return round(bmr)
