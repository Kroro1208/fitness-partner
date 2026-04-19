import { execFileSync } from "node:child_process";

const outputKey = process.argv[2];
if (!outputKey) {
	throw new Error("Usage: node ./tools/get-stack-output.mjs <OutputKey>");
}

const stackName = process.env.FITNESS_STACK_NAME ?? "FitnessStack";
const region = process.env.AWS_REGION ?? "ap-northeast-1";

const raw = execFileSync(
	"aws",
	[
		"cloudformation",
		"describe-stacks",
		"--stack-name",
		stackName,
		"--region",
		region,
		"--output",
		"json",
	],
	{
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	},
);

const parsed = JSON.parse(raw);
const outputs = parsed.Stacks?.[0]?.Outputs;
if (!Array.isArray(outputs)) {
	throw new Error(`CloudFormation stack "${stackName}" has no outputs`);
}

const match = outputs.find((output) => output.OutputKey === outputKey);
if (!match?.OutputValue) {
	throw new Error(
		`CloudFormation output "${outputKey}" was not found in stack "${stackName}"`,
	);
}

process.stdout.write(match.OutputValue);
