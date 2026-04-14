import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { FitnessDatabase } from "./constructs/database";
import { FitnessAuth } from "./constructs/auth";
import { FitnessApi } from "./constructs/api";
import { HelloLambda } from "./constructs/hello-lambda";
import { CrudLambdas } from "./constructs/crud-lambdas";

export class FitnessStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const rawInviteCodes: unknown = this.node.tryGetContext("inviteCodes");
    if (typeof rawInviteCodes !== "string" || rawInviteCodes.length === 0) {
      throw new Error(
        "Missing required context: -c inviteCodes=CODE1,CODE2. " +
          "Every deploy must specify invite codes explicitly.",
      );
    }
    const inviteCodes: string = rawInviteCodes;

    const database = new FitnessDatabase(this, "Database");

    const auth = new FitnessAuth(this, "Auth", {
      inviteCodes,
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
  }
}
