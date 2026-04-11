"""Supplement Recommender: ルールベースのサプリ推奨。"""

from fitness_contracts.models.supplement import (
    SupplementInput,
    SupplementRecommendation,
    SupplementRecommendationList,
)

_PROTEIN_GAP_THRESHOLD = 20.0
_CREATINE_MIN_WORKOUTS = 3
_MAGNESIUM_SLEEP_THRESHOLD = 7.0
_OMEGA3_FISH_THRESHOLD = 1  # fish_per_week < 1 (= 0) でトリガー


def recommend_supplements(input_: SupplementInput) -> SupplementRecommendationList:
    """ルールに従ってサプリを推奨する (architecture.md 11.7 の 6 種)。

    条件:
    - protein_gap_g > 20: whey
    - workouts_per_week >= 3: creatine
    - early_morning_training == True: caffeine
    - low_sunlight_exposure == True: vitamin_d
    - fish_per_week == 0: omega3
    - sleep_hours < 7: magnesium
    """
    items: list[SupplementRecommendation] = []

    if input_.protein_gap_g > _PROTEIN_GAP_THRESHOLD:
        items.append(
            SupplementRecommendation(
                name="whey",
                dose="20-30 g/回",
                timing="運動後または食事でタンパク質が不足する日",
                why_relevant=(
                    f"1 日のタンパク質が目標より約 {input_.protein_gap_g:.0f} g 不足"
                ),
                caution="乳製品アレルギーがある場合は植物性代替品を検討",
            )
        )

    if input_.workouts_per_week >= _CREATINE_MIN_WORKOUTS:
        items.append(
            SupplementRecommendation(
                name="creatine",
                dose="3-5 g/day",
                timing="毎日、タイミングは問わない",
                why_relevant="週 3 回以上のトレーニングで筋力・回復サポートが期待できる",
            )
        )

    if input_.early_morning_training:
        items.append(
            SupplementRecommendation(
                name="caffeine",
                dose="100-200 mg",
                timing="運動 30-45 分前 (就寝 6 時間前以降は避ける)",
                why_relevant="早朝トレや眠気対策でパフォーマンス・覚醒度を上げる",
                caution="不眠傾向がある場合は午後以降の摂取は避ける",
            )
        )

    if input_.low_sunlight_exposure:
        items.append(
            SupplementRecommendation(
                name="vitamin_d",
                dose="1000-2000 IU/day",
                timing="食事と一緒に (脂溶性)",
                why_relevant="日照不足・屋内生活・冬場ではビタミン D 合成が不足しがち",
                caution="腎疾患がある場合は医師に相談",
            )
        )

    if input_.fish_per_week < _OMEGA3_FISH_THRESHOLD:
        items.append(
            SupplementRecommendation(
                name="omega3",
                dose="1-2 g/day (EPA+DHA)",
                timing="食事と一緒に",
                why_relevant="魚摂取が週 0 回のため必須脂肪酸が不足しがち",
            )
        )

    if input_.sleep_hours < _MAGNESIUM_SLEEP_THRESHOLD:
        items.append(
            SupplementRecommendation(
                name="magnesium",
                dose="200-400 mg/day",
                timing="就寝前",
                why_relevant="睡眠時間が短く、睡眠の質改善が期待できる",
            )
        )

    return SupplementRecommendationList(items=items)
