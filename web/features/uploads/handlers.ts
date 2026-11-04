import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "../../generated/prisma/client";
import type { SessionUser } from "../../domain/session-user";
import { draftLifetime, UploadError } from "./service";
import type { ObjectStorage, Purpose } from "./storage";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
// Stay below Vercel's 4.5 MB request-body limit, including multipart overhead.
export const maxFileBytes = 4 * 1024 * 1024;
export function validImage(bytes: Uint8Array, type: string) {
  const head = Buffer.from(bytes.subarray(0, 12));
  return (
    (type === "image/jpeg" &&
      head[0] === 255 &&
      head[1] === 216 &&
      head[2] === 255) ||
    (type === "image/png" &&
      head
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (type === "image/webp" &&
      head.subarray(0, 4).toString() === "RIFF" &&
      head.subarray(8, 12).toString() === "WEBP")
  );
}
type UploadDependencies = {
  db: PrismaClient;
  currentUser: () => Promise<SessionUser | null>;
  allowAttempt: (key: string) => Promise<boolean>;
  storage: () => ObjectStorage;
};

// Load production resources only for live calls; tests supply dependencies directly.
async function uploadDependencies(input?: UploadDependencies) {
  if (!input) {
    const { prisma } = await import("../../server/database/prisma");
    const { getCurrentUser } = await import("../../server/auth/current-user");
    const { allowAuthAttempt } = await import("../../server/auth/password-auth");
    const { r2Storage } = await import("./storage");
    input = {
      db: prisma,
      currentUser: getCurrentUser,
      allowAttempt: allowAuthAttempt,
      storage: r2Storage,
    };
  }
  const {
    db,
    currentUser,
    allowAttempt,
    storage,
  } = input;
  return { db, currentUser, allowAttempt, storage };
}

async function account(deps: Awaited<ReturnType<typeof uploadDependencies>>) {
  const { currentUser } = deps;
  const user = await currentUser();
  if (!user?.isActive) throw new UploadError("Sign in first.", 401);
  return user;
}

async function safe(run: () => Promise<Response>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof UploadError)
      return json({ error: error.message }, error.status);
    console.error("[Upload Error]", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Unable to complete image request. Your draft is retained; please retry.",
      },
      503,
    );
  }
}

export async function uploadImage(request: Request, purpose: Purpose, dependencies?: UploadDependencies) {
  const deps = await uploadDependencies(dependencies);
  const { db, allowAttempt, storage } = deps;
  return safe(async () => {
    const user = await account(deps);
    if (purpose === "PRODUCT" && user.role !== "ADMIN")
      return json({ error: "Administrator access required." }, 403);
    if (!(await allowAttempt(`upload:${user.id}`)))
      return json({ error: "Too many uploads. Try again later." }, 429);
    if (
      !request.headers
        .get("content-type")
        ?.startsWith("multipart/form-data")
    )
      return json({ error: "Choose an image." }, 400);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Choose an image." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxFileBytes + 65536) {
        await reader.cancel();
        return json({ error: "Choose an image up to 4 MB." }, 413);
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > maxFileBytes)
      return json({ error: "Choose a JPEG, PNG or WebP up to 4 MB." }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validImage(bytes, file.type))
      return json(
        { error: "Choose a valid JPEG, PNG or WebP image." },
        400,
      );
    const store = storage(),
      id = randomUUID(),
      key = `${purpose.toLowerCase()}/${id}.${file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]}`;
    // Record before PUT: even a lost response or process termination leaves a cleanup record.
    const asset = await db.uploadAsset.create({
      data: {
        id,
        userId: user.id,
        purpose,
        objectKey: key,
        url: store.url(id, key, purpose),
        contentType: file.type,
        size: file.size,
        expiresAt: new Date(Date.now() + draftLifetime),
      },
    });
    await store.put(key, purpose, bytes, file.type);
    const completed = await db.uploadAsset.update({
      where: { id },
      data: {
        state: "READY",
        uploadedAt: new Date(),
        expiresAt: new Date(Date.now() + draftLifetime),
      },
    });
    return json(
      {
        id,
        imageUrl: asset.url,
        imageUploadedAt: completed.uploadedAt,
        expiresAt: completed.expiresAt,
      },
      201,
    );
  });
}

export async function deleteUpload(id: string, dependencies?: UploadDependencies) {
  const deps = await uploadDependencies(dependencies);
  const { db } = deps;
  return safe(async () => {
    const user = await account(deps);
    if (!z.uuid().safeParse(id).success)
      return json({ error: "Invalid upload" }, 400);
    const result = await db.uploadAsset.updateMany({
      where: { id, userId: user.id, state: { in: ["UPLOADING", "READY"] } },
      data: { state: "DELETE_PENDING", expiresAt: new Date() },
    });
    if (!result.count)
      return json({ error: "Upload missing or already attached." }, 409);
    return json({ ok: true });
  });
}

export async function renewUpload(id: string, dependencies?: UploadDependencies) {
  const deps = await uploadDependencies(dependencies);
  const { db } = deps;
  return safe(async () => {
    const user = await account(deps);
    if (!z.uuid().safeParse(id).success)
      return json({ error: "Invalid upload" }, 400);
    const result = await db.uploadAsset.updateMany({
      where: {
        id,
        userId: user.id,
        state: "READY",
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date(Date.now() + draftLifetime) },
    });
    if (result.count) return json({ ok: true });
    const attached = await db.uploadAsset.findFirst({
      where: { id, userId: user.id, state: "ATTACHED" },
      select: { id: true },
    });
    return attached
      ? json({ ok: true, attached: true })
      : json({ error: "Upload expired; select and upload it again." }, 409);
  });
}

export async function getUploadContent(id: string, dependencies?: UploadDependencies) {
  const deps = await uploadDependencies(dependencies);
  const { db, storage } = deps;
  return safe(async () => {
    const user = await account(deps);
    if (!z.uuid().safeParse(id).success)
      return json({ error: "Invalid upload" }, 400);
    const asset = await db.uploadAsset.findUnique({ where: { id } });
    if (
      !asset ||
      asset.purpose !== "EVIDENCE" ||
      !["READY", "ATTACHED"].includes(asset.state) ||
      (asset.state === "READY" && asset.expiresAt <= new Date()) ||
      (asset.userId !== user.id &&
        !(user.role === "ADMIN" && asset.state === "ATTACHED"))
    )
      return json({ error: "Image not found" }, 404);
    const result = await storage().get(asset.objectKey, "EVIDENCE");
    return new Response(Buffer.from(result.bytes), {
      headers: {
        "Content-Type": result.type,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  });
}

// Compatibility adapter for callers that inject dependencies (including tests).
export function uploadHandlers(dependencies: UploadDependencies) {
  return {
    upload: (request: Request, purpose: Purpose) => uploadImage(request, purpose, dependencies),
    remove: (id: string) => deleteUpload(id, dependencies),
    renew: (id: string) => renewUpload(id, dependencies),
    content: (id: string) => getUploadContent(id, dependencies),
  };
}

export function validCron(request: Request, secret: string | undefined) {
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(`Bearer ${secret}`),
    b = Buffer.from(request.headers.get("authorization") ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function cleanupUploads(
  db: PrismaClient,
  storage: ObjectStorage,
  budgetMs = 40000,
) {
  const deadline = Date.now() + budgetMs;
  let deleted = 0,
    failed = 0;
  while (Date.now() < deadline - 6000) {
    const now = new Date();
    const asset = await db.uploadAsset.findFirst({
      where: {
        state: { in: ["UPLOADING", "READY", "DELETE_PENDING"] },
        expiresAt: { lte: now },
        AND: [
          { OR: [{ retryAt: null }, { retryAt: { lte: now } }] },
          { OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
        ],
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    });
    if (!asset) break;
    const leaseUntil = new Date(Date.now() + 60000);
    const claimed = await db.uploadAsset.updateMany({
      where: {
        id: asset.id,
        state: asset.state,
        expiresAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      },
      data: { state: "DELETE_PENDING", leaseUntil },
    });
    if (!claimed.count) continue;
    try {
      await storage.remove(asset.objectKey, asset.purpose as Purpose);
      await db.uploadAsset.updateMany({
        where: { id: asset.id, state: "DELETE_PENDING", leaseUntil },
        data: {
          state: "DELETED",
          deletedAt: new Date(),
          leaseUntil: null,
          attempts: { increment: 1 },
        },
      });
      deleted++;
    } catch {
      await db.uploadAsset.updateMany({
        where: { id: asset.id, state: "DELETE_PENDING", leaseUntil },
        data: {
          leaseUntil: null,
          attempts: { increment: 1 },
          retryAt: new Date(Date.now() + 3600000),
        },
      });
      failed++;
    }
  }
  return { deleted, failed, moreMayRemain: Date.now() >= deadline - 6000 };
}
