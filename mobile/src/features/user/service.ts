import { z } from "zod";
import { apiRequest } from "@/lib/api";
import type { UserProfile } from "@/features/user/types";

const addressSchema = z.object({
  coordinates: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  zoneId: z.string(), streetOrClose: z.string(), houseNumber: z.string(), flatOrBlock: z.string(),
  landmark: z.string(), note: z.string(), phoneNumber: z.string(),
});
const profileSchema = z.object({
  id: z.string(), name: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(),
  notificationsEnabled: z.boolean(), deliveryAddress: addressSchema.nullable(),
});
export async function fetchUserProfile(): Promise<UserProfile> {
  const result = await apiRequest<{ profile: unknown }>("/api/profile");
  return mapProfile(result.profile);
}
export async function patchUserProfile(data: { name?: string; phone?: string | null; notificationsEnabled?: boolean; deliveryAddress?: UserProfile["deliveryAddress"] }): Promise<UserProfile> {
  const result = await apiRequest<{ profile: unknown }>("/api/profile", { method: "PATCH", body: JSON.stringify(data) });
  return mapProfile(result.profile);
}
function mapProfile(value: unknown): UserProfile {
  const profile = profileSchema.parse(value);
  return {
    id: profile.id, name: profile.name ?? "", email: profile.email ?? "", phoneNumber: profile.phone ?? "",
    notificationsEnabled: profile.notificationsEnabled,
    deliveryAddress: profile.deliveryAddress ?? {
      zoneId: "", streetOrClose: "", houseNumber: "", flatOrBlock: "", landmark: "", note: "", phoneNumber: profile.phone ?? "",
    },
  };
}
