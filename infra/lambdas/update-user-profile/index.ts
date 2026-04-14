import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { profileKey } from "../shared/keys";
import {
  ok,
  badRequest,
  serverError,
  requireJsonBody,
  withServerError,
} from "../shared/response";
import { isRecord, isValidEnum, isInRange } from "../shared/validation";
import { PROFILE_FIELDS, type ProfilePatch } from "../shared/types";

// ── 定数 ────────────────────────────────────────────────────────────

const VALID_SEX: ReadonlySet<string> = new Set(["male", "female"]);
const VALID_ACTIVITY_LEVEL: ReadonlySet<string> = new Set([
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "extremely_active",
]);
const VALID_DESIRED_PACE: ReadonlySet<string> = new Set([
  "steady",
  "aggressive",
]);
const VALID_STRESS_LEVEL: ReadonlySet<string> = new Set([
  "low",
  "moderate",
  "high",
]);

// ── バリデーション (exported for testing) ────────────────────────────

type ValidationResult =
  | { valid: true; data: ProfilePatch }
  | { valid: false; message: string };

/**
 * 手書き if ガード。参照元: UpdateUserProfileInput.schema.json
 * contracts-py 側の Pydantic モデルと同じ境界値を強制する。
 */
export function validateUpdateProfileInput(body: unknown): ValidationResult {
  if (!isRecord(body)) {
    return { valid: false, message: "Request body must be a JSON object" };
  }

  // 許可フィールドだけ抽出し、null/undefined を除外
  const data: ProfilePatch = {};
  for (const key of PROFILE_FIELDS) {
    const value = body[key];
    if (value !== undefined && value !== null) {
      data[key] = value;
    }
  }

  if (Object.keys(data).length === 0) {
    return { valid: false, message: "At least one field must be provided" };
  }

  // 個別フィールドの型・範囲バリデーション
  if (data.name !== undefined && typeof data.name !== "string") {
    return { valid: false, message: "name must be a string" };
  }
  if (data.age !== undefined) {
    if (typeof data.age !== "number" || !Number.isInteger(data.age)) {
      return { valid: false, message: "age must be an integer" };
    }
    if (data.age < 18 || data.age > 120) {
      return { valid: false, message: "age must be between 18 and 120" };
    }
  }
  if (data.sex !== undefined && !isValidEnum(data.sex, VALID_SEX)) {
    return { valid: false, message: "sex must be 'male' or 'female'" };
  }
  if (
    data.height_cm !== undefined &&
    !isInRange(data.height_cm, { gt: 0, lt: 300 })
  ) {
    return { valid: false, message: "height_cm must be > 0 and < 300" };
  }
  if (
    data.weight_kg !== undefined &&
    !isInRange(data.weight_kg, { gt: 0, lt: 500 })
  ) {
    return { valid: false, message: "weight_kg must be > 0 and < 500" };
  }
  if (
    data.activity_level !== undefined &&
    !isValidEnum(data.activity_level, VALID_ACTIVITY_LEVEL)
  ) {
    return { valid: false, message: "Invalid activity_level" };
  }
  if (
    data.desired_pace !== undefined &&
    !isValidEnum(data.desired_pace, VALID_DESIRED_PACE)
  ) {
    return { valid: false, message: "Invalid desired_pace" };
  }
  if (
    data.sleep_hours !== undefined &&
    !isInRange(data.sleep_hours, { ge: 0, le: 24 })
  ) {
    return { valid: false, message: "sleep_hours must be between 0 and 24" };
  }
  if (
    data.stress_level !== undefined &&
    !isValidEnum(data.stress_level, VALID_STRESS_LEVEL)
  ) {
    return { valid: false, message: "Invalid stress_level" };
  }

  return { valid: true, data };
}

// ── UpdateExpression ビルダー (exported for testing) ─────────────────

type ExpressionFields = ProfilePatch & { updated_at?: string };

export function buildUpdateExpression(fields: ExpressionFields): {
  UpdateExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
} {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setClauses: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    const nameKey = `#${key}`;
    const valueKey = `:${key}`;
    names[nameKey] = key;
    values[valueKey] = value;
    setClauses.push(`${nameKey} = ${valueKey}`);
  }

  return {
    UpdateExpression: `SET ${setClauses.join(", ")}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

// ── handler ─────────────────────────────────────────────────────────

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = requireUserId(event);
  if (!auth.ok) return auth.response;

  const parsed = requireJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const validation = validateUpdateProfileInput(parsed.body);
  if (!validation.valid) {
    return badRequest(validation.message);
  }

  // updated_at を監査用に自動付与
  const dataWithTimestamp = {
    ...validation.data,
    updated_at: new Date().toISOString(),
  };
  const expr = buildUpdateExpression(dataWithTimestamp);

  return withServerError("updateUserProfile", async () => {
    const { Attributes } = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: profileKey(auth.userId),
        UpdateExpression: expr.UpdateExpression,
        ExpressionAttributeNames: expr.ExpressionAttributeNames,
        ExpressionAttributeValues: expr.ExpressionAttributeValues,
        ReturnValues: "ALL_NEW",
      }),
    );

    if (!Attributes) {
      return serverError();
    }

    return ok({ profile: stripKeys(Attributes) });
  });
}
