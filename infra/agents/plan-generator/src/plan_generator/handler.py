"""AgentCore Runtime entrypoint.

HTTP runtime contract:
- GET /ping
- POST /invocations

Event dispatch:
- action (absent) | action="generate_plan" → Plan 08 の weekly plan 生成
- action="swap_candidates" → Plan 09 の meal swap 候補 3 件生成
"""

import json
import logging
from typing import Any

from fastapi import FastAPI, HTTPException
from fitness_contracts.models.plan.agent_io import SafeAgentInput, SafePromptProfile
from fitness_contracts.models.plan.generated_meal_swap import (
    GeneratedMealSwapCandidates,
)
from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from fitness_contracts.models.plan.meal_swap_context import MealSwapContext

from plan_generator.agent import build_agent_for_runtime, build_swap_agent
from plan_generator.prompts.food_hints import FOOD_HINTS
from plan_generator.tools.calorie_macro import calculate_calories_macros
from plan_generator.tools.get_food_by_id import get_food_by_id
from plan_generator.tools.hydration import calculate_hydration
from plan_generator.tools.supplements import recommend_supplements

logger = logging.getLogger("plan-generator")
logger.setLevel(logging.INFO)

app = FastAPI()
_AGENT = None
_SWAP_AGENT = None


def build_agent():
    return build_agent_for_runtime(enable_tools=False)


def _get_agent():
    global _AGENT
    if _AGENT is None:
        _AGENT = build_agent()
    return _AGENT


def _get_swap_agent():
    global _SWAP_AGENT
    if _SWAP_AGENT is None:
        _SWAP_AGENT = build_swap_agent()
    return _SWAP_AGENT


def _generate_weekly_plan(user_message: str) -> GeneratedWeeklyPlan:
    result = _get_agent()(user_message)
    generated = getattr(result, "structured_output", result)
    if isinstance(generated, GeneratedWeeklyPlan):
        return generated
    return GeneratedWeeklyPlan.model_validate(generated)


def _generate_swap_candidates(user_message: str) -> GeneratedMealSwapCandidates:
    result = _get_swap_agent()(user_message)
    generated = getattr(result, "structured_output", result)
    if isinstance(generated, GeneratedMealSwapCandidates):
        return generated
    return GeneratedMealSwapCandidates.model_validate(generated)


def _build_generation_message(
    *,
    week_start: str,
    prompt: SafePromptProfile,
    agent_input: SafeAgentInput,
) -> str:
    referenced_foods = [
        food.model_dump()
        for food in (
            get_food_by_id({"food_id": hint["food_id"]})
            for hint in FOOD_HINTS[:3]
        )
        if food is not None
    ]
    deterministic_results = {
        "calorie_macro_result": calculate_calories_macros(
            agent_input.calorie_macro_input
        ).model_dump(),
        "hydration_result": calculate_hydration(
            agent_input.hydration_input
        ).model_dump(),
        "supplement_result": recommend_supplements(
            agent_input.supplement_input
        ).model_dump(),
    }
    return json.dumps(
        {
            "week_start": week_start,
            "safe_prompt_profile": prompt.model_dump(),
            "safe_agent_input": agent_input.model_dump(),
            "deterministic_results": deterministic_results,
            "referenced_foods": referenced_foods,
        },
        ensure_ascii=False,
    )


def handler(event: dict[str, Any], _context: Any = None) -> dict[str, Any]:
    """Dispatch by ``action``.

    - ``action`` absent or ``"generate_plan"`` → Plan 08 weekly plan 生成
      Event: {user_id, week_start, safe_prompt_profile, safe_agent_input}
    - ``action == "swap_candidates"`` → Plan 09 meal swap 候補生成
      Event: {action, swap_context: {safe_prompt_profile, target_meal, daily_context}}
    """
    action = event.get("action", "generate_plan")
    if action == "generate_plan":
        return handle_generate_plan(event)
    if action == "swap_candidates":
        return handle_swap_candidates(event)
    raise ValueError(f"unknown action: {action!r}")


def handle_generate_plan(event: dict[str, Any]) -> dict[str, Any]:
    """Plan 08 既存フロー: weekly plan 生成 (structured_output=GeneratedWeeklyPlan)。"""
    try:
        prompt = SafePromptProfile.model_validate(event["safe_prompt_profile"])
        agent_input = SafeAgentInput.model_validate(event["safe_agent_input"])
        week_start = event["week_start"]
    except Exception as exc:
        logger.error("invalid_event_shape: %s", type(exc).__name__)
        raise ValueError("invalid event shape") from exc

    user_message = _build_generation_message(
        week_start=week_start,
        prompt=prompt,
        agent_input=agent_input,
    )
    generated = _generate_weekly_plan(user_message)
    return {"generated_weekly_plan": generated.model_dump()}


def handle_swap_candidates(event: dict[str, Any]) -> dict[str, Any]:
    """Plan 09: meal swap 候補 3 件を LLM に生成させる。

    ``swap_context`` に ``safe_prompt_profile`` / ``target_meal`` / ``daily_context``
    を含む前提。medical_*_note は adapter 側で既に除去済み。
    """
    try:
        ctx = MealSwapContext.model_validate(event["swap_context"])
    except Exception as exc:
        logger.error("invalid_swap_context: %s", type(exc).__name__)
        raise ValueError("invalid swap_context") from exc

    user_message = json.dumps(
        {
            "safe_prompt_profile": ctx.safe_prompt_profile.model_dump(),
            "target_meal": ctx.target_meal.model_dump(),
            "daily_context": ctx.daily_context.model_dump(),
        },
        ensure_ascii=False,
    )
    generated = _generate_swap_candidates(user_message)
    return {"generated_candidates": generated.model_dump()}


@app.get("/ping")
def ping() -> dict[str, str]:
    return {"status": "Healthy"}


@app.post("/invocations")
def invoke(event: dict[str, Any]) -> dict[str, Any]:
    try:
        return handler(event)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
