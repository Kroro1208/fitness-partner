#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { FitnessStack } from "../lib/fitness-stack";

const app = new cdk.App();
new FitnessStack(app, "FitnessStack");
