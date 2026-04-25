import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export interface AgentCoreRuntimeProps {
	readonly fitnessTableArn: string;
}

function toAgentCoreRuntimeName(stackName: string): string {
	const normalized = `${stackName}_runtime`.replace(/[^A-Za-z0-9_]/g, "_");
	const withLetterPrefix = /^[A-Za-z]/.test(normalized)
		? normalized
		: `R${normalized}`;
	return withLetterPrefix.slice(0, 48);
}

export class AgentCoreRuntime extends Construct {
	public readonly runtimeArn: string;

	constructor(scope: Construct, id: string, props: AgentCoreRuntimeProps) {
		super(scope, id);
		const stack = cdk.Stack.of(this);
		const account = stack.account;
		const region = stack.region;
		const runtimeName = toAgentCoreRuntimeName(stack.stackName);

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
				EnvironmentVariables: {
					FITNESS_TABLE_NAME: cdk.Fn.select(
						1,
						cdk.Fn.split("/", props.fitnessTableArn),
					),
					FITNESS_TABLE_REGION: "ap-northeast-1",
					PLAN_GENERATOR_MODEL_ID: "global.anthropic.claude-sonnet-4-6",
				},
				NetworkConfiguration: {
					NetworkMode: "PUBLIC",
				},
			},
		});
		// AgentCore control plane は create 時に execution role の ECR 権限を即時検証する。
		// Role ARN 参照だけだと inline policy の作成順が保証されず、権限反映前に
		// Runtime create が走って ECR access denied になることがある。
		runtime.node.addDependency(role);
		const defaultPolicy = role.node.tryFindChild("DefaultPolicy");
		if (defaultPolicy) {
			runtime.node.addDependency(defaultPolicy);
		}

		this.runtimeArn = runtime.getAtt("AgentRuntimeArn").toString();

		new cdk.CfnOutput(this, "RuntimeArnOutput", {
			value: this.runtimeArn,
			description: "AgentCore Runtime ARN",
		});
	}
}
