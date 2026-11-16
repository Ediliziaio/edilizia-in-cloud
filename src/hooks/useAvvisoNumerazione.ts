// src/hooks/useAvvisoNumerazione.ts
// Cosa dire sulla numerazione prima di emettere (16/11/2026). I tre numeri che servono:
//  - quanti documenti fiscali ha già emesso questa azienda dentro l'app (zero = è la prima);
//  - il prossimo numero che il contatore assegnerà (anagrafica_azienda.ultimo_numero_fattura + 1);
//  - il progressivo più alto dell'archivio importato dello stesso anno (tabella `invoices`),
//    che l'editor non guarda e che è la fonte dei doppioni.
// Il giudizio sta in lib/fatturazione/primaEmissione.ts: qui si legge soltanto.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { avvisoNumerazione, haNumerazioneFiscale, type AvvisoNumerazione } from "@/lib/fatturazione/primaEmissione";

// Le letture toccano tabelle fuori dai tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function useAvvisoNumerazione(
  companyId: string | null | undefined,
  tipo: string,
  anno: number,
  abilitato = true,
): AvvisoNumerazione {
  const attivo = !!companyId && abilitato && haNumerazioneFiscale(tipo);
  const q = useQuery({
    queryKey: ["avviso-numerazione", companyId, anno],
    enabled: attivo,
    staleTime: 30_000,
    queryFn: async () => {
      const [emessi, ana, archivio] = await Promise.all([
        // Documenti fiscali già emessi dall'app, quest'anno: zero vuol dire che questa è la prima.
        db.from("documenti_fiscali")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("anno", anno)
          .is("deleted_at", null)
          .not("stato", "in", '("bozza","annullata")'),
        db.from("anagrafica_azienda")
          .select("ultimo_numero_fattura, anno_corrente_fattura")
          .eq("company_id", companyId)
          .maybeSingle(),
        // L'archivio importato: il progressivo più alto dello stesso anno.
        db.from("invoices")
          .select("progressive_number")
          .eq("company_id", companyId)
          .eq("invoice_year", anno)
          .is("deleted_at", null)
          .not("progressive_number", "is", null)
          .order("progressive_number", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const contatore = numero(ana?.data?.ultimo_numero_fattura);
      const annoContatore = numero(ana?.data?.anno_corrente_fattura);
      // A inizio anno il contatore riparte da 1: il suo valore vecchio non dice più niente.
      const prossimo = contatore === null ? null : annoContatore !== null && annoContatore < anno ? 1 : contatore + 1;
      return {
        prima: (emessi?.count ?? 0) === 0,
        prossimo,
        massimoArchivio: numero(archivio?.data?.progressive_number),
      };
    },
  });
  // Finché non si sa, non si dice niente: meglio nessun avviso che un avviso sbagliato.
  if (!attivo || !q.data) return { tipo: "nessuno" };
  return avvisoNumerazione(q.data);
}
