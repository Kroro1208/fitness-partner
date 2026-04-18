"""Hydration Engine のテスト。"""

import pytest

from fitness_contracts.models.fitness_engine.hydration import (
    HydrationInput,
    HydrationResult,
)

from fitness_engine.hydration import calculate_hydration_target


@pytest.mark.parametrize(
    ("weight_kg", "workouts_per_week", "avg_workout_minutes", "job_type", "expected_liters"),
    [
        # 基本: 35ml × 70kg = 2.45 L
        (70.0, 0, 0, "desk", 2.45),
        # 運動: 週3 × 60分 = 180分/週 = 3時間/週 = 0.4286時間/日 → +500*0.4286 = +214 → 2.664 → 2.66
        (70.0, 3, 60, "desk", 2.66),
        # 肉体労働: +750ml
        (70.0, 0, 0, "manual_labour", 3.20),
        # 屋外: +750ml
        (70.0, 0, 0, "outdoor", 3.20),
        # light_physical は加算なし (デスク扱い)
        (70.0, 0, 0, "light_physical", 2.45),
    ],
)
def test_calculate_hydration_target_breakdown(
    weight_kg: float,
    workouts_per_week: int,
    avg_workout_minutes: int,
    job_type: str,
    expected_liters: float,
):
    input_ = HydrationInput(
        weight_kg=weight_kg,
        workouts_per_week=workouts_per_week,
        avg_workout_minutes=avg_workout_minutes,
        job_type=job_type,
    )
    result = calculate_hydration_target(input_)
    assert isinstance(result, HydrationResult)
    # 小数第2位まで許容
    assert abs(result.target_liters - expected_liters) < 0.01


def test_calculate_hydration_breakdown_has_three_components():
    """breakdown は base / workout / job の 3 要素を含む (文言の具体は問わない)。

    narrative テキストの言い回しに依存しない構造検証。
    """
    input_ = HydrationInput(
        weight_kg=70.0,
        workouts_per_week=3,
        avg_workout_minutes=60,
        job_type="manual_labour",
    )
    result = calculate_hydration_target(input_)
    assert len(result.formula_breakdown) == 3


def test_calculate_hydration_returns_practical_tips_and_why():
    """architecture.md 11.6 に合わせて practical_tips と why_it_matters を返すこと。"""
    input_ = HydrationInput(
        weight_kg=65.0,
        workouts_per_week=2,
        avg_workout_minutes=30,
        job_type="desk",
    )
    result = calculate_hydration_target(input_)
    assert len(result.practical_tips) >= 1
    assert len(result.why_it_matters) >= 1
