/**
 * Banner UI che mostra lo stato offline e la coda di sincronizzazione.
 * Si mostra automaticamente quando il dispositivo è offline o quando
 * ci sono elementi in attesa di sync.
 * Mostra anche info sulle bozze salvate localmente.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { WifiOff, CloudUpload, Save } from "lucide-react";
import { useNetworkStatus } from "@/hooks/campo/useNetworkStatus";
import { useOfflineSync } from "@/hooks/campo/useOfflineSync";
import { listDraftKeys } from "@/hooks/campo/useFormDraft";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { viaggiKey } from "@/hooks/useMezziViaggi";
import { toast } from "sonner";
import { syncQueue } from "@/lib/campo/sync-queue";
import { bozzeCantieriPrelievo } from "@/lib/campo/bozzaPrelievo";
import { aggiornaPrelieviCampo } from "@/lib/campo/prelievoInCoda";
import { refreshCommessaCampoQueries } from "@/lib/orders/refreshCommessaCampoQueries";
import { refreshCampoTimeQueries } from "@/lib/campo/refreshTimeQueries";
import { notifyRapportinoPdf } from "@/lib/campo/rapportinoPdf";
import type { JSX } from "react";

export default function OfflineBanner(): JSX.Element | null {
  const online = useNetworkStatus();
  const { user, profile, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id ?? profile?.company_id;
  const queryClient = useQueryClient();
  const { queueCount, isSyncing, failedCount, puoRitentare, lastError, retry } = useOfflineSync();
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => syncQueue.on("processed", (esito) => {
    if (!esito || esito.companyId !== companyId || esito.userId !== user?.id) return;
    if (esito.tipo === "prelievo") {
      aggiornaPrelieviCampo(queryClient, esito);
      if (esito.errore) toast.error("Controlla il prelievo", { description: esito.errore });
      else if (esito.stato === "rifiutato") toast.info("Prelievo rifiutato");
      else toast.success(esito.stato === "richiesto" ? "Richiesta al magazzino inviata" : "Prelievo registrato");
      return;
    }
    void refreshCommessaCampoQueries(queryClient, esito.orderId, esito.companyId);
    if (esito.tipo === "avanzamento" || esito.tipo === "rilievo") {
      toast.success(esito.tipo === "avanzamento" ? "Aggiornamento inviato" : "Visita inviata",
        { id: esito.id ? `invio-campo:${esito.id}` : undefined });
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["campo-rapportini-da-compilare"] });
    void queryClient.invalidateQueries({ queryKey: ["campo-rapportini-sospesi"] });
    void queryClient.invalidateQueries({ queryKey: ["mezzi"] });
    void queryClient.invalidateQueries({ queryKey: viaggiKey(esito.companyId) });
    if (esito.chiudeGiornata) void refreshCampoTimeQueries(queryClient);
    const inviato = esito.chiudeGiornata ? "Rapportino inviato, giornata chiusa" : "Rapportino inviato";
    if (esito.avvisoMezzi) {
      toast.warning(inviato, { description: "Alcune rilevazioni dei mezzi non sono state salvate. Comunica all’ufficio i dati e dove hai lasciato le attrezzature." });
    } else {
      toast.success(inviato);
    }
    if (esito.id && esito.pdf) void notifyRapportinoPdf(esito.id, esito.orderId, queryClient);
  }), [companyId, queryClient, user?.id]);

  // Conta bozze salvate
  useEffect(() => {
    const userId = user?.id;
    let active = true;
    let lettura = 0;
    const count = async () => {
      const attuale = ++lettura;
      const countLegacy = companyId && userId ? listDraftKeys().filter(k => k.startsWith(`rapportino:${companyId}:${userId}:`)
        || k.startsWith(`merce:${companyId}:${userId}:`)).length
        + bozzeCantieriPrelievo(companyId, userId).filter(v => !v.bozza.inVerifica).length : 0;
      const tecniche = companyId && userId ? await syncQueue.countBozzeTecniche(companyId, userId).catch(() => 0) : 0;
      if (active && attuale === lettura) setDraftCount(countLegacy + tecniche);
    };
    const aggiorna = (): void => { void count(); };
    aggiorna();
    const offBozze = syncQueue.on("draft-change", aggiorna);
    const offCoda = syncQueue.on("enqueued", aggiorna);
    const interval = setInterval(aggiorna, 5000);
    return () => { active = false; offBozze(); offCoda(); clearInterval(interval); };
  }, [companyId, user?.id]);


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
          {queueCount > 0 ? "La coda parte quando torna la rete." : "Sei offline. Puoi mettere gli invii in coda."}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {draftCount > 0 && (
            <Link to="/campo/invii" className="flex min-h-9 items-center gap-1 rounded-full bg-amber-900/90 px-2 text-[11px] font-bold text-amber-100">
              <Save className="w-3 h-3" />
              {draftCount} {draftCount === 1 ? "bozza" : "bozze"}
            </Link>
          )}
          {queueCount > 0 && (
            <Link to="/campo/invii" className="inline-flex min-h-9 items-center rounded-full bg-amber-900/90 px-2 text-[11px] font-bold text-amber-100">
              {queueCount} in coda
            </Link>
          )}
        </span>
      </div>
    );
  }

  if (lastError || failedCount > 0) return <div role="alert" className="flex flex-wrap items-center gap-2 border-b bg-amber-100 px-4 py-2 text-sm text-amber-950">
    <span className="flex-1">{failedCount > 0 ? `${failedCount} ${failedCount === 1 ? "operazione" : "operazioni"} da verificare. ` : ""}
      {lastError || "I dati sono conservati sul telefono."}</span>
    <Link to="/campo/invii" className="inline-flex min-h-11 items-center font-semibold underline">Apri invii</Link>
    {(puoRitentare || failedCount === 0) && <button type="button" disabled={isSyncing} className="min-h-11 underline"
      onClick={() => void retry()}>Riprova invio</button>}
  </div>;

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
          <Link to="/campo/invii" className="inline-flex min-h-9 items-center rounded-full bg-emerald-900/90 px-2 text-[11px] font-bold">
            {queueCount} in coda
          </Link>
        )}
      </div>
    );
  }

  return null;
}
