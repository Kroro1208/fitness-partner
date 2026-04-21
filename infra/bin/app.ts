#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { FitnessStack } from "../lib/fitness-stack";
import { PlanGeneratorStack } from "../lib/plan-generator-stack";

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;

new FitnessStack(app, "FitnessStack", {
	env: account ? { region: "ap-northeast-1", account } : undefined,
});

// cross-region token 参照を避けるため、FitnessTable 名は context 経由で渡す。
// 初回 `pnpm deploy:plan-generator` 時にまだテーブル名が不明な場合は
// デフォルト "FitnessTable" を使う。以降 PlanGeneratorStack をデプロイする
// 際は `-c fitnessTableName=<実際のテーブル名>` で上書きする。
const fitnessTableName =
	app.node.tryGetContext("fitnessTableName") ?? "FitnessTable";

if (account) {
	const fitnessTableArn = `arn:aws:dynamodb:ap-northeast-1:${account}:table/${fitnessTableName}`;
	new PlanGeneratorStack(app, "PlanGeneratorStack", {
		env: { region: "us-west-2", account },
		fitnessTableArn,
	});
}
