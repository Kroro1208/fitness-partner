import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, it } from "vitest";
import { PlanGeneratorStack } from "../../lib/plan-generator-stack";

describe("PlanGeneratorStack", () => {
	it("Runtime + IAM を含む", () => {
		const app = new App();
		const stack = new PlanGeneratorStack(app, "Test", {
			env: { region: "us-west-2", account: "111111111111" },
			fitnessTableArn:
				"arn:aws:dynamodb:ap-northeast-1:111111111111:table/FitnessTable",
		});
		const t = Template.fromStack(stack);
		t.hasResourceProperties("AWS::BedrockAgentCore::Runtime", {
			AgentRuntimeName: "Test-runtime",
			RoleArn: {
				"Fn::GetAtt": [Match.anyValue(), "Arn"],
			},
			AgentRuntimeArtifact: {
				ContainerConfiguration: {
					ContainerUri: Match.anyValue(),
				},
			},
		});
		t.hasResourceProperties("AWS::IAM::Role", {
			AssumeRolePolicyDocument: Match.objectLike({
				Statement: Match.arrayWith([
					Match.objectLike({
						Principal: { Service: "bedrock-agentcore.amazonaws.com" },
						Condition: Match.objectLike({
							StringEquals: { "aws:SourceAccount": "111111111111" },
						}),
					}),
				]),
			}),
		});
	});

	it("container IAM が food#* LeadingKeys で read-only に絞られる", () => {
		const app = new App();
		const stack = new PlanGeneratorStack(app, "Test", {
			env: { region: "us-west-2", account: "111111111111" },
			fitnessTableArn:
				"arn:aws:dynamodb:ap-northeast-1:111111111111:table/FitnessTable",
		});
		const t = Template.fromStack(stack);
		// GetItem のみ、LeadingKeys=food#*、PutItem は含まれない
		t.hasResourceProperties("AWS::IAM::Policy", {
			PolicyDocument: Match.objectLike({
				Statement: Match.arrayWith([
					Match.objectLike({
						Action: "ecr:GetAuthorizationToken",
						Resource: "*",
					}),
					Match.objectLike({
						Action: "dynamodb:GetItem",
						Condition: Match.objectLike({
							"ForAllValues:StringLike": Match.objectLike({
								"dynamodb:LeadingKeys": ["food#*"],
							}),
						}),
					}),
				]),
			}),
		});
		t.hasResourceProperties("AWS::IAM::Policy", {
			PolicyDocument: Match.objectLike({
				Statement: Match.arrayWith([
					Match.objectLike({
						Action: Match.arrayWith([
							"bedrock:InvokeModel",
							"bedrock:InvokeModelWithResponseStream",
						]),
					}),
				]),
			}),
		});
		// container policy (= Runtime Role 経由で添付される Policy) に PutItem が
		// 含まれる Statement が 0 件であることを CDK Match API で宣言的に検証する。
		// GeneratePlanLambda 側の user#* policy は別 Stack なのでここでは評価されない。
		t.resourcePropertiesCountIs(
			"AWS::IAM::Policy",
			{
				PolicyDocument: Match.objectLike({
					Statement: Match.arrayWith([
						Match.objectLike({ Action: "dynamodb:PutItem" }),
					]),
				}),
			},
			0,
		);
	});
});
