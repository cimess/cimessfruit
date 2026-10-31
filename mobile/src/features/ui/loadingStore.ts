import { create } from "zustand";

type LoadingState = {
  isVisible: boolean;
  message: string;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  flashLoading: (message?: string, duration?: number) => void;
};

let loadingTimer: ReturnType<typeof setTimeout> | null = null;

export const useLoadingStore = create<LoadingState>((set) => ({
  isVisible: false,
  message: "Loading...",
  showLoading: (message = "Loading...") =>
    set({
      isVisible: true,
      message,
    }),
  hideLoading: () => {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }

    set({ isVisible: false });
  },
  flashLoading: (message = "Loading...", duration = 450) => {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
    }

    set({ isVisible: true, message });

    loadingTimer = setTimeout(() => {
      set({ isVisible: false });
      loadingTimer = null;
    }, duration);
  },
}));
