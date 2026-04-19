"""Onboarding の free-text parse API 契約。"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class FreeTextParseRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "title": "FreeTextParseRequest",
            "description": "Onboarding の free-text parse 入力。",
        }
    )

    stage: Literal["lifestyle", "preferences", "snacks"]
    free_text: str
    structured_snapshot: dict[str, Any]


class FreeTextParseResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "title": "FreeTextParseResponse",
            "description": "Onboarding の free-text parse 出力。構造化フィールドは上書きしない。",
        }
    )

    note_field: Literal["lifestyle_note", "preferences_note", "snacks_note"]
    extracted_note: str
    suggested_tags: list[str]
