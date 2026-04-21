from unittest.mock import MagicMock

import pytest

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from plan_generator import handler as handler_module


def _valid_event():
    return {
        "user_id": "u1",
        "week_start": "2026-04-20",
        "safe_prompt_profile": {"age": 30, "sex": "male", "height_cm": 170, "weight_kg": 70},
        "safe_agent_input": {
            "calorie_macro_input": {
                "age": 30,
                "sex": "male",
                "height_cm": 170,
                "weight_kg": 70,
                "activity_level": "moderately_active",
                "sleep_hours": 7,
                "stress_level": "low",
            },
            "hydration_input": {
                "weight_kg": 70,
                "workouts_per_week": 3,
                "avg_workout_minutes": 45,
                "job_type": "desk",
            },
            "supplement_input": {
                "protein_gap_g": 0,
                "workouts_per_week": 3,
                "sleep_hours": 7,
                "fish_per_week": 2,
            },
        },
    }


def _gen_plan() -> GeneratedWeeklyPlan:
    item = MealItem(
        name="鶏むね", grams=150, calories_kcal=180, protein_g=33, fat_g=3, carbs_g=0
    )
    meal = Meal(
        slot="breakfast",
        title="朝食",
        items=[item],
        total_calories_kcal=180,
        total_protein_g=33,
        total_fat_g=3,
        total_carbs_g=0,
    )
    day = DayPlan(
        date="2026-04-20",
        theme="高タンパク",
        meals=[meal] * 3,
        daily_total_calories_kcal=540,
        daily_total_protein_g=99,
        daily_total_fat_g=9,
        daily_total_carbs_g=0,
    )
    return GeneratedWeeklyPlan(
        target_calories_kcal=2200,
        target_protein_g=140,
        target_fat_g=70,
        target_carbs_g=240,
        days=[day] * 7,
        personal_rules=["a", "b", "c"],
        hydration_target_liters=2.5,
    )


def test_returns_generated_plan(monkeypatch):
    monkeypatch.setattr(handler_module, "_AGENT", MagicMock(return_value=_gen_plan()))
    res = handler_module.handler(_valid_event())
    assert "generated_weekly_plan" in res
    assert "plan_id" not in res["generated_weekly_plan"]
    assert len(res["generated_weekly_plan"]["days"]) == 7


def test_rejects_invalid_event(monkeypatch):
    monkeypatch.setattr(handler_module, "_AGENT", MagicMock())
    with pytest.raises(ValueError):
        handler_module.handler({"user_id": "u1"})
