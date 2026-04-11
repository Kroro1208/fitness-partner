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


ActivityLevel = Literal[
    "sedentary",
    "lightly_active",
    "moderately_active",
    "very_active",
    "extremely_active",
]

ACTIVITY_MULTIPLIERS: dict[str, float] = {
    "sedentary": 1.2,
    "lightly_active": 1.375,
    "moderately_active": 1.55,
    "very_active": 1.725,
    "extremely_active": 1.9,
}


def calculate_tdee(*, bmr: int, activity_level: ActivityLevel) -> int:
    """BMR と活動レベルから TDEE (kcal/day) を計算する。

    Raises:
        ValueError: activity_level が ACTIVITY_MULTIPLIERS のキー以外の場合。
    """
    try:
        multiplier = ACTIVITY_MULTIPLIERS[activity_level]
    except KeyError as exc:
        raise ValueError(
            f"activity_level must be one of {list(ACTIVITY_MULTIPLIERS)}, "
            f"got {activity_level!r}"
        ) from exc
    return round(bmr * multiplier)
