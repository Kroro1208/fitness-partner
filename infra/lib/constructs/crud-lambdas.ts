import * as path from "node:path";
import { type HttpApi, HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export interface CrudLambdasProps {
	readonly httpApi: HttpApi;
	readonly table: dynamodb.Table;
}

export class CrudLambdas extends Construct {
	constructor(scope: Construct, id: string, props: CrudLambdasProps) {
		super(scope, id);

		/**
		 * CRUD Lambda を 1 本作成し、IAM 権限付与 + API ルート登録する。
		 * 5 本の Lambda で共通する entry/runtime/env/bundling/grant/route の
		 * ボイラープレートを集約。
		 */
		const createCrudFunction = (opts: {
			constructId: string;
			lambdaDir: string;
			iamAction: string;
			routePath: string;
			method: HttpMethod;
		}) => {
			const fn = new lambda_nodejs.NodejsFunction(this, opts.constructId, {
				entry: path.join(__dirname, `../../lambdas/${opts.lambdaDir}/index.ts`),
				handler: "handler",
				runtime: lambda.Runtime.NODEJS_22_X,
				environment: { TABLE_NAME: props.table.tableName },
				bundling: { externalModules: ["@aws-sdk/*"] },
			});
			props.table.grant(fn, opts.iamAction);
			props.httpApi.addRoutes({
				path: opts.routePath,
				methods: [opts.method],
				integration: new HttpLambdaIntegration(
					`${opts.constructId}Integration`,
					fn,
				),
			});
			return fn;
		};

		createCrudFunction({
			constructId: "FetchUserProfileFn",
			lambdaDir: "fetch-user-profile",
			iamAction: "dynamodb:GetItem",
			routePath: "/users/me/profile",
			method: HttpMethod.GET,
		});

		createCrudFunction({
			constructId: "UpdateUserProfileFn",
			lambdaDir: "update-user-profile",
			iamAction: "dynamodb:UpdateItem",
			routePath: "/users/me/profile",
			method: HttpMethod.PATCH,
		});

		createCrudFunction({
			constructId: "LogMealFn",
			lambdaDir: "log-meal",
			iamAction: "dynamodb:PutItem",
			routePath: "/users/me/meals",
			method: HttpMethod.POST,
		});

		createCrudFunction({
			constructId: "LogWeightFn",
			lambdaDir: "log-weight",
			iamAction: "dynamodb:PutItem",
			routePath: "/users/me/weight",
			method: HttpMethod.POST,
		});

		createCrudFunction({
			constructId: "FetchWeeklyPlanFn",
			lambdaDir: "fetch-weekly-plan",
			iamAction: "dynamodb:GetItem",
			routePath: "/users/me/plans/{weekStart}",
			method: HttpMethod.GET,
		});
	}
}
