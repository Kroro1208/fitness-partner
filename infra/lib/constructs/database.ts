import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class FitnessDatabase extends Construct {
	public readonly table: dynamodb.Table;

	constructor(scope: Construct, id: string) {
		super(scope, id);

		this.table = new dynamodb.Table(this, "FitnessTable", {
			partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
			sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			pointInTimeRecoverySpecification: {
				pointInTimeRecoveryEnabled: true,
			},
			removalPolicy: cdk.RemovalPolicy.RETAIN,
			// Plan 09: swap_proposal#<uuid> item を TTL で自動削除するため。
			// 10 分後に期限切れとなる proposal に ``ttl`` (unix seconds) を付与し、
			// DynamoDB 側で非同期削除される。他の item type (user / plan / food) には
			// ttl 属性を付けないため影響しない。
			timeToLiveAttribute: "ttl",
		});
	}
}
