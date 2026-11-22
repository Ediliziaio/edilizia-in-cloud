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
import { readAllOrderRows } from "@/lib/orders/listScope";
import { giornoLocale, type RapportinoFasi, type StatoFase } from "@/lib/orders/cronoprogramma";

// Alcune colonne non sono nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Quante righe al massimo per tipo: un'operazione grande ne ha centinaia, non migliaia al mese. */
export const LIMITE_MOVIMENTI = 500;
export type VistaOperazione = "da-seguire" | "rapportini" | "lavorazioni" | "cronoprogramma" | "acquisti" | "ddt" | "squadre" | "fatture";

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
  expected_delivery_date: string | null;
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
  purchase_orders?: { oda_number: string | null } | null;
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

export interface FaseOperazione {
  id: string;
  order_id: string;
  name: string;
  status: StatoFase;
  percentuale: number | null;
  start_date: string | null;
  end_date: string | null;
  completata_il: string | null;
  position: number;
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
  rapportiniCronoprogramma: RapportinoFasi[];
  subappalti: SubappaltoOperazione[];
  fornitori: Record<string, string>;
  /** Tipi che hanno toccato il limite: l'elenco non è completo. */
  troncati: string[];
}

async function leggi<T>(tabella: string, colonne: string, companyId: string, ids: string[], ordina: string, filtra?: (q: typeof db) => typeof db): Promise<T[]> {
  let q = db.from(tabella).select(colonne).eq("company_id", companyId).in("order_id", ids);
  if (filtra) q = filtra(q);
  const { data, error } = await q.order(ordina, { ascending: false, nullsFirst: false }).limit(LIMITE_MOVIMENTI);
  if (error) throw error;
  return (data ?? []) as T[];
}

async function leggiCronoprogramma(companyId: string, ids: string[], signal: AbortSignal) {
  const fasi: FaseOperazione[] = [];
  const rapportini: RapportinoFasi[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const ambito = ids.slice(i, i + 100);
    const [fasiDelGruppo, rapportiniDelGruppo] = await Promise.all([
      readAllOrderRows<FaseOperazione>((da, a) => db.from("order_work_phases")
        .select("id, order_id, name, status, percentuale, start_date, end_date, completata_il, position")
        .eq("company_id", companyId).in("order_id", ambito)
        .order("position").order("id").range(da, a).abortSignal(signal)),
      readAllOrderRows<RapportinoFasi>((da, a) => supabase.from("campo_rapportini")
        .select("data_lavoro, stato, fasi_lavorate").eq("company_id", companyId).in("order_id", ambito)
        .in("stato", ["inviato", "approvato"]).is("annullato_at", null).not("fasi_lavorate", "is", null)
        .order("id").range(da, a).abortSignal(signal)),
    ]);
    fasi.push(...fasiDelGruppo);
    rapportini.push(...rapportiniDelGruppo);
  }
  return { fasi, rapportini };
}

export function useMovimentiOperazione(r: RiepilogoGenerale, vista: VistaOperazione, commessaId?: string) {
  const companyId = useEffectiveCompanyId();
  const ids = [r.generale.id, ...r.figlie.map((f) => f.id)].filter(id => !commessaId || id === commessaId);
  return useQuery({
    queryKey: ["generale-movimenti-operazione", companyId, r.generale.id, ids.join(","), r.permessi.costi, r.permessi.importi, vista],
    enabled: !!companyId && ids.length > 0,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    queryFn: async ({ signal }): Promise<MovimentiOperazione> => {
      const daSeguire = vista === "da-seguire";
      const oggi = giornoLocale(new Date().toISOString());
      const [rapportini, ordini, ddt, costi, giornale, timbrature, mezzi, fasi, subappalti, crono] = await Promise.all([
        vista === "rapportini" || daSeguire ? leggi<RapportinoOperazione>(
          "campo_rapportini",
          "id, order_id, data_lavoro, ore_lavorate, descrizione_lavori, stato, approvato, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)",
          companyId!, ids, "data_lavoro",
          q => daSeguire ? q.is("annullato_at", null).eq("stato", "inviato") : q.is("annullato_at", null),
        ) : [],
        vista === "acquisti" || daSeguire ? leggi<OrdineOperazione>("purchase_orders",
          `id, order_id, oda_number, status, issue_date, supplier_id, expected_delivery_date${vista === "acquisti" && r.permessi.importi ? ", total" : ""}`,
          companyId!, ids, daSeguire ? "expected_delivery_date" : "issue_date",
          daSeguire ? q => q.in("status", ["inviato", "confermato", "parziale"]).lt("expected_delivery_date", oggi) : undefined) : [],
        vista === "ddt" || daSeguire ? leggi<DdtOperazione>("ddt_ricezione",
          `id, order_id, numero_ddt, data_ricezione, stato, supplier_id, purchase_order_id${vista === "ddt" ? ", purchase_orders!ddt_ricezione_purchase_order_id_fkey(oda_number)" : ""}`,
          companyId!, ids, "data_ricezione",
          daSeguire ? q => q.in("stato", ["ricevuto", "parziale", "non_conforme"]) : undefined) : [],
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
          "id, order_id, name, status, percentuale, start_date, end_date, completata_il, position", companyId!, ids, "updated_at") : [],
        vista === "squadre" && r.permessi.costi ? leggi<SubappaltoOperazione>("contratti_subappalto",
          "id, order_id, numero_contratto, descrizione_lavori, stato, subappaltatori_sicurezza(ragione_sociale)", companyId!, ids, "created_at") : [],
        vista === "cronoprogramma" || daSeguire ? leggiCronoprogramma(companyId!, ids, signal) : null,
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
      return { rapportini, ordini, ddt, costi, giornale, timbrature, mezzi, fasi: crono?.fasi ?? fasi,
        rapportiniCronoprogramma: crono?.rapportini ?? [], subappalti, fornitori, troncati };
    },
  });
}
