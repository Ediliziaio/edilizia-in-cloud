// Compatibility shim: delegates all toast calls to sonner
// This allows all 68+ files importing from here to work with sonner
// without individual migration. The old Radix toast system is removed.

import { toast as sonnerToast } from "sonner";

interface LegacyToastProps {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
  [key: string]: unknown;
}

function toast(props: LegacyToastProps) {
  const { title, description, variant } = props;
  const message = title || "Notifica";

  if (variant === "destructive") {
    sonnerToast.error(message, description ? { description } : undefined);
  } else {
    sonnerToast.success(message, description ? { description } : undefined);
  }

  return {
    id: String(Date.now()),
    dismiss: () => {},
    update: () => {},
  };
}

function useToast() {
  return {
    toast,
    toasts: [] as any[],
    dismiss: () => {},
  };
}

export { useToast, toast };
