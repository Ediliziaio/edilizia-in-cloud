/**
 * Movimenti di tutta l'operazione: generale + figlie insieme (lotto B, 14/11/2026).
 *
 * La scheda Cantiere della commessa generale mostrava rapportini, ordini, DDT e costi una
 * commessa alla volta. Qui si leggono tutti, per gli id della generale e delle sue figlie, e
 * l'interfaccia li mostra in elenchi unici con la colonna «Commessa». Sola lettura: per
 * registrare si sceglie dove (la generale o una figlia), come prima.
 *
 * I costi divisi da un'altra commessa (`allocations`) qui non compaiono: questo è l'elenco di
 * ciò che è registrato sull'operazione, non la ripartizione (quella è nel piano).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import type { RiepilogoGenerale } from "@/lib/orders/commesseGenerali";

// Alcune colonne non sono nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Quante righe al massimo per tipo: un'operazione grande ne ha centinaia, non migliaia al mese. */
export const LIMITE_MOVIMENTI = 500;

export interface RapportinoOperazione {
  id: string;
  order_id: string;
  data_lavoro: string | null;
  ore_lavorate: number | null;
  descrizione_lavori: string | null;
  stato: string | null;
  approvato: boolean | null;
  autore: { first_name: string | null; last_name: string | null } | null;
}
export interface OrdineOperazione {
  id: string;
  order_id: string;
  oda_number: string | null;
  status: string | null;
  issue_date: string | null;
  total: number | null;
  supplier_id: string | null;
}
export interface DdtOperazione {
  id: string;
  order_id: string;
  numero_ddt: string | null;
  data_ricezione: string | null;
  stato: string | null;
  supplier_id: string | null;
  purchase_order_id: string | null;
}
export interface CostoOperazioneRiga {
  id: string;
  order_id: string;
  name: string | null;
  amount: number | null;
  documento_data: string | null;
  due_date: string | null;
  is_paid: boolean | null;
  paid_date: string | null;
  supplier_id: string | null;
}

export interface MovimentiOperazione {
  rapportini: RapportinoOperazione[];
  ordini: OrdineOperazione[];
  ddt: DdtOperazione[];
  costi: CostoOperazioneRiga[] | null;
  fornitori: Record<string, string>;
  /** Tipi che hanno toccato il limite: l'elenco non è completo. */
  troncati: string[];
}

async function leggi<T>(tabella: string, colonne: string, companyId: string, ids: string[], ordina: string, filtra?: (q: unknown) => unknown): Promise<T[]> {
  let q = db.from(tabella).select(colonne).eq("company_id", companyId).in("order_id", ids);
  if (filtra) q = filtra(q);
  const { data, error } = await q.order(ordina, { ascending: false, nullsFirst: false }).limit(LIMITE_MOVIMENTI);
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useMovimentiOperazione(r: RiepilogoGenerale, attivo: boolean) {
  const companyId = useEffectiveCompanyId();
  const ids = [r.generale.id, ...r.figlie.map((f) => f.id)];
  return useQuery({
    queryKey: ["generale-movimenti-operazione", companyId, r.generale.id, ids.join(","), r.permessi.costi],
    enabled: attivo && !!companyId,
    staleTime: 30_000,
    queryFn: async (): Promise<MovimentiOperazione> => {
      const [rapportini, ordini, ddt, costi] = await Promise.all([
        leggi<RapportinoOperazione>(
          "campo_rapportini",
          "id, order_id, data_lavoro, ore_lavorate, descrizione_lavori, stato, approvato, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)",
          companyId!, ids, "data_lavoro",
          (q) => (q as { is: (c: string, v: null) => unknown }).is("annullato_at", null),
        ),
        leggi<OrdineOperazione>("purchase_orders", "id, order_id, oda_number, status, issue_date, total, supplier_id", companyId!, ids, "issue_date"),
        leggi<DdtOperazione>("ddt_ricezione", "id, order_id, numero_ddt, data_ricezione, stato, supplier_id, purchase_order_id", companyId!, ids, "data_ricezione"),
        r.permessi.costi
          ? leggi<CostoOperazioneRiga>("company_costs", "id, order_id, name, amount, documento_data, due_date, is_paid, paid_date, supplier_id", companyId!, ids, "documento_data")
          : Promise.resolve(null),
      ]);
      const idFornitori = [...new Set([...ordini, ...ddt, ...(costi ?? [])].map((x) => x.supplier_id).filter((x): x is string => !!x))];
      const fornitori: Record<string, string> = {};
      for (let i = 0; i < idFornitori.length; i += 100) {
        const { data, error } = await db.from("suppliers").select("id, name").eq("company_id", companyId).in("id", idFornitori.slice(i, i + 100));
        if (error) throw error;
        for (const f of (data ?? []) as Array<{ id: string; name: string | null }>) fornitori[f.id] = f.name ?? "";
      }
      const troncati = [
        rapportini.length >= LIMITE_MOVIMENTI && "rapportini",
        ordini.length >= LIMITE_MOVIMENTI && "ordini",
        ddt.length >= LIMITE_MOVIMENTI && "DDT",
        (costi?.length ?? 0) >= LIMITE_MOVIMENTI && "costi",
      ].filter((x): x is string => !!x);
      return { rapportini, ordini, ddt, costi, fornitori, troncati };
    },
  });
}
