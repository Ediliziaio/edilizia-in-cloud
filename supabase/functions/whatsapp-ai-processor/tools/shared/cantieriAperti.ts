// I cantieri su cui una persona può lavorare oggi, e quello su cui è più
// probabile che sia (18/10/2026).
//
// Le commesse si considerano aperte finché non sono chiuse, annullate o in
// bozza: gli stati veri sono «confermato», «in_corso», «active»… e cambiano da
// azienda ad azienda, quindi si escludono quelli chiusi invece di elencare
// quelli aperti. Le commesse cancellate (deleted_at) non compaiono mai.
//
// L'ordine segue i segnali di «dove sei oggi»: la timbratura di oggi, il
// cantiere indicato in chat poco fa, i rapportini degli ultimi giorni.

import type { ToolCtx } from "./types.ts";
import { assignedSiteIds } from "./siteAccess.ts";

const STATI_CHIUSI = new Set([
  "completato", "completata", "chiuso", "chiusa", "annullato", "annullata",
  "cancellato", "cancellata", "archiviato", "archiviata", "bozza",
]);

/** Una commessa su cui si può ancora lavorare. */
export function commessaAperta(status: string | null | undefined): boolean {
  return !STATI_CHIUSI.has(String(status ?? "").trim().toLowerCase());
}

export interface CommessaAperta {
  id: string;
  order_code: string | null;
  description: string | null;
  client_name: string | null;
  indirizzo_lavori: string | null;
  status: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
  updated_at: string | null;
}

export interface CantiereCandidato {
  id: string;
  /** Codice o nome breve, per il titolo della riga. */
  titolo: string;
  /** Nome e indirizzo, per la descrizione della riga e il riepilogo. */
  dettaglio: string;
  punteggio: number;
  /** Perché è in cima, detto all'operaio («hai timbrato lì oggi»). */
  motivo: string | null;
}

const COLONNE = "id, order_code, description, client_name, indirizzo_lavori, status, work_start_date, work_end_date, updated_at";

export function oggiARoma(adesso = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(adesso);
}

/** Mezzanotte di quel giorno a Roma, come istante assoluto (l'edge gira in UTC). */
export function inizioGiornoRoma(giorno: string): string {
  const comeSeUTC = new Date(`${giorno}T00:00:00Z`);
  const aRoma = comeSeUTC.toLocaleString("sv-SE", { timeZone: "Europe/Rome" });
  const scarto = new Date(`${aRoma.replace(" ", "T")}Z`).getTime() - comeSeUTC.getTime();
  return new Date(comeSeUTC.getTime() - scarto).toISOString();
}

function giorniPrima(giorno: string, n: number): string {
  const d = new Date(`${giorno}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Un cantiere finito da più di due settimane non si propone più. */
function ancoraInCorso(o: CommessaAperta, oggi: string): boolean {
  return !o.work_end_date || o.work_end_date >= giorniPrima(oggi, 14);
}

/**
 * Le commesse aperte che questa persona può usare. Per l'operaio solo le sue
 * (stesse assegnazioni dell'app Campo); per ufficio e amministratore le più
 * recenti dell'azienda.
 */
export async function commesseAperte(ctx: ToolCtx, adesso = new Date()): Promise<CommessaAperta[]> {
  const oggi = oggiARoma(adesso);
  const assegnate = await assignedSiteIds(ctx, oggi);
  const righe: CommessaAperta[] = [];
  if (assegnate) {
    const ids = [...assegnate];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await ctx.supabase.from("orders").select(COLONNE)
        .eq("company_id", ctx.company_id).is("deleted_at", null).in("id", ids.slice(i, i + 100));
      if (error) throw new Error("site_list_unavailable");
      righe.push(...((data ?? []) as CommessaAperta[]));
    }
  } else {
    const { data, error } = await ctx.supabase.from("orders").select(COLONNE)
      .eq("company_id", ctx.company_id).is("deleted_at", null)
      .order("updated_at", { ascending: false }).limit(200);
    if (error) throw new Error("site_list_unavailable");
    righe.push(...((data ?? []) as CommessaAperta[]));
  }
  return righe.filter((o) => commessaAperta(o.status) && ancoraInCorso(o, oggi));
}

function dataBreve(giorno: string, oggi: string): string {
  if (giorno === oggi) return "oggi";
  if (giorno === giorniPrima(oggi, 1)) return "ieri";
  const [, m, g] = giorno.split("-");
  return `il ${g}/${m}`;
}

/**
 * Ufficio e amministratore: le commesse aperte dell'azienda che corrispondono a
 * ciò che ha scritto («Rossi», «via Verdi», il codice), anche fuori dalle 200
 * più recenti. Cerca nel cliente della commessa, nella descrizione,
 * nell'indirizzo, nel codice e nel nome del cliente in anagrafica.
 */
export async function cercaCommesseUfficio(ctx: ToolCtx, testo: string, adesso = new Date(), opzioni: { ancheChiuse?: boolean } = {}): Promise<CommessaAperta[]> {
  const t = testo.replace(/[%,()*\\]/g, " ").replace(/\s+/g, " ").trim();
  if (t.length < 2) return [];
  const like = `%${t}%`;
  const [{ data: perTesto, error }, { data: clienti }] = await Promise.all([
    ctx.supabase.from("orders").select(COLONNE)
      .eq("company_id", ctx.company_id).is("deleted_at", null)
      .or(`client_name.ilike.${like},client_company.ilike.${like},description.ilike.${like},indirizzo_lavori.ilike.${like},order_code.ilike.${like}`)
      .order("updated_at", { ascending: false }).limit(30),
    ctx.supabase.from("profiles").select("id")
      .eq("company_id", ctx.company_id)
      .or(`first_name.ilike.${like},last_name.ilike.${like}`).limit(30),
  ]);
  if (error) throw new Error("site_list_unavailable");
  const righe = new Map(((perTesto ?? []) as CommessaAperta[]).map((o) => [o.id, o]));
  const idClienti = ((clienti ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (idClienti.length) {
    const { data } = await ctx.supabase.from("orders").select(COLONNE)
      .eq("company_id", ctx.company_id).is("deleted_at", null).in("customer_id", idClienti)
      .order("updated_at", { ascending: false }).limit(30);
    for (const o of (data ?? []) as CommessaAperta[]) righe.set(o.id, o);
  }
  const oggi = oggiARoma(adesso);
  // Una fattura può arrivare a lavori finiti: allora vanno bene anche le commesse chiuse.
  if (opzioni.ancheChiuse) return [...righe.values()].filter((o) => String(o.status ?? "").toLowerCase() !== "bozza");
  return [...righe.values()].filter((o) => commessaAperta(o.status) && ancoraInCorso(o, oggi));
}

/** I profili del personale della persona: per account o, senza account, per anagrafica dipendente. */
export async function profiliDelPersonale(ctx: ToolCtx): Promise<string[]> {
  const ids = new Set<string>();
  if (ctx.user_id) {
    const { data } = await ctx.supabase.from("hr_profili").select("id").eq("company_id", ctx.company_id).eq("user_id", ctx.user_id);
    for (const r of (data ?? []) as Array<{ id: string }>) ids.add(r.id);
  }
  if (ctx.employee_id) {
    const { data } = await ctx.supabase.from("hr_profili").select("id").eq("company_id", ctx.company_id).eq("employee_id", ctx.employee_id);
    for (const r of (data ?? []) as Array<{ id: string }>) ids.add(r.id);
  }
  return [...ids];
}

/**
 * Ordina le commesse aperte dal cantiere più probabile, con il motivo.
 * Nessun segnale è obbligatorio: senza segnali l'ordine è quello delle date.
 */
export async function cantieriInOrdine(ctx: ToolCtx, aperte: CommessaAperta[], adesso = new Date()): Promise<CantiereCandidato[]> {
  if (aperte.length === 0) return [];
  const oggi = oggiARoma(adesso);
  const ids = new Set(aperte.map((o) => o.id));
  const punti = new Map<string, { punteggio: number; motivo: string | null }>();
  const segna = (id: string | null | undefined, punteggio: number, motivo: string) => {
    if (!id || !ids.has(id)) return;
    const prima = punti.get(id);
    if (!prima || punteggio > prima.punteggio) punti.set(id, { punteggio, motivo });
  };

  // Timbratura di oggi su un cantiere: il segnale più forte.
  if (ctx.user_id) {
    const { data } = await ctx.supabase.from("campo_timbrature").select("order_id, timestamp_evento")
      .eq("company_id", ctx.company_id).eq("user_id", ctx.user_id)
      .gte("timestamp_evento", inizioGiornoRoma(oggi)).order("timestamp_evento", { ascending: false }).limit(5);
    for (const t of (data ?? []) as Array<{ order_id: string | null }>) segna(t.order_id, 100, "hai timbrato lì oggi");
  }

  // Timbratura di oggi fatta su WhatsApp o dal totem (registro del personale).
  const profili = await profiliDelPersonale(ctx);
  if (profili.length > 0) {
    const { data } = await ctx.supabase.from("hr_timbrature").select("order_id, timestamp")
      .eq("company_id", ctx.company_id).in("profilo_id", profili)
      .gte("timestamp", inizioGiornoRoma(oggi)).order("timestamp", { ascending: false }).limit(5);
    for (const t of (data ?? []) as Array<{ order_id: string | null }>) segna(t.order_id, 100, "hai timbrato lì oggi");
  }

  // Il cantiere indicato in chat nelle ultime ore.
  if (ctx.sessionId) {
    const { data } = await ctx.supabase.from("whatsapp_sessions").select("current_cantiere_id, last_activity_at")
      .eq("id", ctx.sessionId).eq("company_id", ctx.company_id).maybeSingle();
    const quando = data?.last_activity_at ? Date.parse(String(data.last_activity_at)) : NaN;
    if (Number.isFinite(quando) && adesso.getTime() - quando < 12 * 3_600_000) {
      segna(data?.current_cantiere_id as string | null, 80, "è il cantiere che mi hai indicato");
    }
  }

  // Rapportini degli ultimi 10 giorni di questa persona.
  const daQuando = giorniPrima(oggi, 10);
  const rapportini: Array<{ order_id: string; data_lavoro: string }> = [];
  if (ctx.user_id) {
    const { data } = await ctx.supabase.from("campo_rapportini").select("order_id, data_lavoro")
      .eq("company_id", ctx.company_id).eq("user_id", ctx.user_id).gte("data_lavoro", daQuando)
      .order("data_lavoro", { ascending: false }).limit(20);
    rapportini.push(...((data ?? []) as typeof rapportini));
  }
  if (ctx.employee_id) {
    const { data } = await ctx.supabase.from("campo_rapportini").select("order_id, data_lavoro")
      .eq("company_id", ctx.company_id).eq("ufficio_employee_id", ctx.employee_id).gte("data_lavoro", daQuando)
      .order("data_lavoro", { ascending: false }).limit(20);
    rapportini.push(...((data ?? []) as typeof rapportini));
    // È solo un indizio per proporre il cantiere: se la lettura fallisce si va avanti senza.
    if (!ctx.user_id) rapportini.push(...await rapportiniWhatsAppDelDipendente(ctx, daQuando).catch((): never[] => []));
  }
  for (const r of rapportini) {
    const recenza = r.data_lavoro === oggi ? 70 : r.data_lavoro === giorniPrima(oggi, 1) ? 60 : 40;
    segna(r.order_id, recenza, `ci hai lavorato ${dataBreve(r.data_lavoro, oggi)}`);
  }

  return aperte.map((o) => {
    const p = punti.get(o.id);
    const nelleDate = (!o.work_start_date || o.work_start_date <= oggi) && (!o.work_end_date || o.work_end_date >= oggi);
    const nome = o.client_name || o.description || o.order_code || "Cantiere";
    const sotto = [
      o.indirizzo_lavori,
      o.description && o.description !== nome ? o.description : null,
      o.order_code && o.order_code !== nome ? o.order_code : null,
    ].filter(Boolean).join(" · ");
    return {
      id: o.id,
      titolo: nome,
      dettaglio: sotto || nome,
      punteggio: (p?.punteggio ?? 0) + (nelleDate ? 10 : 0),
      motivo: p?.motivo ?? null,
      aggiornata: o.updated_at ?? "",
    };
  }).sort((a, b) => b.punteggio - a.punteggio || b.aggiornata.localeCompare(a.aggiornata) || a.titolo.localeCompare(b.titolo, "it", { numeric: true }))
    .map(({ aggiornata: _aggiornata, ...c }) => c);
}

/**
 * I rapportini mandati su WhatsApp da chi non ha l'account: senza utente, con
 * il dipendente nelle presenze (come le ore della squadra nell'app).
 */
export async function rapportiniWhatsAppDelDipendente(ctx: ToolCtx, daQuando: string): Promise<Array<{ id: string; order_id: string; data_lavoro: string; stato: string }>> {
  if (!ctx.employee_id) return [];
  const { data, error } = await ctx.supabase.from("campo_rapportini").select("id, order_id, data_lavoro, stato, presenze")
    .eq("company_id", ctx.company_id).is("user_id", null).is("ufficio_employee_id", null).eq("source", "whatsapp")
    .gte("data_lavoro", daQuando).order("data_lavoro", { ascending: false }).limit(500);
  // Una lettura fallita non vuol dire «nessun rapportino»: chi chiama si ferma invece di crearne un doppione.
  if (error) throw new Error("rapportini_non_letti");
  return ((data ?? []) as Array<{ id: string; order_id: string; data_lavoro: string; stato: string; presenze: unknown }>)
    .filter((r) => Array.isArray(r.presenze) && r.presenze.some((p) => (p as { employee_id?: string })?.employee_id === ctx.employee_id))
    .map(({ presenze: _presenze, ...r }) => r);
}
