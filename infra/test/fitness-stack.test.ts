import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { FitnessStack } from "../lib/fitness-stack";

describe("FitnessStack", () => {
	const app = new cdk.App({
		context: {
			inviteCodesParameterName: "/fitness/test/invite-codes",
		},
	});
	const stack = new FitnessStack(app, "TestStack");
	const template = Template.fromStack(stack);

	it("creates a DynamoDB table with pk/sk and PAY_PER_REQUEST", () => {
		template.hasResourceProperties("AWS::DynamoDB::Table", {
			KeySchema: [
				{ AttributeName: "pk", KeyType: "HASH" },
				{ AttributeName: "sk", KeyType: "RANGE" },
			],
			BillingMode: "PAY_PER_REQUEST",
			PointInTimeRecoverySpecification: {
				PointInTimeRecoveryEnabled: true,
			},
		});
	});

	it("creates a Cognito User Pool with email sign-in and MFA optional", () => {
		template.hasResourceProperties("AWS::Cognito::UserPool", {
			UsernameAttributes: ["email"],
			MfaConfiguration: "OPTIONAL",
		});
	});

	it("creates a User Pool Client with SRP and PASSWORD auth flows", () => {
		template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
			ExplicitAuthFlows: [
				"ALLOW_USER_PASSWORD_AUTH",
				"ALLOW_USER_SRP_AUTH",
				"ALLOW_REFRESH_TOKEN_AUTH",
			],
		});
	});

	it("creates a pre-signup Lambda with SecureString parameter name and table env vars", () => {
		template.hasResourceProperties("AWS::Lambda::Function", {
			Runtime: "nodejs22.x",
			Environment: {
				Variables: {
					INVITE_CODES_PARAMETER_NAME: "/fitness/test/invite-codes",
				},
			},
		});
	});

	it("does not model inviteCodesParameterName as a CloudFormation SSM value parameter", () => {
		const parameters = template.toJSON().Parameters ?? {};
		const inviteParameters = Object.values(parameters).filter(
			(parameter) =>
				typeof parameter === "object" &&
				parameter !== null &&
				"Default" in parameter &&
				parameter.Default === "/fitness/test/invite-codes",
		);

		expect(inviteParameters).toEqual([]);
	});

	it("grants pre-signup Lambda SSM read and DynamoDB PutItem", () => {
		const policies = template.findResources("AWS::IAM::Policy");
		const statements = Object.values(policies).flatMap((policy) => {
			const document = policy.Properties.PolicyDocument;
			return Array.isArray(document.Statement)
				? document.Statement
				: [document.Statement];
		});

		const hasAction = (action: string): boolean =>
			statements.some((statement) => {
				const statementAction = statement.Action;
				return Array.isArray(statementAction)
					? statementAction.includes(action)
					: statementAction === action;
			});

		expect(hasAction("ssm:GetParameter")).toBe(true);
		expect(hasAction("dynamodb:PutItem")).toBe(true);
	});

	it("creates an HTTP API with CORS for localhost:3000", () => {
		template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
			ProtocolType: "HTTP",
			CorsConfiguration: {
				AllowOrigins: ["http://localhost:3000"],
			},
		});
	});

	it("creates a JWT authorizer for Cognito", () => {
		template.hasResourceProperties("AWS::ApiGatewayV2::Authorizer", {
			AuthorizerType: "JWT",
		});
	});

	it("creates a GET /hello route with JWT auth", () => {
		template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
			RouteKey: "GET /hello",
			AuthorizationType: "JWT",
		});
	});

	it("outputs ApiUrl, UserPoolId, UserPoolClientId, TableName", () => {
		const outputs = template.findOutputs("*");
		expect(Object.keys(outputs)).toEqual(
			expect.arrayContaining([
				"ApiUrl",
				"UserPoolId",
				"UserPoolClientId",
				"TableName",
			]),
		);
	});

	// ── CRUD Lambda ルート ──────────────────────────────────────────

	it("creates a GET /users/me/profile route with JWT auth", () => {
		template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
			RouteKey: "GET /users/me/profile",
			AuthorizationType: "JWT",
		});
	});

	it("creates a PATCH /users/me/profile route with JWT auth", () => {
		template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
			RouteKey: "PATCH /users/me/profile",
			AuthorizationType: "JWT",
		});
	});

	it("creates a POST /users/me/meals route with JWT auth", () => {
		template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
			RouteKey: "POST /users/me/meals",
			AuthorizationType: "JWT",
		});
	});

	it("creates a POST /users/me/weight route with JWT auth", () => {
		template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
			RouteKey: "POST /users/me/weight",
			AuthorizationType: "JWT",
		});
	});

	it("creates a GET /users/me/plans/{weekStart} route with JWT auth", () => {
		template.hasResourceProperties("AWS::ApiGatewayV2::Route", {
			RouteKey: "GET /users/me/plans/{weekStart}",
			AuthorizationType: "JWT",
		});
	});

	// construct ID ベースで各 CRUD Lambda を個別に検証
	const crudConstructIds = [
		"FetchUserProfileFn",
		"UpdateUserProfileFn",
		"LogMealFn",
		"LogWeightFn",
		"FetchWeeklyPlanFn",
	];

	for (const constructId of crudConstructIds) {
		it(`creates ${constructId} with TABLE_NAME`, () => {
			const allFunctions = template.findResources("AWS::Lambda::Function");
			const matched = Object.entries(allFunctions).filter(([logicalId]) =>
				logicalId.includes(constructId),
			);
			expect(matched.length).toBeGreaterThanOrEqual(1);
			const [, resource] = matched[0];
			expect(resource.Properties.Environment.Variables).toHaveProperty(
				"TABLE_NAME",
			);
		});
	}

	it("includes PATCH in CORS allowed methods", () => {
		template.hasResourceProperties("AWS::ApiGatewayV2::Api", {
			CorsConfiguration: {
				AllowMethods: Match.arrayWith(["PATCH"]),
			},
		});
	});

	it("throws when inviteCodesParameterName context is not provided", () => {
		const appNoContext = new cdk.App();
		expect(() => new FitnessStack(appNoContext, "NoContextStack")).toThrow(
			"Missing required context",
		);
	});
});
