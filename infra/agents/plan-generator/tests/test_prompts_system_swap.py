"""Meal swap 用 system prompt の不変検査 (Plan 09 Task C1)。"""

from plan_generator.prompts.system_swap import (
    SWAP_PROMPT_INVARIANTS,
    build_swap_system_prompt,
)


def test_prompt_contains_required_invariants() -> None:
    """SWAP_PROMPT_INVARIANTS の全キーが prompt に埋め込まれていること。

    候補数=3 の数値制約は GeneratedMealSwapCandidates の Field(min_length=3, max_length=3)
    で schema 強制済み。ここでは指示の存在シグナルのみを検証する。
    """
    prompt = build_swap_system_prompt().lower()
    for invariant in SWAP_PROMPT_INVARIANTS:
        assert invariant.lower() in prompt, invariant


def test_prompt_includes_food_hints_marker() -> None:
    prompt = build_swap_system_prompt()
    # FOOD_HINTS が末尾に連結されていることを示すマーカー
    assert "FOOD_HINTS" in prompt or "food_id" in prompt
