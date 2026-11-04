import policies from "@/lib/legal/policies.json";

// Public legal documents: no account, session or database access is needed.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ policy: string }> },
) {
  const { policy } = await params;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!Object.hasOwn(policies, policy)) {
    return Response.json({ error: "Policy not found" }, { status: 404, headers });
  }
  return Response.json({ policy: { id: policy, ...policies[policy as keyof typeof policies] } }, { headers });
}
