/**
 * Movimenti di tutta l'operazione: generale + figlie insieme (lotti B e C, 14/11/2026).
 * Lotto C: anche giornale dei lavori, timbrature e giornate dei mezzi, che la generale non
 * leggeva da nessuna parte.
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
export type VistaOperazione = "rapportini" | "lavorazioni" | "acquisti" | "ddt" | "squadre" | "fatture";

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

export interface GiornaleOperazione {
  id: string;
  order_id: string;
  data_lavori: string | null;
  lavorazioni_eseguite: string | null;
  personale_presente: number | null;
  stato: string | null;
}
export interface TimbraturaOperazione {
  id: string;
  order_id: string;
  tipo: string | null;
  timestamp_evento: string | null;
  persona: { first_name: string | null; last_name: string | null } | null;
}
export interface GiornataMezzoOperazione {
  id: string;
  order_id: string;
  giorno: string | null;
  usato: boolean | null;
  contatore: number | null;
  mezzo: { nome: string | null; targa: string | null } | null;
}

interface FaseOperazione {
  id: string;
  order_id: string;
  name: string;
  status: string | null;
  percentuale: number | null;
  end_date: string | null;
}

interface SubappaltoOperazione {
  id: string;
  order_id: string;
  numero_contratto: string | null;
  descrizione_lavori: string | null;
  stato: string | null;
  subappaltatori_sicurezza: { ragione_sociale: string } | null;
}

export interface MovimentiOperazione {
  rapportini: RapportinoOperazione[];
  ordini: OrdineOperazione[];
  ddt: DdtOperazione[];
  costi: CostoOperazioneRiga[] | null;
  giornale: GiornaleOperazione[];
  timbrature: TimbraturaOperazione[];
  mezzi: GiornataMezzoOperazione[];
  fasi: FaseOperazione[];
  subappalti: SubappaltoOperazione[];
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

export function useMovimentiOperazione(r: RiepilogoGenerale, vista: VistaOperazione) {
  const companyId = useEffectiveCompanyId();
  const ids = [r.generale.id, ...r.figlie.map((f) => f.id)];
  return useQuery({
    queryKey: ["generale-movimenti-operazione", companyId, r.generale.id, ids.join(","), r.permessi.costi, r.permessi.importi, vista],
    enabled: !!companyId,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    queryFn: async (): Promise<MovimentiOperazione> => {
      const [rapportini, ordini, ddt, costi, giornale, timbrature, mezzi, fasi, subappalti] = await Promise.all([
        vista === "rapportini" ? leggi<RapportinoOperazione>(
          "campo_rapportini",
          "id, order_id, data_lavoro, ore_lavorate, descrizione_lavori, stato, approvato, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)",
          companyId!, ids, "data_lavoro",
          (q) => (q as { is: (c: string, v: null) => unknown }).is("annullato_at", null),
        ) : [],
        vista === "acquisti" ? leggi<OrdineOperazione>("purchase_orders",
          `id, order_id, oda_number, status, issue_date, supplier_id${r.permessi.importi ? ", total" : ""}`, companyId!, ids, "issue_date") : [],
        vista === "ddt" ? leggi<DdtOperazione>("ddt_ricezione", "id, order_id, numero_ddt, data_ricezione, stato, supplier_id, purchase_order_id", companyId!, ids, "data_ricezione") : [],
        vista === "fatture" && r.permessi.costi
          ? leggi<CostoOperazioneRiga>("company_costs", "id, order_id, name, amount, documento_data, due_date, is_paid, paid_date, supplier_id", companyId!, ids, "documento_data")
          : Promise.resolve(null),
        vista === "rapportini" ? leggi<GiornaleOperazione>("giornale_lavori", "id, order_id, data_lavori, lavorazioni_eseguite, personale_presente, stato", companyId!, ids, "data_lavori") : [],
        vista === "squadre" ? leggi<TimbraturaOperazione>(
          "campo_timbrature",
          "id, order_id, tipo, timestamp_evento, persona:profiles!campo_timbrature_user_id_fkey(first_name, last_name)",
          companyId!, ids, "timestamp_evento",
        ) : [],
        vista === "squadre" ? leggi<GiornataMezzoOperazione>(
          "mezzi_giornate",
          "id, order_id, giorno, usato, contatore, mezzo:mezzi!mezzi_giornate_mezzo_id_fkey(nome, targa)",
          companyId!, ids, "giorno",
        ) : [],
        vista === "lavorazioni" ? leggi<FaseOperazione>("order_work_phases",
          "id, order_id, name, status, percentuale, end_date", companyId!, ids, "updated_at") : [],
        vista === "squadre" && r.permessi.costi ? leggi<SubappaltoOperazione>("contratti_subappalto",
          "id, order_id, numero_contratto, descrizione_lavori, stato, subappaltatori_sicurezza(ragione_sociale)", companyId!, ids, "created_at") : [],
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
        giornale.length >= LIMITE_MOVIMENTI && "giornale",
        timbrature.length >= LIMITE_MOVIMENTI && "timbrature",
        mezzi.length >= LIMITE_MOVIMENTI && "giornate dei mezzi",
        fasi.length >= LIMITE_MOVIMENTI && "lavorazioni",
        subappalti.length >= LIMITE_MOVIMENTI && "subappalti",
      ].filter((x): x is string => !!x);
      return { rapportini, ordini, ddt, costi, giornale, timbrature, mezzi, fasi, subappalti, fornitori, troncati };
    },
  });
}
