import { create } from "zustand";
import { createSerialQueue } from "@/lib/api-client";

import {
  fetchCurrentSession,
  loginUser,
  loginWithGoogleIdToken,
  logoutUser,
  signupUser,
} from "@/features/auth/service";
import type { AuthUser, LoginDraft, SignupDraft } from "@/features/auth/types";

import { commitAuthenticatedUser, setUnauthorizedHandler } from "@/lib/api";
import { useUserStore } from "@/features/user/store";
import { useOrderStore } from "@/features/order/store";

const runAuthOperation = createSerialQueue();

function resetPrivateData() {
  useUserStore.setState({ profile: null, isLoadingProfile: false, isSaving: false, error: null });
  useOrderStore.getState().reset();
}

type AuthState = {
  user: AuthUser | null;
  hasCheckedSession: boolean;
  isCheckingSession: boolean;
  isSubmitting: boolean;
  error: string | null;

  checkSession: () => Promise<void>;
  login: (draft: LoginDraft) => Promise<AuthUser>;
  signup: (draft: SignupDraft) => Promise<AuthUser>;
  googleLogin: (idToken:string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  hasCheckedSession: false,
  isCheckingSession: false,
  isSubmitting: false,
  error: null,
  checkSession: () => runAuthOperation(async () => {
    set({ isCheckingSession: true, error: null });

    try {
      const user = await fetchCurrentSession();
      const commit = () => {
        if (!user || get().user?.id !== user.id) resetPrivateData();
        set({ user, hasCheckedSession: true, isCheckingSession: false });
      };
      if (user) await commitAuthenticatedUser(user.id, commit);
      else commit();
    } catch (error) {
      set({
        error:
          error instanceof Error
            ? error.message
            : "Unable to check your session.",
        hasCheckedSession: true,
        isCheckingSession: false,
      });
    }
  }),
  login: (draft) => runAuthOperation(async () => {
    set({ isSubmitting: true, error: null });

    try {
      const user = await loginUser(draft);
      await commitAuthenticatedUser(user.id, () => {
        resetPrivateData();
        set({ user, isSubmitting: false, hasCheckedSession: true });
      });
      return user;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unable to log in.",
        isSubmitting: false,
      });
      throw error;
    }
  }),
  signup: (draft) => runAuthOperation(async () => {
    set({ isSubmitting: true, error: null });

    try {
      const user = await signupUser(draft);
      await commitAuthenticatedUser(user.id, () => {
        resetPrivateData();
        set({ user, isSubmitting: false, hasCheckedSession: true });
      });
      return user;
    } catch (error) {
      set({
        error:
          error instanceof Error ? error.message : "Unable to create account.",
        isSubmitting: false,
      });
      throw error;
    }
  }),
  googleLogin: (idToken: string) => runAuthOperation(async () => {
    set({ isSubmitting: true, error: null });
    try {
      const user = await loginWithGoogleIdToken(idToken);
      await commitAuthenticatedUser(user.id, () => {
        resetPrivateData();
        set({ user, isSubmitting: false, hasCheckedSession: true });
      });
      return user;
    } catch (error) {
      set({ isSubmitting: false, error: error instanceof Error ? error.message : "Unable to sign in with Google." });
      throw error;
    }
  }),
  logout: () => runAuthOperation(async () => {
    set({ isSubmitting: true, error: null });

    try {
      await logoutUser();
      resetPrivateData();
      set({ user: null, isSubmitting: false, hasCheckedSession: true });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Unable to sign out.",
        isSubmitting: false,
      });
      throw error;
    }
  }),
  clearError: () => set({ error: null }),
}));

setUnauthorizedHandler(() => {
  resetPrivateData();
  useAuthStore.setState({ user: null, hasCheckedSession: true });
});
