"""DynamoDB Writer のテスト (Layer 3, boto3 モック)。"""

from unittest.mock import MagicMock

from fitness_contracts.models.food_catalog.food_item import FoodItem
from fitness_contracts.models.food_catalog.nutrient import (
    NutrientQuality,
    NutrientValue,
)

from food_catalog_etl.dynamodb_writer import write_food_items, write_import_manifest


def _nv(v: float = 1.0) -> NutrientValue:
    return NutrientValue(value=v, quality=NutrientQuality.EXACT)


def _food(food_id: str = "01001") -> FoodItem:
    return FoodItem(
        food_id=food_id,
        name_ja="テスト食品",
        category="穀類",
        energy_kcal=_nv(100),
        protein_g=_nv(10),
        fat_g=_nv(5),
        carbs_g=_nv(20),
        fiber_g=_nv(3),
        sodium_mg=_nv(1),
        source_row_number=2,
    )


class TestWriteFoodItems:
    def test_writes_items_with_pk_sk(self):
        mock_table = MagicMock()
        mock_writer = MagicMock()
        mock_table.batch_writer.return_value.__enter__ = MagicMock(return_value=mock_writer)
        mock_table.batch_writer.return_value.__exit__ = MagicMock(return_value=False)

        written, failed = write_food_items(mock_table, [_food("01001"), _food("01002")])

        assert written == 2
        assert failed == 0
        calls = mock_writer.put_item.call_args_list
        assert len(calls) == 2
        assert calls[0].kwargs["Item"]["pk"] == "food#01001"
        assert calls[0].kwargs["Item"]["sk"] == "meta"

    def test_empty_list_writes_nothing(self):
        mock_table = MagicMock()
        mock_writer = MagicMock()
        mock_table.batch_writer.return_value.__enter__ = MagicMock(return_value=mock_writer)
        mock_table.batch_writer.return_value.__exit__ = MagicMock(return_value=False)

        written, failed = write_food_items(mock_table, [])

        assert written == 0
        assert failed == 0
        mock_writer.put_item.assert_not_called()

    def test_flush_exception_returns_all_as_failed(self):
        mock_table = MagicMock()
        mock_writer = MagicMock()
        mock_table.batch_writer.return_value.__enter__ = MagicMock(return_value=mock_writer)
        mock_table.batch_writer.return_value.__exit__ = MagicMock(side_effect=Exception("flush failed"))

        items = [_food("01001"), _food("01002")]
        written, failed = write_food_items(mock_table, items)

        assert written == 0
        assert failed == len(items)


class TestWriteImportManifest:
    def test_writes_manifest_with_etl_pk(self):
        mock_table = MagicMock()

        write_import_manifest(
            table=mock_table,
            source_file="fct2020.xlsx",
            file_hash="abc123",
            total_rows=100,
            success_count=95,
            skip_count=5,
            failed_count=0,
        )

        mock_table.put_item.assert_called_once()
        item = mock_table.put_item.call_args.kwargs["Item"]
        assert item["pk"].startswith("etl#import#")
        assert item["sk"] == "meta"
        assert item["dataset_version"] == "FCT2020"
        assert item["total_rows"] == 100
        assert item["success_count"] == 95
