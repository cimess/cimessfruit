import { createHash } from "node:crypto";
// Public catalogue only. Authentication/private responses must not use this helper.
export async function conditionalCatalogue(
  request: Request,
  response: Response,
) {
  if (response.status !== 200) return response;
  const text = await response.text(),
    etag = `"${createHash("sha256").update(text).digest("base64url")}"`;
  const headers = new Headers(response.headers);
  headers.set("ETag", etag);
  headers.set("Cache-Control", "private, no-cache");
  const matches = (request.headers.get("if-none-match") ?? "")
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""));
  return matches.includes(etag) || matches.includes("*")
    ? new Response(null, { status: 304, headers })
    : new Response(text, { status: 200, headers });
}
