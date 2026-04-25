import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

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

    def _meal(slot: str) -> Meal:
        return Meal(
            slot=slot,
            title="朝食",
            items=[item],
            total_calories_kcal=180,
            total_protein_g=33,
            total_fat_g=3,
            total_carbs_g=0,
        )

    # Plan 09 Task A1: DayPlan.meals の slot 一意性 validator を満たすため
    # breakfast/lunch/dinner を各 1 件ずつ用意する。
    day = DayPlan(
        date="2026-04-20",
        theme="高タンパク",
        meals=[_meal("breakfast"), _meal("lunch"), _meal("dinner")],
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


@pytest.fixture(autouse=True)
def _reset_agent():
    handler_module._AGENT = None
    handler_module._SWAP_AGENT = None
    yield
    handler_module._AGENT = None
    handler_module._SWAP_AGENT = None


def test_returns_generated_plan(monkeypatch):
    monkeypatch.setattr(handler_module, "_AGENT", MagicMock(return_value=_gen_plan()))
    res = handler_module.handler(_valid_event())
    assert "generated_weekly_plan" in res
    assert "plan_id" not in res["generated_weekly_plan"]
    assert len(res["generated_weekly_plan"]["days"]) == 7


def test_handler_passes_safe_inputs_to_agent(monkeypatch):
    captured: list[str] = []

    def fake_generate_plan(message: str):
        captured.append(message)
        return _gen_plan()

    monkeypatch.setattr(handler_module, "_generate_weekly_plan", fake_generate_plan)

    handler_module.handler(_valid_event())

    payload = json.loads(captured[0])
    assert payload["week_start"] == "2026-04-20"
    assert "safe_prompt_profile" in payload
    assert "safe_agent_input" in payload
    assert "precomputed" not in payload


def test_rejects_invalid_event(monkeypatch):
    monkeypatch.setattr(handler_module, "_AGENT", MagicMock())
    with pytest.raises(ValueError):
        handler_module.handler({"user_id": "u1"})


def test_ping_endpoint():
    client = TestClient(handler_module.app)
    response = client.get("/ping")
    assert response.status_code == 200
    assert response.json() == {"status": "Healthy"}


def test_invocations_endpoint_returns_generated_plan(monkeypatch):
    monkeypatch.setattr(handler_module, "_generate_weekly_plan", lambda _message: _gen_plan())
    client = TestClient(handler_module.app)
    response = client.post("/invocations", json=_valid_event())
    assert response.status_code == 200
    body = response.json()
    assert "generated_weekly_plan" in body
    assert len(body["generated_weekly_plan"]["days"]) == 7


# ---- Plan 09: swap candidates dispatch ----------------------------------


def _swap_event():
    return {
        "action": "swap_candidates",
        "swap_context": {
            "safe_prompt_profile": {
                "age": 30, "sex": "male", "height_cm": 170, "weight_kg": 70,
            },
            "target_meal": {
                "slot": "breakfast",
                "title": "卵かけご飯",
                "items": [{
                    "name": "米", "grams": 150,
                    "calories_kcal": 252, "protein_g": 4,
                    "fat_g": 0.5, "carbs_g": 55,
                }],
                "total_calories_kcal": 252,
                "total_protein_g": 4,
                "total_fat_g": 0.5,
                "total_carbs_g": 55,
            },
            "daily_context": {
                "date": "2026-04-27",
                "original_day_total_calories_kcal": 2000,
                "original_day_total_protein_g": 120,
                "original_day_total_fat_g": 60,
                "original_day_total_carbs_g": 220,
                "other_meals_total_calories_kcal": 1500,
                "other_meals_total_protein_g": 90,
                "other_meals_total_fat_g": 45,
                "other_meals_total_carbs_g": 170,
            },
        },
    }


def _gen_swap_candidates():
    from fitness_contracts.models.plan.generated_meal_swap import (
        GeneratedMealSwapCandidates,
    )

    meal = Meal(
        slot="breakfast",
        title="代替朝食",
        items=[MealItem(
            name="オーツ", grams=60,
            calories_kcal=220, protein_g=8, fat_g=4, carbs_g=35,
        )],
        total_calories_kcal=220,
        total_protein_g=8,
        total_fat_g=4,
        total_carbs_g=35,
        prep_tag="quick",
        notes=["高タンパク"],
    )
    return GeneratedMealSwapCandidates(candidates=[meal, meal, meal])


def test_handler_routes_swap_candidates_to_swap_handler(monkeypatch):
    called: list[str] = []

    def fake_handle_swap(event):
        called.append("swap")
        return {"generated_candidates": {"candidates": []}}

    monkeypatch.setattr(handler_module, "handle_swap_candidates", fake_handle_swap)
    res = handler_module.handler(_swap_event())
    assert called == ["swap"]
    assert "generated_candidates" in res


def test_handler_unknown_action_raises():
    with pytest.raises(ValueError) as ei:
        handler_module.handler({"action": "unknown"})
    assert "unknown" in str(ei.value).lower()


def test_handler_defaults_to_generate_plan_when_action_absent(monkeypatch):
    monkeypatch.setattr(handler_module, "_AGENT", MagicMock(return_value=_gen_plan()))
    res = handler_module.handler(_valid_event())
    assert "generated_weekly_plan" in res


def test_swap_handler_returns_generated_candidates(monkeypatch):
    monkeypatch.setattr(
        handler_module,
        "_generate_swap_candidates",
        lambda _message: _gen_swap_candidates(),
    )
    res = handler_module.handle_swap_candidates(_swap_event())
    assert "generated_candidates" in res
    assert len(res["generated_candidates"]["candidates"]) == 3


def test_swap_handler_passes_swap_context_to_agent(monkeypatch):
    captured: list[str] = []

    def fake_generate(message: str):
        captured.append(message)
        return _gen_swap_candidates()

    monkeypatch.setattr(handler_module, "_generate_swap_candidates", fake_generate)
    handler_module.handle_swap_candidates(_swap_event())
    payload = json.loads(captured[0])
    assert payload["target_meal"]["slot"] == "breakfast"
    assert payload["daily_context"]["original_day_total_calories_kcal"] == 2000
    assert "safe_prompt_profile" in payload


def test_swap_handler_rejects_invalid_swap_context():
    with pytest.raises(ValueError):
        handler_module.handle_swap_candidates({"action": "swap_candidates"})
