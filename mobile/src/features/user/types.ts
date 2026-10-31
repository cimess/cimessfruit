import type { DeliveryAddressDraft } from "@/features/delivery/types";

export type UserProfile = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  deliveryAddress: DeliveryAddressDraft;
  notificationsEnabled: boolean;
};
