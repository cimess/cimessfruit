const unavailableCodes = new Set(["57014", "53300", "57P01", "57P02", "57P03", "08000", "08003", "08006", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "P1001", "P1002", "P1008", "P1017", "P2024"]);

export function databaseUnavailable(error: unknown): boolean {
  function check(value: unknown, depth: number): boolean {
    if (!value || typeof value !== "object" || depth > 5) return false;
    const record = value as Record<string, unknown>;
    if ([record.code, record.originalCode].some(code => typeof code === "string" && unavailableCodes.has(code))) return true;
    const messages = [record.message, record.originalMessage];
    if (record.code === "P2028" && messages.some(message => typeof message === "string" && /timeout|expired|timed out/i.test(message))) return true;
    if (messages.some(message => typeof message === "string" &&
      /Query read timeout|timeout exceeded when trying to connect|Connection terminated due to connection timeout|Transaction.*(?:expired|timed out)/i.test(message))) return true;
    return ["meta", "driverAdapterError", "cause"].some(key => check(record[key], depth + 1));
  }
  return check(error, 0);
}

export function databaseUnavailableResponse() {
  return Response.json({ error: "Database temporarily unavailable. Please refresh and try again." }, {
    status: 503,
    headers: { "Cache-Control": "private, no-store", "Retry-After": "1" },
  });
}
