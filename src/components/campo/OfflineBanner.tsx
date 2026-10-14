/**
 * Banner UI che mostra lo stato offline e la coda di sincronizzazione.
 * Si mostra automaticamente quando il dispositivo è offline o quando
 * ci sono elementi in attesa di sync.
 * Mostra anche info sulle bozze salvate localmente.
 */
import { useEffect, useState } from "react";
import { WifiOff, CloudUpload, Save } from "lucide-react";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import { listDraftKeys } from "@/hooks/campo/useFormDraft";
import { useAuth } from "@/contexts/AuthContext";
import type { JSX } from "react";

export default function OfflineBanner(): JSX.Element | null {
  const online = useNetworkStatus();
  const { user, profile } = useAuth();
  const { queueCount, isSyncing, failedCount, lastError, retry } = useOfflineSync();
  const [draftCount, setDraftCount] = useState(0);

  // Conta bozze salvate
  useEffect(() => {
    const count = () => listDraftKeys().filter(k => k.startsWith(`rapportino:${profile?.company_id}:${user?.id}:`) || k.startsWith(`merce:${profile?.company_id}:${user?.id}:`)).length;
    let active = true;
    void Promise.resolve().then(() => { if (active) setDraftCount(count()); });
    // Aggiorna ogni 5s
    const interval = setInterval(() => {
      setDraftCount(count());
    }, 5000);
    return () => { active = false; clearInterval(interval); };
  }, [profile?.company_id, user?.id]);


  // Offline: banner giallo
  if (!online) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex-none bg-amber-500/95 text-amber-950 px-4 py-2 flex items-center gap-2 text-sm font-medium border-b border-amber-700 animate-in slide-in-from-top duration-300"
      >
        <WifiOff className="w-4 h-4 shrink-0" />
        <span className="flex-1 leading-tight">
          Sei offline. Le bozze restano sul telefono; non sono inviate. Solo le operazioni in coda verranno sincronizzate.
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {draftCount > 0 && (
            <span className="bg-amber-900/90 text-amber-100 text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Save className="w-3 h-3" />
              {draftCount} bozze
            </span>
          )}
          {queueCount > 0 && (
            <span className="bg-amber-900/90 text-amber-100 text-[11px] font-bold px-2 py-0.5 rounded-full">
              {queueCount} in coda
            </span>
          )}
        </span>
      </div>
    );
  }

  if (lastError || failedCount > 0) return <div role="alert" className="flex flex-wrap items-center gap-2 border-b bg-amber-100 px-4 py-2 text-sm text-amber-950"><span className="flex-1">{failedCount > 0 ? `${failedCount} operazioni da verificare. ` : ""}{lastError || "I dati sono conservati sul telefono."}</span><button type="button" disabled={isSyncing} className="min-h-11 underline" onClick={() => void retry()}>Riprova invio</button></div>;

  // Online + syncing: banner verde
  if (isSyncing || queueCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex-none bg-emerald-600/95 text-white px-4 py-2 flex items-center gap-2 text-sm font-medium border-b border-emerald-800 animate-in slide-in-from-top duration-300"
      >
        <CloudUpload className="w-4 h-4 shrink-0 animate-pulse" />
        <span className="flex-1 leading-tight">
          {isSyncing ? "Sincronizzazione in corso…" : "Operazioni in attesa di sincronizzazione…"}
        </span>
        {queueCount > 0 && (
          <span className="bg-emerald-900/90 text-[11px] font-bold px-2 py-0.5 rounded-full">
            {queueCount}
          </span>
        )}
      </div>
    );
  }

  return null;
}
