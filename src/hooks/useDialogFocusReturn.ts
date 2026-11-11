import { useRef } from "react";

/** Per dialog controllati aperti da righe/celle senza un DialogTrigger Radix. */
export function useDialogFocusReturn() {
  const originRef = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      const origin = document.activeElement;
      originRef.current = origin instanceof HTMLElement && origin !== document.body ? origin : null;
    },
    onCloseAutoFocus: (event: Event) => {
      if (originRef.current?.isConnected) {
        event.preventDefault();
        originRef.current.focus();
      }
    },
  };
}
