const nativeCallback = "cimessfruit://auth/callback";

export function mobileCallback(value: unknown, development: boolean, configured?: string): string | null {
  if (value === undefined || value === nativeCallback) return nativeCallback;
  if (typeof value !== "string" || !development || value !== configured) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "exp:" || !url.hostname || url.pathname !== "/--/auth/callback" ||
        url.username || url.password || url.search || url.hash) return null;
    return value;
  } catch {
    return null;
  }
}
