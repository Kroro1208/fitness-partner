import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import { FitnessStack } from "../lib/fitness-stack";

describe("FitnessStack", () => {
  const app = new cdk.App({ context: { inviteCodes: "TEST123" } });
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

  it("creates a pre-signup Lambda with INVITE_CODES env var", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
      Environment: {
        Variables: {
          INVITE_CODES: "TEST123",
        },
      },
    });
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

  it("throws when inviteCodes context is not provided", () => {
    const appNoContext = new cdk.App();
    expect(() => new FitnessStack(appNoContext, "NoContextStack")).toThrow(
      "Missing required context",
    );
  });
});
