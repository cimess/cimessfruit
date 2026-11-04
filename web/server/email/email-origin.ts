/** AUTH_URL is trusted server configuration, never taken from request headers. */
export function configuredEmailOrigin(value: string, production: boolean) {
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== "https:" && (production || url.protocol !== "http:"))) {
    throw new Error("Email links require HTTPS in production or HTTP/HTTPS in development");
  }
  return url.origin;
}
