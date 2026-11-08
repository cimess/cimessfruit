export type StoredSession = { token: string; expires: string; user: unknown };
export type SessionSnapshot = {
  session: StoredSession | null;
  version: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// A rejected operation must not prevent later operations from running.
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation);
    tail = result.catch(() => undefined);
    return result;
  };
}

export function createApiClient(deps: {
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
  remove: () => Promise<void>;
  origin: () => string;
  fetch: typeof fetch;
  now?: () => number;
  observe?: (sample: {
    path: string;
    method: string;
    status: number;
    payloadBytes: number | null;
    durationMs: number;
  }) => void;
}) {
  const lock = createSerialQueue();
  const now = deps.now ?? Date.now;
  const catalogueResponses = new Map<string, { etag: string; json: string }>();
  let version = 0;
  let onUnauthorized: (() => void) | undefined;

  function parse(value: string | null): StoredSession | null {
    if (!value) return null;
    try {
      const session = JSON.parse(value);
      if (
        session &&
        typeof session.token === "string" &&
        /^mobile_[a-f0-9]{64}$/.test(session.token) &&
        typeof session.expires === "string" &&
        Number.isFinite(Date.parse(session.expires)) &&
        "user" in session
      )
        return session;
    } catch {
      /* Invalid storage is cleared by readValid. */
    }
    return null;
  }
  async function clear() {
    catalogueResponses.clear();
    await deps.remove();
    version += 1;
    // Notify while holding the lock, before a newer login can commit.
    onUnauthorized?.();
  }
  async function readValid() {
    // Storage access errors (e.g. a locked device) propagate; they are not logout.
    const raw = await deps.read();
    const session = parse(raw);
    if (raw !== null && (!session || Date.parse(session.expires) <= now())) {
      await clear();
      return null;
    }
    return session;
  }
  const getSessionSnapshot = () =>
    lock(
      async (): Promise<SessionSnapshot> => ({
        session: await readValid(),
        version,
      }),
    );
  async function assertCurrent(snapshot: SessionSnapshot) {
    if (snapshot.version !== version)
      throw new ApiError("Session changed. Please retry.", 409);
    const session = await readValid();
    if (!session)
      throw new ApiError("Your session has expired. Please log in.", 401);
    if (session.token !== snapshot.session?.token)
      throw new ApiError("Session changed. Please retry.", 409);
    return session;
  }

  return {
    setUnauthorizedHandler(handler: () => void) {
      onUnauthorized = handler;
      return () => {
        if (onUnauthorized === handler) onUnauthorized = undefined;
      };
    },
    getSessionSnapshot,
    async readStoredSession() {
      return (await getSessionSnapshot()).session;
    },
    saveSession(session: StoredSession) {
      return lock(async () => {
        if (
          !parse(JSON.stringify(session)) ||
          Date.parse(session.expires) <= now()
        ) {
          throw new Error("Cannot save an invalid or expired session.");
        }
        await deps.write(JSON.stringify(session));
        version += 1;
      });
    },
    updateStoredUser(snapshot: SessionSnapshot, user: unknown) {
      return lock(async () => {
        const session = await assertCurrent(snapshot);
        await deps.write(JSON.stringify({ ...session, user }));
      });
    },
    commitAuthenticatedUser(userId: string, commit: () => void) {
      return lock(async () => {
        const session = await readValid();
        const user = session?.user;
        if (
          !user ||
          typeof user !== "object" ||
          !("id" in user) ||
          user.id !== userId
        ) {
          throw new ApiError("Your session has expired. Please log in.", 401);
        }
        commit();
      });
    },
    clearStoredSession() {
      return lock(clear);
    },
    async apiRequest<T>(
      path: string,
      options: RequestInit = {},
      authenticated = true,
    ): Promise<T> {
      const origin = deps.origin();
      const url = new URL(path, origin);
      if (
        !path.startsWith("/api/") ||
        url.origin !== origin ||
        !url.pathname.startsWith("/api/") ||
        url.hash
      ) {
        throw new Error("Invalid API path");
      }
      const headers = new Headers(options.headers);
      const conditional =
        !authenticated &&
        (!options.method || options.method.toUpperCase() === "GET") &&
        /^\/api\/products(?:\/[a-f0-9-]+)?$/.test(url.pathname);
      const cached = conditional ? catalogueResponses.get(path) : undefined;
      if (conditional) {
        headers.delete("If-None-Match");
        if (cached) headers.set("If-None-Match", cached.etag);
      }
      // Credentials are owned by this client, never by a caller's headers.
      headers.delete("Authorization");
      headers.delete("Cookie");
      if (typeof options.body === "string" && !headers.has("Content-Type"))
        headers.set("Content-Type", "application/json");
      // FormData/Blob bodies pass through; fetch supplies multipart boundaries.
      const snapshot = authenticated
        ? await lock(async () => {
            const previousVersion = version;
            const session = await readValid();
            if (!session) {
              if (version === previousVersion) onUnauthorized?.();
              throw new ApiError("Authentication required.", 401);
            }
            return { session, version };
          })
        : null;
      if (snapshot?.session)
        headers.set("Authorization", `Bearer ${snapshot.session.token}`);
      const started = now();
      const observe = (status: number, payloadBytes: number | null) => {
        try {
          deps.observe?.({
            path: url.pathname,
            method: options.method?.toUpperCase() ?? "GET",
            status,
            payloadBytes,
            durationMs: now() - started,
          });
        } catch {
          /* Diagnostics must never affect requests. */
        }
      };
     const debugExchange = url.pathname === "/api/mobile/exchange";

if (debugExchange) {
  console.info("[mobile-api] request", {
    origin: url.origin,
    route: url.pathname,
    method: options.method ?? "GET",
    contentType: headers.get("Content-Type"),
  });
}

let response: Response;

try {
  response = await deps.fetch(url.toString(), {
    ...options,
    headers,
    credentials: "omit",
    redirect: "error",
  });
} catch (error) {
  observe(0, null);

  if (debugExchange) {
    console.error("[mobile-api] fetch failed before response", {
      type: error instanceof Error ? error.name : typeof error,
    });
  }

  throw error;
}

if (debugExchange) {
  console.info("[mobile-api] response", {
    route: url.pathname,
    status: response.status,
    contentType: response.headers.get("content-type"),
    requestId: response.headers.get("x-auth-request-id"),
    vercelId: response.headers.get("x-vercel-id"),
    durationMs: now() - started,
  });
}
      if (snapshot && response.status === 401) observe(401, null);
      if (snapshot && response.status === 401) {
        await lock(async () => {
          if (snapshot.version !== version)
            throw new ApiError("Session changed. Please retry.", 409);
          // Compare the raw token, including when it expired during this request.
          const current = parse(await deps.read());
          if (current && current.token !== snapshot.session?.token)
            throw new ApiError("Session changed. Please retry.", 409);
          await clear();
        });
        throw new ApiError("Your session has expired. Please log in.", 401);
      }
      if (response.status === 304 && conditional) {
        observe(304, 0);
        if (!cached)
          throw new ApiError("Catalogue needs a fresh response. Retry.", 502);
        return JSON.parse(cached.json) as T;
      }
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        observe(response.status, null);
        throw error;
      }
      observe(response.status, new TextEncoder().encode(text).byteLength);
      if (snapshot) await lock(() => assertCurrent(snapshot));
      let body: unknown = null;
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          if (response.ok)
            throw new ApiError("The server returned invalid JSON.", 502);
        }
      } else if (
        response.ok &&
        response.status !== 204 &&
        response.status !== 205 &&
        options.method?.toUpperCase() !== "HEAD"
      ) {
        throw new ApiError("The server returned an empty JSON response.", 502);
      }
      if (!response.ok) {
        if (debugExchange) {
          console.error("[mobile-api] exchange error response body", {
            status: response.status,
            body: text,
          });
        }
        const message =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Unable to complete your request.";
        throw new ApiError(message, response.status);
      }
      if (
        conditional &&
        response.status === 200 &&
        new TextEncoder().encode(text).byteLength <= 131072
      ) {
        const etag = response.headers.get("etag");
        if (etag && etag.length <= 128) {
          catalogueResponses.delete(path);
          catalogueResponses.set(path, { etag, json: text });
          if (catalogueResponses.size > 32)
            catalogueResponses.delete(catalogueResponses.keys().next().value!);
        }
      }
      return body as T;
    },
  };
}
