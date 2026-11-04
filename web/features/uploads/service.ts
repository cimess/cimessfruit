import { createHash } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client";
export const draftLifetime = 7 * 86400000;
export class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function attachUploads(
  tx: Prisma.TransactionClient,
  userId: string,
  ids: string[],
  purpose: string,
  attachedTo: string,
  now = new Date(),
) {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  const files = await tx.uploadAsset.findMany({
    where: { id: { in: unique }, userId, purpose },
  });
  if (
    files.length !== unique.length ||
    files.some(
      (file) =>
        !file.uploadedAt ||
        !(
          (file.state === "READY" && file.expiresAt > now) ||
          (file.state === "ATTACHED" && file.attachedTo === attachedTo)
        ),
    )
  )
    throw new UploadError(
      "Upload expired or unavailable. Upload the selected image again.",
    );
  for (const file of files) {
    const result = await tx.uploadAsset.updateMany({
      where: {
        id: file.id,
        state: file.state,
        attachedTo: file.attachedTo,
        ...(file.state === "READY" ? { expiresAt: { gt: now } } : {}),
      },
      data: { state: "ATTACHED", attachedTo, leaseUntil: null },
    });
    if (result.count !== 1)
      throw new UploadError("Upload changed. Please retry.", 409);
  }
  return files;
}
export async function productPhoto(
  tx: Prisma.TransactionClient,
  userId: string,
  uploadId: string | null | undefined,
  productId: string,
  previousUrl?: string | null,
) {
  if (uploadId === undefined) return undefined;
  const file = uploadId
    ? (
        await attachUploads(
          tx,
          userId,
          [uploadId],
          "PRODUCT",
          `product:${productId}`,
        )
      )[0]
    : null;
  if (previousUrl && previousUrl !== file?.url)
    await tx.uploadAsset.updateMany({
      where: {
        url: previousUrl,
        state: "ATTACHED",
        attachedTo: `product:${productId}`,
      },
      data: { state: "ARCHIVED" },
    });
  return {
    imageUrl: file?.url ?? null,
    imageUploadedAt: file?.uploadedAt ?? null,
  };
}
export async function submission(
  tx: Prisma.TransactionClient,
  key: string | undefined,
  userId: string,
  scope: string,
  payload: unknown,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  if (!key) return { hash, existing: null };
  const existing = await tx.submissionReceipt.findUnique({ where: { key } });
  if (
    existing &&
    (existing.userId !== userId ||
      existing.scope !== scope ||
      existing.hash !== hash)
  )
    throw new UploadError(
      "This save reference belongs to different details.",
      409,
    );
  return { hash, existing };
}
