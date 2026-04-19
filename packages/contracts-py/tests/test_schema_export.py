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
    # Plan 07: Onboarding flow extended UpdateUserProfileInput to 43 fields.
    # 具体フィールドのリスト固定は契約変更のたびに壊れるため、契約上重要な
    # 不変条件 (コア 9 フィールドと Onboarding 特有フィールドの包含) を確認する。
    fields = schema["x-at-least-one-not-null"]
    core_fields = {
        "name",
        "age",
        "sex",
        "height_cm",
        "weight_kg",
        "activity_level",
        "desired_pace",
        "sleep_hours",
        "stress_level",
    }
    onboarding_fields = {
        "onboarding_stage",
        "blocked_reason",
        "is_pregnant_or_breastfeeding",
        "has_eating_disorder_history",
    }
    assert core_fields.issubset(set(fields))
    assert onboarding_fields.issubset(set(fields))
    assert "default" not in schema["properties"]["name"]
    assert "required" not in schema
