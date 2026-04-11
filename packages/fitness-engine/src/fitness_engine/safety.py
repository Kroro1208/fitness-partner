"""Safety Guard: 決定論的ルールによる安全度分類。

LLM を使わず、Pydantic 入力のフィールドに対するルール評価だけで
safe / caution / blocked を判定する。
"""

from fitness_contracts.models.safety import SafetyInput, SafetyResult

_BLOCKING_MEDICAL_CONDITIONS = frozenset(
    {
        "diabetes_insulin",
        "severe_kidney",
        "severe_hypertension",
        "heart_condition_acute",
    }
)

_BLOCK_BMI_THRESHOLD = 17.0
_CAUTION_BMI_UPPER = 20.0
_MIN_ADULT_AGE = 18


def _bmi(weight_kg: float, height_cm: float) -> float:
    return weight_kg / ((height_cm / 100) ** 2)


def _check_block(input_: SafetyInput) -> list[str]:
    reasons: list[str] = []

    if input_.age < _MIN_ADULT_AGE:
        reasons.append(
            f"18 歳未満 (age={input_.age}) は本サービスの対象外"
        )

    if input_.pregnancy_or_breastfeeding:
        reasons.append("妊娠中または授乳中のため通常の減量プラン生成を停止")

    if input_.eating_disorder_history:
        reasons.append("摂食障害の既往があるため専門家への相談を推奨")

    blocking_conditions = (
        set(input_.medical_conditions) & _BLOCKING_MEDICAL_CONDITIONS
    )
    if blocking_conditions:
        reasons.append(
            "病状管理を要する既往症 "
            f"({', '.join(sorted(blocking_conditions))}) があるため医師相談が先"
        )

    bmi = _bmi(input_.weight_kg, input_.height_cm)
    if bmi < _BLOCK_BMI_THRESHOLD:
        reasons.append(
            f"BMI が極端に低い ({bmi:.1f}) ため減量は推奨できない"
        )

    return reasons


def _check_caution(input_: SafetyInput) -> list[str]:
    reasons: list[str] = []

    if input_.desired_pace == "aggressive":
        reasons.append("aggressive pace は早すぎる減量希望 (architecture.md 15.2)")

    if input_.sleep_hours < 6 and input_.stress_level == "high":
        reasons.append("睡眠不足とストレス高値の組み合わせ")

    if input_.alcohol_per_week >= 10:
        reasons.append("週 10 杯以上の飲酒頻度")

    bmi = _bmi(input_.weight_kg, input_.height_cm)
    if _BLOCK_BMI_THRESHOLD <= bmi < _CAUTION_BMI_UPPER:
        reasons.append(f"BMI が低め ({bmi:.1f})")

    return reasons


def evaluate_safety(input_: SafetyInput) -> SafetyResult:
    """SafetyInput を評価して SafetyResult を返す。

    block が 1 件でもあれば level=blocked。block なしで caution が
    1 件でもあれば level=caution。どちらもなければ safe。
    """
    block_reasons = _check_block(input_)
    if block_reasons:
        return SafetyResult(
            level="blocked",
            reasons=block_reasons,
            allowed_to_generate_plan=False,
            response_mode="medical_redirect",
        )

    caution_reasons = _check_caution(input_)
    if caution_reasons:
        return SafetyResult(
            level="caution",
            reasons=caution_reasons,
            allowed_to_generate_plan=True,
            response_mode="limited",
        )

    return SafetyResult(
        level="safe",
        reasons=[],
        allowed_to_generate_plan=True,
        response_mode="normal",
    )
