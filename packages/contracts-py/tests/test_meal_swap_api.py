"""Swap API Request/Response 契約テスト (Plan 09 Task A5)。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from fitness_contracts.models.plan.meal_swap_api import (
    MealSwapApplyRequest,
    MealSwapApplyResponse,
    MealSwapCandidatesRequest,
    MealSwapCandidatesResponse,
)


def _meal(slot: str = "breakfast") -> Meal:
    return Meal(
        slot=slot,
        title="朝食",
        items=[
            MealItem(
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
    )


def _day(date: str = "2026-04-27") -> DayPlan:
    return DayPlan(
        date=date,
        theme="test",
        meals=[_meal("breakfast"), _meal("lunch"), _meal("dinner")],
        daily_total_calories_kcal=756,
        daily_total_protein_g=12,
        daily_total_fat_g=1.5,
        daily_total_carbs_g=165,
    )


def test_candidates_request_requires_both_date_and_slot() -> None:
    with pytest.raises(ValidationError):
        MealSwapCandidatesRequest(date="2026-04-27")  # type: ignore[call-arg]


def test_candidates_request_rejects_invalid_slot() -> None:
    with pytest.raises(ValidationError):
        MealSwapCandidatesRequest(date="2026-04-27", slot="snack")  # type: ignore[arg-type]


def test_candidates_response_requires_three_candidates() -> None:
    with pytest.raises(ValidationError):
        MealSwapCandidatesResponse(
            proposal_id="p1",
            proposal_expires_at="2026-04-27T00:00:00Z",
            candidates=[_meal(), _meal()],
        )


def test_apply_request_chosen_index_range() -> None:
    with pytest.raises(ValidationError):
        MealSwapApplyRequest(proposal_id="p1", chosen_index=-1)
    with pytest.raises(ValidationError):
        MealSwapApplyRequest(proposal_id="p1", chosen_index=3)
    ok = MealSwapApplyRequest(proposal_id="p1", chosen_index=0)
    assert ok.chosen_index == 0


def test_apply_response_requires_revision_ge_zero() -> None:
    with pytest.raises(ValidationError):
        MealSwapApplyResponse(updated_day=_day(), plan_id="p1", revision=-1)


def test_apply_response_includes_revision() -> None:
    resp = MealSwapApplyResponse(updated_day=_day(), plan_id="pid-1", revision=3)
    assert resp.revision == 3
    assert resp.plan_id == "pid-1"
