from fitness_contracts.models.fitness_engine.hydration import HydrationInput, HydrationResult
from fitness_engine.hydration import calculate_hydration_target
from strands import tool


@tool
def calculate_hydration(input: HydrationInput) -> HydrationResult:
    """Calculate hydration target (liters/day) from weight and activity."""
    normalized = HydrationInput.model_validate(input)
    return calculate_hydration_target(normalized)
