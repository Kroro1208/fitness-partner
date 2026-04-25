import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { type HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export interface GeneratePlanLambdaProps {
	readonly httpApi: HttpApi;
	readonly table: dynamodb.Table;
	readonly agentcoreRuntimeArn: string;
}

export class GeneratePlanLambda extends Construct {
	constructor(scope: Construct, id: string, props: GeneratePlanLambdaProps) {
		super(scope, id);

		const fn = new lambda_nodejs.NodejsFunction(this, "Fn", {
			entry: path.join(__dirname, "../../lambdas/generate-plan/index.ts"),
			handler: "handler",
			runtime: lambda.Runtime.NODEJS_22_X,
			timeout: cdk.Duration.seconds(120),
			memorySize: 1024,
			environment: {
				TABLE_NAME: props.table.tableName,
				AGENTCORE_RUNTIME_ARN: props.agentcoreRuntimeArn,
				AGENTCORE_REGION: "us-west-2",
			},
			// AgentCore client は新しいサービス SDK で、Lambda runtime 同梱版への依存は
			// 不安定。ここは bundle して deploy artifact を自己完結させる。
		});

		// 最小権限: spec §セキュリティに従い dynamodb:LeadingKeys=user#* 条件を付与。
		// grantReadWriteData は table 全体へ GetItem/PutItem を許してしまうため使わない。
		fn.addToRolePolicy(
			new iam.PolicyStatement({
				actions: [
					"dynamodb:GetItem",
					"dynamodb:PutItem",
					"dynamodb:UpdateItem",
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
				// AgentCore invoke は qualifier=DEFAULT を付けると
				// `...:runtime/<id>/qualifier/DEFAULT` 側で IAM 評価される。
				// runtime 本体 ARN だけだと AccessDenied になるため、配下も許可する。
				resources: [
					props.agentcoreRuntimeArn,
					`${props.agentcoreRuntimeArn}/*`,
				],
			}),
		);

		props.httpApi.addRoutes({
			path: "/users/me/plans/generate",
			methods: [HttpMethod.POST],
			integration: new HttpLambdaIntegration("Integration", fn),
		});
	}
}
