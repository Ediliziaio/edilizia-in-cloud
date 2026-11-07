/**
 * Note e appuntamenti nell'esportazione delle opportunità.
 *
 * Le note vere stanno in marketing_contact_notes, legate all'opportunità: quelle del
 * solo contatto (senza opportunità) valgono per le sue opportunità, e le automatiche
 * del sistema restano fuori. Un appuntamento vale per la sua opportunità; se ha solo
 * il contatto, per le opportunità di quel contatto. Le letture non salvano errori: se
 * una fallisce il file non parte, invece di uscire con colonne vuote che sembrano vere.
 */
import { supabase } from "@/integrations/supabase/client";

export interface NotaEsportata {
  opportunity_id: string | null;
  contact_id: string | null;
  content: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AppuntamentoEsportato {
  opportunity_id: string | null;
  contact_id: string | null;
  title: string | null;
  appointment_type: string | null;
  appointment_date: string | null;
  appointment_time: string | null;
  appointment_end_time: string | null;
  status: string | null;
  is_completed: boolean | null;
  assigned_to: string | null;
  address_line: string | null;
  address_city: string | null;
  internal_notes: string | null;
}

/** Chi può leggere note e appuntamenti, come le regole del database: senza, la colonna uscirebbe a zero e sembrerebbe vera. */
export interface PermessiDettagli {
  isAdmin?: boolean;
  onlyAssigned?: boolean;
  canViewMarketingContacts?: boolean;
  canViewOrders?: boolean;
  canViewCalendar?: boolean;
  canViewMarketingAppointments?: boolean;
  canEditOrders?: boolean;
}

export function accessoDettagli(p: PermessiDettagli) {
  const tutto = !!p.isAdmin;
  return {
    note: tutto || !!p.canViewMarketingContacts || !!p.canViewOrders,
    appuntamenti: tutto || !!p.canViewCalendar || !!p.canViewMarketingAppointments || !!p.canEditOrders,
    /** Vede solo una parte: i numeri nel file valgono per quello che può vedere. */
    parzialeNote: !tutto && !!p.onlyAssigned,
    // Dal calendario o dalle commesse si vedono solo gli appuntamenti con una commessa
    // o propri: tutti quelli del CRM soltanto col permesso sugli appuntamenti marketing.
    parzialeAppuntamenti: !tutto && (!!p.onlyAssigned || !p.canViewMarketingAppointments),
  };
}

export interface OpportunitaPerDettagli { id: string; contact_id?: string | null }

const BLOCCO = 200;
const PAGINA = 1000;

// Tabelle non tutte nei tipi generati, come negli altri lettori del CRM.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Filtro = (q: unknown) => unknown;

/** Legge a blocchi (limite di IN) e a pagine (PostgREST si ferma a mille righe). */
export async function leggiPerBlocchi<T>(tabella: string, campi: string, colonna: string, ids: readonly string[], filtro?: Filtro): Promise<T[]> {
  const unici = [...new Set(ids.filter(Boolean))];
  const righe: T[] = [];
  for (let i = 0; i < unici.length; i += BLOCCO) {
    const blocco = unici.slice(i, i + BLOCCO);
    for (let da = 0; ; da += PAGINA) {
      let q = db.from(tabella).select(campi).in(colonna, blocco);
      if (filtro) q = filtro(q);
      const { data, error } = await q.order("id").range(da, da + PAGINA - 1);
      if (error) throw error;
      righe.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGINA) break;
    }
  }
  return righe;
}

export async function leggiNoteEsportazione(companyId: string, opp: readonly OpportunitaPerDettagli[]): Promise<NotaEsportata[]> {
  const campi = "id, opportunity_id, contact_id, content, created_by, created_at";
  const manuali = (q: unknown) => (q as { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => unknown } }).eq("company_id", companyId).eq("automatica", false);
  const [legate, delContatto] = await Promise.all([
    leggiPerBlocchi<NotaEsportata>("marketing_contact_notes", campi, "opportunity_id", opp.map((o) => o.id), manuali),
    leggiPerBlocchi<NotaEsportata>("marketing_contact_notes", campi, "contact_id", opp.map((o) => o.contact_id ?? ""),
      (q) => (manuali(q) as { is: (c: string, v: null) => unknown }).is("opportunity_id", null)),
  ]);
  return [...legate, ...delContatto];
}

export async function leggiAppuntamentiEsportazione(companyId: string, opp: readonly OpportunitaPerDettagli[]): Promise<AppuntamentoEsportato[]> {
  const campi = "id, opportunity_id, contact_id, title, appointment_type, appointment_date, appointment_time, appointment_end_time, status, is_completed, assigned_to, address_line, address_city, internal_notes";
  const veri = (q: unknown) => (q as { eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => unknown } }).eq("company_id", companyId).eq("is_blocked_slot", false);
  const [legati, delContatto] = await Promise.all([
    leggiPerBlocchi<AppuntamentoEsportato>("appointments", campi, "opportunity_id", opp.map((o) => o.id), veri),
    leggiPerBlocchi<AppuntamentoEsportato>("appointments", campi, "contact_id", opp.map((o) => o.contact_id ?? ""),
      (q) => (veri(q) as { is: (c: string, v: null) => unknown }).is("opportunity_id", null)),
  ]);
  return [...legati, ...delContatto];
}

/** Ogni riga va alla sua opportunità; senza opportunità, a quelle del suo contatto. */
export function perOpportunita<T extends { opportunity_id: string | null; contact_id: string | null }>(
  righe: readonly T[],
  opp: readonly OpportunitaPerDettagli[],
): Record<string, T[]> {
  const delContatto = new Map<string, string[]>();
  for (const o of opp) if (o.contact_id) delContatto.set(o.contact_id, [...(delContatto.get(o.contact_id) ?? []), o.id]);
  const conosciute = new Set(opp.map((o) => o.id));
  const out: Record<string, T[]> = {};
  for (const r of righe) {
    const destinatarie = r.opportunity_id
      ? (conosciute.has(r.opportunity_id) ? [r.opportunity_id] : [])
      : (r.contact_id ? delContatto.get(r.contact_id) ?? [] : []);
    for (const id of destinatarie) (out[id] ??= []).push(r);
  }
  return out;
}

/** I nomi di chi ha scritto note o segue appuntamenti, anche se non è più nello staff. */
export async function leggiNomiPersone(ids: readonly (string | null | undefined)[], noti: Record<string, string>): Promise<Record<string, string>> {
  const mancanti = [...new Set(ids.filter((id): id is string => !!id && !noti[id]))];
  if (mancanti.length === 0) return noti;
  // I nomi sono un di più: se non si leggono il file parte lo stesso, con «Nome non disponibile».
  const righe = await leggiPerBlocchi<{ id: string; first_name: string | null; last_name: string | null }>("profiles", "id, first_name, last_name", "id", mancanti)
    .catch((): Array<{ id: string; first_name: string | null; last_name: string | null }> => []);
  const trovati = Object.fromEntries(righe.flatMap((p) => {
    const nome = [p.first_name, p.last_name].map((v) => v?.trim()).filter(Boolean).join(" ");
    return nome ? [[p.id, nome] as const] : [];
  }));
  return { ...noti, ...trovati };
}

/** Il nome di una persona; se non si può leggere si dice questo, non che ha lasciato l'azienda. */
export const nomePersona = (id: string | null | undefined, nomi: Record<string, string>) =>
  (id ? nomi[id] || "Nome non disponibile" : "");

const quandoNota = (iso: string) => new Intl.DateTimeFormat("it-IT", {
  timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(iso)).replace(",", "");

export const dataItaliana = (giorno: string | null | undefined) => {
  const [a, m, g] = (giorno ?? "").slice(0, 10).split("-");
  return a && m && g ? `${g}/${m}/${a}` : "";
};
const ora = (t: string | null | undefined) => (t ?? "").slice(0, 5);
const parola = (t: string | null | undefined) => {
  const s = (t ?? "").replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
};

/** Completato per lo spunta o per lo stato: nei dati ci sono tutti e due i casi. */
const completato = (a: Pick<AppuntamentoEsportato, "status" | "is_completed">) => !!a.is_completed || a.status === "completato";

/** Lo stato di un appuntamento: quello scritto, ma un annullato resta annullato. */
export function statoAppuntamento(a: Pick<AppuntamentoEsportato, "status" | "is_completed">): string {
  if (a.status === "annullato") return "Annullato";
  if (completato(a)) return "Completato";
  return parola(a.status);
}

const titoloAppuntamento = (a: AppuntamentoEsportato) => a.title?.trim() || parola(a.appointment_type) || "Appuntamento";
const quandoAppuntamento = (a: AppuntamentoEsportato) => [dataItaliana(a.appointment_date), ora(a.appointment_time)].filter(Boolean).join(" ");
const descriviAppuntamento = (a: AppuntamentoEsportato) => `${quandoAppuntamento(a)} ${titoloAppuntamento(a)} (${statoAppuntamento(a)})`.trim();

/**
 * Una cella di Excel tiene al massimo 32.767 caratteri: meglio dire cosa manca, e dove
 * trovarlo, che tagliare in silenzio. Il CSV quel limite non ce l'ha, e nemmeno il foglio.
 */
const MASSIMO_CELLA = 32000;
function uniscePerCella(voci: string[], perExcel: boolean): string {
  if (!perExcel) return voci.join("\n");
  let testo = "";
  for (let i = 0; i < voci.length; i++) {
    const prossimo = testo ? `${testo}\n${voci[i]}` : voci[i];
    if (prossimo.length > MASSIMO_CELLA) return `${testo}\n… altre ${voci.length - i} nel foglio dedicato`;
    testo = prossimo;
  }
  return testo;
}

/** Le colonne delle note di un'opportunità: dalla più recente. */
export function celleNote(note: readonly NotaEsportata[] | undefined, autori: Record<string, string>, perExcel = true): Record<string, string> {
  const ordinate = [...(note ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    note_numero: String(ordinate.length),
    note_ultima: ordinate[0] ? quandoNota(ordinate[0].created_at) : "",
    note_testo: uniscePerCella(ordinate.flatMap((n) => {
      const testo = n.content?.trim();
      if (!testo) return [];
      const autore = nomePersona(n.created_by, autori);
      return [`[${quandoNota(n.created_at)}${autore ? ` · ${autore}` : ""}] ${testo}`];
    }), perExcel),
  };
}

/** Le colonne degli appuntamenti: il prossimo non annullato, l'ultimo passato, l'elenco. */
export function celleAppuntamenti(lista: readonly AppuntamentoEsportato[] | undefined, oggi: string, perExcel = true): Record<string, string> {
  const ordinati = [...(lista ?? [])].sort((a, b) => `${a.appointment_date ?? ""}${a.appointment_time ?? ""}`.localeCompare(`${b.appointment_date ?? ""}${b.appointment_time ?? ""}`));
  const validi = ordinati.filter((a) => a.status !== "annullato");
  const prossimo = validi.find((a) => (a.appointment_date ?? "") >= oggi && !completato(a));
  const passati = validi.filter((a) => (a.appointment_date ?? "") < oggi || completato(a));
  const ultimo = passati[passati.length - 1];
  return {
    app_numero: String(ordinati.length),
    app_prossimo: prossimo ? descriviAppuntamento(prossimo) : "",
    app_ultimo: ultimo ? descriviAppuntamento(ultimo) : "",
    app_elenco: uniscePerCella([...ordinati].reverse().map(descriviAppuntamento), perExcel),
  };
}

export interface OpportunitaIntestata { id: string; name?: string | null; contatto: string; telefono: string }

/** Il foglio «Note» dell'Excel: una riga per nota. */
export function righeFoglioNote(noteDi: Record<string, NotaEsportata[]>, opp: readonly OpportunitaIntestata[], autori: Record<string, string>): Record<string, string>[] {
  return opp.flatMap((o) => [...(noteDi[o.id] ?? [])]
    .filter((n) => n.content?.trim())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((n) => ({
      opportunita: o.name ?? "", contatto: o.contatto, telefono: o.telefono,
      quando: quandoNota(n.created_at), autore: nomePersona(n.created_by, autori), testo: n.content!.trim(),
    })));
}

/** Il foglio «Appuntamenti» dell'Excel: una riga per appuntamento. */
export function righeFoglioAppuntamenti(appDi: Record<string, AppuntamentoEsportato[]>, opp: readonly OpportunitaIntestata[], persone: Record<string, string>): Record<string, string>[] {
  return opp.flatMap((o) => [...(appDi[o.id] ?? [])]
    .sort((a, b) => `${b.appointment_date ?? ""}${b.appointment_time ?? ""}`.localeCompare(`${a.appointment_date ?? ""}${a.appointment_time ?? ""}`))
    .map((a) => ({
      opportunita: o.name ?? "", contatto: o.contatto, telefono: o.telefono,
      data: dataItaliana(a.appointment_date), ora: ora(a.appointment_time), fine: ora(a.appointment_end_time),
      tipo: parola(a.appointment_type), titolo: a.title?.trim() ?? "", stato: statoAppuntamento(a),
      assegnato: nomePersona(a.assigned_to, persone),
      luogo: [a.address_line, a.address_city].map((v) => v?.trim()).filter(Boolean).join(", "),
      note: a.internal_notes?.trim() ?? "",
    })));
}
