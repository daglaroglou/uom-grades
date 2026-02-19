"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle01Icon,
  AlertCircleIcon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: (_: Omit<Toast, "id">) => {},
    };
  }
  return ctx;
}

const TOAST_DURATION = 4000;

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const icon =
    toast.type === "success"
      ? CheckmarkCircle01Icon
      : toast.type === "error"
        ? AlertCircleIcon
        : InformationCircleIcon;

  const iconBg =
    toast.type === "success"
      ? "bg-emerald-500/15 dark:bg-emerald-500/20"
      : toast.type === "error"
        ? "bg-destructive/15 dark:bg-destructive/20"
        : "bg-primary/15 dark:bg-primary/20";

  const iconColor =
    toast.type === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : toast.type === "error"
        ? "text-destructive"
        : "text-primary";

  const barColor =
    toast.type === "success"
      ? "bg-emerald-500/30 dark:bg-emerald-500/40"
      : toast.type === "error"
        ? "bg-destructive/30 dark:bg-destructive/40"
        : "bg-primary/30 dark:bg-primary/40";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="w-72 overflow-hidden rounded-xl border bg-popover shadow-xl shadow-black/10 dark:shadow-black/30 ring-1 ring-border/50"
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconBg}`}
        >
          <HugeiconsIcon icon={icon} size={20} className={iconColor} />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="font-semibold text-foreground">{toast.title}</p>
          {toast.message && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {toast.message}
            </p>
          )}
        </div>
      </div>
      <motion.div
        className={`h-1 ${barColor}`}
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration: TOAST_DURATION / 1000, ease: "linear" }}
        onAnimationComplete={onDismiss}
      />
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((t: Omit<Toast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const toast: Toast = { ...t, id };
    setToasts((prev) => [...prev, toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== id));
    }, TOAST_DURATION);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col-reverse gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
              <ToastItem
                toast={toast}
                onDismiss={() => dismiss(toast.id)}
              />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
