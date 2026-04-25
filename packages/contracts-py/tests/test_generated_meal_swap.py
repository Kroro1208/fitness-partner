"""GeneratedMealSwapCandidates のテスト (Plan 09 Task A4)。agent 出力境界型。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.generated_meal_swap import (
    GeneratedMealSwapCandidates,
)
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem


def _meal(slot: str, title: str) -> Meal:
    return Meal(
        slot=slot,
        title=title,
        items=[
            MealItem(
                food_id=None,
                name="x",
                grams=100,
                calories_kcal=300,
                protein_g=20,
                fat_g=10,
                carbs_g=30,
            )
        ],
        total_calories_kcal=300,
        total_protein_g=20,
        total_fat_g=10,
        total_carbs_g=30,
        prep_tag=None,
        notes=None,
    )


@pytest.mark.parametrize("invalid_count", [0, 1, 2, 4, 5, 10])
def test_rejects_candidate_count_other_than_three(invalid_count: int) -> None:
    with pytest.raises(ValidationError):
        GeneratedMealSwapCandidates(
            candidates=[_meal("breakfast", f"m{i}") for i in range(invalid_count)]
        )


def test_accepts_exactly_three() -> None:
    obj = GeneratedMealSwapCandidates(
        candidates=[
            _meal("breakfast", "a"),
            _meal("breakfast", "b"),
            _meal("breakfast", "c"),
        ]
    )
    assert len(obj.candidates) == 3
