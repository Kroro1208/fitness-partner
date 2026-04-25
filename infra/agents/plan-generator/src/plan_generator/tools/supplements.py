from fitness_contracts.models.fitness_engine.supplement import (
    SupplementInput,
    SupplementRecommendationList,
)
from fitness_engine.supplements import recommend_supplements as _engine_recommend
from strands import tool


@tool
def recommend_supplements(input: SupplementInput) -> SupplementRecommendationList:
    """Recommend supplements based on protein gap, workouts, sleep, and fish intake."""
    normalized = SupplementInput.model_validate(input)
    return _engine_recommend(normalized)
