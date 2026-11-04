import { z } from "zod";
import { coordinateSchema } from "../domain/delivery-geometry";

export const passwordSchema = z.string().min(12).max(72)
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password is too long");
export const setPasswordSchema = z.strictObject({
  password: passwordSchema,
  confirmPassword: z.string().max(72),
  currentPassword: z.string().max(72)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password is too long").optional(),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match", path: ["confirmPassword"],
});
export const normalizeIdentity = (value: string) => value.trim().toLowerCase();
export const emailSchema = z.string().trim().max(254).pipe(z.email()).transform(normalizeIdentity);
export const loginSchema = z.object({ emailOrPhone: z.string().trim().min(3).max(254).transform(normalizeIdentity), password: z.string().min(1).max(72) });
export const addressSchema = z.object({
  coordinates: coordinateSchema.optional(),
  zoneId: z.string().min(1).max(100), streetOrClose: z.string().max(200), houseNumber: z.string().max(100),
  flatOrBlock: z.string().max(100), landmark: z.string().max(200), note: z.string().max(500), phoneNumber: z.string().max(30),
});
export const signupSchema = z.object({
  name: z.string().trim().min(2).max(100), email: emailSchema,
  phoneNumber: z.string().trim().regex(/^\+?[0-9]{8,15}$/), password: passwordSchema,
  deliveryAddress: addressSchema.optional(),
});
