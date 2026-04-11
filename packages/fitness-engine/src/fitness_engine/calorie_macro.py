"""Calorie Macro Engine: BMR / TDEE / deficit / macros の決定論的計算。

純粋関数のみ。I/O なし。将来 Strands Agents から in-process tool として
呼ばれる。
"""

from typing import Literal

from fitness_contracts.models.calorie_macro import CalorieMacroResult
from fitness_contracts.models.calorie_macro_input import CalorieMacroInput

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


def calculate_target_calories(
    *,
    tdee: int,
    bmr: int,
    activity_level: ActivityLevel,
    sleep_hours: float,
    stress_level: Literal["low", "moderate", "high"],
    bmi: float,
) -> int:
    """TDEE から deficit ルールに従って目標カロリーを決定する。

    ルール:
    - caution 条件 (睡眠<6h かつ stress=high / BMI<20): TDEE - 300
    - 高活動 (very_active, extremely_active): TDEE - 500
    - 通常: TDEE - 400
    - 下限 guard: BMR * 1.1 を下回らない
    """
    is_caution = (sleep_hours < 6 and stress_level == "high") or bmi < 20.0
    is_high_activity = activity_level in ("very_active", "extremely_active")

    if is_caution:
        deficit = 300
    elif is_high_activity:
        deficit = 500
    else:
        deficit = 400

    target = tdee - deficit
    floor = round(bmr * 1.1)
    return max(target, floor)


def calculate_macros(*, target_calories: int, weight_kg: float) -> dict[str, int]:
    """目標カロリーと体重から protein / fat / carbs の g を決める。

    MVP ルール:
    - protein: 1.8 g/kg
    - fat: 0.8 g/kg
    - carbs: 残り / 4 kcal/g (負になったら 0 にクリップ)
    """
    protein_g = round(weight_kg * 1.8)
    fat_g = round(weight_kg * 0.8)
    protein_kcal = protein_g * 4
    fat_kcal = fat_g * 9
    carbs_kcal = max(0, target_calories - protein_kcal - fat_kcal)
    carbs_g = round(carbs_kcal / 4)
    return {"protein_g": protein_g, "fat_g": fat_g, "carbs_g": carbs_g}


def calculate_calories_and_macros(
    input_: CalorieMacroInput,
) -> CalorieMacroResult:
    """4 ステップ計算をまとめて CalorieMacroResult を返すオーケストレータ。

    1. BMR を Mifflin-St Jeor で計算
    2. TDEE を活動係数で計算
    3. deficit ルールで目標カロリーを決定
    4. 体重から macros を算出

    副作用なし、純粋関数。
    """
    bmr = calculate_bmr(
        sex=input_.sex,
        age=input_.age,
        height_cm=input_.height_cm,
        weight_kg=input_.weight_kg,
    )
    tdee = calculate_tdee(bmr=bmr, activity_level=input_.activity_level)
    bmi = input_.weight_kg / ((input_.height_cm / 100) ** 2)
    target_calories = calculate_target_calories(
        tdee=tdee,
        bmr=bmr,
        activity_level=input_.activity_level,
        sleep_hours=input_.sleep_hours,
        stress_level=input_.stress_level,
        bmi=bmi,
    )
    macros = calculate_macros(
        target_calories=target_calories, weight_kg=input_.weight_kg
    )

    multiplier = ACTIVITY_MULTIPLIERS[input_.activity_level]
    explanation = [
        f"BMR: Mifflin-St Jeor ({input_.sex}, {input_.age}y, "
        f"{input_.height_cm}cm, {input_.weight_kg}kg) = {bmr} kcal",
        f"TDEE: BMR × {multiplier} ({input_.activity_level}) = {tdee} kcal",
        f"Target: {tdee} - deficit = {target_calories} kcal",
        (
            f"Macros: P={macros['protein_g']}g / "
            f"F={macros['fat_g']}g / C={macros['carbs_g']}g"
        ),
    ]

    return CalorieMacroResult(
        bmr=bmr,
        activity_multiplier=multiplier,
        tdee=tdee,
        target_calories=target_calories,
        protein_g=macros["protein_g"],
        fat_g=macros["fat_g"],
        carbs_g=macros["carbs_g"],
        explanation=explanation,
    )
