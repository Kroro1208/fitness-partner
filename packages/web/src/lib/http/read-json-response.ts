type JsonResponseReadResult =
	| {
			ok: true;
			payload: unknown;
	  }
	| {
			ok: false;
			reason: "invalid_json_response_body";
			error: unknown;
	  };

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object";
}

export async function readJsonResponseBody(
	response: Response,
): Promise<JsonResponseReadResult> {
	try {
		return {
			ok: true,
			payload: await response.json(),
		};
	} catch (error) {
		return {
			ok: false,
			reason: "invalid_json_response_body",
			error,
		};
	}
}

export function toResponseErrorBody(result: JsonResponseReadResult): unknown {
	if (result.ok) return result.payload;

	return {
		error: result.reason,
	};
}

export function readResponseErrorCode(result: JsonResponseReadResult): unknown {
	if (!result.ok) return result.reason;
	if (!isRecord(result.payload)) return undefined;
	return result.payload.error;
}
