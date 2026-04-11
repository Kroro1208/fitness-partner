# sandbox 制約対応: キャッシュ先をリポジトリ内に寄せる
# (デフォルトの ~/.cache/uv と ~/.local/share/pnpm/store は書き込み不可)
export UV_CACHE_DIR := .cache/uv
export PNPM_STORE_DIR := .cache/pnpm-store

.PHONY: help install contracts contracts-py contracts-ts test test-py test-ts clean

help:
	@echo "利用可能ターゲット:"
	@echo "  install       - Python と Node の依存関係をインストール"
	@echo "  contracts     - JSON Schema + TS 型 + Zod スキーマを再生成"
	@echo "  contracts-py  - Pydantic から JSON Schema を書き出す"
	@echo "  contracts-ts  - JSON Schema から TS 型 + Zod スキーマを再生成"
	@echo "  test          - すべてのテストを実行"
	@echo "  test-py       - Python テストを実行"
	@echo "  test-ts       - TypeScript テストを実行"
	@echo "  clean         - 生成物を削除"

install:
	uv sync --all-packages --extra dev
	pnpm install

contracts-py:
	.venv/bin/python -m fitness_contracts.schema_export packages/contracts-ts/schemas

contracts-ts:
	pnpm --filter @fitness/contracts-ts generate

contracts: contracts-py contracts-ts

test-py:
	.venv/bin/pytest packages/contracts-py -v

test-ts:
	pnpm --filter @fitness/contracts-ts test

test: test-py test-ts

clean:
	rm -rf packages/contracts-ts/generated/*.ts packages/contracts-ts/generated/*.d.ts
	rm -rf packages/contracts-ts/schemas/*.schema.json
	touch packages/contracts-ts/generated/.gitkeep
