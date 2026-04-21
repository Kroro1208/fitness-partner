import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface AgentCoreRuntimeProps {
	readonly fitnessTableArn: string;
}

export class AgentCoreRuntime extends Construct {
	public readonly runtimeArn: string;

	constructor(scope: Construct, id: string, props: AgentCoreRuntimeProps) {
		super(scope, id);
		const stack = cdk.Stack.of(this);
		const account = stack.account;
		const region = stack.region;
		const runtimeName = `${stack.stackName}-runtime`;

		// build context = repo root
		const image = new DockerImageAsset(this, "Image", {
			directory: path.join(__dirname, "../../.."),
			file: "infra/agents/plan-generator/Dockerfile",
			platform: Platform.LINUX_ARM64,
			exclude: [
				"node_modules",
				"**/node_modules",
				"cdk.out",
				"**/cdk.out",
				".next",
				"**/.next",
				".venv",
				"**/.venv",
				"**/__pycache__",
				"packages/web",
				".git",
				".claude",
				".agent",
				".codex",
				"tasks",
				"docs",
				"tmp",
				".DS_Store",
			],
		});

		const role = new iam.Role(this, "RuntimeRole", {
			assumedBy: new iam.ServicePrincipal(
				"bedrock-agentcore.amazonaws.com",
			).withConditions({
				StringEquals: { "aws:SourceAccount": account },
				ArnLike: {
					"aws:SourceArn": `arn:aws:bedrock-agentcore:${region}:${account}:*`,
				},
			}),
		});
		image.repository.grantPull(role);
		role.addToPolicy(
			new iam.PolicyStatement({
				actions: ["ecr:GetAuthorizationToken"],
				resources: ["*"],
			}),
		);
		role.addToPolicy(
			new iam.PolicyStatement({
				actions: ["logs:DescribeLogStreams", "logs:CreateLogGroup"],
				resources: [
					`arn:aws:logs:${region}:${account}:log-group:/aws/bedrock-agentcore/runtimes/*`,
				],
			}),
		);
		role.addToPolicy(
			new iam.PolicyStatement({
				actions: ["logs:DescribeLogGroups"],
				resources: [`arn:aws:logs:${region}:${account}:log-group:*`],
			}),
		);
		role.addToPolicy(
			new iam.PolicyStatement({
				actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
				resources: [
					`arn:aws:logs:${region}:${account}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*`,
				],
			}),
		);
		role.addToPolicy(
			new iam.PolicyStatement({
				actions: [
					"xray:PutTraceSegments",
					"xray:PutTelemetryRecords",
					"xray:GetSamplingRules",
					"xray:GetSamplingTargets",
				],
				resources: ["*"],
			}),
		);
		role.addToPolicy(
			new iam.PolicyStatement({
				actions: ["cloudwatch:PutMetricData"],
				resources: ["*"],
				conditions: {
					StringEquals: { "cloudwatch:namespace": "bedrock-agentcore" },
				},
			}),
		);
		role.addToPolicy(
			new iam.PolicyStatement({
				actions: [
					"bedrock-agentcore:GetWorkloadAccessToken",
					"bedrock-agentcore:GetWorkloadAccessTokenForJWT",
					"bedrock-agentcore:GetWorkloadAccessTokenForUserId",
				],
				resources: [
					`arn:aws:bedrock-agentcore:${region}:${account}:workload-identity-directory/default`,
					`arn:aws:bedrock-agentcore:${region}:${account}:workload-identity-directory/default/workload-identity/${runtimeName}-*`,
				],
			}),
		);
		role.addToPolicy(
			new iam.PolicyStatement({
				actions: [
					"bedrock:InvokeModel",
					"bedrock:InvokeModelWithResponseStream",
				],
				resources: [
					"arn:aws:bedrock:*::foundation-model/*",
					`arn:aws:bedrock:${region}:${account}:*`,
				],
			}),
		);
		role.addToPolicy(
			new iam.PolicyStatement({
				actions: ["dynamodb:GetItem"],
				resources: [props.fitnessTableArn],
				conditions: {
					"ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["food#*"] },
				},
			}),
		);

		// AgentCore Runtime は L2 未提供のため、CloudFormation L1 を直接組む。
		const runtime = new cdk.CfnResource(this, "Runtime", {
			type: "AWS::BedrockAgentCore::Runtime",
			properties: {
				AgentRuntimeName: runtimeName,
				RoleArn: role.roleArn,
				AgentRuntimeArtifact: {
					ContainerConfiguration: {
						ContainerUri: image.imageUri,
					},
				},
			},
		});

		this.runtimeArn = runtime.getAtt("AgentRuntimeArn").toString();

		new cdk.CfnOutput(this, "RuntimeArnOutput", {
			value: this.runtimeArn,
			description: "AgentCore Runtime ARN",
		});
	}
}
