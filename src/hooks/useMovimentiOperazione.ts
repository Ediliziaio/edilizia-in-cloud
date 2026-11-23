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
import { aggiungiGiorni, giornoLocale, type RapportinoFasi, type StatoFase } from "@/lib/orders/cronoprogramma";
import { RIGHE_REGISTRO, type CategoriaPriorita, type PagineRegistro, type PeriodoRegistro, type RegistroOperazione } from "@/lib/orders/generali/registroOperazione";

// Alcune colonne non sono nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type VistaOperazione = "da-seguire" | "rapportini" | "lavorazioni" | "cronoprogramma" | "acquisti" | "ddt" | "squadre" | "fatture";

export interface RapportinoOperazione {
  id: string;
  order_id: string;
  data_lavoro: string | null;
  ore_lavorate: number | null;
  descrizione_lavori: string | null;
  stato: string | null;
  approvato: boolean | null;
  approvato_at?: string | null;
  ore_straordinario?: number | null;
  foto_urls?: string[] | null;
  autore: { first_name: string | null; last_name: string | null } | null;
}
export interface OrdineOperazione {
  id: string;
  order_id: string;
  oda_number: string | null;
  status: string | null;
  issue_date: string | null;
  expected_delivery_date: string | null;
  actual_delivery_date?: string | null;
  supplier_reference?: string | null;
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
  destinazione?: "cantiere" | "magazzino" | null;
  corriere?: string | null;
  ricevuto_da_nome?: string | null;
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
  esecuzione?: string | null;
  position: number;
}

export interface RapportinoCronoprogrammaOperazione extends RapportinoFasi {
  id: string;
  order_id: string;
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
  rapportiniCronoprogramma: RapportinoCronoprogrammaOperazione[];
  subappalti: SubappaltoOperazione[];
  fornitori: Record<string, string>;
  pagine?: Partial<Record<RegistroOperazione, { altre: boolean }>>;
}

async function leggiRegistro<T>(
  tabella: string, colonne: string, companyId: string, generaleId: string, commessaId: string | undefined,
  ordina: string, periodo: PeriodoRegistro, pagina: number, signal: AbortSignal, priorita: boolean, edificio: string | undefined,
  filtra?: (q: typeof db) => typeof db,
): Promise<T[]> {
  const unita = edificio ? ",unita:unita_immobiliari!unita_immobiliari_order_id_fkey!inner(id)" : "";
  let q = db.from(tabella).select(`${colonne},ambito:orders!${tabella}_order_id_fkey!inner(id${unita})`)
    .eq("company_id", companyId).eq("ambito.company_id", companyId).is("ambito.deleted_at", null);
  q = commessaId
    ? q.eq("order_id", commessaId)
    : q.or(`id.eq.${generaleId},commessa_generale_id.eq.${generaleId}`, { referencedTable: "ambito" });
  if (edificio) q = q.eq("ambito.unita.edificio", edificio).eq("ambito.unita.company_id", companyId);
  if (tabella === "order_work_phases") {
    if (periodo.dal) q = q.gte("end_date", periodo.dal);
    if (periodo.al) q = q.lte("start_date", periodo.al);
  } else {
    const conOra = ordina === "timestamp_evento" || ordina === "created_at";
    const mezzanotte = (giorno: string) => new Date(`${giorno}T00:00:00`).toISOString();
    if (periodo.dal) q = q.gte(ordina, conOra ? mezzanotte(periodo.dal) : periodo.dal);
    if (periodo.al && conOra && periodo.al !== "9999-12-31") q = q.lt(ordina, mezzanotte(aggiungiGiorni(periodo.al, 1)));
    if (periodo.al && !conOra) q = q.lte(ordina, periodo.al);
  }
  if (filtra) q = filtra(q);
  if (priorita && tabella === "ddt_ricezione") q = q.order("stato", { ascending: true });
  const da = (pagina - 1) * RIGHE_REGISTRO;
  const { data, error } = await q.order(ordina, { ascending: priorita, nullsFirst: false })
    .order("id", { ascending: priorita }).range(da, da + RIGHE_REGISTRO).abortSignal(signal);
  if (error) throw error;
  return (data ?? []) as T[];
}

async function leggiCronoprogramma(companyId: string, ids: string[], signal: AbortSignal, conRapportini: boolean) {
  const fasi: FaseOperazione[] = [];
  const rapportini: RapportinoCronoprogrammaOperazione[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const ambito = ids.slice(i, i + 100);
    const [fasiDelGruppo, rapportiniDelGruppo] = await Promise.all([
      readAllOrderRows<FaseOperazione>((da, a) => db.from("order_work_phases")
        .select("id, order_id, name, status, percentuale, start_date, end_date, completata_il, esecuzione, position")
        .eq("company_id", companyId).in("order_id", ambito)
        .order("position").order("id").range(da, a).abortSignal(signal)),
      conRapportini ? readAllOrderRows<RapportinoCronoprogrammaOperazione>((da, a) => supabase.from("campo_rapportini")
        .select("id, order_id, data_lavoro, stato, fasi_lavorate").eq("company_id", companyId).in("order_id", ambito)
        .in("stato", ["inviato", "approvato"]).is("annullato_at", null).not("fasi_lavorate", "is", null)
        .order("created_at").order("id").range(da, a).abortSignal(signal)) : [],
    ]);
    fasi.push(...fasiDelGruppo);
    rapportini.push(...rapportiniDelGruppo);
  }
  return { fasi, rapportini };
}

export function useDitteFaseOperazione(orderId: string, faseId: string) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["order-external-teams", orderId, companyId, "fase-cronoprogramma", faseId],
    enabled: !!companyId,
    queryFn: async ({ signal }) => {
      const righe = await readAllOrderRows<{ team: { name: string } }>((da, a) => supabase
        .from("order_external_teams")
        .select("team:external_teams!inner(name), orders!inner(company_id)")
        .eq("order_id", orderId).eq("phase_id", faseId)
        .eq("orders.company_id", companyId!).eq("team.company_id", companyId!).eq("team.kind", "esterna")
        .order("id").range(da, a).abortSignal(signal));
      return [...new Set(righe.map(r => r.team.name))].sort((a, b) => a.localeCompare(b, "it"));
    },
  });
}

export function useMovimentiOperazione(
  r: RiepilogoGenerale, vista: VistaOperazione, commessaId?: string,
  periodo: PeriodoRegistro = { dal: "", al: "" }, pagine: PagineRegistro = {}, categoria: CategoriaPriorita = "tutte",
  edificio?: { nome: string; idCommesse: string[] },
) {
  const companyId = useEffectiveCompanyId();
  const ids = edificio?.idCommesse ?? [r.generale.id, ...r.figlie.map((f) => f.id)].filter(id => !commessaId || id === commessaId);
  return useQuery({
    queryKey: ["generale-movimenti-operazione", companyId, r.generale.id, ids.join(","), r.permessi.costi, r.permessi.importi, vista, periodo, pagine, categoria, edificio?.nome],
    enabled: !!companyId && ids.length > 0,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchInterval: Object.values(pagine).every(pagina => pagina === 1) ? 30_000 : false,
    queryFn: async ({ signal }): Promise<MovimentiOperazione> => {
      const daSeguire = vista === "da-seguire";
      const priorita = (tipo: CategoriaPriorita) => daSeguire && (categoria === "tutte" || categoria === tipo);
      const oggi = giornoLocale(new Date().toISOString());
      const metadati: NonNullable<MovimentiOperazione["pagine"]> = {};
      const elenco = async <T>(
        registro: RegistroOperazione, tabella: string, colonne: string, ordina: string, filtra?: (q: typeof db) => typeof db,
      ) => {
        const righe = await leggiRegistro<T>(tabella, colonne, companyId!, r.generale.id, commessaId,
          ordina, periodo, pagine[registro] ?? 1, signal, daSeguire, edificio?.nome, filtra);
        metadati[registro] = { altre: righe.length > RIGHE_REGISTRO };
        return righe.slice(0, RIGHE_REGISTRO);
      };
      const [rapportini, ordini, ddt, costi, giornale, timbrature, mezzi, fasi, subappalti, crono] = await Promise.all([
        vista === "rapportini" || priorita("rapportini") ? elenco<RapportinoOperazione>(
          "rapportini", "campo_rapportini",
          `id, order_id, data_lavoro, ore_lavorate, descrizione_lavori, stato, approvato, autore:profiles!campo_rapportini_user_id_fkey(first_name, last_name)${vista === "rapportini" ? ", ore_straordinario, approvato_at, foto_urls" : ""}`,
          "data_lavoro",
          q => daSeguire ? q.is("annullato_at", null).eq("stato", "inviato").not("approvato", "is", true) : q.is("annullato_at", null),
        ) : [],
        vista === "acquisti" || priorita("ordini") ? elenco<OrdineOperazione>("ordini", "purchase_orders",
          `id, order_id, oda_number, status, issue_date, supplier_id, expected_delivery_date${vista === "acquisti" ? ", actual_delivery_date, supplier_reference" : ""}${vista === "acquisti" && r.permessi.importi ? ", total" : ""}`,
          daSeguire ? "expected_delivery_date" : "issue_date",
          daSeguire ? q => q.in("status", ["inviato", "confermato", "parziale"]).lt("expected_delivery_date", oggi) : undefined) : [],
        vista === "ddt" || priorita("ddt") ? elenco<DdtOperazione>("ddt", "ddt_ricezione",
          `id, order_id, numero_ddt, data_ricezione, stato, supplier_id, purchase_order_id${vista === "ddt" ? ", destinazione, corriere, ricevuto_da_nome, purchase_orders!ddt_ricezione_purchase_order_id_fkey(oda_number)" : ""}`,
          "data_ricezione",
          daSeguire ? q => q.in("stato", ["ricevuto", "parziale", "non_conforme"]) : undefined) : [],
        vista === "fatture" && r.permessi.costi
          ? elenco<CostoOperazioneRiga>("costi", "company_costs", "id, order_id, name, amount, documento_data, due_date, is_paid, paid_date, supplier_id", "documento_data")
          : Promise.resolve(null),
        vista === "rapportini" ? elenco<GiornaleOperazione>("giornale", "giornale_lavori", "id, order_id, data_lavori, lavorazioni_eseguite, personale_presente, stato", "data_lavori") : [],
        vista === "squadre" ? elenco<TimbraturaOperazione>(
          "timbrature", "campo_timbrature",
          "id, order_id, tipo, timestamp_evento, persona:profiles!campo_timbrature_user_id_fkey(first_name, last_name)",
          "timestamp_evento",
        ) : [],
        vista === "squadre" ? elenco<GiornataMezzoOperazione>(
          "mezzi", "mezzi_giornate",
          "id, order_id, giorno, usato, contatore, mezzo:mezzi!mezzi_giornate_mezzo_id_fkey(nome, targa)",
          "giorno",
        ) : [],
        vista === "lavorazioni" ? elenco<FaseOperazione>("fasi", "order_work_phases",
          "id, order_id, name, status, percentuale, start_date, end_date, completata_il, esecuzione, position", "updated_at") : [],
        vista === "squadre" && r.permessi.costi ? elenco<SubappaltoOperazione>("subappalti", "contratti_subappalto",
          "id, order_id, numero_contratto, descrizione_lavori, stato, subappaltatori_sicurezza(ragione_sociale)", "created_at") : [],
        vista === "cronoprogramma" || priorita("fasi") || priorita("materiali")
          ? leggiCronoprogramma(companyId!, ids, signal, vista === "cronoprogramma" || priorita("fasi")) : null,
      ]);
      const idFornitori = [...new Set([...ordini, ...ddt, ...(costi ?? [])].map((x) => x.supplier_id).filter((x): x is string => !!x))];
      const fornitori: Record<string, string> = {};
      for (let i = 0; i < idFornitori.length; i += 100) {
        const { data, error } = await db.from("suppliers").select("id, name").eq("company_id", companyId).in("id", idFornitori.slice(i, i + 100));
        if (error) throw error;
        for (const f of (data ?? []) as Array<{ id: string; name: string | null }>) fornitori[f.id] = f.name ?? "";
      }
      return { rapportini, ordini, ddt, costi, giornale, timbrature, mezzi, fasi: crono?.fasi ?? fasi,
        rapportiniCronoprogramma: crono?.rapportini ?? [], subappalti, fornitori, pagine: metadati };
    },
  });
}
