"""WeeklyPlan.revision field (optimistic concurrency token) のテスト。Plan 09 Task A2。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from fitness_contracts.models.plan.weekly_plan import WeeklyPlan


def _item() -> MealItem:
    return MealItem(
        name="鶏むね",
        grams=100,
        calories_kcal=120,
        protein_g=22,
        fat_g=2,
        carbs_g=0,
    )


def _meal(slot: str) -> Meal:
    return Meal(
        slot=slot,
        title="食事",
        items=[_item()],
        total_calories_kcal=120,
        total_protein_g=22,
        total_fat_g=2,
        total_carbs_g=0,
    )


def _day(date: str) -> DayPlan:
    return DayPlan(
        date=date,
        theme="高タンパク",
        meals=[_meal("breakfast"), _meal("lunch"), _meal("dinner")],
        daily_total_calories_kcal=360,
        daily_total_protein_g=66,
        daily_total_fat_g=6,
        daily_total_carbs_g=0,
    )


def _base_kwargs(**overrides: object) -> dict[str, object]:
    days = [_day(f"2026-04-2{i}") for i in range(7)]
    base: dict[str, object] = dict(
        plan_id="p1",
        week_start="2026-04-20",
        generated_at="2026-04-20T00:00:00Z",
        revision=0,
        target_calories_kcal=2000,
        target_protein_g=120,
        target_fat_g=60,
        target_carbs_g=200,
        days=days,
        personal_rules=["a", "b", "c"],
        hydration_target_liters=2.5,
    )
    base.update(overrides)
    return base


def test_weekly_plan_default_revision_zero_when_omitted() -> None:
    """adapter が revision を付け忘れても 0 として扱い、JSON 上は欠落し得る。"""
    kwargs = _base_kwargs()
    kwargs.pop("revision")
    plan = WeeklyPlan(**kwargs)
    assert plan.revision == 0


def test_weekly_plan_revision_ge_zero() -> None:
    with pytest.raises(ValidationError):
        WeeklyPlan(**_base_kwargs(revision=-1))


def test_weekly_plan_accepts_revision_zero() -> None:
    plan = WeeklyPlan(**_base_kwargs(revision=0))
    assert plan.revision == 0


def test_weekly_plan_accepts_revision_positive() -> None:
    plan = WeeklyPlan(**_base_kwargs(revision=42))
    assert plan.revision == 42


def test_generated_weekly_plan_does_not_have_revision() -> None:
    """Strands が出力する GeneratedWeeklyPlan の serialized 出力に revision キーが含まれない
    (adapter 責務)。Pydantic の internal model_fields ではなく、観察可能な model_dump()
    の振る舞いで検証する。"""
    from fitness_contracts.models.plan.generated_weekly_plan import (
        GeneratedWeeklyPlan,
    )

    instance = GeneratedWeeklyPlan(
        target_calories_kcal=2000,
        target_protein_g=120,
        target_fat_g=60,
        target_carbs_g=200,
        days=[_day(f"2026-04-2{i}") for i in range(7)],
        personal_rules=["a", "b", "c"],
        hydration_target_liters=2.5,
    )
    assert "revision" not in instance.model_dump()
