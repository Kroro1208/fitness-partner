"""Supplement Recommender のテスト。"""

import pytest

from fitness_contracts.models.supplement import (
    SupplementInput,
    SupplementRecommendationList,
)

from fitness_engine.supplements import recommend_supplements


def _input(**overrides) -> SupplementInput:
    base = dict(
        protein_gap_g=0.0,
        workouts_per_week=3,
        sleep_hours=7.5,
        fish_per_week=2,
        early_morning_training=False,
        low_sunlight_exposure=False,
    )
    base.update(overrides)
    return SupplementInput(**base)


def test_recommend_whey_when_protein_gap_large():
    result = recommend_supplements(_input(protein_gap_g=30.0))
    names = [item.name for item in result.items]
    assert "whey" in names


def test_no_whey_when_protein_gap_small():
    result = recommend_supplements(_input(protein_gap_g=10.0))
    names = [item.name for item in result.items]
    assert "whey" not in names


def test_recommend_creatine_when_training_frequent():
    result = recommend_supplements(_input(workouts_per_week=4))
    names = [item.name for item in result.items]
    assert "creatine" in names


def test_no_creatine_when_training_rare():
    result = recommend_supplements(_input(workouts_per_week=1))
    names = [item.name for item in result.items]
    assert "creatine" not in names


def test_recommend_magnesium_when_sleep_short():
    result = recommend_supplements(_input(sleep_hours=6.0))
    names = [item.name for item in result.items]
    assert "magnesium" in names


def test_recommend_omega3_when_no_fish():
    result = recommend_supplements(_input(fish_per_week=0))
    names = [item.name for item in result.items]
    assert "omega3" in names


def test_recommend_caffeine_when_early_morning():
    result = recommend_supplements(_input(early_morning_training=True))
    names = [item.name for item in result.items]
    assert "caffeine" in names


def test_no_caffeine_when_not_early_morning():
    result = recommend_supplements(_input(early_morning_training=False))
    names = [item.name for item in result.items]
    assert "caffeine" not in names


def test_recommend_vitamin_d_when_low_sunlight():
    result = recommend_supplements(_input(low_sunlight_exposure=True))
    names = [item.name for item in result.items]
    assert "vitamin_d" in names


def test_no_vitamin_d_when_normal_sunlight():
    result = recommend_supplements(_input(low_sunlight_exposure=False))
    names = [item.name for item in result.items]
    assert "vitamin_d" not in names


def test_no_recommendations_when_all_conditions_ideal():
    result = recommend_supplements(
        _input(
            protein_gap_g=0.0,
            workouts_per_week=1,
            sleep_hours=8.0,
            fish_per_week=3,
            early_morning_training=False,
            low_sunlight_exposure=False,
        )
    )
    assert isinstance(result, SupplementRecommendationList)
    assert result.items == []


def test_result_is_pydantic_model():
    result = recommend_supplements(_input())
    assert isinstance(result, SupplementRecommendationList)


# ---- 境界値 ----


@pytest.mark.parametrize(
    ("field", "value", "supplement", "should_include"),
    [
        # protein_gap: > 20 で whey (>, 境界は 20.0)
        ("protein_gap_g", 20.0, "whey", False),
        ("protein_gap_g", 20.01, "whey", True),
        # workouts_per_week: >= 3 で creatine (境界は 3)
        ("workouts_per_week", 2, "creatine", False),
        ("workouts_per_week", 3, "creatine", True),
        # sleep_hours: < 7 で magnesium (境界は 7.0)
        ("sleep_hours", 7.0, "magnesium", False),
        ("sleep_hours", 6.99, "magnesium", True),
        # fish_per_week: < 1 (= 0) で omega3 (境界は 1)
        ("fish_per_week", 1, "omega3", False),
        ("fish_per_week", 0, "omega3", True),
    ],
)
def test_supplement_trigger_boundaries(
    field: str, value: object, supplement: str, should_include: bool
):
    """各サプリのトリガー閾値ちょうどの境界を検証する。"""
    result = recommend_supplements(_input(**{field: value}))
    names = [item.name for item in result.items]
    if should_include:
        assert supplement in names
    else:
        assert supplement not in names
