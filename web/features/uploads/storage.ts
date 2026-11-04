import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { v2 as cloudinary } from "cloudinary";
import { createHash } from "node:crypto";

export type Purpose = "PRODUCT" | "EVIDENCE";

export interface ObjectStorage {
  url(id: string, key: string, purpose: Purpose): string;
  put(
    key: string,
    purpose: Purpose,
    bytes: Uint8Array,
    type: string,
  ): Promise<void>;
  remove(key: string, purpose: Purpose): Promise<void>;
  get(
    key: string,
    purpose: Purpose,
  ): Promise<{
    bytes: Uint8Array;
    type: string;
  }>;
}

export function r2Storage(): ObjectStorage {
  const account = process.env.R2_ACCOUNT_ID,
    accessKeyId = process.env.R2_ACCESS_KEY_ID,
    secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const privateBucket = process.env.R2_EVIDENCE_BUCKET;
  const origin = process.env.APP_URL;

  // Cloudinary credentials for PRODUCT photos
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME,
    cApiKey = process.env.CLOUDINARY_API_KEY,
    cApiSecret = process.env.CLOUDINARY_API_SECRET;

  const hasCloudinary = Boolean(cloudName && cApiKey && cApiSecret);

  // Cloudflare R2 public bucket (optional fallback if Cloudinary is not used)
  const publicBucket = process.env.R2_PRODUCT_BUCKET;
  const publicBase = process.env.R2_PUBLIC_URL;

  if (hasCloudinary) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: cApiKey,
      api_secret: cApiSecret,
      secure: true,
    });
  }

  // Validate R2 for private EVIDENCE storage
  if (
    !account ||
    !accessKeyId ||
    !secretAccessKey ||
    !privateBucket ||
    !origin
  ) {
    throw Error("Cloudflare R2 is not configured for evidence storage");
  }

  // If not using Cloudinary, check R2 product config
  if (!hasCloudinary) {
    if (!publicBucket || !publicBase || publicBucket === privateBucket) {
      throw Error("Neither Cloudinary nor R2 Public Bucket is configured for products");
    }
  }

  for (const value of [publicBase, origin].filter(Boolean) as string[]) {
    const url = new URL(value);
    if (
      url.protocol !== "https:" &&
      !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")
    )
      throw Error("Invalid storage URL");
  }

  const s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 2,
  });

  return {
    url: (id, key, purpose) => {
      if (purpose === "PRODUCT") {
        if (hasCloudinary) {
          // Cloudinary canonical public URL using the key (strip extension if any for public_id)
          const publicId = key.replace(/\.[^/.]+$/, "");
          return `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`;
        }
        return `${publicBase!.replace(/\/$/, "")}/${key}`;
      }
      return `${new URL(origin).origin}/api/uploads/${id}/content`;
    },

    async put(key, purpose, bytes, type) {
      if (purpose === "PRODUCT" && hasCloudinary) {
        // Upload to Cloudinary using signed multipart fetch (resilient across runtimes without socket timeouts)
        const publicId = key.replace(/\.[^/.]+$/, "");
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signString = `overwrite=true&public_id=${publicId}&timestamp=${timestamp}${cApiSecret}`;
        const signature = createHash("sha1").update(signString).digest("hex");

        const form = new FormData();
        form.append("file", new Blob([bytes as unknown as BlobPart], { type }), `${publicId}.${type.split("/")[1] || "jpg"}`);
        form.append("public_id", publicId);
        form.append("overwrite", "true");
        form.append("timestamp", timestamp);
        form.append("api_key", cApiKey!);
        form.append("signature", signature);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(60000),
        });

        if (!response.ok) {
          let errorMsg = "Cloudinary upload failed";
          try {
            const data = (await response.json()) as { error?: { message?: string } };
            if (data?.error?.message) errorMsg = data.error.message;
          } catch {
            // keep default error
          }
          throw new Error(errorMsg);
        }
        return;
      }

      // R2 Storage (Evidence or fallback R2 Product)
      const targetBucket = purpose === "PRODUCT" ? publicBucket! : privateBucket;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: key,
          Body: bytes,
          ContentType: type,
          CacheControl:
            purpose === "PRODUCT"
              ? "public, max-age=31536000, immutable"
              : "private, no-store",
        }),
        { abortSignal: AbortSignal.timeout(25000) },
      );
    },

    async remove(key, purpose) {
      if (purpose === "PRODUCT" && hasCloudinary) {
        const publicId = key.replace(/\.[^/.]+$/, "");
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
        return;
      }

      const targetBucket = purpose === "PRODUCT" ? publicBucket! : privateBucket;
      await s3Client.send(
        new DeleteObjectCommand({ Bucket: targetBucket, Key: key }),
        { abortSignal: AbortSignal.timeout(5000) },
      );
    },

    async get(key, purpose) {
      // Evidence is always fetched from private R2
      const targetBucket = purpose === "PRODUCT" ? publicBucket! : privateBucket;
      const result = await s3Client.send(
        new GetObjectCommand({ Bucket: targetBucket, Key: key }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      if (!result.Body) throw Error("Missing asset");
      return {
        bytes: await result.Body.transformToByteArray(),
        type: result.ContentType ?? "application/octet-stream",
      };
    },
  };
}
