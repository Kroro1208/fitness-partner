"""UpdateUserProfileInput: プロフィール部分更新の入力型。"""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from fitness_contracts.models.profile.user_profile import OnboardingStage


_ALL_FIELDS = (
    "name", "age", "sex", "height_cm", "weight_kg", "goal_weight_kg", "goal_description",
    "desired_pace", "activity_level", "job_type", "workouts_per_week", "workout_types",
    "sleep_hours", "stress_level", "alcohol_per_week",
    "favorite_meals", "hated_foods", "restrictions", "cooking_preference", "food_adventurousness",
    "current_snacks", "snacking_reason", "snack_taste_preference", "late_night_snacking",
    "eating_out_style", "budget_level", "meal_frequency_preference", "location_region",
    "kitchen_access", "convenience_store_usage",
    "has_medical_condition", "is_under_treatment", "on_medication",
    "is_pregnant_or_breastfeeding", "has_doctor_diet_restriction", "has_eating_disorder_history",
    "medical_condition_note", "medication_note",
    "onboarding_stage", "blocked_reason",
    "preferences_note", "snacks_note", "lifestyle_note",
)


class UpdateUserProfileInput(BaseModel):
    """プロフィール部分更新の入力。全フィールド optional (PATCH セマンティクス)。"""

    model_config = ConfigDict(
        json_schema_extra={
            "title": "UpdateUserProfileInput",
            "description": "プロフィール部分更新の入力。",
            "x-at-least-one-not-null": list(_ALL_FIELDS),
        }
    )

    # Core body stats
    name: str | None = None
    age: int | None = Field(default=None, ge=18, le=120)
    sex: Literal["male", "female"] | None = None
    height_cm: float | None = Field(default=None, gt=0, lt=300)
    weight_kg: float | None = Field(default=None, gt=0, lt=500)
    goal_weight_kg: float | None = Field(default=None, gt=0, lt=500)
    goal_description: str | None = None
    desired_pace: Literal["steady", "aggressive"] | None = None

    # Activity / wellness
    activity_level: Literal[
        "sedentary", "lightly_active", "moderately_active", "very_active", "extremely_active",
    ] | None = None
    job_type: Literal[
        "desk", "standing", "light_physical", "manual_labour", "outdoor",
    ] | None = None
    workouts_per_week: int | None = Field(default=None, ge=0, le=14)
    workout_types: list[str] | None = None
    sleep_hours: float | None = Field(default=None, ge=0, le=24)
    stress_level: Literal["low", "moderate", "high"] | None = None
    alcohol_per_week: str | None = None

    # Food preferences
    favorite_meals: list[str] | None = Field(default=None, max_length=5)
    hated_foods: list[str] | None = None
    restrictions: list[str] | None = None
    cooking_preference: Literal["scratch", "quick", "batch", "mixed"] | None = None
    food_adventurousness: int | None = Field(default=None, ge=1, le=10)

    # Snacking
    current_snacks: list[str] | None = None
    snacking_reason: Literal["hunger", "boredom", "habit", "mixed"] | None = None
    snack_taste_preference: Literal["sweet", "savory", "both"] | None = None
    late_night_snacking: bool | None = None

    # Feasibility
    eating_out_style: Literal["mostly_home", "mostly_eating_out", "mixed"] | None = None
    budget_level: Literal["low", "medium", "high"] | None = None
    meal_frequency_preference: int | None = Field(default=None, ge=1, le=6)
    location_region: str | None = None
    kitchen_access: str | None = None
    convenience_store_usage: Literal["low", "medium", "high"] | None = None

    # Safety flags
    has_medical_condition: bool | None = None
    is_under_treatment: bool | None = None
    on_medication: bool | None = None
    is_pregnant_or_breastfeeding: bool | None = None
    has_doctor_diet_restriction: bool | None = None
    has_eating_disorder_history: bool | None = None
    medical_condition_note: str | None = None
    medication_note: str | None = None

    # Onboarding meta
    onboarding_stage: OnboardingStage | None = None
    blocked_reason: str | None = None
    preferences_note: str | None = None
    snacks_note: str | None = None
    lifestyle_note: str | None = None

    @model_validator(mode="before")
    @classmethod
    def check_at_least_one_field(cls, data: Any) -> Any:
        if isinstance(data, dict):
            has_value = any(data.get(f) is not None for f in _ALL_FIELDS)
            if not has_value:
                raise ValueError("At least one field must be provided")
        return data
