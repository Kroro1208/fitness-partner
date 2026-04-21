"""Strands Agent (structured_output_model=GeneratedWeeklyPlan)。

strands-agents 1.x の公式 API に合わせている:
- `structured_output_model` (Plan の記述では `output_schema` になっていたが、実 API は
  `structured_output_model`)。
- `BedrockModel` は `region_name` で region 指定、`model_id` は kwargs 経由。
"""

from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from strands import Agent
from strands.models import BedrockModel

from plan_generator.prompts.system import build_system_prompt
from plan_generator.tools.calorie_macro import calculate_calories_macros
from plan_generator.tools.get_food_by_id import get_food_by_id
from plan_generator.tools.hydration import calculate_hydration
from plan_generator.tools.supplements import recommend_supplements


def build_agent() -> Agent:
    return Agent(
        model=BedrockModel(
            model_id="anthropic.claude-sonnet-4-20250514-v1:0",
            region_name="us-west-2",
        ),
        system_prompt=build_system_prompt(),
        tools=[
            calculate_calories_macros,
            calculate_hydration,
            recommend_supplements,
            get_food_by_id,
        ],
        structured_output_model=GeneratedWeeklyPlan,
    )
