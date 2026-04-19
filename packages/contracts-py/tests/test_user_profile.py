import pytest
from pydantic import ValidationError

from fitness_contracts.models.profile.user_profile import UserProfile


def test_user_profile_all_fields_optional():
    profile = UserProfile()
    assert profile.age is None
    assert profile.onboarding_stage is None


def test_user_profile_age_out_of_range():
    with pytest.raises(ValidationError):
        UserProfile(age=17)
    with pytest.raises(ValidationError):
        UserProfile(age=121)


def test_user_profile_favorite_meals_max_5():
    with pytest.raises(ValidationError):
        UserProfile(favorite_meals=["a", "b", "c", "d", "e", "f"])


def test_user_profile_onboarding_stage_enum():
    profile = UserProfile(onboarding_stage="complete")
    assert profile.onboarding_stage == "complete"
    with pytest.raises(ValidationError):
        UserProfile(onboarding_stage="invalid")


def test_user_profile_safety_flags_all_boolean():
    profile = UserProfile(is_pregnant_or_breastfeeding=True, has_eating_disorder_history=False)
    assert profile.is_pregnant_or_breastfeeding is True
    assert profile.has_eating_disorder_history is False
