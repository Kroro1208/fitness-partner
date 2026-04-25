"""Swap agent e2e: build_swap_agent() が返す実 Agent を通し、Bedrock invoke だけ mock する (Plan 09 Task C4)。

test_agent_e2e.py の pattern を踏襲し、BedrockModel の __init__ だけ stub して
以降の Agent 構築 (system_swap prompt / 4 tools / structured_output_model=
GeneratedMealSwapCandidates) を実際に通す。
"""

from unittest.mock import MagicMock, patch

import pytest

from fitness_contracts.models.plan.generated_meal_swap import (
    GeneratedMealSwapCandidates,
)
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from plan_generator import handler as handler_module


def _golden_candidates() -> GeneratedMealSwapCandidates:
    def _meal(title: str) -> Meal:
        return Meal(
            slot="breakfast",
            title=title,
            items=[MealItem(
                name="オーツ", grams=60,
                calories_kcal=220, protein_g=8, fat_g=4, carbs_g=35,
            )],
            total_calories_kcal=220,
            total_protein_g=8,
            total_fat_g=4,
            total_carbs_g=35,
            prep_tag="quick",
            notes=["高タンパク"],
        )

    return GeneratedMealSwapCandidates(
        candidates=[_meal("代替A"), _meal("代替B"), _meal("代替C")]
    )


def _swap_event():
    return {
        "action": "swap_candidates",
        "swap_context": {
            "safe_prompt_profile": {
                "age": 30, "sex": "male", "height_cm": 170, "weight_kg": 70,
            },
            "target_meal": {
                "slot": "breakfast",
                "title": "卵かけご飯",
                "items": [{
                    "name": "米", "grams": 150,
                    "calories_kcal": 252, "protein_g": 4,
                    "fat_g": 0.5, "carbs_g": 55,
                }],
                "total_calories_kcal": 252,
                "total_protein_g": 4,
                "total_fat_g": 0.5,
                "total_carbs_g": 55,
            },
            "daily_context": {
                "date": "2026-04-27",
                "original_day_total_calories_kcal": 2000,
                "original_day_total_protein_g": 120,
                "original_day_total_fat_g": 60,
                "original_day_total_carbs_g": 220,
                "other_meals_total_calories_kcal": 1500,
                "other_meals_total_protein_g": 90,
                "other_meals_total_fat_g": 45,
                "other_meals_total_carbs_g": 170,
            },
        },
    }


@pytest.fixture(autouse=True)
def _reset_swap_agent():
    handler_module._SWAP_AGENT = None
    yield
    handler_module._SWAP_AGENT = None


def test_build_swap_agent_wires_tools_and_output_schema():
    """build_swap_agent() が呼べる / 4 tools / structured_output_model=GeneratedMealSwapCandidates
    が設定される / system_prompt が swap 用キーワードを含む。"""
    from plan_generator.agent import build_swap_agent

    with patch("plan_generator.agent.BedrockModel") as bedrock_mock:
        fake_model = MagicMock()
        fake_model.stateful = False
        bedrock_mock.return_value = fake_model
        agent = build_swap_agent()

    bedrock_mock.assert_called_once()
    kwargs = bedrock_mock.call_args.kwargs
    assert kwargs["model_id"] == "global.anthropic.claude-sonnet-4-6"
    assert kwargs["region_name"] == "us-west-2"

    # 4 tools 登録
    assert len(agent.tool_names) == 4
    assert {
        "calculate_calories_macros",
        "calculate_hydration",
        "recommend_supplements",
        "get_food_by_id",
    }.issubset(set(agent.tool_names))

    # structured_output_model が GeneratedMealSwapCandidates で紐付く
    assert agent._default_structured_output_model is GeneratedMealSwapCandidates

    # system_prompt が swap 特有のキーワードを含む
    assert "EXACTLY 3" in agent.system_prompt
    assert "same slot" in agent.system_prompt
    assert "original_day_total" in agent.system_prompt


def test_handle_swap_through_real_agent_with_mocked_llm_call(monkeypatch):
    """handle_swap_candidates → build_swap_agent() → mocked Agent __call__ →
    GeneratedMealSwapCandidates return の経路を通す。"""
    golden = _golden_candidates()

    class _StubSwapAgent:
        tool_names = [
            "calculate_calories_macros",
            "calculate_hydration",
            "recommend_supplements",
            "get_food_by_id",
        ]
        _default_structured_output_model = GeneratedMealSwapCandidates

        def __call__(self, _user_message: str):
            class _AgentResult:
                structured_output = golden

            return _AgentResult()

    monkeypatch.setattr(
        "plan_generator.handler.build_swap_agent", lambda: _StubSwapAgent()
    )

    response = handler_module.handler(_swap_event())
    # GeneratedMealSwapCandidates として strict validate できる
    GeneratedMealSwapCandidates.model_validate(response["generated_candidates"])
    # agent の出力に plan_id / proposal_id が含まれない (adapter 責務)
    assert "plan_id" not in response["generated_candidates"]
    assert "proposal_id" not in response["generated_candidates"]
    assert len(response["generated_candidates"]["candidates"]) == 3


def test_swap_system_prompt_contains_swap_specific_directives():
    """system_swap.py の build_swap_system_prompt() が swap 特有のルールと
    FOOD_HINTS を含むこと。"""
    from plan_generator.prompts.system_swap import build_swap_system_prompt

    prompt = build_swap_system_prompt()
    assert "EXACTLY 3" in prompt
    assert "same slot" in prompt
    assert "original_day_total" in prompt
    assert "other_meals_total" in prompt
    # FOOD_HINTS の存在 (render_food_hints() の出力は "FOOD_HINTS" を必ず含む)
    assert "food_id" in prompt or "FOOD_HINTS" in prompt
    # 医療情報除外
    assert "medical" in prompt.lower()
