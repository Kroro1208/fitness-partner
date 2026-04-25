import { App, Stack } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { describe, it } from "vitest";
import { GeneratePlanLambda } from "../../../lib/constructs/generate-plan-lambda";

describe("GeneratePlanLambda", () => {
	it("Lambda + IAM + Route", () => {
		const app = new App();
		const stack = new Stack(app, "T", {
			env: { region: "ap-northeast-1", account: "1" },
		});
		const httpApi = new HttpApi(stack, "Api");
		const table = new dynamodb.Table(stack, "Tbl", {
			partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
			sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
		});
		new GeneratePlanLambda(stack, "GP", {
			httpApi,
			table,
			agentcoreRuntimeArn: "arn:aws:bedrock-agentcore:us-west-2:1:runtime/x",
		});
		const t = Template.fromStack(stack);
		t.resourceCountIs("AWS::Lambda::Function", 1);
		t.hasResourceProperties("AWS::Lambda::Function", {
			Timeout: 120,
		});
		t.hasResourceProperties("AWS::IAM::Policy", {
			PolicyDocument: Match.objectLike({
				Statement: Match.arrayWith([
					Match.objectLike({
						Action: "bedrock-agentcore:InvokeAgentRuntime",
					}),
				]),
			}),
		});
		// DDB 最小権限: user#* LeadingKeys 条件が付いていること
		t.hasResourceProperties("AWS::IAM::Policy", {
			PolicyDocument: Match.objectLike({
				Statement: Match.arrayWith([
					Match.objectLike({
						Action: Match.arrayWith(["dynamodb:GetItem", "dynamodb:PutItem"]),
						Condition: Match.objectLike({
							"ForAllValues:StringLike": Match.objectLike({
								"dynamodb:LeadingKeys": ["user#*"],
							}),
						}),
					}),
				]),
			}),
		});
	});
});
