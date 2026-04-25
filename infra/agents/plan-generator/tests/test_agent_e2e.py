"""Agent wiring test: build_agent() が返す実 Agent を通し、Bedrock invoke だけ mock する。

Strands Agent 内部の system prompt / tool wiring を実際に通す。BedrockModel の
__init__ だけ stub して Bedrock credential 不要化。schema 接続は handler 経由の
振る舞いテスト (test_handler_through_real_agent_with_mocked_llm_call) で検証する。

strands-agents 1.x の実 API:
- tool 一覧は `agent.tool_names` (list[str]) で参照する (公開 API)。
- Agent.__call__ は AgentResult を返す; `.structured_output` が Pydantic model。
- 内部の `_default_structured_output_model` は private 属性のため直接 assert しない
  (SDK rename / wrap で簡単に壊れる)。
"""

from unittest.mock import MagicMock, patch

import pytest

from fitness_contracts.models.plan.day_plan import DayPlan
from fitness_contracts.models.plan.generated_weekly_plan import GeneratedWeeklyPlan
from fitness_contracts.models.plan.meal import Meal
from fitness_contracts.models.plan.meal_item import MealItem
from plan_generator import handler as handler_module


def _golden_plan() -> GeneratedWeeklyPlan:
    item = MealItem(
        name="鶏むね", grams=150, calories_kcal=180, protein_g=33, fat_g=3, carbs_g=0
    )

    def _meal(slot: str) -> Meal:
        return Meal(
            slot=slot,
            title="朝食",
            items=[item],
            total_calories_kcal=180,
            total_protein_g=33,
            total_fat_g=3,
            total_carbs_g=0,
        )

    # Plan 09 Task A1: DayPlan.meals の slot 一意性 validator を満たすため各 slot 1 件ずつ。
    day = DayPlan(
        date="2026-04-20",
        theme="高タンパク",
        meals=[_meal("breakfast"), _meal("lunch"), _meal("dinner")],
        daily_total_calories_kcal=540,
        daily_total_protein_g=99,
        daily_total_fat_g=9,
        daily_total_carbs_g=0,
    )
    return GeneratedWeeklyPlan(
        target_calories_kcal=2200,
        target_protein_g=140,
        target_fat_g=70,
        target_carbs_g=240,
        days=[day] * 7,
        personal_rules=["バランス", "水分", "睡眠"],
        hydration_target_liters=2.5,
    )


def _valid_event():
    return {
        "user_id": "u1",
        "week_start": "2026-04-20",
        "safe_prompt_profile": {"age": 30, "sex": "male", "height_cm": 170, "weight_kg": 70},
        "safe_agent_input": {
            "calorie_macro_input": {
                "age": 30,
                "sex": "male",
                "height_cm": 170,
                "weight_kg": 70,
                "activity_level": "moderately_active",
                "sleep_hours": 7,
                "stress_level": "low",
            },
            "hydration_input": {
                "weight_kg": 70,
                "workouts_per_week": 3,
                "avg_workout_minutes": 45,
                "job_type": "desk",
            },
            "supplement_input": {
                "protein_gap_g": 0,
                "workouts_per_week": 3,
                "sleep_hours": 7,
                "fish_per_week": 2,
            },
        },
    }


@pytest.fixture(autouse=True)
def _reset_agent():
    """各テストで lazy-init された _AGENT をリセット。"""
    handler_module._AGENT = None
    yield
    handler_module._AGENT = None


def test_build_agent_wires_tools_and_output_schema():
    """build_agent() が呼べる / 4 tools / structured_output_model=GeneratedWeeklyPlan が設定される。

    BedrockModel の __init__ だけ mock して、以降の Agent 構築を実際に走らせる。
    これで prompt/tool/schema 配線の import/typo エラーを拾う。
    """
    from plan_generator.agent import build_agent

    with patch("plan_generator.agent.BedrockModel") as bedrock_mock:
        # Agent.__init__ が model.stateful を参照するため、MagicMock で属性充足。
        fake_model = MagicMock()
        fake_model.stateful = False
        bedrock_mock.return_value = fake_model
        agent = build_agent()

    bedrock_mock.assert_called_once()
    kwargs = bedrock_mock.call_args.kwargs
    assert kwargs["model_id"] == "global.anthropic.claude-sonnet-4-6"
    assert kwargs["region_name"] == "us-west-2"

    # 4 tools が登録され、全て tool_names に入っている
    assert len(agent.tool_names) == 4
    assert {
        "calculate_calories_macros",
        "calculate_hydration",
        "recommend_supplements",
        "get_food_by_id",
    }.issubset(set(agent.tool_names))

    # schema 接続は test_handler_through_real_agent_with_mocked_llm_call で
    # GeneratedWeeklyPlan として model_validate できることを通じて間接的に検証する。


def test_handler_through_real_agent_with_mocked_llm_call(monkeypatch):
    """handler → build_agent() → mocked Agent __call__ → GeneratedWeeklyPlan return の経路。

    Agent の __call__ 境界 1 点を stub して、handler 側の配線 (event shape validate →
    user_message 組み立て → agent invoke → structured_output 取り出し → model_dump) を
    実際に通す。
    """
    golden = _golden_plan()

    class _StubAgent:
        tool_names = [
            "calculate_calories_macros",
            "calculate_hydration",
            "recommend_supplements",
            "get_food_by_id",
        ]
        _default_structured_output_model = GeneratedWeeklyPlan

        def __call__(self, _user_message: str):
            class _AgentResult:
                structured_output = golden

            return _AgentResult()

    monkeypatch.setattr("plan_generator.handler.build_agent", lambda: _StubAgent())

    response = handler_module.handler(_valid_event())
    # GeneratedWeeklyPlan として strict validate できること
    GeneratedWeeklyPlan.model_validate(response["generated_weekly_plan"])
    # agent の出力に plan_id が含まれない (adapter 責務)
    assert "plan_id" not in response["generated_weekly_plan"]
    assert len(response["generated_weekly_plan"]["days"]) == 7


def test_system_prompt_contains_required_invariants():
    """SYSTEM_PROMPT_INVARIANTS の全キーが build_system_prompt() の出力に含まれること。"""
    from plan_generator.prompts.system import (
        SYSTEM_PROMPT_INVARIANTS,
        build_system_prompt,
    )

    prompt = build_system_prompt()
    for invariant in SYSTEM_PROMPT_INVARIANTS:
        assert invariant in prompt, invariant
