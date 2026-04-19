"""TypeScript onboarding-safety.ts と Python adapter の等価性を担保するテスト。"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from fitness_engine.onboarding_safety import (
    OnboardingSafetyInput,
    evaluate_onboarding_safety_guard,
)

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "contracts-ts"
    / "schemas"
    / "fixtures"
    / "safety-matrix.json"
)


def load_matrix() -> list[dict]:
    return json.loads(FIXTURE_PATH.read_text())["cases"]


@pytest.mark.parametrize("case", load_matrix(), ids=lambda c: c["name"])
def test_onboarding_safety_matrix(case: dict) -> None:
    result = evaluate_onboarding_safety_guard(OnboardingSafetyInput(**case["input"]))
    assert result.level == case["expected"]["level"]
    assert result.reasons == case["expected"]["reasons"]
    assert result.warnings == case["expected"]["warnings"]
