import * as cdk from "aws-cdk-lib";
import type { Construct } from "constructs";
import { AgentCoreRuntime } from "./constructs/agentcore-runtime";

export interface PlanGeneratorStackProps extends cdk.StackProps {
	readonly fitnessTableArn: string;
}

export class PlanGeneratorStack extends cdk.Stack {
	public readonly runtimeArn: string;

	constructor(scope: Construct, id: string, props: PlanGeneratorStackProps) {
		super(scope, id, props);

		const runtime = new AgentCoreRuntime(this, "PlanGenerator", {
			fitnessTableArn: props.fitnessTableArn,
		});
		this.runtimeArn = runtime.runtimeArn;
	}
}
