import { z } from "zod";

export const policyNames = {
  terms: "Terms and conditions",
  privacy: "Privacy policy",
  refunds: "Cancellations and refunds",
  delivery: "Delivery information",
} as const;
export type PolicyId = keyof typeof policyNames;
export function isPolicyId(value: unknown): value is PolicyId {
  return typeof value === "string" && Object.hasOwn(policyNames, value);
}

const policySchema = z.object({
  id: z.enum(["terms", "privacy", "refunds", "delivery"]),
  title: z.string().min(1),
  version: z.string().min(1),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  summary: z.string().min(1),
  sections: z.array(z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    paragraphs: z.array(z.string().min(1)).min(1),
  })).min(1),
  links: z.array(z.object({
    label: z.string().min(1),
    url: z.url().refine(value => new URL(value).protocol === "https:"),
  })),
});
export type Policy = z.infer<typeof policySchema>;

export function parsePolicyResponse(value: unknown, expected: PolicyId): Policy {
  const result = z.object({ policy: policySchema }).safeParse(value);
  if (!result.success || result.data.policy.id !== expected ||
      new Set(result.data.policy.sections.map(section => section.id)).size !== result.data.policy.sections.length) {
    throw new Error("The policy could not be read. Please try again.");
  }
  return result.data.policy;
}

export async function fetchPolicy(id: PolicyId, signal?: AbortSignal): Promise<Policy> {
  const { apiRequest } = await import("@/lib/api");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15_000);
  try {
    // Public policies do not read session storage or send authentication credentials.
    const result = await apiRequest<unknown>(`/api/policies/${id}`, { signal: controller.signal }, false);
    return parsePolicyResponse(result, id);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
