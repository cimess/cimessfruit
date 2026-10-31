import { create } from "zustand";

type ToastKind = "success" | "info" | "error";

type ToastState = {
  isVisible: boolean;
  message: string;
  kind: ToastKind;
  showToast: (message: string, kind?: ToastKind) => void;
  hideToast: () => void;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  isVisible: false,
  message: "",
  kind: "info",
  showToast: (message, kind = "info") => {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }

    set({ isVisible: true, message, kind });

    toastTimer = setTimeout(() => {
      set({ isVisible: false });
      toastTimer = null;
    }, 2200);
  },
  hideToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }

    set({ isVisible: false });
  },
}));
