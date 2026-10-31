import type { DeliveryAddressDraft } from "@/features/delivery/types";

export type LoginDraft = {
  emailOrPhone: string;
  password: string;
};

export type SignupDraft = {
  name: string;
  email: string;
  phoneNumber: string;
  password: string;
  deliveryAddress?: DeliveryAddressDraft;
};

export type AuthUser = {
  id: string;
  image: string | null;
  role: "CUSTOMER" | "ADMIN";
  isActive: boolean;
  name: string;
  email: string;
  phoneNumber: string;
};
