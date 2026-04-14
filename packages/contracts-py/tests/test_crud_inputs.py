"""CRUD Lambda 入力 DTO のテスト。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.update_user_profile_input import (
    UpdateUserProfileInput,
)
from fitness_contracts.models.log_meal_input import LogMealInput
from fitness_contracts.models.log_weight_input import LogWeightInput


# ── UpdateUserProfileInput ───────────────────────────────────────────


class TestUpdateUserProfileInput:
    """UpdateUserProfileInput のバリデーションテスト。"""

    def test_valid_single_field(self):
        """1 フィールドだけで有効。"""
        result = UpdateUserProfileInput(name="太郎")
        assert result.name == "太郎"
        assert result.age is None

    def test_valid_multiple_fields(self):
        """複数フィールド同時更新。"""
        result = UpdateUserProfileInput(name="太郎", age=30, sex="male")
        assert result.name == "太郎"
        assert result.age == 30
        assert result.sex == "male"

    def test_rejects_empty_dict(self):
        """空 {} は ValidationError。"""
        with pytest.raises(ValidationError) as exc_info:
            UpdateUserProfileInput()
        errors = exc_info.value.errors()
        assert any("at least one field" in str(e["msg"]).lower() for e in errors)

    def test_rejects_all_none(self):
        """全フィールド None も ValidationError。"""
        with pytest.raises(ValidationError):
            UpdateUserProfileInput(
                name=None, age=None, sex=None, height_cm=None,
                weight_kg=None, activity_level=None, desired_pace=None,
                sleep_hours=None, stress_level=None,
            )

    @pytest.mark.parametrize(
        ("field", "bad_value", "expected_loc"),
        [
            ("age", 17, ("age",)),         # ge=18
            ("age", 121, ("age",)),        # le=120
            ("height_cm", 0, ("height_cm",)),    # gt=0
            ("height_cm", 300, ("height_cm",)),  # lt=300
            ("weight_kg", 0, ("weight_kg",)),    # gt=0
            ("weight_kg", 500, ("weight_kg",)),  # lt=500
            ("sleep_hours", -1, ("sleep_hours",)),  # ge=0
            ("sleep_hours", 25, ("sleep_hours",)),  # le=24
            ("sex", "other", ("sex",)),
            ("activity_level", "invalid", ("activity_level",)),
            ("desired_pace", "slow", ("desired_pace",)),
            ("stress_level", "extreme", ("stress_level",)),
        ],
    )
    def test_rejects_out_of_range(
        self, field: str, bad_value: object, expected_loc: tuple[str, ...]
    ):
        """境界値・不正値は ValidationError で該当フィールドに紐付く。"""
        with pytest.raises(ValidationError) as exc_info:
            UpdateUserProfileInput(**{field: bad_value})
        error_locs = {e["loc"] for e in exc_info.value.errors()}
        assert expected_loc in error_locs

    def test_unknown_fields_ignored(self):
        """未知のフィールドは無視される。"""
        result = UpdateUserProfileInput(name="太郎", unknown_field="value")
        assert result.name == "太郎"

    def test_json_schema_fields_are_optional(self):
        """JSON Schema で全フィールドが optional (required リストなし)。"""
        schema = UpdateUserProfileInput.model_json_schema()
        # model_validator で at-least-one を強制するが、
        # JSON Schema 上は required なし (全 optional)
        required = schema.get("required", [])
        assert len(required) == 0


# ── LogMealInput ─────────────────────────────────────────────────────


class TestLogMealInput:
    """LogMealInput のバリデーションテスト。"""

    def test_valid(self):
        result = LogMealInput(
            date="2026-04-13",
            food_id="01001",
            amount_g=150.0,
            meal_type="breakfast",
        )
        from datetime import date as date_type
        assert result.date == date_type(2026, 4, 13)
        assert result.food_id == "01001"
        assert result.amount_g == 150.0
        assert result.meal_type == "breakfast"

    @pytest.mark.parametrize(
        ("field", "bad_value", "expected_loc"),
        [
            ("date", "2026-4-13", ("date",)),       # 不正フォーマット
            ("date", "20260413", ("date",)),         # ハイフンなし
            ("date", "", ("date",)),                 # 空文字
            ("date", "2026-99-01", ("date",)),       # 不存在月
            ("date", "2026-02-30", ("date",)),       # 不存在日
            ("food_id", "", ("food_id",)),           # 空文字 (min_length=1)
            ("amount_g", 0, ("amount_g",)),          # gt=0
            ("amount_g", -1, ("amount_g",)),         # 負数
            ("meal_type", "brunch", ("meal_type",)), # 不正値
        ],
    )
    def test_rejects_invalid(
        self, field: str, bad_value: object, expected_loc: tuple[str, ...]
    ):
        base = {
            "date": "2026-04-13",
            "food_id": "01001",
            "amount_g": 150.0,
            "meal_type": "breakfast",
        }
        base[field] = bad_value
        with pytest.raises(ValidationError) as exc_info:
            LogMealInput(**base)
        error_locs = {e["loc"] for e in exc_info.value.errors()}
        assert expected_loc in error_locs


# ── LogWeightInput ───────────────────────────────────────────────────


class TestLogWeightInput:
    """LogWeightInput のバリデーションテスト。"""

    def test_valid(self):
        from datetime import date as date_type
        result = LogWeightInput(date="2026-04-13", weight_kg=70.5)
        assert result.date == date_type(2026, 4, 13)
        assert result.weight_kg == 70.5

    @pytest.mark.parametrize(
        ("field", "bad_value", "expected_loc"),
        [
            ("date", "2026/04/13", ("date",)),   # 不正フォーマット
            ("date", "2026-99-01", ("date",)),   # 不存在月
            ("weight_kg", 0, ("weight_kg",)),    # gt=0
            ("weight_kg", 500, ("weight_kg",)),  # lt=500
            ("weight_kg", -1, ("weight_kg",)),   # 負数
        ],
    )
    def test_rejects_invalid(
        self, field: str, bad_value: object, expected_loc: tuple[str, ...]
    ):
        base = {"date": "2026-04-13", "weight_kg": 70.5}
        base[field] = bad_value
        with pytest.raises(ValidationError) as exc_info:
            LogWeightInput(**base)
        error_locs = {e["loc"] for e in exc_info.value.errors()}
        assert expected_loc in error_locs
