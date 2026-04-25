"""Strands Agent (structured_output_model=GeneratedWeeklyPlan / GeneratedMealSwapCandidates)."""

import logging
import os

from fitness_contracts.models.plan.generated_meal_swap import (
    GeneratedMealSwapCandidates,
)
from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from strands import Agent
from strands.models import BedrockModel

from plan_generator.prompts.system import build_system_prompt
from plan_generator.prompts.system_swap import build_swap_system_prompt
from plan_generator.tools.calorie_macro import calculate_calories_macros
from plan_generator.tools.get_food_by_id import get_food_by_id
from plan_generator.tools.hydration import calculate_hydration
from plan_generator.tools.supplements import recommend_supplements

# Bedrock 経由は Sonnet 系のみを使う。Claude Haiku 4.5 (Amazon Bedrock Edition)
# は使わない (ユーザー指示: 2026-04-24)。環境変数 PLAN_GENERATOR_MODEL_ID で
# 上書き可能だが、Bedrock Haiku を指定しないこと。
DEFAULT_MODEL_ID = "global.anthropic.claude-sonnet-4-6"
logger = logging.getLogger("plan-generator")
STRUCTURED_OUTPUT_PROMPT = (
    "Return only one valid GeneratedWeeklyPlan JSON object. "
    "Do not include prose, explanations, markdown, or narration."
)
SWAP_STRUCTURED_OUTPUT_PROMPT = (
    "Return only one valid GeneratedMealSwapCandidates JSON object with "
    "exactly 3 Meal candidates. Do not include prose, explanations, "
    "markdown, or narration."
)


def build_agent() -> Agent:
    return build_agent_for_runtime(enable_tools=True)


def build_agent_for_runtime(*, enable_tools: bool) -> Agent:
    model_id = os.environ.get("PLAN_GENERATOR_MODEL_ID", DEFAULT_MODEL_ID)
    logger.info("building_plan_generator_agent model_id=%s", model_id)
    return Agent(
        model=BedrockModel(
            model_id=model_id,
            region_name="us-west-2",
            streaming=False,
        ),
        system_prompt=build_system_prompt(enable_tools=enable_tools),
        structured_output_prompt=STRUCTURED_OUTPUT_PROMPT,
        callback_handler=None,
        tools=(
            [
                calculate_calories_macros,
                calculate_hydration,
                recommend_supplements,
                get_food_by_id,
            ]
            if enable_tools
            else []
        ),
        structured_output_model=GeneratedWeeklyPlan,
    )


def build_swap_agent() -> Agent:
    """Plan 09: Meal swap 候補 3 件生成用の Strands Agent。

    既存 4 tools を再利用し、``structured_output_model`` を
    ``GeneratedMealSwapCandidates`` に差し替える。tool は有効化する
    (meal 1 食分の小規模生成なのでレイテンシ許容、``get_food_by_id`` で
    食品カタログの正確なマクロを引く価値がある)。
    """
    model_id = os.environ.get("PLAN_GENERATOR_MODEL_ID", DEFAULT_MODEL_ID)
    logger.info("building_swap_meal_agent model_id=%s", model_id)
    return Agent(
        model=BedrockModel(
            model_id=model_id,
            region_name="us-west-2",
            streaming=False,
        ),
        system_prompt=build_swap_system_prompt(),
        structured_output_prompt=SWAP_STRUCTURED_OUTPUT_PROMPT,
        callback_handler=None,
        tools=[
            calculate_calories_macros,
            calculate_hydration,
            recommend_supplements,
            get_food_by_id,
        ],
        structured_output_model=GeneratedMealSwapCandidates,
    )
