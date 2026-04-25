import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from fitness_contracts.models.plan.snack_swap import SnackSwap
from fitness_contracts.models.plan.weekly_plan import WeeklyPlan


def _item(**o):
    base = dict(name="鶏むね", grams=100, calories_kcal=120, protein_g=22, fat_g=2, carbs_g=0)
    return MealItem(**{**base, **o})


def _meal(**o):
    base = dict(slot="breakfast", title="朝食", items=[_item()],
                total_calories_kcal=120, total_protein_g=22, total_fat_g=2, total_carbs_g=0)
    return Meal(**{**base, **o})


def _day(**o):
    base = dict(date="2026-04-20", theme="高タンパク",
                meals=[_meal(slot="breakfast"), _meal(slot="lunch"), _meal(slot="dinner")],
                daily_total_calories_kcal=360, daily_total_protein_g=66,
                daily_total_fat_g=6, daily_total_carbs_g=0)
    return DayPlan(**{**base, **o})


def _gen(**o):
    base = dict(target_calories_kcal=2000, target_protein_g=120, target_fat_g=60,
                target_carbs_g=200, days=[_day() for _ in range(7)],
                personal_rules=["a", "b", "c"], hydration_target_liters=2.5)
    return GeneratedWeeklyPlan(**{**base, **o})


def test_meal_item_grams_positive():
    with pytest.raises(ValidationError):
        MealItem(name="x", grams=0, calories_kcal=0, protein_g=0, fat_g=0, carbs_g=0)


def test_meal_requires_items():
    with pytest.raises(ValidationError):
        Meal(slot="breakfast", title="x", items=[], total_calories_kcal=0,
             total_protein_g=0, total_fat_g=0, total_carbs_g=0)


def test_day_requires_3_to_4_meals():
    with pytest.raises(ValidationError):
        DayPlan(date="2026-04-20", theme="x", meals=[_meal()],
                daily_total_calories_kcal=0, daily_total_protein_g=0,
                daily_total_fat_g=0, daily_total_carbs_g=0)


def test_generated_requires_7_days():
    with pytest.raises(ValidationError):
        _gen(days=[_day() for _ in range(6)])


def test_generated_rules_min_3():
    with pytest.raises(ValidationError):
        _gen(personal_rules=["a", "b"])


def test_generated_has_no_plan_id_field():
    assert "plan_id" not in GeneratedWeeklyPlan.model_fields


def test_weekly_requires_plan_id_week_start_generated_at():
    generated = _gen()
    with pytest.raises(ValidationError):
        WeeklyPlan(**generated.model_dump())


def test_weekly_constructs_from_generated_plus_meta():
    generated = _gen()
    plan = WeeklyPlan(**generated.model_dump(), plan_id="p1",
                     week_start="2026-04-20", generated_at="2026-04-20T00:00:00Z",
                     revision=0)
    assert plan.plan_id == "p1"
    assert len(plan.days) == 7
    assert plan.revision == 0


def test_snack_swap_shape():
    SnackSwap(current_snack="チョコ", replacement="ナッツ",
              calories_kcal=180, why_it_works="低糖質")
