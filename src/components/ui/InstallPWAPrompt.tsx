/**
 * InstallPWAPrompt — v8.6.91
 *
 * Toast/banner che propone l'installazione PWA quando il browser fa partire
 * `beforeinstallprompt`. Show solo:
 *   - su mobile (matchMedia max-width 768px) o se l'utente è su Android/iOS
 *   - se NON già in standalone mode
 *   - se l'utente NON ha mai dismisso (localStorage)
 *
 * Click "Installa" → mostra il dialog nativo del browser.
 * Click "Più tardi" → snooze 7gg.
 *
 * Per iOS Safari (che NON supporta beforeinstallprompt), mostra istruzioni
 * manuali "Aggiungi alla schermata Home" dal Share menu.
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Smartphone, Share, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics/posthog";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const STORAGE_KEY = "pwa_install_dismissed_at";
const SNOOZE_DAYS = 7;

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // Classic iOS UA detection
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ si presenta come MacIntel ma supporta touch → detection alt.
  if (
    navigator.platform === "MacIntel" &&
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }
  return false;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari standalone
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((navigator as any).standalone === true) return true;
  // PWA installed
  return window.matchMedia("(display-mode: standalone)").matches;
}

function isDismissedRecently(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (!v) return false;
    const dismissedAt = parseInt(v, 10);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function InstallPWAPrompt() {
  const location = useLocation();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // v8.6.96 — Mostrato SOLO nelle aree app autenticate (azienda, admin, campo).
  // No prompt su login, landing, pagine pubbliche (prezzi, blog, ecc.).
  const path = location.pathname;
  const isAppArea = path.startsWith("/azienda") || path.startsWith("/admin") || path.startsWith("/campo");

  useEffect(() => {
    if (isStandalone() || isDismissedRecently()) {
      setDismissed(true);
      return;
    }

    // Android/Chrome — capture beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      track("pwa_install_prompt_available");
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS — non c'è beforeinstallprompt: mostriamo hint manuale dopo 30s
    // di engagement (per non infastidire al primo paint).
    if (isIOS()) {
      const t = setTimeout(() => setShowIOSHint(true), 30_000);
      return () => {
        window.removeEventListener("beforeinstallprompt", handler);
        clearTimeout(t);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    track("pwa_install_clicked");
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    track("pwa_install_outcome", { outcome });
    setInstallEvent(null);
    if (outcome === "dismissed") {
      try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* ignore */ }
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    track("pwa_install_dismissed");
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* ignore */ }
    setDismissed(true);
    setInstallEvent(null);
    setShowIOSHint(false);
  };

  if (dismissed) return null;
  if (!isAppArea) return null;
  if (!installEvent && !showIOSHint) return null;

  // ── Variante Android/Chrome: usa il prompt nativo ────────────────────────
  if (installEvent) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50/60 to-white dark:from-amber-950/40 dark:to-background shadow-lg p-4 animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
            <Smartphone className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Installa Edilizia in Cloud</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Apri l&apos;app dalla schermata Home, funziona meglio in cantiere.
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleInstall} className="h-8 text-xs">
                <Download className="h-3.5 w-3.5 mr-1" />
                Installa
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 text-xs">
                Più tardi
              </Button>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            className="h-7 w-7 shrink-0 -mr-1 -mt-1"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Variante iOS: istruzioni manuali via Share menu ──────────────────────
  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white shadow-lg p-4 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shrink-0">
          <Smartphone className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Aggiungi a Home Screen</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tocca <Share className="inline h-3 w-3 mx-0.5" /> in basso → &quot;Aggiungi
            alla schermata Home&quot; per usarla come app nativa.
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDismiss}
          className="h-7 w-7 shrink-0 -mr-1 -mt-1"
          aria-label="Chiudi"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
