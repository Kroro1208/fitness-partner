from fitness_contracts.models.fitness_engine.calorie_macro_input import CalorieMacroInput
from plan_generator.tools.calorie_macro import calculate_calories_macros


def test_returns_calorie_macro_result():
    input_ = CalorieMacroInput(
        age=30,
        sex="male",
        height_cm=170,
        weight_kg=70,
        activity_level="moderately_active",
        sleep_hours=7,
        stress_level="low",
    )
    r = calculate_calories_macros(input_)
    assert r.bmr == 1618
    assert r.activity_multiplier == 1.55


def test_accepts_plain_dict_input():
    r = calculate_calories_macros(
        {
            "age": 30,
            "sex": "male",
            "height_cm": 170,
            "weight_kg": 70,
            "activity_level": "moderately_active",
            "sleep_hours": 7,
            "stress_level": "low",
        }
    )
    assert r.bmr == 1618
    assert r.activity_multiplier == 1.55
