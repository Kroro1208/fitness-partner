# ai-fitness-partner

パーソナルフィットネストレーナーエージェント。アーキテクチャは `docs/superpowers/specs/2026-04-11-design-decisions.md` を参照。

## 前提ツール

- Node 22 LTS 以上
- pnpm 10 以上
- Python 3.11
- uv 0.9 以上
- GNU Make

## クイックスタート

```bash
make install       # Python と Node の依存関係をインストール
make contracts     # 契約生成パイプラインを実行 (Pydantic → JSON Schema → TS + Zod)
make test          # すべてのテストを実行
```

## ディレクトリ構成

- `packages/contracts-py/` — Pydantic v2 の source-of-truth モデル。JSON Schema を書き出す。
- `packages/contracts-ts/` — 生成された TypeScript 型と Zod スキーマ。Next.js フロントエンドから消費される。
- `docs/` — アーキテクチャ、UI 仕様、設計決定事項。

## 契約 (contracts) のワークフロー

契約の再生成は `make contracts` で行う。`packages/contracts-ts/schemas` または `packages/contracts-ts/generated` 配下のコミット済みファイルが Pydantic の source と食い違っていると、CI は失敗する。

新しい契約モデルを追加する手順:

1. `packages/contracts-py/src/fitness_contracts/models/` 配下に新しい Pydantic モデルを作る
2. `src/fitness_contracts/schema_export.py` 内の `MODEL_REGISTRY` に登録する
3. `make contracts` を実行して TS 型 + Zod スキーマを再生成する
4. 再生成されたファイルをコミットする
