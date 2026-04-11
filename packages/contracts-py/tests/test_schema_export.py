"""schema_export モジュールのテスト。"""

import json
from pathlib import Path

import pytest

from fitness_contracts.schema_export import (
    MODEL_REGISTRY,
    export_all_schemas,
)


def test_registry_contains_calorie_macro_result():
    """レジストリに CalorieMacroResult が登録されていること。"""
    names = [name for name, _ in MODEL_REGISTRY]
    assert "CalorieMacroResult" in names


def test_export_all_schemas_writes_files(tmp_path: Path):
    """export_all_schemas が JSON ファイルを出力すること。"""
    written = export_all_schemas(tmp_path)
    assert len(written) == len(MODEL_REGISTRY)

    target = tmp_path / "CalorieMacroResult.schema.json"
    assert target.exists()

    schema = json.loads(target.read_text())
    assert schema["type"] == "object"
    assert "bmr" in schema["properties"]


def test_export_all_schemas_creates_directory(tmp_path: Path):
    """存在しないネストディレクトリも作成されること。"""
    nested = tmp_path / "deeply" / "nested"
    export_all_schemas(nested)
    assert nested.is_dir()
    assert (nested / "CalorieMacroResult.schema.json").exists()


def test_export_all_schemas_overwrites_existing(tmp_path: Path):
    """既存ファイルは上書きされること。"""
    target = tmp_path / "CalorieMacroResult.schema.json"
    target.write_text("{}")
    export_all_schemas(tmp_path)
    reloaded = json.loads(target.read_text())
    assert reloaded != {}
