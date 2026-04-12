import * as cognito from "aws-cdk-lib/aws-cognito";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambda_nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import * as path from "node:path";

export interface FitnessAuthProps {
  readonly inviteCodes: string;
}

export class FitnessAuth extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: FitnessAuthProps) {
    super(scope, id);

    const preSignupFn = new lambda_nodejs.NodejsFunction(this, "PreSignupFn", {
      entry: path.join(__dirname, "../../lambdas/pre-signup/index.ts"),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_22_X,
      environment: {
        INVITE_CODES: props.inviteCodes,
      },
    });

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
