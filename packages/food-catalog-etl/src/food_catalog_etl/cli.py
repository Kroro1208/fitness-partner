"""FCT2020 Excel → DynamoDB FitnessTable インポート CLI。

Usage:
    python -m food_catalog_etl.cli --file data/fct2020.xlsx --table-name <TableName> --region <Region>
"""

from __future__ import annotations

import argparse
import logging
import time

import boto3

from food_catalog_etl.dynamodb_writer import (
    compute_file_hash,
    write_food_items,
    write_import_manifest,
)
from food_catalog_etl.fct2020_parser import parse_workbook

logger = logging.getLogger(__name__)

BAD_ROW_THRESHOLD = 0.05  # 5%


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="FCT2020 → DynamoDB importer")
    parser.add_argument("--file", required=True, help="FCT2020 Excel ファイルパス")
    parser.add_argument("--table-name", required=True, help="DynamoDB テーブル名")
    parser.add_argument("--region", required=True, help="AWS リージョン")
    args = parser.parse_args()

    logger.info("Parsing %s ...", args.file)
    items, skipped = parse_workbook(args.file)
    total_rows = len(items) + len(skipped)

    logger.info("Parsed: %d items, %d skipped (total %d rows)", len(items), len(skipped), total_rows)

    if total_rows > 0 and len(skipped) / total_rows > BAD_ROW_THRESHOLD:
        logger.error(
            "Bad row ratio %.1f%% exceeds threshold %.0f%%. Aborting.",
            len(skipped) / total_rows * 100,
            BAD_ROW_THRESHOLD * 100,
        )
        return 1

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(args.table_name)

    logger.info("Writing %d items to %s ...", len(items), args.table_name)
    start = time.monotonic()
    written, failed = write_food_items(table, items)
    elapsed = time.monotonic() - start

    logger.info("Wrote %d items in %.1fs (failed: %d)", written, elapsed, failed)

    file_hash = compute_file_hash(args.file)
    write_import_manifest(
        table=table,
        source_file=args.file,
        file_hash=file_hash,
        total_rows=total_rows,
        success_count=written,
        skip_count=len(skipped),
        failed_count=failed,
    )

    if failed > 0:
        logger.error("DynamoDB write failures: %d items lost", failed)
        return 1

    logger.info("Done. %d food items imported.", written)
    return 0
