import type { PreSignUpTriggerEvent } from "aws-lambda";

export const handler = async (
  event: PreSignUpTriggerEvent,
): Promise<PreSignUpTriggerEvent> => {
  const allowedCodes = (process.env.INVITE_CODES ?? "").split(",");
  const providedCode = event.request.clientMetadata?.inviteCode;

  if (!providedCode || !allowedCodes.includes(providedCode)) {
    throw new Error("Invalid or missing invite code.");
  }

  // 自動確認はしない (メール検証を Cognito に任せる)
  return event;
};
