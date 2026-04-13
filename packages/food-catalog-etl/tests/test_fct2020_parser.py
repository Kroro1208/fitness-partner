"""FCT2020 パーサの純粋変換テスト (Layer 1) + fixture 統合テスト (Layer 2)。"""

from pathlib import Path

import pytest

from fitness_contracts.models.nutrient import NutrientQuality

from food_catalog_etl.fct2020_parser import parse_nutrient, parse_row, parse_workbook


# ---- Layer 1: 純粋変換テスト ----


class TestParseNutrient:
    """セル値 -> NutrientValue の変換テスト。"""

    @pytest.mark.parametrize(
        ("raw", "expected_value", "expected_quality"),
        [
            (12.5, 12.5, NutrientQuality.EXACT),
            (0, 0.0, NutrientQuality.EXACT),
            ("Tr", 0.0, NutrientQuality.TRACE),
            ("(Tr)", 0.0, NutrientQuality.TRACE),
            ("-", 0.0, NutrientQuality.MISSING),
            ("(0)", 0.0, NutrientQuality.EXACT),
            ("3.2", 3.2, NutrientQuality.EXACT),
        ],
    )
    def test_parse_nutrient(self, raw, expected_value, expected_quality):
        result = parse_nutrient(raw)
        assert result.value == pytest.approx(expected_value)
        assert result.quality == expected_quality

    def test_parse_nutrient_none_returns_missing(self):
        result = parse_nutrient(None)
        assert result.quality == NutrientQuality.MISSING


class TestParseRow:
    """行 dict -> FoodItem の変換テスト。"""

    def _make_row(self, **overrides):
        base = {
            "食品番号": "01001",
            "食品名": "アマランサス 玄穀",
            "食品群": "01: 穀類",
            "エネルギー (kcal)": 358,
            "たんぱく質": 12.7,
            "脂質": 6.0,
            "炭水化物": 64.9,
            "食物繊維総量": 7.4,
            "ナトリウム": 1,
        }
        base.update(overrides)
        return base

    def test_normal_row(self):
        result = parse_row(self._make_row(), row_number=2)
        assert result is not None
        assert result.food_id == "01001"
        assert result.name_ja == "アマランサス 玄穀"
        assert result.energy_kcal.value == pytest.approx(358.0)
        assert result.energy_kcal.quality == NutrientQuality.EXACT
        assert result.source_row_number == 2

    def test_trace_values(self):
        result = parse_row(self._make_row(**{"ナトリウム": "Tr"}), row_number=3)
        assert result is not None
        assert result.sodium_mg.quality == NutrientQuality.TRACE

    def test_missing_values(self):
        result = parse_row(self._make_row(**{"食物繊維総量": "-"}), row_number=4)
        assert result is not None
        assert result.fiber_g.quality == NutrientQuality.MISSING

    def test_missing_food_id_returns_none(self):
        result = parse_row(self._make_row(**{"食品番号": None}), row_number=5)
        assert result is None

    def test_missing_food_name_returns_none(self):
        result = parse_row(self._make_row(**{"食品名": None}), row_number=6)
        assert result is None


# ---- Layer 2: fixture 統合テスト ----


FIXTURE_PATH = str(
    Path(__file__).parent / "fixtures" / "fct2020_sample.xlsx"
)


class TestParseWorkbook:
    """fixture Excel からの統合テスト (Layer 2)。"""

    def test_parses_expected_columns(self):
        items, skipped = parse_workbook(FIXTURE_PATH)
        assert len(items) == 4
        assert len(skipped) == 1

    def test_first_item_values(self):
        items, _ = parse_workbook(FIXTURE_PATH)
        first = items[0]
        assert first.food_id == "01001"
        assert first.name_ja == "アマランサス 玄穀"
        assert first.energy_kcal.value == pytest.approx(358.0)

    def test_trace_quality(self):
        items, _ = parse_workbook(FIXTURE_PATH)
        awamochi = next(i for i in items if i.food_id == "01002")
        assert awamochi.sodium_mg.quality == NutrientQuality.TRACE

    def test_missing_quality(self):
        items, _ = parse_workbook(FIXTURE_PATH)
        awamochi = next(i for i in items if i.food_id == "01003")
        assert awamochi.fiber_g.quality == NutrientQuality.MISSING
