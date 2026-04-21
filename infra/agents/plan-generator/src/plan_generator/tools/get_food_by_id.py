"""DynamoDB から食品マスタを 1 件取得する tool。

FITNESS_TABLE_NAME / FITNESS_TABLE_REGION は import 時点ではなく、
実際に DynamoDB アクセスするタイミング (=_table() 呼び出し時) に読む。
これにより、テストの fixture 内で env を設定するパターンが正しく動く。
"""

import os

import boto3
from fitness_contracts.models.food_catalog.food_item import FoodItem
from strands import tool
from typing_extensions import TypedDict


class GetFoodByIdInput(TypedDict):
    food_id: str


def _table():
    table_name = os.environ.get("FITNESS_TABLE_NAME", "FitnessTable")
    region = os.environ.get("FITNESS_TABLE_REGION", "ap-northeast-1")
    return boto3.resource("dynamodb", region_name=region).Table(table_name)


@tool
def get_food_by_id(input: GetFoodByIdInput) -> FoodItem | None:
    """pk=food#<id>, sk=meta の GetItem。cross-region。"""
    try:
        resp = _table().get_item(Key={"pk": f"food#{input['food_id']}", "sk": "meta"})
    except Exception:
        return None
    raw = resp.get("Item")
    if raw is None:
        return None
    cleaned = {k: v for k, v in raw.items() if k not in ("pk", "sk")}
    return FoodItem.model_validate(cleaned)
