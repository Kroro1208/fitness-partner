"""Hydration Engine: 水分目標の決定論的計算。"""

from fitness_contracts.models.hydration import HydrationInput, HydrationResult

_BASE_ML_PER_KG = 35
_WORKOUT_BONUS_ML_PER_HOUR = 500
_MANUAL_LABOUR_BONUS_ML = 750


def calculate_hydration_target(input_: HydrationInput) -> HydrationResult:
    """体重・運動量・仕事タイプから 1 日の水分目標を計算する。

    - base = 35 ml × weight_kg
    - workout bonus = 500 ml × (週運動時間 / 7) (= 1日平均の運動時間)
    - job bonus = 750 ml (manual_labour / outdoor のみ)

    戻り値: 0.01 L 単位に丸めた目標リットル数と breakdown メッセージ。
    """
    base_ml = _BASE_ML_PER_KG * input_.weight_kg

    weekly_workout_hours = (input_.workouts_per_week * input_.avg_workout_minutes) / 60
    daily_workout_hours = weekly_workout_hours / 7
    workout_bonus_ml = _WORKOUT_BONUS_ML_PER_HOUR * daily_workout_hours

    if input_.job_type in ("manual_labour", "outdoor"):
        job_bonus_ml = _MANUAL_LABOUR_BONUS_ML
        job_label = f"job ({input_.job_type}): +{_MANUAL_LABOUR_BONUS_ML} ml"
    else:
        job_bonus_ml = 0
        job_label = f"job ({input_.job_type}): +0 ml"

    total_ml = base_ml + workout_bonus_ml + job_bonus_ml
    total_liters = round(total_ml / 1000, 2)

    breakdown = [
        f"base: 35 ml × {input_.weight_kg} kg = {base_ml:.0f} ml",
        (
            f"workout: +500 ml/h × {daily_workout_hours:.2f} h/day "
            f"= {workout_bonus_ml:.0f} ml"
        ),
        job_label,
    ]

    practical_tips = [
        "起床直後にコップ 1 杯 (200-300 ml) を飲む",
        "食事ごとに 1 杯を組み合わせる",
        "運動前・運動中・運動後にそれぞれ 200 ml を目安に補給",
    ]
    why_it_matters = [
        "適切な水分は代謝と集中力、空腹感のコントロールを支える",
        "運動時の発汗損失を補わないとパフォーマンスが落ちる",
    ]

    return HydrationResult(
        target_liters=total_liters,
        formula_breakdown=breakdown,
        practical_tips=practical_tips,
        why_it_matters=why_it_matters,
    )
