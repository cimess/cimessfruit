// Only a routing hint: the receiving handler must verify the raw-body signature.
export function isSupportWebhook(request: Request) {
  return request.method === "POST" && ["svix-id", "svix-timestamp", "svix-signature"].some(name => request.headers.has(name));
}
