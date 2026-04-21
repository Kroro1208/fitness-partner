"""Onboarding Flow (Plan 07) 用の bool subset Safety adapter。

既存 `fitness_engine.safety` は Plan 生成用の broader contract を扱うため、
Onboarding 画面の二重防御とは分離して mirror 実装する。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


@dataclass(frozen=True)
class OnboardingSafetyInput:
    has_medical_condition: bool
    is_under_treatment: bool
    on_medication: bool
    is_pregnant_or_breastfeeding: bool
    has_doctor_diet_restriction: bool
    has_eating_disorder_history: bool


@dataclass(frozen=True)
class OnboardingSafetyResult:
    level: Literal["safe", "caution", "blocked"]
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def evaluate_onboarding_safety_guard(
    input_: OnboardingSafetyInput,
) -> OnboardingSafetyResult:
    blocked_reasons: list[str] = []
    if input_.is_pregnant_or_breastfeeding:
        blocked_reasons.append("pregnancy_or_breastfeeding")
    if input_.has_eating_disorder_history:
        blocked_reasons.append("eating_disorder_history")
    if input_.has_doctor_diet_restriction:
        blocked_reasons.append("doctor_diet_restriction")

    if blocked_reasons:
        return OnboardingSafetyResult(level="blocked", reasons=blocked_reasons)

    warnings: list[str] = []
    if input_.has_medical_condition:
        warnings.append("medical_condition")
    if input_.on_medication:
        warnings.append("on_medication")

    if warnings:
        return OnboardingSafetyResult(level="caution", warnings=warnings)

    return OnboardingSafetyResult(level="safe")
