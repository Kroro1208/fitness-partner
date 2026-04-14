"""schema_export モジュールのテスト。"""

import json
from pathlib import Path

from fitness_contracts.schema_export import (
    MODEL_REGISTRY,
    export_all_schemas,
)


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


def test_update_user_profile_schema_preserves_patch_semantics(tmp_path: Path):
    """UpdateUserProfileInput の schema が PATCH 契約を表現すること。"""
    export_all_schemas(tmp_path)

    schema = json.loads(
        (tmp_path / "UpdateUserProfileInput.schema.json").read_text(),
    )
    assert schema["x-at-least-one-not-null"] == [
        "name",
        "age",
        "sex",
        "height_cm",
        "weight_kg",
        "activity_level",
        "desired_pace",
        "sleep_hours",
        "stress_level",
    ]
    assert "default" not in schema["properties"]["name"]
    assert "required" not in schema
