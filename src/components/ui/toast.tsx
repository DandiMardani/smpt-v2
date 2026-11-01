"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toast: {
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
  };
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Standalone event-based trigger for direct imports
let globalAddToast: ((type: ToastType, message: string, duration?: number) => void) | null = null;

export const toast = {
  success: (message: string, duration?: number) => {
    if (globalAddToast) globalAddToast("success", message, duration);
  },
  error: (message: string, duration?: number) => {
    if (globalAddToast) globalAddToast("error", message, duration);
  },
  warning: (message: string, duration?: number) => {
    if (globalAddToast) globalAddToast("warning", message, duration);
  },
  info: (message: string, duration?: number) => {
    if (globalAddToast) globalAddToast("info", message, duration);
  },
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return { toast };
  }
  return context;
}

function UrlToastListener({
  addToast,
}: {
  addToast: (type: ToastType, message: string) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const successMsg = searchParams.get("success");
    const errorMsg = searchParams.get("error");

    if (successMsg) {
      addToast("success", successMsg);
    }
    if (errorMsg) {
      addToast("error", errorMsg);
    }

    if (successMsg || errorMsg) {
      // Bersihkan param dari URL tanpa reload halaman
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    }
  }, [searchParams, addToast]);

  return null;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, message: string, duration = 4000) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  useEffect(() => {
    globalAddToast = addToast;
    return () => {
      globalAddToast = null;
    };
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ toast, removeToast }}>
      {children}

      <React.Suspense fallback={null}>
        <UrlToastListener addToast={addToast} />
      </React.Suspense>

      {/* Floating Container */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed top-4 right-4 z-[999999] flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
              item.type === "success"
                ? "border-emerald-200 bg-emerald-50/95 text-emerald-900 shadow-emerald-950/10"
                : item.type === "error"
                ? "border-red-200 bg-red-50/95 text-red-900 shadow-red-950/10"
                : item.type === "warning"
                ? "border-amber-200 bg-amber-50/95 text-amber-900 shadow-amber-950/10"
                : "border-blue-200 bg-blue-50/95 text-blue-900 shadow-blue-950/10"
            }`}
          >
            {/* Icons */}
            <div className="shrink-0 pt-0.5">
              {item.type === "success" && (
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {item.type === "error" && (
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {item.type === "warning" && (
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {item.type === "info" && (
                <svg className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            {/* Message */}
            <div className="flex-1 text-sm font-medium leading-snug">
              {item.message}
            </div>

            {/* Dismiss button */}
            <button
              type="button"
              onClick={() => removeToast(item.id)}
              className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-black/5 hover:text-gray-700 transition-colors"
              aria-label="Tutup"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

