"""calorie_macro モジュールのテスト (Mifflin-St Jeor)。"""

import pytest

from fitness_engine.calorie_macro import calculate_bmr


@pytest.mark.parametrize(
    ("sex", "age", "height_cm", "weight_kg", "expected"),
    [
        # Mifflin-St Jeor 公式の既知値 (手計算確認済み)
        # 男性 30歳 170cm 70kg: 10*70 + 6.25*170 - 5*30 + 5 = 700+1062.5-150+5 = 1617.5 → round 1618
        ("male", 30, 170.0, 70.0, 1618),
        # 女性 30歳 160cm 55kg: 10*55 + 6.25*160 - 5*30 - 161 = 550+1000-150-161 = 1239
        ("female", 30, 160.0, 55.0, 1239),
        # 男性 25歳 180cm 80kg: 800+1125-125+5 = 1805
        ("male", 25, 180.0, 80.0, 1805),
        # 女性 45歳 155cm 50kg: 500+968.75-225-161 = 1082.75 → round 1083
        ("female", 45, 155.0, 50.0, 1083),
    ],
)
def test_calculate_bmr_mifflin_st_jeor(
    sex: str, age: int, height_cm: float, weight_kg: float, expected: int
):
    result = calculate_bmr(
        sex=sex, age=age, height_cm=height_cm, weight_kg=weight_kg
    )
    assert result == expected


def test_calculate_bmr_rejects_unknown_sex():
    """sex が male/female 以外なら ValueError。エラーメッセージ文言には依存しない。"""
    with pytest.raises(ValueError):
        calculate_bmr(sex="other", age=30, height_cm=170.0, weight_kg=70.0)
