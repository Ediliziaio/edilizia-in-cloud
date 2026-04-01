import { useState } from "react";
import { X, Download } from "lucide-react";
import { usePWAInstallPrompt } from "@/hooks/usePWAInstallPrompt";
import { Button } from "@/components/ui/button";

export function PWAInstallBanner() {
  const { canInstall, triggerInstall } = usePWAInstallPrompt();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div
      role="banner"
      className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 bg-primary text-primary-foreground shadow-md"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
    >
      <Download className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-sm font-medium leading-snug">
        Installa l'app per un'esperienza migliore
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="shrink-0 h-8 text-xs"
        onClick={triggerInstall}
      >
        Installa
      </Button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Chiudi banner installazione"
        className="shrink-0 p-1 rounded-full hover:bg-primary-foreground/20 transition-colors"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
