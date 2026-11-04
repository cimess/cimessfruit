import { createHash } from "node:crypto";

export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");
export const mobileSessionKey = (token: string) => `mobile-hash:${hashSecret(token)}`;
export function bearerToken(headers: Headers) {
  return headers.get("authorization")?.match(/^Bearer (mobile_[a-f0-9]{64})$/)?.[1] ?? null;
}
