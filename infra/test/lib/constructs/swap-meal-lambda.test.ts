import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { describe, it } from "vitest";

import { SwapMealLambda } from "../../../lib/constructs/swap-meal-lambda";

function buildStack() {
	const app = new cdk.App();
	const stack = new cdk.Stack(app, "TestStack", {
		env: { account: "111122223333", region: "ap-northeast-1" },
	});
	const table = new dynamodb.Table(stack, "T", {
		partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
		sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
	});
	const httpApi = new HttpApi(stack, "Api");
	new SwapMealLambda(stack, "SM", {
		httpApi,
		table,
		agentcoreRuntimeArn:
			"arn:aws:bedrock-agentcore:us-west-2:111122223333:runtime/abc",
	});
	return Template.fromStack(stack);
}

describe("SwapMealLambda", () => {
	it("creates two API Gateway routes (candidates + apply)", () => {
		const t = buildStack();
		t.resourceCountIs("AWS::ApiGatewayV2::Route", 2);
		t.hasResourceProperties("AWS::ApiGatewayV2::Route", {
			RouteKey: "POST /users/me/plans/{weekStart}/meals/swap-candidates",
		});
		t.hasResourceProperties("AWS::ApiGatewayV2::Route", {
			RouteKey: "POST /users/me/plans/{weekStart}/meals/swap-apply",
		});
	});

	it("grants rate limit + proposal permissions on the table with LeadingKeys=user#*", () => {
		const t = buildStack();
		t.hasResourceProperties("AWS::IAM::Policy", {
			PolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Action: Match.arrayWith([
							"dynamodb:GetItem",
							"dynamodb:PutItem",
							"dynamodb:UpdateItem",
							"dynamodb:DeleteItem",
						]),
						Condition: {
							"ForAllValues:StringLike": {
								"dynamodb:LeadingKeys": ["user#*"],
							},
						},
					}),
				]),
			},
		});
	});

	it("grants bedrock-agentcore:InvokeAgentRuntime on the provided ARN", () => {
		const t = buildStack();
		t.hasResourceProperties("AWS::IAM::Policy", {
			PolicyDocument: {
				Statement: Match.arrayWith([
					Match.objectLike({
						Action: "bedrock-agentcore:InvokeAgentRuntime",
					}),
				]),
			},
		});
	});

	it("Lambda has TABLE_NAME and AGENTCORE_RUNTIME_ARN env vars", () => {
		const t = buildStack();
		t.hasResourceProperties("AWS::Lambda::Function", {
			Environment: {
				Variables: Match.objectLike({
					AGENTCORE_RUNTIME_ARN:
						"arn:aws:bedrock-agentcore:us-west-2:111122223333:runtime/abc",
					AGENTCORE_REGION: "us-west-2",
				}),
			},
		});
	});
});
