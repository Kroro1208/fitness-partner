import pytest
from pydantic import ValidationError

from fitness_contracts.models.onboarding.coach_prompt import (
    CoachPromptRequest,
    CoachPromptResponse,
)
from fitness_contracts.models.onboarding.free_text_parse import (
    FreeTextParseRequest,
    FreeTextParseResponse,
)


def test_coach_prompt_request_valid():
    req = CoachPromptRequest(target_stage="stats", profile_snapshot={"age": 30})
    assert req.target_stage == "stats"


def test_coach_prompt_request_invalid_stage():
    with pytest.raises(ValidationError):
        CoachPromptRequest(target_stage="unknown", profile_snapshot={})


def test_free_text_parse_request_stage_restricted():
    FreeTextParseRequest(stage="lifestyle", free_text="hello", structured_snapshot={})
    with pytest.raises(ValidationError):
        FreeTextParseRequest(stage="safety", free_text="x", structured_snapshot={})


def test_free_text_parse_response_shape():
    res = FreeTextParseResponse(
        note_field="preferences_note",
        extracted_note="summary",
        suggested_tags=["tag1"],
    )
    assert res.note_field == "preferences_note"
