import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { type HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export interface SwapMealLambdaProps {
	readonly httpApi: HttpApi;
	readonly table: dynamodb.Table;
	readonly agentcoreRuntimeArn: string;
}

/**
 * Plan 09: Meal swap Adapter Lambda。
 *
 * 1 Lambda 内部で path により 2 route を分岐:
 * - POST /users/me/plans/{weekStart}/meals/swap-candidates (経路 A、AgentCore 呼出)
 * - POST /users/me/plans/{weekStart}/meals/swap-apply (経路 B、DDB のみ)
 *
 * IAM は最小権限 (LeadingKeys=user#* + DeleteItem 追加)。
 */
export class SwapMealLambda extends Construct {
	constructor(scope: Construct, id: string, props: SwapMealLambdaProps) {
		super(scope, id);

		const fn = new lambda_nodejs.NodejsFunction(this, "Fn", {
			entry: path.join(__dirname, "../../lambdas/swap-meal/index.ts"),
			handler: "handler",
			runtime: lambda.Runtime.NODEJS_22_X,
			timeout: cdk.Duration.seconds(30),
			memorySize: 512,
			environment: {
				TABLE_NAME: props.table.tableName,
				AGENTCORE_RUNTIME_ARN: props.agentcoreRuntimeArn,
				AGENTCORE_REGION: "us-west-2",
			},
		});

		// Plan 08 と同じ最小権限パターン。swap-meal は proposal DeleteItem が追加で必要。
		// - GetItem: profile / plan / swap_proposal
		// - PutItem: plan (apply 時、ConditionExpression で revision 比較) / swap_proposal (candidates 時)
		// - DeleteItem: swap_proposal (apply 成功時の one-shot 消費)
		fn.addToRolePolicy(
			new iam.PolicyStatement({
				actions: [
					"dynamodb:GetItem",
					"dynamodb:PutItem",
					"dynamodb:DeleteItem",
				],
				resources: [props.table.tableArn],
				conditions: {
					"ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["user#*"] },
				},
			}),
		);
		fn.addToRolePolicy(
			new iam.PolicyStatement({
				actions: ["bedrock-agentcore:InvokeAgentRuntime"],
				resources: [
					props.agentcoreRuntimeArn,
					`${props.agentcoreRuntimeArn}/*`,
				],
			}),
		);

		const integration = new HttpLambdaIntegration("Integration", fn);
		props.httpApi.addRoutes({
			path: "/users/me/plans/{weekStart}/meals/swap-candidates",
			methods: [HttpMethod.POST],
			integration,
		});
		props.httpApi.addRoutes({
			path: "/users/me/plans/{weekStart}/meals/swap-apply",
			methods: [HttpMethod.POST],
			integration,
		});
	}
}
