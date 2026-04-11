/**
 * Banner UI che mostra lo stato offline e la coda di sincronizzazione.
 * Si mostra automaticamente quando il dispositivo è offline o quando
 * ci sono elementi in attesa di sync.
 * Mostra anche info sulle bozze salvate localmente.
 */
import { useEffect, useState } from "react";
import { WifiOff, CloudUpload, Check, Save } from "lucide-react";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import { listDraftKeys } from "@/hooks/campo/useFormDraft";

export default function OfflineBanner(): JSX.Element | null {
  const online = useNetworkStatus();
  const { queueCount, isSyncing } = useOfflineSync();
  const [showSyncedToast, setShowSyncedToast] = useState(false);
  const [prevQueue, setPrevQueue] = useState(queueCount);
  const [draftCount, setDraftCount] = useState(0);

  // Conta bozze salvate
  useEffect(() => {
    const count = listDraftKeys().length;
    setDraftCount(count);
    // Aggiorna ogni 5s
    const interval = setInterval(() => {
      setDraftCount(listDraftKeys().length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Mostra brevemente "Sincronizzato" quando la coda passa da >0 a 0
  useEffect(() => {
    if (prevQueue > 0 && queueCount === 0 && online) {
      setShowSyncedToast(true);
      const timer = setTimeout(() => setShowSyncedToast(false), 2500);
      return () => clearTimeout(timer);
    }
    setPrevQueue(queueCount);
  }, [queueCount, prevQueue, online]);

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
          Sei offline — i dati vengono salvati localmente e sincronizzati al ritorno online
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
          Sincronizzazione in corso…
        </span>
        {queueCount > 0 && (
          <span className="bg-emerald-900/90 text-[11px] font-bold px-2 py-0.5 rounded-full">
            {queueCount}
          </span>
        )}
      </div>
    );
  }

  // Toast "Sincronizzato" effimero
  if (showSyncedToast) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex-none bg-emerald-600/95 text-white px-4 py-2 flex items-center gap-2 text-sm font-medium border-b border-emerald-800 animate-in slide-in-from-top duration-300"
      >
        <Check className="w-4 h-4 shrink-0" />
        <span className="flex-1 leading-tight">Tutti i dati sincronizzati</span>
      </div>
    );
  }

  return null;
}
