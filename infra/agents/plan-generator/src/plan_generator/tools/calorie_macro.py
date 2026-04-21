from fitness_contracts.models.fitness_engine.calorie_macro import CalorieMacroResult
from fitness_contracts.models.fitness_engine.calorie_macro_input import CalorieMacroInput
from fitness_engine.calorie_macro import calculate_calories_and_macros
from strands import tool


@tool
def calculate_calories_macros(input: CalorieMacroInput) -> CalorieMacroResult:
    """Calculate BMR / TDEE / target calories / macros from profile inputs."""
    return calculate_calories_and_macros(input)
