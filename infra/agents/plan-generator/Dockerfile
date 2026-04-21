# syntax=docker/dockerfile:1.6
# Build context: repo root (NOT infra/agents/plan-generator)
# Local test cmd: docker build --platform linux/arm64 -f infra/agents/plan-generator/Dockerfile -t plan-generator .
# CDK: DockerImageAsset が directory=<repo root>, file=<this Dockerfile> で自動 build+push する
FROM --platform=linux/arm64 python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY packages/contracts-py /opt/fitness-contracts
COPY packages/fitness-engine /opt/fitness-engine
COPY infra/agents/plan-generator/pyproject.toml /app/pyproject.toml
COPY infra/agents/plan-generator/src /app/src

# 依存順: contracts → engine → plan-generator 本体。
# `--no-sources` は `[tool.uv.sources]` の workspace 指示を無視させる
# (container 内は monorepo workspace ではなく、ローカルコピーを直接 install する)。
RUN uv pip install --system --no-cache --no-sources /opt/fitness-contracts \
    && uv pip install --system --no-cache --no-sources /opt/fitness-engine \
    && uv pip install --system --no-cache --no-sources .

ENV PYTHONPATH=/app/src

CMD ["python", "-m", "plan_generator.handler"]
