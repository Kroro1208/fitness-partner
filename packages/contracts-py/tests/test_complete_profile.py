import pytest
from pydantic import ValidationError

from fitness_contracts.models.plan.complete_profile import CompleteProfileForPlan


def _base(**o):
    base = dict(onboarding_stage="complete", age=30, sex="male", height_cm=170,
                weight_kg=70, sleep_hours=7, stress_level="low",
                job_type="desk", workouts_per_week=3)
    return {**base, **o}


def test_rejects_incomplete_stage():
    with pytest.raises(ValidationError):
        CompleteProfileForPlan(**_base(onboarding_stage="stats"))


def test_rejects_missing_weight_kg():
    data = _base()
    del data["weight_kg"]
    with pytest.raises(ValidationError):
        CompleteProfileForPlan(**data)


def test_allows_extra_fields():
    p = CompleteProfileForPlan(**_base(favorite_meals=["rice"], medical_condition_note="x"))
    assert p.age == 30
