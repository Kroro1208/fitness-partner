"""4 つのエンジンを組み合わせた end-to-end パイプラインのスモークテスト。"""

from fitness_contracts.models.fitness_engine.calorie_macro_input import (
    CalorieMacroInput,
)
from fitness_contracts.models.fitness_engine.hydration import HydrationInput
from fitness_contracts.models.fitness_engine.safety import SafetyInput
from fitness_contracts.models.fitness_engine.supplement import SupplementInput

from fitness_engine.calorie_macro import calculate_calories_and_macros
from fitness_engine.hydration import calculate_hydration_target
from fitness_engine.safety import evaluate_safety
from fitness_engine.supplements import recommend_supplements


def test_full_pipeline_for_typical_user():
    """典型的なデスクワーク女性ユーザーのフルパイプラインを一貫実行する。"""
    # Safety first
    safety = evaluate_safety(
        SafetyInput(
            age=32,
            weight_kg=62.0,
            height_cm=162.0,
            desired_pace="steady",
            sleep_hours=7.0,
            stress_level="moderate",
            alcohol_per_week=3,
            pregnancy_or_breastfeeding=False,
            eating_disorder_history=False,
            medical_conditions=[],
        )
    )
    assert safety.allowed_to_generate_plan is True

    # Calorie & macros
    macros = calculate_calories_and_macros(
        CalorieMacroInput(
            age=32,
            sex="female",
            height_cm=162.0,
            weight_kg=62.0,
            activity_level="lightly_active",
            sleep_hours=7.0,
            stress_level="moderate",
        )
    )
    assert macros.target_calories > 1200
    assert macros.target_calories < 2500

    # Hydration
    hydration = calculate_hydration_target(
        HydrationInput(
            weight_kg=62.0,
            workouts_per_week=3,
            avg_workout_minutes=45,
            job_type="desk",
        )
    )
    assert hydration.target_liters >= 2.0

    # Supplements
    supps = recommend_supplements(
        SupplementInput(
            protein_gap_g=15.0,
            workouts_per_week=3,
            sleep_hours=7.0,
            fish_per_week=2,
            early_morning_training=False,
            low_sunlight_exposure=False,
        )
    )
    # creatine は推奨される (workouts=3)、whey は推奨されない (gap=15)
    names = [item.name for item in supps.items]
    assert "creatine" in names
    assert "whey" not in names
    assert "caffeine" not in names
    assert "vitamin_d" not in names


def test_full_pipeline_blocked_user():
    """妊娠中ユーザーは safety でブロックされる (後続は呼ばれない想定)。"""
    safety = evaluate_safety(
        SafetyInput(
            age=29,
            weight_kg=60.0,
            height_cm=165.0,
            desired_pace="steady",
            sleep_hours=7.0,
            stress_level="low",
            alcohol_per_week=0,
            pregnancy_or_breastfeeding=True,
        )
    )
    assert safety.level == "blocked"
    assert safety.allowed_to_generate_plan is False
