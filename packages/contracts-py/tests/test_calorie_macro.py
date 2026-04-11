"""CalorieMacroResult モデルのテスト。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.calorie_macro import CalorieMacroResult


def test_valid_calorie_macro_result():
    """妥当な値で正しくインスタンス化できること。"""
    result = CalorieMacroResult(
        bmr=1500,
        activity_multiplier=1.55,
        tdee=2325,
        target_calories=1825,
        protein_g=140,
        fat_g=60,
        carbs_g=180,
        explanation=["BMR via Mifflin-St Jeor", "TDEE = BMR * 1.55"],
    )
    assert result.bmr == 1500
    assert result.activity_multiplier == 1.55
    assert result.tdee == 2325
    assert result.target_calories == 1825
    assert len(result.explanation) == 2


def test_negative_bmr_rejected():
    """BMR が負の値なら拒否されること。"""
    with pytest.raises(ValidationError) as exc_info:
        CalorieMacroResult(
            bmr=-100,
            activity_multiplier=1.2,
            tdee=2000,
            target_calories=1500,
            protein_g=100,
            fat_g=50,
            carbs_g=200,
        )
    assert "bmr" in str(exc_info.value).lower()


def test_activity_multiplier_out_of_range_rejected():
    """activity_multiplier が範囲外 (>2.0) なら拒否されること。"""
    with pytest.raises(ValidationError):
        CalorieMacroResult(
            bmr=1500,
            activity_multiplier=3.0,
            tdee=2000,
            target_calories=1500,
            protein_g=100,
            fat_g=50,
            carbs_g=200,
        )


def test_explanation_defaults_to_empty_list():
    """explanation は未指定時は空リストになること。"""
    result = CalorieMacroResult(
        bmr=1500,
        activity_multiplier=1.2,
        tdee=1800,
        target_calories=1500,
        protein_g=100,
        fat_g=50,
        carbs_g=180,
    )
    assert result.explanation == []


def test_model_json_schema_is_emitted():
    """model_json_schema() が必須フィールドを含む JSON Schema を返すこと。"""
    schema = CalorieMacroResult.model_json_schema()
    assert schema["type"] == "object"
    assert "bmr" in schema["properties"]
    assert "activity_multiplier" in schema["properties"]
    assert "explanation" in schema["properties"]
    assert set(schema["required"]) >= {
        "bmr",
        "activity_multiplier",
        "tdee",
        "target_calories",
        "protein_g",
        "fat_g",
        "carbs_g",
    }
