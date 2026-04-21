"""Onboarding 画面の Coach prompt 生成 API 契約。"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict

from fitness_contracts.models.profile.user_profile import OnboardingStage


class CoachPromptRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "title": "CoachPromptRequest",
            "description": "Onboarding Coach prompt 生成の入力。",
        }
    )

    target_stage: OnboardingStage
    profile_snapshot: dict[str, Any]


class CoachPromptResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "title": "CoachPromptResponse",
            "description": "Onboarding Coach prompt 生成の出力。",
        }
    )

    prompt: str
    cached: bool
