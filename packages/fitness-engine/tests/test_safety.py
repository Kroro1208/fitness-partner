"""Safety Guard のテスト (block / caution / safe の分類ルール)。"""

import pytest

from fitness_contracts.models.safety import SafetyInput, SafetyResult

from fitness_engine.safety import evaluate_safety


def _input(**overrides) -> SafetyInput:
    base = dict(
        age=30,
        weight_kg=65.0,
        height_cm=170.0,
        desired_pace="steady",
        sleep_hours=7.5,
        stress_level="moderate",
        alcohol_per_week=2,
        pregnancy_or_breastfeeding=False,
        eating_disorder_history=False,
        medical_conditions=[],
    )
    base.update(overrides)
    return SafetyInput(**base)


# ---- block 条件 ----


@pytest.mark.parametrize(
    "overrides",
    [
        {"age": 17},
        {"age": 15},
        {"pregnancy_or_breastfeeding": True},
        {"eating_disorder_history": True},
        {"medical_conditions": ["diabetes_insulin"]},
        {"medical_conditions": ["severe_kidney"]},
        {"medical_conditions": ["severe_hypertension"]},
        {"medical_conditions": ["heart_condition_acute"]},
    ],
)
def test_block_cases(overrides: dict):
    result = evaluate_safety(_input(**overrides))
    assert isinstance(result, SafetyResult)
    assert result.level == "blocked"
    assert result.allowed_to_generate_plan is False
    assert result.response_mode == "medical_redirect"
    assert len(result.reasons) >= 1


def test_block_bmi_extreme_low():
    """weight 40kg / height 170cm → BMI 13.84 (<17.0) → block。"""
    result = evaluate_safety(_input(weight_kg=40.0, height_cm=170.0))
    assert result.level == "blocked"
    assert result.allowed_to_generate_plan is False


def test_adult_boundary_not_blocked():
    """18 歳ちょうどは block されない (境界値)。"""
    result = evaluate_safety(_input(age=18))
    assert result.level != "blocked"


@pytest.mark.parametrize(
    ("weight_kg", "height_cm", "expected_level"),
    [
        # BMI ~16.6 (48.0 / 2.89) → blocked (< 17.0 で余裕)
        (48.0, 170.0, "blocked"),
        # BMI ~17.6 (51.0 / 2.89) → caution (17.0 側の内側、余裕あり)
        (51.0, 170.0, "caution"),
        # BMI ~19.7 (57.0 / 2.89) → caution (20.0 側の内側、余裕あり)
        (57.0, 170.0, "caution"),
        # BMI ~20.8 (60.0 / 2.89) → safe (>= 20.0 で余裕)
        (60.0, 170.0, "safe"),
    ],
)
def test_safety_bmi_ranges(
    weight_kg: float, height_cm: float, expected_level: str
):
    """BMI の block/caution/safe 判定を各レンジで検証する。

    浮動小数演算の誤差を避けるため境界から 0.3 以上離れた値を使用する。
    厳密な境界 (BMI = 17.0 / 20.0 ちょうど) は float の丸め誤差で結果が
    揺れうるので、明瞭なレンジ内テストに限定する。
    """
    result = evaluate_safety(
        _input(weight_kg=weight_kg, height_cm=height_cm)
    )
    assert result.level == expected_level


# ---- caution 条件 ----


def test_caution_sleep_deprived_and_stressed():
    result = evaluate_safety(
        _input(sleep_hours=5.0, stress_level="high")
    )
    assert result.level == "caution"
    assert result.allowed_to_generate_plan is True
    assert result.response_mode == "limited"


def test_caution_high_alcohol():
    result = evaluate_safety(_input(alcohol_per_week=15))
    assert result.level == "caution"


def test_caution_aggressive_pace():
    """architecture.md 15.2「早すぎる減量希望」は caution 扱い。"""
    result = evaluate_safety(_input(desired_pace="aggressive"))
    assert result.level == "caution"
    assert result.allowed_to_generate_plan is True


def test_caution_bmi_17_to_19():
    # weight 50kg / height 170cm → BMI 17.30
    result = evaluate_safety(
        _input(weight_kg=50.0, height_cm=170.0, desired_pace="steady")
    )
    assert result.level == "caution"


# ---- safe 条件 ----


def test_safe_normal_case():
    result = evaluate_safety(_input())
    assert result.level == "safe"
    assert result.allowed_to_generate_plan is True
    assert result.response_mode == "normal"
    assert result.reasons == []


# ---- block が caution より優先されること ----


def test_block_takes_precedence_over_caution():
    result = evaluate_safety(
        _input(
            pregnancy_or_breastfeeding=True,
            sleep_hours=4.0,  # caution 条件も同時に満たす
            stress_level="high",
        )
    )
    assert result.level == "blocked"
