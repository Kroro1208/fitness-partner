import * as path from "node:path";
import * as cognito from "aws-cdk-lib/aws-cognito";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

export interface FitnessAuthProps {
	readonly inviteCodesParameterName: string;
	readonly table: dynamodb.Table;
}

export class FitnessAuth extends Construct {
	public readonly userPool: cognito.UserPool;
	public readonly userPoolClient: cognito.UserPoolClient;

	constructor(scope: Construct, id: string, props: FitnessAuthProps) {
		super(scope, id);

		const inviteCodesParameter = ssm.StringParameter.fromStringParameterName(
			this,
			"InviteCodesParameter",
			props.inviteCodesParameterName,
		);

		const preSignupFn = new lambda_nodejs.NodejsFunction(this, "PreSignupFn", {
			entry: path.join(__dirname, "../../lambdas/pre-signup/index.ts"),
			handler: "handler",
			runtime: lambda.Runtime.NODEJS_22_X,
			environment: {
				INVITE_CODES_PARAMETER_NAME: inviteCodesParameter.parameterName,
				TABLE_NAME: props.table.tableName,
			},
		});
		inviteCodesParameter.grantRead(preSignupFn);
		props.table.grant(preSignupFn, "dynamodb:PutItem");

		this.userPool = new cognito.UserPool(this, "UserPool", {
			selfSignUpEnabled: true,
			signInAliases: { email: true },
			autoVerify: { email: true },
			passwordPolicy: {
				minLength: 8,
				requireLowercase: true,
				requireUppercase: true,
				requireDigits: true,
				requireSymbols: true,
			},
			mfa: cognito.Mfa.OPTIONAL,
			mfaSecondFactor: { sms: false, otp: true },
			lambdaTriggers: {
				preSignUp: preSignupFn,
			},
		});

		this.userPoolClient = this.userPool.addClient("AppClient", {
			authFlows: {
				userSrp: true,
				userPassword: true,
			},
			disableOAuth: true,
		});
	}
}
