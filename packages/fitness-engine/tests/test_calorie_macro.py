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


from fitness_engine.calorie_macro import ACTIVITY_MULTIPLIERS, calculate_tdee


def test_activity_multipliers_match_spec():
    assert ACTIVITY_MULTIPLIERS == {
        "sedentary": 1.2,
        "lightly_active": 1.375,
        "moderately_active": 1.55,
        "very_active": 1.725,
        "extremely_active": 1.9,
    }


@pytest.mark.parametrize(
    ("bmr", "activity_level", "expected"),
    [
        (1500, "sedentary", 1800),  # 1500 * 1.2 = 1800
        # Note: Python 3 の round() は banker's rounding (偶数丸め) を使うため
        # 1500 * 1.375 = 2062.5 は 2062 になる (2062 が偶数)
        (1500, "lightly_active", 2062),
        (1618, "moderately_active", 2508),  # 1618 * 1.55 = 2507.9 → 2508
        (2000, "very_active", 3450),  # 2000 * 1.725 = 3450
        (2000, "extremely_active", 3800),
    ],
)
def test_calculate_tdee(bmr: int, activity_level: str, expected: int):
    assert calculate_tdee(bmr=bmr, activity_level=activity_level) == expected


def test_calculate_tdee_rejects_unknown_level():
    """未知の activity_level は ValueError。メッセージ文言には依存しない。"""
    with pytest.raises(ValueError):
        calculate_tdee(bmr=1500, activity_level="super_active")


from fitness_engine.calorie_macro import calculate_target_calories


@pytest.mark.parametrize(
    ("tdee", "bmr", "activity_level", "sleep_hours", "stress_level", "bmi", "expected"),
    [
        # 通常条件: TDEE - 400
        (2500, 1600, "moderately_active", 7.5, "moderate", 22.0, 2100),
        # 高活動: TDEE - 500 (very_active 以上)
        (3000, 1800, "very_active", 8.0, "low", 23.0, 2500),
        # caution (睡眠不足+高ストレス): TDEE - 300
        (2500, 1600, "moderately_active", 5.5, "high", 22.0, 2200),
        # caution (低体重 BMI<20): TDEE - 300
        (2200, 1500, "lightly_active", 8.0, "low", 19.0, 1900),
        # guard: BMR*1.1 を下回らない
        # BMR=1500, BMR*1.1=1650, TDEE=1800, TDEE-400=1400 → guard で 1650
        (1800, 1500, "sedentary", 8.0, "moderate", 22.0, 1650),
    ],
)
def test_calculate_target_calories(
    tdee: int,
    bmr: int,
    activity_level: str,
    sleep_hours: float,
    stress_level: str,
    bmi: float,
    expected: int,
):
    result = calculate_target_calories(
        tdee=tdee,
        bmr=bmr,
        activity_level=activity_level,
        sleep_hours=sleep_hours,
        stress_level=stress_level,
        bmi=bmi,
    )
    assert result == expected
