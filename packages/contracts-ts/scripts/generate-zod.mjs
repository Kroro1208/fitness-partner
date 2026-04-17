// @ts-check
/**
 * JSON Schema ファイルから Zod スキーマを生成する。
 * $ref を $defs からインライン展開してから json-schema-to-zod に渡すことで、
 * z.any() へのフォールバックを防ぐ。
 *
 * 入力:  packages/contracts-ts/schemas/*.schema.json
 * 出力:  packages/contracts-ts/generated/zod.ts
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jsonSchemaToZod } from "json-schema-to-zod";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const schemasDir = join(pkgRoot, "schemas");
const outFile = join(pkgRoot, "generated", "zod.ts");

/**
 * JSON Schema ノード。再帰的に走査されるため unknown で受ける。
 * @typedef {unknown} SchemaNode
 */

/**
 * JSON Schema 内の $ref を $defs からインライン展開する。
 * json-schema-to-zod が $ref を z.any() にフォールバックする問題を回避。
 *
 * @param {SchemaNode} schema
 * @returns {SchemaNode}
 */
function derefSchema(schema) {
	const defs =
		schema !== null &&
		typeof schema === "object" &&
		!Array.isArray(schema) &&
		"$defs" in schema &&
		typeof schema.$defs === "object" &&
		schema.$defs !== null
			? /** @type {Record<string, SchemaNode>} */ (schema.$defs)
			: /** @type {Record<string, SchemaNode>} */ ({});

	/**
	 * @param {SchemaNode} node
	 * @returns {SchemaNode}
	 */
	function resolveNode(node) {
		if (node === null || typeof node !== "object") {
			return node;
		}

		if (Array.isArray(node)) {
			return node.map(resolveNode);
		}

		const obj = /** @type {Record<string, SchemaNode>} */ (node);

		// $ref を解決
		if (typeof obj.$ref === "string") {
			const match = obj.$ref.match(/^#\/\$defs\/(.+)$/);
			if (match && defs[match[1]] !== undefined) {
				// $ref 先の定義をインライン展開 (再帰的に解決)
				return resolveNode(structuredClone(defs[match[1]]));
			}
		}

		// オブジェクトの各プロパティを再帰的に解決
		/** @type {Record<string, SchemaNode>} */
		const resolved = {};
		for (const [key, value] of Object.entries(obj)) {
			if (key === "$defs") continue; // $defs 自体は出力に含めない
			resolved[key] = resolveNode(value);
		}
		return resolved;
	}

	return resolveNode(schema);
}

/**
 * @param {SchemaNode} node
 * @param {Set<unknown> | null} fieldNamesToStripDefaults
 * @returns {SchemaNode}
 */
function normalizeSchemaForZod(node, fieldNamesToStripDefaults = null) {
	if (node === null || typeof node !== "object") {
		return node;
	}

	if (Array.isArray(node)) {
		return node.map((item) =>
			normalizeSchemaForZod(item, fieldNamesToStripDefaults),
		);
	}

	const obj = /** @type {Record<string, SchemaNode>} */ (node);
	/** @type {Record<string, SchemaNode>} */
	const normalized = {};
	for (const [key, value] of Object.entries(obj)) {
		if (key === "x-at-least-one-not-null") continue;
		if (
			key === "default" &&
			value === null &&
			fieldNamesToStripDefaults instanceof Set
		) {
			continue;
		}
		normalized[key] = normalizeSchemaForZod(value, fieldNamesToStripDefaults);
	}
	return normalized;
}

/**
 * @param {string} zodCode
 * @param {unknown} fieldNames
 * @returns {string}
 */
function withAtLeastOneNotNullRefinement(zodCode, fieldNames) {
	if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
		return zodCode;
	}

	const predicate = fieldNames
		.map((field) => `value.${field} !== undefined && value.${field} !== null`)
		.join(" || ");
	return `${zodCode}.refine((value) => ${predicate}, { message: "At least one field must be provided" })`;
}

/**
 * @param {string} zodCode
 * @param {unknown} fieldNames
 * @returns {string}
 */
function rewriteNullableDefaultsToOptional(zodCode, fieldNames) {
	if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
		return zodCode;
	}

	return zodCode.replaceAll(".default(null)", ".optional()");
}

/**
 * json-schema-to-zod は oneOf を Zod v4 API (z.core.$ZodIssue,
 * code: invalid_union + errors 配列) で出力するが、本リポジトリは Zod v3 を使う。
 * 生成された superRefine ブロックを v3 互換形にまるごと置き換える。
 *
 * 入力例:
 *   z.any().superRefine((x, ctx) => {
 *     const schemas = [...];
 *     const { errors, failed } = schemas.reduce<{...}>(...);
 *     const passed = schemas.length - failed;
 *     if (passed !== 1) { ctx.addIssue(... v4 API ...); }
 *   })
 *
 * 出力例:
 *   z.any().superRefine((x, ctx) => {
 *     const schemas = [...];
 *     const passed = schemas.filter((s) => s.safeParse(x).success).length;
 *     if (passed !== 1) {
 *       ctx.addIssue({ path: [], code: "custom",
 *         message: `Invalid input: Should pass single schema. Passed ${passed}` });
 *     }
 *   })
 *
 * @param {string} zodCode
 * @returns {string}
 */
function rewriteV4OneOfToV3(zodCode) {
	return zodCode.replace(
		/(z\.any\(\)\.superRefine\(\(x,\s*ctx\)\s*=>\s*\{\s*const schemas = \[[\s\S]*?\];)\s*const \{ errors, failed \} = schemas\.reduce[\s\S]*?\{ errors: \[\], failed: 0 \},\s*\);\s*const passed = schemas\.length - failed;\s*if \(passed !== 1\) \{[\s\S]*?\}\s*\}\)/g,
		(_, header) =>
			`${header}\n    const passed = schemas.filter((s) => s.safeParse(x).success).length;\n    if (passed !== 1) {\n      ctx.addIssue({\n        path: [],\n        code: "custom",\n        message: \`Invalid input: Should pass single schema. Passed \${passed}\`,\n      });\n    }\n  })`,
	);
}

function main() {
	const schemaFiles = readdirSync(schemasDir)
		.filter((f) => f.endsWith(".schema.json"))
		.sort();

	if (schemaFiles.length === 0) {
		throw new Error(`no *.schema.json files found in ${schemasDir}`);
	}

	const parts = [
		"/**",
		" * AUTO-GENERATED by scripts/generate-zod.mjs — DO NOT EDIT.",
		" * Source: packages/contracts-ts/schemas/*.schema.json",
		" */",
		'import { z } from "zod";',
		"",
	];

	for (const file of schemaFiles) {
		const schemaPath = join(schemasDir, file);
		const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
		const modelName = file.replace(/\.schema\.json$/, "");
		const exportName = `${modelName}Schema`;
		const atLeastOneNotNull = schema["x-at-least-one-not-null"];

		// $ref をインライン展開してから Zod 生成
		const dereffed = derefSchema(
			normalizeSchemaForZod(
				schema,
				Array.isArray(atLeastOneNotNull) ? new Set(atLeastOneNotNull) : null,
			),
		);

		const zodCode = jsonSchemaToZod(
			/** @type {import("json-schema-to-zod").JsonSchema} */ (dereffed),
			{
				name: exportName,
				module: "none",
			},
		);

		const normalizedZodCode = rewriteV4OneOfToV3(
			rewriteNullableDefaultsToOptional(zodCode, atLeastOneNotNull),
		);
		parts.push(
			`export ${withAtLeastOneNotNullRefinement(normalizedZodCode, atLeastOneNotNull)}`,
		);
		parts.push("");
	}

	mkdirSync(dirname(outFile), { recursive: true });
	writeFileSync(outFile, parts.join("\n"));
	console.log(`wrote ${resolve(outFile)}`);
}

try {
	main();
} catch (err) {
	console.error(err);
	process.exit(1);
}
