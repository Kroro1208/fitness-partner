import os
from decimal import Decimal

import boto3
import pytest
from moto import mock_aws

from plan_generator.tools.get_food_by_id import get_food_by_id


@pytest.fixture
def fitness_table():
    with mock_aws():
        os.environ["FITNESS_TABLE_NAME"] = "FitnessTable"
        os.environ["FITNESS_TABLE_REGION"] = "ap-northeast-1"
        ddb = boto3.resource("dynamodb", region_name="ap-northeast-1")
        table = ddb.create_table(
            TableName="FitnessTable",
            KeySchema=[
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table.put_item(
            Item={
                "pk": "food#11220",
                "sk": "meta",
                "food_id": "11220",
                "name_ja": "鶏むね肉 皮なし 生",
                "category": "11",
                "energy_kcal": {"value": Decimal("105.0"), "quality": "exact"},
                "protein_g": {"value": Decimal("23.3"), "quality": "exact"},
                "fat_g": {"value": Decimal("1.9"), "quality": "exact"},
                "carbs_g": {"value": Decimal("0.0"), "quality": "exact"},
                "fiber_g": {"value": Decimal("0.0"), "quality": "exact"},
                "sodium_mg": {"value": Decimal("45.0"), "quality": "exact"},
                "serving_g": Decimal("100.0"),
                "source_version": "FCT2020",
                "source_row_number": 1220,
            }
        )
        yield table


def test_returns_food_item(fitness_table):
    item = get_food_by_id({"food_id": "11220"})
    assert item is not None
    assert item.name_ja == "鶏むね肉 皮なし 生"


def test_returns_none_for_missing(fitness_table):
    assert get_food_by_id({"food_id": "99999"}) is None
