# syntax=docker/dockerfile:1.6
# Build context: repo root (NOT infra/agents/plan-generator)
# Local test cmd: docker build --platform linux/arm64 -f infra/agents/plan-generator/Dockerfile -t plan-generator .
# CDK: DockerImageAsset が directory=<repo root>, file=<this Dockerfile> で自動 build+push する
FROM --platform=linux/arm64 python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY packages/fitness-engine /opt/fitness-engine
COPY packages/contracts-py /opt/fitness-contracts
COPY infra/agents/plan-generator/pyproject.toml /app/pyproject.toml
COPY infra/agents/plan-generator/src /app/src

RUN uv pip install --system --no-cache /opt/fitness-engine /opt/fitness-contracts \
    && uv pip install --system --no-cache .

ENV PYTHONPATH=/app/src

CMD ["python", "-m", "plan_generator.handler"]
