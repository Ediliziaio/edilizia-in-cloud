import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";

const SUPABASE_ORIGIN = new URL(import.meta.env.VITE_SUPABASE_URL as string).origin;

interface OAuthStepProps {
  onSuccess: () => void;
  hook: any;
}

const STORAGE_KEY = "meta_oauth_result";

export function OAuthStep({ onSuccess, hook }: OAuthStepProps) {
  const [loading, setLoading] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const closedPollRef = useRef<number | null>(null);
  const dbPollRef = useRef<number | null>(null);
  const doneRef = useRef(false);
  // updated_at dell'integrazione PRIMA di questo tentativo: il polling DB
  // avanza solo quando cambia (= callback nuovo), mai su una connessione
  // preesistente.
  const baselineRef = useRef<string | null>(null);
  // onSuccess/hook via ref: gli handler vivono per tutta la vita del componente
  // ma devono usare i valori aggiornati senza riarmare i listener.
  const onSuccessRef = useRef(onSuccess);
  const hookRef = useRef(hook);
  onSuccessRef.current = onSuccess;
  hookRef.current = hook;

  const clearTimers = () => {
    if (closedPollRef.current) { clearInterval(closedPollRef.current); closedPollRef.current = null; }
    if (dbPollRef.current) { clearInterval(dbPollRef.current); dbPollRef.current = null; }
  };

  const finish = (status: "success" | "error") => {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimers();
    setLoading(false);
    try { popupRef.current?.close(); } catch { /* opener spezzato dal COOP */ }
    popupRef.current = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    if (status === "success") onSuccessRef.current();
  };

  useEffect(() => {
    // 1) postMessage classico (funziona solo se il COOP di Facebook non ha
    //    spezzato window.opener — su Chrome recenti NON funziona).
    const onMessage = (event: MessageEvent) => {
      const allowed = event.origin === SUPABASE_ORIGIN || event.origin === window.location.origin;
      if (!allowed) return;
      if (event.data?.type === "META_OAUTH_RESULT") {
        finish(event.data.status === "success" ? "success" : "error");
      }
    };
    // 2) BroadcastChannel same-origin: immune al COOP, è il canale principale.
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("meta-oauth");
      bc.onmessage = (ev) => {
        const s = ev.data?.status;
        finish(s === "success" || s === "ok" ? "success" : "error");
      };
    } catch { /* non supportato → restano storage + polling DB */ }
    // 3) storage event: il popup scrive meta_oauth_result → altra fallback.
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== STORAGE_KEY || !ev.newValue) return;
      try {
        const v = JSON.parse(ev.newValue);
        finish(v.status === "success" || v.status === "ok" ? "success" : "error");
      } catch { /* valore non valido */ }
    };
    window.addEventListener("message", onMessage);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
      bc?.close();
      clearTimers();
    };
  }, []);

  const isNewlyConnected = async (): Promise<boolean> => {
    try {
      const s = await hookRef.current.getMetaStatus?.();
      return !!s?.connected && s.updatedAt !== baselineRef.current;
    } catch {
      return false;
    }
  };

  const handleConnect = async () => {
    doneRef.current = false;
    setLoading(true);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    // Baseline PRIMA di aprire il popup: distingue una connessione nuova da
    // una già esistente (evita l'avanzamento prematuro nel polling DB).
    try { baselineRef.current = (await hookRef.current.getMetaStatus?.())?.updatedAt ?? null; } catch { baselineRef.current = null; }
    const oauthUrl = await hookRef.current.startOAuth();
    if (!oauthUrl) {
      setLoading(false);
      return;
    }
    // La dialog di Facebook "Login for Business" è larga: con 600px usciva
    // grigia con scroll orizzontale. Più spazio + ridimensionabile.
    const w = Math.min(820, Math.floor(screen.width * 0.9));
    const h = Math.min(860, Math.floor(screen.height * 0.9));
    const left = Math.max(0, (screen.width - w) / 2);
    const top = Math.max(0, (screen.height - h) / 2);
    popupRef.current = window.open(
      oauthUrl,
      "meta_oauth",
      `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`,
    );

    // Se l'utente chiude il popup senza completare, sblocca il bottone.
    closedPollRef.current = window.setInterval(() => {
      if (popupRef.current && popupRef.current.closed) {
        // Il popup potrebbe essersi chiuso DOPO un successo non ancora
        // ricevuto via canale: diamo un ultimo controllo al DB, poi sblocca.
        isNewlyConnected().then((ok) => {
          if (ok) finish("success");
          else if (!doneRef.current) { setLoading(false); clearTimers(); }
        });
      }
    }, 1000);

    // RETE DI SICUREZZA: se tutti i canali di messaggistica falliscono
    // (COOP + BroadcastChannel + storage), interroghiamo direttamente il DB:
    // quando l'integrazione risulta NUOVAMENTE "connected" avanziamo lo stesso.
    dbPollRef.current = window.setInterval(() => {
      isNewlyConnected().then((ok) => { if (ok) finish("success"); });
    }, 2500);
  };

  return (
    <div className="text-center space-y-4 py-8">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-8 w-8" fill="none">
          <rect width="36" height="36" rx="8" fill="hsl(var(--primary))" />
          <text x="18" y="24" textAnchor="middle" fill="white" fontSize="18" fontWeight="700" fontFamily="system-ui">M</text>
        </svg>
      </div>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Collega il tuo account Facebook per importare automaticamente i lead
          dai moduli Lead Ads delle tue pagine.
        </p>
        <p className="text-xs text-muted-foreground">
          Facebook ti chiederà i permessi per pagine, moduli lead e inserzioni, più quelli delle funzioni attive (post, statistiche, messaggi).
        </p>
      </div>
      <Button onClick={handleConnect} disabled={loading} className="gap-2">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Collega con Facebook
      </Button>
    </div>
  );
}
