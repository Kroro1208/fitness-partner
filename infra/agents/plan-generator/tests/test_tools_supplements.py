from fitness_contracts.models.fitness_engine.supplement import SupplementInput
from plan_generator.tools.supplements import recommend_supplements


def test_no_whey_when_gap_zero():
    r = recommend_supplements(
        SupplementInput(protein_gap_g=0, workouts_per_week=3, sleep_hours=7, fish_per_week=2)
    )
    assert "whey" not in {item.name for item in r.items}


def test_whey_when_gap_over_20():
    """engine 契約確認 (Plan 09+ で gap 動的計算に戻したとき用)。"""
    r = recommend_supplements(
        SupplementInput(protein_gap_g=25, workouts_per_week=4, sleep_hours=6, fish_per_week=1)
    )
    assert "whey" in {item.name for item in r.items}


def test_supplements_accept_plain_dict_input():
    r = recommend_supplements(
        {
            "protein_gap_g": 0,
            "workouts_per_week": 3,
            "sleep_hours": 7,
            "fish_per_week": 2,
        }
    )
    assert "whey" not in {item.name for item in r.items}
