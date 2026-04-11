"""Supplement: サプリ推奨の入出力型。"""

from pydantic import BaseModel, ConfigDict, Field


class SupplementInput(BaseModel):
    """Supplement Recommender への入力。"""

    model_config = ConfigDict(json_schema_extra={"title": "SupplementInput"})

    protein_gap_g: float = Field(
        description=(
            "タンパク質目標と食事からの推定摂取量の差 (g)。"
            "正なら不足 (ホエイ推奨トリガー)、負なら過剰。"
        )
    )
    workouts_per_week: int = Field(ge=0, le=14)
    sleep_hours: float = Field(ge=0, le=24)
    fish_per_week: int = Field(
        ge=0, le=21, description="週の魚摂取回数 (オメガ3 推奨トリガー)。"
    )
    early_morning_training: bool = Field(
        default=False,
        description="早朝トレーニング習慣または眠気対策のニーズ (カフェイン推奨トリガー)。",
    )
    low_sunlight_exposure: bool = Field(
        default=False,
        description="日照不足・冬場・屋内労働中心 (ビタミン D 推奨トリガー)。",
    )


class SupplementRecommendation(BaseModel):
    """1 件のサプリ推奨。"""

    model_config = ConfigDict(
        json_schema_extra={"title": "SupplementRecommendation"}
    )

    name: str = Field(description="サプリ名 (whey / creatine / magnesium / omega3 等)。")
    dose: str = Field(description="推奨用量 (人間が読める形式)。")
    timing: str = Field(description="摂取タイミング。")
    why_relevant: str = Field(description="なぜこのユーザーに関係があるか。")
    caution: str | None = Field(
        default=None, description="注意事項 (ある場合)。"
    )


class SupplementRecommendationList(BaseModel):
    """Supplement Recommender の出力 (0 件以上の推奨)。"""

    model_config = ConfigDict(
        json_schema_extra={"title": "SupplementRecommendationList"}
    )

    items: list[SupplementRecommendation] = Field(default_factory=list)
