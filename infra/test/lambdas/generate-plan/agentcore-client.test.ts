import { describe, expect, it, vi } from "vitest";

vi.mock("@aws-sdk/client-bedrock-agentcore", () => ({
	BedrockAgentCoreClient: vi.fn().mockImplementation(() => ({
		send: vi.fn().mockResolvedValue({
			response: (async function* () {
				yield new TextEncoder().encode('{"ok":true}');
			})(),
		}),
	})),
	InvokeAgentRuntimeCommand: vi.fn(),
}));

// fail-loud config: REGION / ARN の両方が required
process.env.AGENTCORE_REGION = "us-west-2";
process.env.AGENTCORE_RUNTIME_ARN =
	"arn:aws:bedrock-agentcore:us-west-2:0:runtime/x";

describe("agentcore-client", () => {
	it("JSON parse できる", async () => {
		const { invokeAgent } = await import(
			"../../../lambdas/generate-plan/agentcore-client"
		);
		// SafePromptProfile / SafeAgentInput の詳細 shape は InvokePayload 型で
		// 制約されているが、invokeAgent はこの test の目的 (stream→JSON parse) に
		// 対して payload の中身を使わない。型を満たす最小値だけ渡す。
		const result = await invokeAgent(
			{
				user_id: "u1",
				week_start: "2026-04-20",
				safe_prompt_profile: {
					age: 30,
					sex: "male",
					height_cm: 170,
					weight_kg: 70,
					favorite_meals: [],
					hated_foods: [],
					restrictions: [],
					current_snacks: [],
					avoid_alcohol: false,
					avoid_supplements_without_consultation: false,
				},
				safe_agent_input: {
					calorie_macro_input: {
						age: 30,
						sex: "male",
						height_cm: 170,
						weight_kg: 70,
						activity_level: "moderately_active",
						sleep_hours: 7,
						stress_level: "low",
					},
					hydration_input: {
						weight_kg: 70,
						workouts_per_week: 3,
						avg_workout_minutes: 30,
						job_type: "desk",
					},
					supplement_input: {
						protein_gap_g: 0,
						workouts_per_week: 3,
						sleep_hours: 7,
						fish_per_week: 2,
						early_morning_training: false,
						low_sunlight_exposure: false,
					},
				},
			},
			5000,
		);
		expect(result).toEqual({ ok: true });
	});
});
