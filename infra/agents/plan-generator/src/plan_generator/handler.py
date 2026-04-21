"""AgentCore Runtime entrypoint。

Agent を呼び出した結果は `AgentResult` オブジェクト。`.structured_output` に
GeneratedWeeklyPlan (BaseModel) が入っている (strands-agents 1.x API)。
"""

import json
import logging
from typing import Any

from fitness_contracts.models.plan.agent_io import SafeAgentInput, SafePromptProfile
from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan

from plan_generator.agent import build_agent

logger = logging.getLogger("plan-generator")
logger.setLevel(logging.INFO)

_AGENT = None


def _get_agent():
    global _AGENT
    if _AGENT is None:
        _AGENT = build_agent()
    return _AGENT


def handler(event: dict[str, Any], _context: Any = None) -> dict[str, Any]:
    """Event: {user_id, week_start, safe_prompt_profile, safe_agent_input}
    Returns: {"generated_weekly_plan": GeneratedWeeklyPlan JSON}"""
    try:
        prompt = SafePromptProfile.model_validate(event["safe_prompt_profile"])
        agent_input = SafeAgentInput.model_validate(event["safe_agent_input"])
        week_start = event["week_start"]
    except Exception as exc:
        logger.error("invalid_event_shape: %s", type(exc).__name__)
        raise ValueError("invalid event shape") from exc

    user_message = json.dumps(
        {
            "week_start": week_start,
            "safe_prompt_profile": prompt.model_dump(),
            "safe_agent_input": agent_input.model_dump(),
        },
        ensure_ascii=False,
    )

    result = _get_agent()(user_message)
    generated = _extract_generated_plan(result)
    return {"generated_weekly_plan": generated.model_dump()}


def _extract_generated_plan(result: Any) -> GeneratedWeeklyPlan:
    """Agent の戻りから GeneratedWeeklyPlan を取り出す。

    - 本物の strands Agent は AgentResult を返し、`.structured_output` に BaseModel。
    - テストで Agent を MagicMock(return_value=GeneratedWeeklyPlan(...)) した場合は
      そのまま GeneratedWeeklyPlan が来る。両方を許容する。
    """
    if isinstance(result, GeneratedWeeklyPlan):
        return result
    structured = getattr(result, "structured_output", None)
    if isinstance(structured, GeneratedWeeklyPlan):
        return structured
    raise ValueError("agent did not return a GeneratedWeeklyPlan")
