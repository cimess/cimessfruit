import type { DeliveryAddressDraft } from "@/features/delivery/types";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  emailVerified?: string | null;
  phoneNumber: string;
  deliveryAddress: DeliveryAddressDraft;
  notificationsEnabled: boolean;
};
