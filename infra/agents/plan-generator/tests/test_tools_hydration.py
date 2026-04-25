from fitness_contracts.models.fitness_engine.hydration import HydrationInput
from plan_generator.tools.hydration import calculate_hydration


def test_hydration_target():
    r = calculate_hydration(
        HydrationInput(
            weight_kg=70, workouts_per_week=3, avg_workout_minutes=45, job_type="desk"
        )
    )
    assert 2.4 <= r.target_liters <= 3.0


def test_hydration_accepts_plain_dict_input():
    r = calculate_hydration(
        {
            "weight_kg": 70,
            "workouts_per_week": 3,
            "avg_workout_minutes": 45,
            "job_type": "desk",
        }
    )
    assert 2.4 <= r.target_liters <= 3.0
