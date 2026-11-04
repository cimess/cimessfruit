import { getCurrentUser } from "@/server/auth/current-user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
}
