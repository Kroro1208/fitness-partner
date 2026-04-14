import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

export const handler = async (
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> => {
	const claims = event.requestContext.authorizer?.jwt?.claims;
	return {
		statusCode: 200,
		body: JSON.stringify({
			message: "Hello from ai-fitness-partner!",
			userId: claims?.sub ?? "unknown",
		}),
	};
};
