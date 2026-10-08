/** A decoded JWT claim is not authentication. User tokens must go through getUser. */
export function isTrustedInternalSender(
  authorization: string,
  suppliedCronSecret: string | null,
  serviceKey: string | undefined,
  cronSecret: string | undefined,
): boolean {
  const internalSecret = cronSecret || serviceKey;
  return Boolean(
    (serviceKey && authorization === `Bearer ${serviceKey}`) ||
    (internalSecret && suppliedCronSecret && suppliedCronSecret === internalSecret),
  );
}

export type MetaSendOutcome =
  | { kind: "accepted"; messageId: string }
  | { kind: "rejected" }
  | { kind: "unknown" };

/** No invented IDs, retries or refunds for an ambiguous provider outcome. */
export function metaSendOutcome(status: number, body: unknown): MetaSendOutcome {
  if (!body || typeof body !== "object") return { kind: "unknown" };
  const result = body as { error?: { message?: unknown }; messages?: Array<{ id?: unknown }> };
  if (status >= 400 && status < 500 && typeof result.error?.message === "string") {
    return { kind: "rejected" };
  }
  const id = Array.isArray(result.messages) ? result.messages[0]?.id : null;
  if (status >= 200 && status < 300 && !result.error && typeof id === "string" && id.trim()) {
    return { kind: "accepted", messageId: id };
  }
  return { kind: "unknown" };
}
