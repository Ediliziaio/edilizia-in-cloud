import { campoWorkDay, validWorkDay } from "@/lib/campo/workDay";

export interface RigaCantiere {
  id: string;
  codice: string | null;
  descrizione: string | null;
  indirizzo: string | null;
  stato: string | null;
  responsabile: string | null;
  previste: number | null;
  timbrate: number | null;
  rapportini_oggi: number | null;
  rapportini_da_approvare: number | null;
  correzioni: number | null;
  bolle: number | null;
  ultimo_segnale: string | null;
  giorni_senza_segnale: number | null;
}
export interface OggiOrder {
  id: string;
  assigned_to: string | null;
  client_name: string | null;
  work_start_date: string | null;
  work_end_date: string | null;
}
export interface OggiPhase {
  id: string;
  order_id: string;
  name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  position: number;
}
export interface OggiTask {
  id: string;
  order_id: string;
  title: string;
  status: string;
  due_date: string | null;
  assigned_to: string | null;
  ufficio_id: string | null;
  bloccata_da_task_id: string | null;
  attende_fase_id: string | null;
}
export interface OggiOverview {
  orders: OggiOrder[];
  phases: OggiPhase[];
  tasks: OggiTask[];
}
export type OggiFilter =
  | "priorita"
  | "oggi"
  | "attenzione"
  | "approvare"
  | "squadre"
  | "non-pianificati"
  | "tutti";
export type OggiPanelView =
  | "riepilogo"
  | "lavorazioni"
  | "ufficio"
  | "approvazioni";
export const GIORNI_FERMO = 3;
export const countKnown = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
export function parseCantieriOggi(data: unknown): RigaCantiere[] {
  if (!Array.isArray(data)) throw Error("Risposta cantieri non valida.");
  const seen = new Set<string>();
  return data.map((value: unknown) => {
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as RigaCantiere).id !== "string"
    )
      throw Error("Cantiere non riconoscibile.");
    const row = value as RigaCantiere;
    if (seen.has(row.id))
      throw Error("La fonte contiene cantieri duplicati. Aggiorna i dati.");
    seen.add(row.id);
    const text = (x: unknown) =>
      typeof x === "string" && x.trim() ? x.trim() : null;
    return {
      id: row.id,
      codice: text(row.codice),
      descrizione: text(row.descrizione),
      indirizzo: text(row.indirizzo),
      stato: text(row.stato),
      responsabile: text(row.responsabile),
      ultimo_segnale: text(row.ultimo_segnale),
      giorni_senza_segnale: countKnown(row.giorni_senza_segnale),
      previste: countKnown(row.previste),
      timbrate: countKnown(row.timbrate),
      rapportini_oggi: countKnown(row.rapportini_oggi),
      rapportini_da_approvare: countKnown(row.rapportini_da_approvare),
      correzioni: countKnown(row.correzioni),
      bolle: countKnown(row.bolle),
    };
  });
}
/** Mon–Fri, in Italian civil time. Not a holiday-aware site calendar. */
export function giorniLavorativiDa(ultimo: string, oggi = new Date()): number {
  const date = new Date(ultimo);
  if (!Number.isFinite(date.getTime())) return 0;
  const start = Date.parse(`${campoWorkDay(date)}T12:00:00Z`);
  const end = Date.parse(`${campoWorkDay(oggi)}T12:00:00Z`);
  const days = Math.max(0, Math.floor((end - start) / 86400000));
  let n = Math.floor(days / 7) * 5;
  const weekday = new Date(start).getUTCDay();
  for (let i = 1; i <= days % 7; i++)
    if (![0, 6].includes((weekday + i) % 7)) n++;
  return n;
}
export function pendingCount(r: RigaCantiere): number | null {
  const values = [r.rapportini_da_approvare, r.correzioni, r.bolle];
  return values.some((n) => countKnown(n) === null)
    ? null
    : values.reduce<number>((sum, n) => sum + n!, 0);
}
export function presenzeLabel(r: RigaCantiere): string {
  if (r.previste === null || r.timbrate === null)
    return "Dati presenze non disponibili";
  if (r.timbrate > 0)
    return `${r.timbrate} rilevat${r.timbrate === 1 ? "o" : "i"} oggi · ${r.previste} previst${r.previste === 1 ? "o" : "i"}`;
  if (r.previste > 0) return `Nessuna rilevazione · ${r.previste} previsti`;
  return "Nessuna squadra prevista";
}
export function statoCantiere(
  r: RigaCantiere,
  oggi = new Date(),
): { testo: string; tono: "ok" | "attenzione" | "neutro" } {
  if (r.previste === null || r.timbrate === null || r.rapportini_oggi === null)
    return { testo: "Dati da verificare", tono: "neutro" };
  if (r.rapportini_oggi > 0)
    return { testo: "Rapportino ricevuto", tono: "ok" };
  if (r.timbrate > 0) return { testo: "Rilevazioni ricevute", tono: "ok" };
  if (r.previste > 0) {
    const day = new Date(`${campoWorkDay(oggi)}T12:00:00Z`).getUTCDay();
    if ([0, 6].includes(day))
      return { testo: "Verifica il calendario del cantiere", tono: "neutro" };
    const days = r.ultimo_segnale
      ? giorniLavorativiDa(r.ultimo_segnale, oggi)
      : null;
    return {
      testo:
        days !== null && days >= GIORNI_FERMO
          ? `Nessun segnale da ${days} giorni lun–ven`
          : "Rilevazioni da verificare",
      tono: "attenzione",
    };
  }
  return { testo: "Non pianificato oggi", tono: "neutro" };
}
export function phaseToday(p: OggiPhase, day: string): boolean {
  return (
    p.status !== "completata" &&
    !!p.start_date &&
    validWorkDay(p.start_date) &&
    p.start_date <= day &&
    (!p.end_date || (validWorkDay(p.end_date) && p.end_date >= day))
  );
}
export interface OggiItem {
  row: RigaCantiere;
  order?: OggiOrder;
  phases: OggiPhase[];
  tasks: OggiTask[];
  todayPhases: OggiPhase[];
  latePhases: OggiPhase[];
  lateTasks: OggiTask[];
  operational: boolean;
  attention: boolean;
  incomplete: boolean;
  pending: number | null;
  title: string;
  address: string | null;
  owner: string;
  score: number;
}
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function makeOggiItems(
  rows: RigaCantiere[],
  overview: OggiOverview | undefined,
  now = new Date(),
): OggiItem[] {
  const day = campoWorkDay(now);
  const orders = new Map(overview?.orders.map((o) => [o.id, o]));
  const phases = new Map<string, OggiPhase[]>(),
    tasks = new Map<string, OggiTask[]>();
  for (const p of overview?.phases ?? [])
    phases.set(p.order_id, [...(phases.get(p.order_id) ?? []), p]);
  for (const t of overview?.tasks ?? [])
    tasks.set(t.order_id, [...(tasks.get(t.order_id) ?? []), t]);
  return rows.map((row) => {
    const order = orders.get(row.id),
      pp = phases.get(row.id) ?? [],
      tt = tasks.get(row.id) ?? [];
    const todayPhases = pp.filter((p) => phaseToday(p, day));
    const latePhases = pp.filter(
      (p) =>
        p.status !== "completata" &&
        p.end_date &&
        validWorkDay(p.end_date) &&
        p.end_date < day,
    );
    const lateTasks = tt.filter(
      (t) =>
        t.status !== "completata" &&
        t.status !== "in_attesa" &&
        t.due_date &&
        t.due_date < day,
    );
    const operational =
      (row.previste ?? 0) > 0 ||
      (row.timbrate ?? 0) > 0 ||
      (row.rapportini_oggi ?? 0) > 0 ||
      todayPhases.length > 0;
    const incomplete =
      !overview ||
      !order ||
      [row.previste, row.timbrate, row.rapportini_oggi, pendingCount(row)].some(
        (n) => n === null,
      );
    const attention =
      statoCantiere(row, now).tono === "attenzione" ||
      latePhases.length > 0 ||
      lateTasks.length > 0 ||
      (operational && !!order && !order.assigned_to) ||
      (todayPhases.length > 0 && row.previste === 0);
    const pending = pendingCount(row);
    const title =
      row.descrizione || order?.client_name || row.codice || "Cantiere";
    // Avoid repeating an address already fully contained in the title.
    const street = normalize(row.indirizzo?.split(",")[0] || "");
    const address =
      row.indirizzo &&
      !normalize(title).includes(normalize(row.indirizzo)) &&
      !(street.length >= 8 && normalize(title).includes(street))
        ? row.indirizzo
        : null;
    return {
      row,
      order,
      phases: pp,
      tasks: tt,
      todayPhases,
      latePhases,
      lateTasks,
      operational,
      attention,
      incomplete,
      pending,
      title,
      address,
      owner:
        row.responsabile ||
        (!order
          ? "Responsabile da verificare"
          : order.assigned_to
            ? "Responsabile non disponibile"
            : "Non assegnato"),
      score:
        (attention ? 100 : 0) + (pending ? 50 : 0) + (operational ? 10 : 0),
    };
  });
}
export function filterOggiItems(
  items: OggiItem[],
  filter: OggiFilter,
  search: string,
  owner: string,
) {
  const q = normalize(search.trim());
  return items
    .filter((i) => {
      if (
        owner &&
        (owner === "non-assegnato"
          ? !i.order || !!i.order.assigned_to
          : i.order?.assigned_to !== owner)
      )
        return false;
      if (
        q &&
        !normalize(
          [
            i.title,
            i.row.codice,
            i.row.indirizzo,
            i.owner,
            i.order?.client_name,
          ].join(" "),
        ).includes(q)
      )
        return false;
      return (
        filter === "tutti" ||
        (filter === "priorita" &&
          (i.operational ||
            i.attention ||
            (i.pending ?? 0) > 0 ||
            i.incomplete)) ||
        (filter === "oggi" && i.operational) ||
        (filter === "attenzione" && i.attention) ||
        (filter === "approvare" && (i.pending ?? 0) > 0) ||
        (filter === "squadre" && (i.row.previste ?? 0) > 0) ||
        (filter === "non-pianificati" && !i.operational && !i.incomplete)
      );
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "it"));
}
export function nextOggiAction(i: OggiItem): {
  text: string;
  view: OggiPanelView;
  detail: string;
} {
  if ((i.pending ?? 0) > 0)
    return {
      text: "Verifica elementi",
      view: "approvazioni",
      detail:
        i.pending === 1
          ? "1 elemento attende una decisione"
          : `${i.pending} elementi attendono una decisione`,
    };
  if (i.lateTasks.length)
    return {
      text: "Verifica ufficio",
      view: "ufficio",
      detail: `${i.lateTasks.length} attività d’ufficio oltre scadenza`,
    };
  if (i.latePhases.length)
    return {
      text: "Verifica lavorazioni",
      view: "lavorazioni",
      detail:
        i.latePhases.length === 1
          ? "1 lavorazione oltre la data prevista"
          : `${i.latePhases.length} lavorazioni oltre la data prevista`,
    };
  if (i.todayPhases.length && i.row.previste === 0)
    return {
      text: "Verifica pianificazione",
      view: "riepilogo",
      detail: "Lavori previsti oggi, nessuna squadra pianificata",
    };
  if (i.operational && i.order && !i.order.assigned_to)
    return {
      text: "Verifica responsabile",
      view: "riepilogo",
      detail: "Cantiere operativo senza responsabile assegnato",
    };
  if (i.incomplete)
    return {
      text: "Verifica dati",
      view: "riepilogo",
      detail: "Informazioni incomplete: verifica le fonti",
    };
  return {
    text: "Vedi giornata",
    view: "riepilogo",
    detail: i.todayPhases.length
      ? i.todayPhases.map((p) => p.name).join(" · ")
      : i.operational
        ? "Controlla squadra e aggiornamenti"
        : "Nessun lavoro o persona pianificati per oggi",
  };
}
