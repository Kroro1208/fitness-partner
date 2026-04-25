import { describe, expect, it, vi } from "vitest";

const invokeCommandMock = vi.fn();
const sendMock = vi.fn();

vi.mock("@aws-sdk/client-bedrock-agentcore", () => ({
	BedrockAgentCoreClient: vi.fn().mockImplementation(() => ({
		send: sendMock,
	})),
	InvokeAgentRuntimeCommand: invokeCommandMock,
}));

process.env.AGENTCORE_REGION = "us-west-2";
process.env.AGENTCORE_RUNTIME_ARN =
	"arn:aws:bedrock-agentcore:us-west-2:0:runtime/x";

describe("swap-meal agentcore-client", () => {
	it("payload は action=swap_candidates + swap_context を含み、JSON parse される", async () => {
		sendMock.mockResolvedValueOnce({
			response: (async function* () {
				yield new TextEncoder().encode(
					'{"generated_candidates":{"candidates":[]}}',
				);
			})(),
		});
		const { invokeSwapAgent, __resetClientForTests } = await import(
			"../../../lambdas/swap-meal/agentcore-client"
		);
		__resetClientForTests();

		const result = await invokeSwapAgent(
			{
				swap_context: {
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
					target_meal: {
						slot: "breakfast",
						title: "朝",
						items: [
							{
								food_id: null,
								name: "x",
								grams: 100,
								calories_kcal: 200,
								protein_g: 10,
								fat_g: 5,
								carbs_g: 20,
							},
						],
						total_calories_kcal: 200,
						total_protein_g: 10,
						total_fat_g: 5,
						total_carbs_g: 20,
					},
					daily_context: {
						date: "2026-04-27",
						original_day_total_calories_kcal: 2000,
						original_day_total_protein_g: 120,
						original_day_total_fat_g: 60,
						original_day_total_carbs_g: 220,
						other_meals_total_calories_kcal: 1500,
						other_meals_total_protein_g: 90,
						other_meals_total_fat_g: 45,
						other_meals_total_carbs_g: 170,
					},
				},
			},
			5000,
		);

		expect(result).toEqual({ generated_candidates: { candidates: [] } });
		expect(invokeCommandMock).toHaveBeenCalledTimes(1);
		const call = invokeCommandMock.mock.calls[0][0];
		expect(call.agentRuntimeArn).toBe(
			"arn:aws:bedrock-agentcore:us-west-2:0:runtime/x",
		);
		const payload = JSON.parse(
			new TextDecoder().decode(call.payload as Uint8Array),
		);
		expect(payload.action).toBe("swap_candidates");
		expect(payload.swap_context.target_meal.slot).toBe("breakfast");
		expect(
			payload.swap_context.daily_context.original_day_total_calories_kcal,
		).toBe(2000);
	});

	it("AGENTCORE_RUNTIME_ARN 未設定で throw", async () => {
		const prev = process.env.AGENTCORE_RUNTIME_ARN;
		process.env.AGENTCORE_RUNTIME_ARN = undefined;
		delete process.env.AGENTCORE_RUNTIME_ARN;
		const { invokeSwapAgent } = await import(
			"../../../lambdas/swap-meal/agentcore-client"
		);
		await expect(
			invokeSwapAgent(
				{
					swap_context: {
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
						target_meal: {
							slot: "breakfast",
							title: "朝",
							items: [
								{
									food_id: null,
									name: "x",
									grams: 100,
									calories_kcal: 200,
									protein_g: 10,
									fat_g: 5,
									carbs_g: 20,
								},
							],
							total_calories_kcal: 200,
							total_protein_g: 10,
							total_fat_g: 5,
							total_carbs_g: 20,
						},
						daily_context: {
							date: "2026-04-27",
							original_day_total_calories_kcal: 2000,
							original_day_total_protein_g: 120,
							original_day_total_fat_g: 60,
							original_day_total_carbs_g: 220,
							other_meals_total_calories_kcal: 1500,
							other_meals_total_protein_g: 90,
							other_meals_total_fat_g: 45,
							other_meals_total_carbs_g: 170,
						},
					},
				},
				5000,
			),
		).rejects.toThrow(/AGENTCORE_RUNTIME_ARN/);
		process.env.AGENTCORE_RUNTIME_ARN = prev;
	});
});
