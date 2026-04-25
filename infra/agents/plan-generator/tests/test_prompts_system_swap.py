"""Meal swap 用 system prompt の不変検査 (Plan 09 Task C1)。"""

from plan_generator.prompts.system_swap import build_swap_system_prompt


def test_prompt_contains_required_directives() -> None:
    prompt = build_swap_system_prompt()
    # 候補数と slot の制約
    assert "EXACTLY 3" in prompt
    assert "same slot" in prompt
    # 予算は original_day_total から other_meals_total を引いて算出する
    assert "original_day_total" in prompt
    assert "other_meals_total" in prompt
    # PII / 医療関連は除外
    assert "NEVER" in prompt
    assert "medical" in prompt.lower()
    # tool 使用権限
    assert "get_food_by_id" in prompt


def test_prompt_includes_food_hints_marker() -> None:
    prompt = build_swap_system_prompt()
    # FOOD_HINTS が末尾に連結されていることを示すマーカー
    assert "FOOD_HINTS" in prompt or "food_id" in prompt
