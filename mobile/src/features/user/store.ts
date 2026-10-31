import { create } from "zustand";
import { fetchUserProfile, patchUserProfile } from "./service";
import { commitAuthenticatedUser } from "@/lib/api";
import type { DeliveryAddressDraft } from "@/features/delivery/types";
import type { UserProfile } from "./types";
type Patch = Parameters<typeof patchUserProfile>[0];
type UserState = {
  profile: UserProfile | null; isLoadingProfile: boolean; isSaving: boolean; error: string | null;
  loadProfile: () => Promise<void>; updateProfile: (patch: Patch) => Promise<void>;
  updateDeliveryAddress: (address: DeliveryAddressDraft) => Promise<void>; setNotificationsEnabled: (enabled: boolean) => Promise<void>;
};
export const useUserStore = create<UserState>((set, get) => ({
  profile: null, isLoadingProfile: false, isSaving: false, error: null,
  loadProfile: async () => {
    if (get().profile || get().isLoadingProfile) return;
    set({ isLoadingProfile: true, error: null });
    try { const profile = await fetchUserProfile(); await commitAuthenticatedUser(profile.id, () => set({ profile, isLoadingProfile: false })); }
    catch (error) { set({ error: error instanceof Error ? error.message : "Unable to load profile.", isLoadingProfile: false }); }
  },
  updateProfile: async patch => {
    if (get().isSaving) throw Error("A change is already being saved.");
    set({ isSaving: true, error: null });
    try { const profile = await patchUserProfile(patch); await commitAuthenticatedUser(profile.id, () => set({ profile })); }
    catch (error) { set({ error: error instanceof Error ? error.message : "Unable to save profile." }); throw error; }
    finally { set({ isSaving: false }); }
  },
  updateDeliveryAddress: address => get().updateProfile({ deliveryAddress: address }),
  setNotificationsEnabled: enabled => get().updateProfile({ notificationsEnabled: enabled }),
}));
