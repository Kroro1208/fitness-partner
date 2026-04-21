"""FOOD_HINTS: LLM が選ぶ食品リスト。Plan 09+ で GSI に置換予定。"""

from typing import TypedDict


class FoodHint(TypedDict):
    food_id: str
    name_ja: str
    macro_summary: str


FOOD_HINTS: list[FoodHint] = [
    # 肉類
    {"food_id": "11220", "name_ja": "鶏むね肉 皮なし 生", "macro_summary": "100g: 105kcal P23 F2 C0"},
    {"food_id": "11221", "name_ja": "鶏もも肉 皮なし 生", "macro_summary": "100g: 113kcal P19 F5 C0"},
    # 穀類
    {"food_id": "01088", "name_ja": "精白米 うるち米", "macro_summary": "100g: 342kcal P6 F1 C77"},
    {"food_id": "01085", "name_ja": "玄米", "macro_summary": "100g: 346kcal P7 F3 C74"},
    # 豆類
    {"food_id": "04046", "name_ja": "糸引き納豆", "macro_summary": "100g: 184kcal P17 F10 C12"},
    # 実装時に魚/卵/乳/野菜/果実/調味料/加工食品 各 5-10 件まで拡張
]


def render_food_hints() -> str:
    lines = ["[FOOD_HINTS — 選んで get_food_by_id で精密値を取得]"]
    for h in FOOD_HINTS:
        lines.append(f"- {h['food_id']}: {h['name_ja']} ({h['macro_summary']})")
    return "\n".join(lines)
