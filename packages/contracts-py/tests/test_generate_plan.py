import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.generate_plan import (
    GeneratePlanRequest, GeneratePlanResponse,
)


def test_request_default_force_false():
    assert GeneratePlanRequest(week_start="2026-04-20").force_regenerate is False


def test_request_requires_week_start():
    with pytest.raises(ValidationError):
        GeneratePlanRequest()


def test_response_requires_weekly_plan():
    with pytest.raises(ValidationError):
        GeneratePlanResponse(
            plan_id="p1", week_start="2026-04-20", generated_at="2026-04-20T00:00:00Z")
