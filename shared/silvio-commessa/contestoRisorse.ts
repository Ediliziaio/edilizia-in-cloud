/**
 * I dati veri per le proposte di persone, ditte, mezzi e acquisti (1/11/2026, fase 4; in
 * `shared/` dalla fase 5, perché li legge anche il piano di volo nella edge function). Solo
 * letture, col client che riceve: nel browser quello di chi apre il popup (la RLS decide cosa
 * vede), nella funzione del cron quello di servizio, sempre filtrato per azienda. Una lettura
 * che non riesce lascia vuota la sua parte e non ferma niente, ma non è un dato vuoto (D10,
 * revisione 2/11): finisce in `lettureFallite`, così il cron salta la commessa invece di dire
 * «nessuno è assegnato», e il popup lo dice (`avvisoLettureFallite`).
 *
 * Lo staff arriva da fuori (useCompanyStaffUsers nel browser): i clienti sono profili anche
 * loro, e un capomastro si sceglie solo fra lo staff.
 *
 * Senza dipendenze, compatibile con Deno.
 */
import type { ContestoRisorse } from "./risorse.ts";
import { oggiInItalia } from "./date.ts";

export type Riga = Record<string, unknown>;
interface Risposta { data: unknown; error: { message: string } | null }
/** Le query che il modulo usa, nella forma di supabase-js. */
interface Query extends PromiseLike<Risposta> {
  select: (c: string) => Query;
  eq: (c: string, v: unknown) => Query;
  is: (c: string, v: null) => Query;
  not: (c: string, op: string, v: unknown) => Query;
  gte: (c: string, v: unknown) => Query;
  lte: (c: string, v: unknown) => Query;
  or: (filtri: string) => Query;
  in: (c: string, v: unknown[]) => Query;
  order: (c: string, o?: { ascending?: boolean }) => Query;
  limit: (n: number) => Query;
}
/** Un client senza tipi: alcune tabelle (hr_assenze, mezzi_piani_cantiere) non sono nei tipi generati. */
export type ClientRisorse = { from: (t: string) => Query };

const LIMITE = 3000;
/** Il tetto vero di PostgREST: oltre, le righe non arrivano, e conviene sapere quali. */
const PAGINA = 1000;
const STATI_CHIUSI = ["completato", "completata", "annullato", "annullata", "chiuso", "chiusa"];
export const testo = (v: unknown) => (typeof v === "string" ? v : "");
export const data = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

export async function righe(q: PromiseLike<Risposta>): Promise<Riga[]> {
  try {
    const { data: d, error } = await q;
    return error || !Array.isArray(d) ? [] : (d as Riga[]);
  } catch {
    return [];
  }
}

/** Una lettura che non è riuscita: da usare dove un elenco vuoto farebbe dire una cosa falsa. */
export class LetturaFallita extends Error {
  constructor(public readonly cosa: string, motivo: string) {
    super(`lettura non riuscita (${cosa}): ${motivo}`);
    this.name = "LetturaFallita";
  }
}

/** Come `righe`, ma un errore si alza invece di diventare un elenco vuoto. */
export async function righeCerte(cosa: string, q: PromiseLike<Risposta>): Promise<Riga[]> {
  let risposta: Risposta;
  try {
    risposta = await q;
  } catch (e) {
    throw new LetturaFallita(cosa, e instanceof Error ? e.message : String(e));
  }
  if (risposta.error) throw new LetturaFallita(cosa, risposta.error.message);
  if (!Array.isArray(risposta.data)) throw new LetturaFallita(cosa, "risposta senza righe");
  return risposta.data as Riga[];
}

/** Il contesto, più quello che non si è riusciti a leggere (nomi in italiano, per le persone). */
export type ContestoLetto = ContestoRisorse & { lettureFallite: string[] };

/**
 * Cosa dire alla persona se qualche lettura non è riuscita, o null. Prende un ContestoRisorse
 * perché il popup riceve quel tipo: il campo in più c'è, a runtime.
 */
export function avvisoLettureFallite(ctx: ContestoRisorse): string | null {
  const fallite = (ctx as Partial<ContestoLetto>).lettureFallite ?? [];
  if (!fallite.length) return null;
  return `Silvio non è riuscito a leggere: ${fallite.join(", ")}. Le proposte su queste parti possono mancare o essere sbagliate: riprova tra poco.`;
}

const nomePersona = (r: Riga) => `${testo(r.first_name)} ${testo(r.last_name)}`.trim() || "Dipendente";
export const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * Il contesto delle proposte per l'azienda. `orderId` (in «completa») è la commessa stessa:
 * non conta né come impegno né come storico.
 */
export async function leggiContestoRisorse(
  companyId: string, staff: ContestoRisorse["staff"], orderId: string | null = null,
  db: ClientRisorse,
): Promise<ContestoLetto> {
  const oggi = oggiInItalia();
  const lettureFallite: string[] = [];
  const leggi = async (cosa: string, q: PromiseLike<Risposta>): Promise<Riga[]> => {
    try {
      return await righeCerte(cosa, q);
    } catch {
      lettureFallite.push(cosa);
      return [];
    }
  };
  const [
    dipendenti, aperti, storicoLavori, assenze, richieste, capomastri, ditte, storicoDitte, documenti, schede, mezzi, piani, allocazioni, fornitori, acquisti,
  ] = await Promise.all([
    leggi("le persone", db.from("employees").select("id, user_id, first_name, last_name, is_active").eq("company_id", companyId).limit(LIMITE)),
    // Gli impegni: le assegnazioni delle commesse aperte, le più recenti prima (revisione 1/11,
    // L11). Prima una lettura sola, senza ordine e senza filtro: PostgREST ne dà 1000, e in
    // un'azienda con molte commesse chiuse una persona già occupata risultava libera.
    leggi("gli impegni delle persone", db.from("order_employees")
      .select("employee_id, order_id, fase:order_work_phases(name, start_date, end_date), ordine:orders!inner(order_code, company_id, deleted_at, status, work_start_date, work_end_date)")
      .eq("ordine.company_id", companyId).is("ordine.deleted_at", null)
      .not("ordine.status", "in", `(${STATI_CHIUSI.join(",")})`)
      .order("created_at", { ascending: false }).limit(PAGINA)),
    // Lo storico («di solito fa le demolizioni»): anche le commesse chiuse, le più recenti.
    leggi("lo storico delle persone", db.from("order_employees")
      .select("employee_id, order_id, fase:order_work_phases(name), ordine:orders!inner(company_id, deleted_at)")
      .eq("ordine.company_id", companyId).is("ordine.deleted_at", null).not("phase_id", "is", null)
      .order("created_at", { ascending: false }).limit(PAGINA)),
    leggi("le assenze", db.from("hr_assenze").select("employee_id, data_inizio, data_fine, tipo_assenza, status")
      .eq("company_id", companyId).gte("data_fine", oggi).limit(LIMITE)),
    // Ferie e permessi chiesti dall'app stanno in hr_richieste, non in hr_assenze.
    leggi("le ferie approvate", db.from("hr_richieste").select("user_id, data_inizio, data_fine, tipo, ore_richieste, profilo:hr_profili(employee_id)")
      .eq("company_id", companyId).in("stato", ["approvata", "approvato"]).gte("data_fine", oggi).limit(LIMITE)),
    leggi("i capomastri", db.from("orders").select("id, capomastro_user_id").eq("company_id", companyId).is("deleted_at", null)
      .not("capomastro_user_id", "is", null).limit(LIMITE)),
    leggi("le ditte", db.from("external_teams").select("id, name, subappaltatore_id, kind, is_active").eq("company_id", companyId).eq("is_active", true)),
    leggi("lo storico delle ditte", db.from("order_external_teams").select("external_team_id, order_id, fase:order_work_phases(name), ordine:orders!inner(company_id)")
      .eq("ordine.company_id", companyId).not("phase_id", "is", null).limit(LIMITE)),
    leggi("i documenti delle ditte", db.from("subappaltatori_documenti").select("subappaltatore_id, tipo, scadenza, esito, status")
      .eq("company_id", companyId).eq("status", "active").limit(LIMITE)),
    leggi("il DURC delle ditte", db.from("subappaltatori_sicurezza").select("campo_subappaltatore_id, durc_scadenza")
      .eq("company_id", companyId).not("campo_subappaltatore_id", "is", null).not("durc_scadenza", "is", null).limit(LIMITE)),
    leggi("i mezzi", db.from("mezzi").select("id, nome, stato, gestione, quantita_totale").eq("company_id", companyId).is("deleted_at", null).limit(LIMITE)),
    leggi("le prenotazioni dei mezzi", db.from("mezzi_piani_cantiere").select("mezzo_id, order_id, fase_ids, dal, al, quantita, ordine:orders(order_code)")
      .eq("company_id", companyId).eq("annullato", false).limit(LIMITE)),
    leggi("le assegnazioni dei mezzi", db.from("mezzi_allocazioni").select("mezzo_id, order_id, dal, al, quantita, ordine:orders(order_code)")
      .eq("company_id", companyId).limit(LIMITE)),
    leggi("i fornitori", db.from("suppliers").select("id, name, lead_time_days, is_active").eq("company_id", companyId).eq("is_active", true).limit(LIMITE)),
    leggi("gli acquisti", db.from("purchase_order_items").select("description, ordine:purchase_orders!inner(supplier_id, company_id)")
      .eq("ordine.company_id", companyId).limit(LIMITE)),
  ]);

  const altra = (r: Riga) => !orderId || r.order_id !== orderId;
  const codice = (r: Riga) => testo(uno(r.ordine as Riga | Riga[] | null)?.order_code) || "senza numero";
  const futuro = (al: string | null, dal: string | null) => (al ?? dal ?? "9999-12-31") >= oggi;

  // Le fasi dei piani dei mezzi, per sapere in che lavori si usano.
  const idFasi = [...new Set(piani.flatMap((p) => (Array.isArray(p.fase_ids) ? (p.fase_ids as string[]) : [])))].slice(0, 300);
  const fasiMezzi = idFasi.length
    ? await leggi("le fasi dei mezzi", db.from("order_work_phases").select("id, name").in("id", idFasi))
    : [];
  const nomeFase = new Map(fasiMezzi.map((f) => [f.id as string, testo(f.name)]));

  return {
    lettureFallite,
    oggi,
    dipendenti: dipendenti.map((d) => ({ id: d.id as string, nome: nomePersona(d), attivo: d.is_active !== false })),
    storicoDipendenti: storicoLavori.filter(altra).flatMap((l) => {
      const fase = uno(l.fase as Riga | Riga[] | null);
      return fase && testo(fase.name) ? [{ employee_id: l.employee_id as string, fase: testo(fase.name) }] : [];
    }),
    impegniDipendenti: aperti.filter(altra).flatMap((l) => {
      const fase = uno(l.fase as Riga | Riga[] | null);
      const ordine = uno(l.ordine as Riga | Riga[] | null);
      // Le date della fase; senza fase, quelle della commessa.
      const dal = data(fase?.start_date) ?? data(ordine?.work_start_date);
      const al = data(fase?.end_date) ?? data(ordine?.work_end_date) ?? dal;
      return dal && futuro(al, dal) ? [{ employee_id: l.employee_id as string, commessa: codice(l), dal, al }] : [];
    }),
    assenze: [...assenze
      .filter((a) => !/rifiut|annull|reject|cancel/i.test(testo(a.status)) && data(a.data_inizio))
      .map((a) => ({ employee_id: a.employee_id as string, dal: data(a.data_inizio)!, al: data(a.data_fine) ?? data(a.data_inizio)!, tipo: testo(a.tipo_assenza) })),
      ...richieste
        // Un permesso di poche ore non toglie la giornata.
        .filter((q) => data(q.data_inizio) && (q.tipo !== "permesso" || (Number(q.ore_richieste) || 8) >= 8))
        .flatMap((q) => {
          const profilo = uno(q.profilo as Riga | Riga[] | null);
          const id = (profilo?.employee_id as string | null) ?? (dipendenti.find((d) => q.user_id && d.user_id === q.user_id)?.id as string | undefined);
          return id ? [{ employee_id: id, dal: data(q.data_inizio)!, al: data(q.data_fine) ?? data(q.data_inizio)!, tipo: testo(q.tipo) }] : [];
        })],
    staff,
    capomastri: capomastri.filter((o) => !orderId || o.id !== orderId).map((o) => o.capomastro_user_id as string),
    ditte: ditte.filter((d) => d.kind !== "interna")
      .map((d) => ({ id: d.id as string, nome: testo(d.name) || "Ditta", subappaltatore_id: (d.subappaltatore_id as string | null) ?? null })),
    storicoDitte: storicoDitte.filter(altra).flatMap((s) => {
      const fase = uno(s.fase as Riga | Riga[] | null);
      return s.external_team_id && fase && testo(fase.name) ? [{ external_team_id: s.external_team_id as string, fase: testo(fase.name) }] : [];
    }),
    documentiDitte: [
      ...documenti.map((d) => ({
        subappaltatore_id: d.subappaltatore_id as string, tipo: testo(d.tipo) || "altro", scadenza: data(d.scadenza), esito: (d.esito as string | null) ?? null,
      })),
      // Il DURC scritto sulla scheda di sicurezza della ditta vale come un DURC caricato.
      ...schede.map((s) => ({ subappaltatore_id: s.campo_subappaltatore_id as string, tipo: "durc", scadenza: data(s.durc_scadenza), esito: null as string | null })),
    ],
    mezzi: mezzi.map((m) => ({
      id: m.id as string, nome: testo(m.nome) || "Mezzo", stato: (m.stato as string | null) ?? null,
      gestione: (m.gestione as string | null) ?? null, quantita_totale: m.quantita_totale == null ? null : Number(m.quantita_totale),
    })),
    storicoMezzi: piani.filter(altra).flatMap((p) => (Array.isArray(p.fase_ids) ? (p.fase_ids as string[]) : [])
      .map((id) => nomeFase.get(id)).filter((n): n is string => !!n)
      .map((fase) => ({ mezzo_id: p.mezzo_id as string, fase }))),
    impegniMezzi: [...piani, ...allocazioni].filter(altra).flatMap((p) => {
      const dal = data(p.dal);
      const al = data(p.al);
      return dal && futuro(al, dal)
        ? [{ mezzo_id: p.mezzo_id as string, commessa: codice(p), dal, al, quantita: Number(p.quantita) || 1 }] : [];
    }),
    fornitori: fornitori.map((f) => ({
      id: f.id as string, nome: testo(f.name) || "Fornitore", lead_time_days: f.lead_time_days == null ? null : Number(f.lead_time_days),
    })),
    storicoAcquisti: acquisti.flatMap((a) => {
      const o = uno(a.ordine as Riga | Riga[] | null);
      return o?.supplier_id && testo(a.description) ? [{ supplier_id: o.supplier_id as string, descrizione: testo(a.description) }] : [];
    }),
  };
}

