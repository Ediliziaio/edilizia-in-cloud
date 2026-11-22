import { useEffect, useState } from "react";
import { syncItemScope, syncQueue, type SyncItem } from "@/lib/campo/sync-queue";
import type { PrelievoInCoda } from "@/lib/campo/prelievoInCoda";
import type { RapportoInCoda } from "@/lib/campo/rapportoInCoda";

type OperazioniCampo = { prelievo: PrelievoInCoda; rapportino: RapportoInCoda };

export function useCodaCampo<Tipo extends keyof OperazioniCampo>(companyId: string | null, userId: string | undefined, tipo: Tipo) {
  const [stato, setStato] = useState<{ chiave: string; voci: SyncItem<OperazioniCampo[Tipo]>[] }>({ chiave: "", voci: [] });
  const chiave = [companyId, userId, tipo].join(":");
  useEffect(() => {
    if (!companyId || !userId) return;
    let attivo = true;
    let lettura = 0;
    const aggiorna = () => {
      const versione = ++lettura;
      void syncQueue.getAll(tipo).then(voci => {
        if (!attivo || versione !== lettura) return;
        const filtrate = voci.filter(voce => {
          if (voce.type !== tipo || voce.status === "done") return false;
          const scope = syncItemScope(voce);
          return scope.owner === userId && scope.companyId === companyId;
        }) as SyncItem<OperazioniCampo[Tipo]>[];
        setStato({ chiave, voci: filtrate });
      }).catch(() => { /* Il banner della coda mostra gli errori di lettura. */ });
    };
    aggiorna();
    const off = syncQueue.on("change", aggiorna);
    return () => { attivo = false; off(); };
  }, [chiave, companyId, tipo, userId]);
  return stato.chiave === chiave ? stato.voci : [];
}
