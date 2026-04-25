"""MealSwapContext / DailyMacroContext のテスト (Plan 09 Task A3)。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.agent_io import SafePromptProfile
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from fitness_contracts.models.plan.meal_swap_context import (
    DailyMacroContext,
    MealSwapContext,
)


def _target_meal() -> Meal:
    return Meal(
        slot="breakfast",
        title="卵かけご飯",
        items=[
            MealItem(
                food_id=None,
                name="米",
                grams=150,
                calories_kcal=252,
                protein_g=4,
                fat_g=0.5,
                carbs_g=55,
            )
        ],
        total_calories_kcal=252,
        total_protein_g=4,
        total_fat_g=0.5,
        total_carbs_g=55,
        prep_tag=None,
        notes=None,
    )


def _safe_profile() -> SafePromptProfile:
    return SafePromptProfile(
        name=None,
        age=30,
        sex="male",
        height_cm=170,
        weight_kg=70,
        goal_weight_kg=65,
        goal_description=None,
        desired_pace="steady",
    )


def _daily_context_kwargs(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = dict(
        date="2026-04-27",
        original_day_total_calories_kcal=2000,
        original_day_total_protein_g=120,
        original_day_total_fat_g=60,
        original_day_total_carbs_g=220,
        other_meals_total_calories_kcal=1500,
        other_meals_total_protein_g=90,
        other_meals_total_fat_g=45,
        other_meals_total_carbs_g=170,
    )
    base.update(overrides)
    return base


@pytest.mark.parametrize(
    "missing_field",
    [
        "original_day_total_calories_kcal",
        "original_day_total_protein_g",
        "original_day_total_fat_g",
        "original_day_total_carbs_g",
        "other_meals_total_calories_kcal",
        "other_meals_total_protein_g",
        "other_meals_total_fat_g",
        "other_meals_total_carbs_g",
        "date",
    ],
)
def test_daily_macro_context_requires_field(missing_field: str) -> None:
    kwargs = _daily_context_kwargs()
    kwargs.pop(missing_field)
    with pytest.raises(ValidationError):
        DailyMacroContext(**kwargs)


@pytest.mark.parametrize(
    "negative_field",
    [
        "original_day_total_calories_kcal",
        "original_day_total_protein_g",
        "original_day_total_fat_g",
        "original_day_total_carbs_g",
        "other_meals_total_calories_kcal",
        "other_meals_total_protein_g",
        "other_meals_total_fat_g",
        "other_meals_total_carbs_g",
    ],
)
def test_daily_macro_context_rejects_negative(negative_field: str) -> None:
    with pytest.raises(ValidationError):
        DailyMacroContext(**_daily_context_kwargs(**{negative_field: -1}))


def test_daily_macro_context_happy_path() -> None:
    ctx = DailyMacroContext(**_daily_context_kwargs())
    assert ctx.original_day_total_calories_kcal == 2000
    assert ctx.other_meals_total_protein_g == 90


def test_meal_swap_context_composes_all_fields() -> None:
    ctx = MealSwapContext(
        safe_prompt_profile=_safe_profile(),
        target_meal=_target_meal(),
        daily_context=DailyMacroContext(**_daily_context_kwargs()),
    )
    assert ctx.target_meal.slot == "breakfast"
    assert ctx.daily_context.date == "2026-04-27"
    assert ctx.safe_prompt_profile.age == 30


def test_meal_swap_context_rejects_missing_target_meal() -> None:
    with pytest.raises(ValidationError):
        MealSwapContext(  # type: ignore[call-arg]
            safe_prompt_profile=_safe_profile(),
            daily_context=DailyMacroContext(**_daily_context_kwargs()),
        )


def test_meal_swap_context_rejects_missing_safe_prompt_profile() -> None:
    with pytest.raises(ValidationError):
        MealSwapContext(  # type: ignore[call-arg]
            target_meal=_target_meal(),
            daily_context=DailyMacroContext(**_daily_context_kwargs()),
        )
