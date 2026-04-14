import * as cdk from "aws-cdk-lib";
import { CorsHttpMethod, HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpJwtAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import type * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface FitnessApiProps {
	readonly userPool: cognito.UserPool;
	readonly userPoolClient: cognito.UserPoolClient;
}

export class FitnessApi extends Construct {
	public readonly httpApi: HttpApi;

	constructor(scope: Construct, id: string, props: FitnessApiProps) {
		super(scope, id);

		const issuer = `https://cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${props.userPool.userPoolId}`;

		const authorizer = new HttpJwtAuthorizer("CognitoAuthorizer", issuer, {
			jwtAudience: [props.userPoolClient.userPoolClientId],
		});

		this.httpApi = new HttpApi(this, "HttpApi", {
			corsPreflight: {
				allowOrigins: ["http://localhost:3000"],
				allowMethods: [
					CorsHttpMethod.GET,
					CorsHttpMethod.POST,
					CorsHttpMethod.PUT,
					CorsHttpMethod.PATCH,
					CorsHttpMethod.DELETE,
					CorsHttpMethod.OPTIONS,
				],
				allowHeaders: ["Authorization", "Content-Type"],
			},
			defaultAuthorizer: authorizer,
		});
	}
}
