import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const tableName = process.env.TABLE_NAME;
if (!tableName) {
	throw new Error("TABLE_NAME environment variable is required");
}

/** DynamoDB テーブル名。CDK が環境変数で注入。 */
export const TABLE_NAME: string = tableName;

const client = new DynamoDBClient({});
/** DocumentClient (コンテナ再利用時にコネクション使い回し)。 */
export const docClient = DynamoDBDocumentClient.from(client);

/**
 * DynamoDB アイテムから pk/sk を除去する。
 * handler がレスポンスを組み立てる際に使う。
 */
export function stripKeys<T extends Record<string, unknown>>(
	item: T,
): Omit<T, "pk" | "sk"> {
	const { pk, sk, ...rest } = item;
	return rest;
}
