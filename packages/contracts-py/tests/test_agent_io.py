import pytest
from pydantic import ValidationError

from fitness_contracts.models.fitness_engine.calorie_macro_input import CalorieMacroInput
from fitness_contracts.models.fitness_engine.hydration import HydrationInput
from fitness_contracts.models.fitness_engine.supplement import SupplementInput
from fitness_contracts.models.plan.agent_io import SafeAgentInput, SafePromptProfile


def test_minimum_valid():
    p = SafePromptProfile(age=30, sex="male", height_cm=170, weight_kg=65)
    assert p.avoid_alcohol is False


def test_age_lower_bound():
    with pytest.raises(ValidationError):
        SafePromptProfile(age=17, sex="male", height_cm=170, weight_kg=65)


def test_safe_agent_input_composition():
    si = SafeAgentInput(
        calorie_macro_input=CalorieMacroInput(
            age=30, sex="male", height_cm=170, weight_kg=65,
            activity_level="moderately_active", sleep_hours=7, stress_level="low"),
        hydration_input=HydrationInput(
            weight_kg=65, workouts_per_week=3, avg_workout_minutes=45, job_type="desk"),
        supplement_input=SupplementInput(
            protein_gap_g=0, workouts_per_week=3, sleep_hours=7, fish_per_week=2),
    )
    assert si.supplement_input.protein_gap_g == 0
