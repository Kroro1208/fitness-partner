"""DayPlan.meals の slot 一意性 validator テスト (Plan 09 Task A1)。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem


def _meal(slot: str, title: str) -> Meal:
    return Meal(
        slot=slot,
        title=title,
        items=[
            MealItem(
                food_id=None,
                name="dummy",
                grams=100,
                calories_kcal=200,
                protein_g=10,
                fat_g=5,
                carbs_g=20,
            )
        ],
        total_calories_kcal=200,
        total_protein_g=10,
        total_fat_g=5,
        total_carbs_g=20,
        prep_tag=None,
        notes=None,
    )


def test_day_plan_rejects_duplicate_slots() -> None:
    with pytest.raises(ValidationError) as ei:
        DayPlan(
            date="2026-04-27",
            theme="test",
            meals=[
                _meal("breakfast", "a"),
                _meal("breakfast", "b"),
                _meal("dinner", "c"),
            ],
            daily_total_calories_kcal=600,
            daily_total_protein_g=30,
            daily_total_fat_g=15,
            daily_total_carbs_g=60,
        )
    assert "unique slots" in str(ei.value)


def test_day_plan_accepts_unique_slots() -> None:
    day = DayPlan(
        date="2026-04-27",
        theme="test",
        meals=[
            _meal("breakfast", "a"),
            _meal("lunch", "b"),
            _meal("dinner", "c"),
        ],
        daily_total_calories_kcal=600,
        daily_total_protein_g=30,
        daily_total_fat_g=15,
        daily_total_carbs_g=60,
    )
    assert len(day.meals) == 3
