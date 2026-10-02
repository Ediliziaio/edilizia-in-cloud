// Sopralluoghi: fase della pratica, quando, cosa fare e filtri (01/10/2026).
//
// La pagina era un elenco di codici e indirizzi, senza cliente, tecnico o data (nessuno dei
// 6 sopralluoghi aveva una data, e 4 bozze su 5 erano ferme da più di due settimane). Qui la
// logica senza interfaccia né database, provata a parte.

export type FasePratica = "da_pianificare" | "pianificato" | "in_corso" | "completato" | "firmato" | "preventivo";

export const FASI: { fase: FasePratica; etichetta: string }[] = [
  { fase: "da_pianificare", etichetta: "Da pianificare" },
  { fase: "pianificato", etichetta: "Pianificato" },
  { fase: "in_corso", etichetta: "In corso" },
  { fase: "completato", etichetta: "Completato" },
  { fase: "firmato", etichetta: "Firmato" },
  { fase: "preventivo", etichetta: "Preventivo fatto" },
];

export interface SopralluogoBacheca {
  id: string;
  code: string;
  status: string;
  scheduled_at: string | null;
  address: string | null;
  city: string | null;
  contact_id: string | null;
  client_id: string | null;
  technician_id: string | null;
  estimate_id: string | null;
  order_id: string | null;
  appointment_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  /** Arricchimenti (nome del cliente, del tecnico, stato dell'appuntamento). */
  cliente_nome?: string | null;
  cliente_telefono?: string | null;
  tecnico_nome?: string | null;
  appuntamento_stato?: string | null;
}

const CHIUSI = new Set(["archived", "cancelled"]);

/** In che punto della pratica sta il sopralluogo; null se archiviato o annullato. */
export function fasePratica(s: Pick<SopralluogoBacheca, "status" | "scheduled_at" | "estimate_id" | "order_id">): FasePratica | null {
  if (CHIUSI.has(s.status)) return null;
  if (s.status === "converted" || s.estimate_id || s.order_id) return "preventivo";
  if (s.status === "signed") return "firmato";
  if (s.status === "completed" || s.status === "reviewed") return "completato";
  if (s.status === "in_progress") return "in_corso";
  return s.scheduled_at ? "pianificato" : "da_pianificare";
}

const GIORNO = 86_400_000;
const giornoLocale = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

function oraIt(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Giorni di differenza (calendario) tra la data e adesso: negativo = passata. */
export function giorniDa(scheduled: string, adesso: Date): number {
  return Math.round((giornoLocale(new Date(scheduled)) - giornoLocale(adesso)) / GIORNO);
}

/** «Oggi 15:00», «Domani 10:30», «gio 3 ott 11:00»; per le passate «In ritardo di 3 giorni». */
export function quando(scheduled: string | null, adesso: Date = new Date(), fatto = false): { testo: string; tono: "normale" | "oggi" | "ritardo" | "nessuna" } {
  if (!scheduled) return { testo: "Senza data", tono: "nessuna" };
  const d = new Date(scheduled);
  const g = giorniDa(scheduled, adesso);
  if (g === 0) return { testo: `Oggi ${oraIt(d)}`, tono: "oggi" };
  if (g === 1) return { testo: `Domani ${oraIt(d)}`, tono: "normale" };
  if (g < 0 && !fatto) return { testo: g === -1 ? "In ritardo di 1 giorno" : `In ritardo di ${-g} giorni`, tono: "ritardo" };
  return { testo: `${GIORNI[d.getDay()]} ${d.getDate()} ${MESI[d.getMonth()]} ${oraIt(d)}`, tono: "normale" };
}

/** La prossima cosa da fare, in una frase. */
export function prossimaAzione(s: SopralluogoBacheca, adesso: Date = new Date()): string | null {
  const fase = fasePratica(s);
  if (fase === null) return null;
  if (s.appuntamento_stato && /annull|cancel/i.test(s.appuntamento_stato)) return "Appuntamento annullato: ripianifica";
  switch (fase) {
    case "da_pianificare": return "Fissa data e tecnico";
    case "pianificato": return s.scheduled_at && giorniDa(s.scheduled_at, adesso) < 0 ? "Data passata: ripianifica o avvia" : "Avvia il sopralluogo il giorno fissato";
    case "in_corso": return "Completa il rilievo";
    case "completato": return "Fai firmare il cliente";
    case "firmato": return "Crea il preventivo";
    case "preventivo": return null;
  }
}

export interface CosaFareOra {
  oggi: SopralluogoBacheca[];
  inRitardo: SopralluogoBacheca[];
  bozzeFerme: SopralluogoBacheca[];
  senzaPreventivo: SopralluogoBacheca[];
}

export const GIORNI_BOZZA_FERMA = 14;

export function cosaFareOra(righe: SopralluogoBacheca[], adesso: Date = new Date()): CosaFareOra {
  const out: CosaFareOra = { oggi: [], inRitardo: [], bozzeFerme: [], senzaPreventivo: [] };
  for (const s of righe) {
    const fase = fasePratica(s);
    if (fase === null) continue;
    const nonFatto = fase === "da_pianificare" || fase === "pianificato";
    if (s.scheduled_at && nonFatto) {
      const g = giorniDa(s.scheduled_at, adesso);
      if (g === 0) out.oggi.push(s);
      else if (g < 0) out.inRitardo.push(s);
    }
    if (fase === "da_pianificare" && (adesso.getTime() - new Date(s.created_at).getTime()) / GIORNO > GIORNI_BOZZA_FERMA) out.bozzeFerme.push(s);
    if (fase === "completato" || fase === "firmato") out.senzaPreventivo.push(s);
  }
  out.oggi.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  return out;
}

export type PeriodoFiltro = "tutti" | "oggi" | "settimana" | "mese" | "in_ritardo" | "senza_data";

export interface FiltriBacheca {
  fase?: FasePratica | "tutte";
  periodo?: PeriodoFiltro;
  tecnico?: string; // id, "nessuno" o vuoto
  testo?: string;
  soloSenzaPreventivo?: boolean;
}

const t = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function filtraBacheca(righe: SopralluogoBacheca[], f: FiltriBacheca, adesso: Date = new Date()): SopralluogoBacheca[] {
  const testo = t(f.testo);
  return righe.filter((s) => {
    const fase = fasePratica(s);
    if (fase === null) return false; // archiviati e annullati non stanno nella bacheca
    if (f.fase && f.fase !== "tutte" && fase !== f.fase) return false;
    if (f.tecnico === "nessuno" ? !!s.technician_id : f.tecnico && f.tecnico !== "tutti" && s.technician_id !== f.tecnico) return false;
    if (f.soloSenzaPreventivo && (fase === "preventivo" || fase === "da_pianificare" || fase === "pianificato" || fase === "in_corso")) return false;
    if (f.periodo && f.periodo !== "tutti") {
      if (f.periodo === "senza_data") { if (s.scheduled_at) return false; }
      else {
        if (!s.scheduled_at) return false;
        const g = giorniDa(s.scheduled_at, adesso);
        if (f.periodo === "oggi" && g !== 0) return false;
        if (f.periodo === "settimana" && (g < 0 || g > 6)) return false;
        if (f.periodo === "mese" && (g < 0 || g > 30)) return false;
        if (f.periodo === "in_ritardo" && !(g < 0 && (fase === "da_pianificare" || fase === "pianificato"))) return false;
      }
    }
    if (testo) {
      const pagliaio = `${s.code} ${s.address ?? ""} ${s.city ?? ""} ${s.cliente_nome ?? ""} ${s.cliente_telefono ?? ""} ${s.tecnico_nome ?? ""}`.toLowerCase();
      if (!pagliaio.includes(testo)) return false;
    }
    return true;
  });
}

/** Quanti sopralluoghi per fase (per la barra di avanzamento). */
export function contaPerFase(righe: SopralluogoBacheca[]): Record<FasePratica, number> {
  const c: Record<FasePratica, number> = { da_pianificare: 0, pianificato: 0, in_corso: 0, completato: 0, firmato: 0, preventivo: 0 };
  for (const s of righe) { const f = fasePratica(s); if (f) c[f] += 1; }
  return c;
}

/** Ordine della bacheca: prima quelli di oggi e in ritardo, poi per data, poi i senza data. */
export function ordinaBacheca(righe: SopralluogoBacheca[], adesso: Date = new Date()): SopralluogoBacheca[] {
  const peso = (s: SopralluogoBacheca): number => {
    const fase = fasePratica(s);
    if (fase === "preventivo") return 4e15;
    if (!s.scheduled_at) return 3e15 - new Date(s.created_at).getTime();
    return new Date(s.scheduled_at).getTime() - adesso.getTime() + (giorniDa(s.scheduled_at, adesso) < 0 ? -1e15 : 0);
  };
  return [...righe].sort((a, b) => peso(a) - peso(b));
}

/** Fine dell'appuntamento: data e ora di inizio + durata, in HH:mm sullo stesso giorno (al massimo 23:59). */
export function oraFine(oraInizio: string, durataMin: number): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(oraInizio);
  if (!m) return "10:00";
  const tot = Math.min(23 * 60 + 59, Number(m[1]) * 60 + Number(m[2]) + Math.max(15, durataMin));
  return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
}
