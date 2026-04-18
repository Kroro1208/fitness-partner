"""DynamoDB への食品データ書き込みと import manifest 記録。"""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone

from fitness_contracts.models.food_catalog.food_item import FoodItem

logger = logging.getLogger(__name__)


def write_food_items(table, items: list[FoodItem]) -> tuple[int, int]:
    """FoodItem リストを DynamoDB に書き込む。

    Table.batch_writer() を使用し、チャンク分割と UnprocessedItems の
    自動 retry は boto3 に委譲する。flush 例外時は永続化状態が不明の
    ため全件を失敗扱いとする。

    Returns:
        (成功件数, 失敗件数) のタプル。flush 例外時は (0, len(items))。
    """
    if not items:
        return 0, 0

    written = 0
    try:
        with table.batch_writer() as writer:
            for food in items:
                item = {"pk": f"food#{food.food_id}", "sk": "meta", **food.model_dump()}
                writer.put_item(Item=item)
                written += 1
    except Exception:
        logger.error("batch_writer flush failed: %d items may be lost", len(items), exc_info=True)
        return 0, len(items)

    return written, 0


def write_import_manifest(
    *,
    table,
    source_file: str,
    file_hash: str,
    total_rows: int,
    success_count: int,
    skip_count: int,
    failed_count: int,
) -> None:
    """ETL 実行の監査ログを DynamoDB に記録する。"""
    now = datetime.now(timezone.utc)
    unique_suffix = uuid.uuid4().hex[:8]
    pk = f"etl#import#{now.strftime('%Y%m%dT%H%M%SZ')}#{unique_suffix}"

    table.put_item(Item={
        "pk": pk,
        "sk": "meta",
        "source_file": source_file,
        "executed_at": now.isoformat(),
        "total_rows": total_rows,
        "success_count": success_count,
        "skip_count": skip_count,
        "failed_count": failed_count,
        "dataset_version": "FCT2020",
        "file_hash": file_hash,
    })

    logger.info(
        "Import manifest recorded: %s (total=%d, success=%d, skip=%d, failed=%d)",
        pk, total_rows, success_count, skip_count, failed_count,
    )


def compute_file_hash(file_path: str) -> str:
    """ファイルの SHA-256 ハッシュを返す。"""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()
