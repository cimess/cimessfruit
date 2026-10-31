// Deliberately small SSE subset: named events and JSON data; comments are ignored.
export function eventParser(consume: (event: string, data: unknown) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer = (buffer + chunk).replace(/\r\n/g, "\n");
    if (buffer.length > 16384) throw Error("Stream frame exceeded limit");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const lines = frame.split("\n"),
        event = lines
          .find((line) => line.startsWith("event:"))
          ?.slice(6)
          .trim();
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (
        event &&
        ["ready", "heartbeat", "order.changed", "catalogue.changed"].includes(
          event,
        )
      ) {
        try {
          consume(event, JSON.parse(data));
        } catch {
          /* malformed JSON is ignored */
        }
      }
    }
  };
}
export async function consumeEvents(
  response: Response,
  consume: (event: string, data: unknown) => void,
  signal: AbortSignal,
) {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.startsWith("text/event-stream") ||
    !response.body
  )
    throw Error("Stream unavailable");
  const reader = response.body.getReader(),
    decoder = new TextDecoder(),
    parse = eventParser(consume);
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      parse(decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n"));
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function waitForRetry(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}
