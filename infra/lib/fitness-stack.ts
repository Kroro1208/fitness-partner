import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { FitnessApi } from "./constructs/api";
import { FitnessAuth } from "./constructs/auth";
import { CrudLambdas } from "./constructs/crud-lambdas";
import { FitnessDatabase } from "./constructs/database";
import { GeneratePlanLambda } from "./constructs/generate-plan-lambda";
import { HelloLambda } from "./constructs/hello-lambda";
import { SwapMealLambda } from "./constructs/swap-meal-lambda";

export class FitnessStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const rawInviteCodesParameterName: unknown = this.node.tryGetContext(
			"inviteCodesParameterName",
		);
		if (
			typeof rawInviteCodesParameterName !== "string" ||
			rawInviteCodesParameterName.length === 0
		) {
			throw new Error(
				"Missing required context: -c inviteCodesParameterName=/path/to/secure/string. " +
					"Every deploy must reference a SecureString parameter explicitly.",
			);
		}
		const inviteCodesParameterName = rawInviteCodesParameterName;

		const database = new FitnessDatabase(this, "Database");

		const auth = new FitnessAuth(this, "Auth", {
			inviteCodesParameterName,
			table: database.table,
		});

		const api = new FitnessApi(this, "Api", {
			userPool: auth.userPool,
			userPoolClient: auth.userPoolClient,
		});

		new HelloLambda(this, "HelloLambda", {
			httpApi: api.httpApi,
		});

		new CrudLambdas(this, "CrudLambdas", {
			httpApi: api.httpApi,
			table: database.table,
		});

		// Plan 08 Phase E: 2段階デプロイ対応。初回は agentcoreRuntimeArn context が
		// 未設定のため GeneratePlanLambda を skip する。PlanGeneratorStack を先に
		// デプロイして RuntimeArn を取得したのち、`-c agentcoreRuntimeArn=<arn>` で
		// 再デプロイすると Lambda + ルートが追加される。
		const rawAgentcoreArn = this.node.tryGetContext("agentcoreRuntimeArn");
		const agentcoreRuntimeArn =
			typeof rawAgentcoreArn === "string" && rawAgentcoreArn.length > 0
				? rawAgentcoreArn
				: null;

		if (agentcoreRuntimeArn !== null) {
			new GeneratePlanLambda(this, "GeneratePlanLambda", {
				httpApi: api.httpApi,
				table: database.table,
				agentcoreRuntimeArn,
			});
			// Plan 09: Meal swap Adapter Lambda。同 Runtime を再利用するため
			// GeneratePlanLambda と同じ agentcoreRuntimeArn 前提で有効化する。
			new SwapMealLambda(this, "SwapMealLambda", {
				httpApi: api.httpApi,
				table: database.table,
				agentcoreRuntimeArn,
			});
		} else {
			cdk.Annotations.of(this).addInfo(
				"agentcoreRuntimeArn context not set — skipping GeneratePlanLambda and SwapMealLambda. " +
					"Re-deploy with `-c agentcoreRuntimeArn=<arn>` after PlanGeneratorStack.",
			);
		}

		new cdk.CfnOutput(this, "ApiUrl", {
			value: api.httpApi.apiEndpoint,
			description: "API Gateway endpoint URL",
		});

		new cdk.CfnOutput(this, "UserPoolId", {
			value: auth.userPool.userPoolId,
			description: "Cognito User Pool ID",
		});

		new cdk.CfnOutput(this, "UserPoolClientId", {
			value: auth.userPoolClient.userPoolClientId,
			description: "Cognito User Pool Client ID",
		});

		new cdk.CfnOutput(this, "TableName", {
			value: database.table.tableName,
			description: "DynamoDB table name",
		});

		new cdk.CfnOutput(this, "TableArnOutput", {
			value: database.table.tableArn,
			description: "FitnessTable ARN",
		});
	}
}
