"""CalorieMacroResult モデルのテスト。"""

import pytest
from pydantic import ValidationError

from fitness_contracts.models.fitness_engine.calorie_macro import CalorieMacroResult


def _valid_payload(**overrides: object) -> dict[str, object]:
    """基本ペイロードのファクトリ。境界値テスト用に一部フィールドだけ上書きできる。"""
    base: dict[str, object] = {
        "bmr": 1500,
        "activity_multiplier": 1.55,
        "tdee": 2325,
        "target_calories": 1825,
        "protein_g": 140,
        "fat_g": 60,
        "carbs_g": 180,
    }
    base.update(overrides)
    return base


def test_valid_calorie_macro_result():
    """妥当な値で正しくインスタンス化できること。"""
    result = CalorieMacroResult(
        **_valid_payload(),
        explanation=["BMR via Mifflin-St Jeor", "TDEE = BMR * 1.55"],
    )
    assert result.bmr == 1500
    assert result.activity_multiplier == 1.55
    assert result.tdee == 2325
    assert result.target_calories == 1825
    assert len(result.explanation) == 2


@pytest.mark.parametrize(
    ("field", "bad_value"),
    [
        # 入力値の異常: 数値フィールドの負値
        ("bmr", -1),
        ("tdee", -1),
        ("target_calories", -1),
        ("protein_g", -1),
        ("fat_g", -1),
        ("carbs_g", -1),
        # 入力値の異常: activity_multiplier の境界超過 (両端)
        ("activity_multiplier", 0.99),  # 下限 1.0 未満
        ("activity_multiplier", 2.01),  # 上限 2.0 超過
    ],
)
def test_rejects_out_of_range(field: str, bad_value: object):
    """範囲外の値は ValidationError で該当フィールドに紐付いたエラーになること。

    `exc_info.value.errors()` の構造化 API を使うことで、Pydantic のエラー
    メッセージ文字列フォーマットに依存しない振る舞い検証にする。
    """
    payload = _valid_payload(**{field: bad_value})
    with pytest.raises(ValidationError) as exc_info:
        CalorieMacroResult(**payload)

    error_locs = {err["loc"] for err in exc_info.value.errors()}
    assert (field,) in error_locs, (
        f"ValidationError は {field} フィールドに紐付くべきだが、"
        f"実際の loc は {error_locs}"
    )


def test_explanation_defaults_to_empty_list():
    """explanation は未指定時は空リストになること。"""
    result = CalorieMacroResult(**_valid_payload())
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
