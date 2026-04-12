import { HttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import type { HttpApi } from "aws-cdk-lib/aws-apigatewayv2";
import { Construct } from "constructs";
import * as path from "node:path";

export interface HelloLambdaProps {
  readonly httpApi: HttpApi;
}

export class HelloLambda extends Construct {
  constructor(scope: Construct, id: string, props: HelloLambdaProps) {
    super(scope, id);

    const helloFn = new lambda_nodejs.NodejsFunction(this, "HelloFn", {
      entry: path.join(__dirname, "../../lambdas/hello/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
    });

    props.httpApi.addRoutes({
      path: "/hello",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("HelloIntegration", helloFn),
    });
  }
}
