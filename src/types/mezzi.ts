// Mezzi e attrezzature dell'impresa: furgoni, mezzi d'opera, attrezzi.
// Le regole di stato qui sotto sono le stesse della vista mezzi_scadenze
// (migrazione 20280924150000): la vista decide gli avvisi giornalieri, queste
// funzioni decidono cosa si vede nella scheda. Se ne cambia una, va cambiata
// anche l'altra.

export type MezzoTipo =
  | "furgone" | "autocarro" | "autovettura" | "macchina_movimento_terra"
  | "sollevamento" | "rimorchio" | "attrezzatura" | "altro";
export type MezzoPossesso = "proprieta" | "leasing" | "noleggio_lungo" | "noleggio_breve";
export type MezzoStato = "in_servizio" | "in_officina" | "fuori_servizio";
export type ContatoreUnita = "km" | "ore";

export type MezzoDocumentoCategoria =
  | "assicurazione" | "bollo" | "revisione" | "contratto"
  | "verifica_periodica" | "libretto" | "altro";

export type MezzoManutenzioneTipo = "tagliando" | "riparazione" | "gomme" | "carrozzeria" | "altro";

export type StatoScadenza = "scaduto" | "in_scadenza" | "valido" | "senza_scadenza" | "sostituito";

export interface Mezzo {
  id: string;
  company_id: string;
  nome: string;
  tipo: MezzoTipo;
  targa: string | null;
  marca: string | null;
  modello: string | null;
  matricola: string | null;
  anno: number | null;
  contatore: number | null;
  contatore_unita: ContatoreUnita;
  contatore_aggiornato_il: string | null;
  possesso: MezzoPossesso;
  stato: MezzoStato;
  assegnato_hr_profilo_id: string | null;
  assegnato_order_id: string | null;
  /** Attrezzo caricato su un altro mezzo (un livello solo). */
  su_mezzo_id: string | null;
  foto_path: string | null;
  valore_acquisto: number | null;
  data_acquisto: string | null;
  /** Rata mensile di leasing o noleggio. */
  rata_mensile: number | null;
  note: string | null;
  deleted_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Mezzo con i nomi di chi o cosa lo ha in carico, per l'elenco e la scheda. */
export interface MezzoConAssegnazione extends Mezzo {
  assegnato_persona: string | null;
  assegnato_commessa: string | null;
  /** Nome del mezzo su cui è caricato, se è un attrezzo a bordo. */
  su_mezzo_nome: string | null;
}

/** Un periodo in cui il mezzo era in carico a una persona, a un cantiere o su un altro mezzo. */
export interface MezzoAssegnazione {
  id: string;
  company_id: string;
  mezzo_id: string;
  hr_profilo_id: string | null;
  order_id: string | null;
  su_mezzo_id: string | null;
  dal: string;
  al: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export type SegnalazioneTipo = "guasto" | "danno" | "km" | "altro";
export type SegnalazioneStato = "aperta" | "in_lavorazione" | "chiusa";

export interface MezzoSegnalazione {
  id: string;
  company_id: string;
  mezzo_id: string;
  tipo: SegnalazioneTipo;
  descrizione: string | null;
  contatore: number | null;
  stato: SegnalazioneStato;
  hr_profilo_id: string | null;
  created_by: string | null;
  created_at: string;
  chiusa_at: string | null;
  chiusa_da: string | null;
  nota_chiusura: string | null;
  updated_at: string;
}

export interface MezzoFoto {
  id: string;
  company_id: string;
  mezzo_id: string;
  segnalazione_id: string | null;
  file_path: string;
  didascalia: string | null;
  created_by: string | null;
  created_at: string;
}

/** Il mezzo come lo vede dal telefono chi lo ha in carico (funzione mezzi_in_carico). */
export interface MezzoInCarico {
  id: string;
  /** L'azienda del mezzo: chi lavora per due aziende vede i mezzi di entrambe. */
  company_id?: string;
  nome: string;
  tipo: MezzoTipo;
  targa: string | null;
  marca: string | null;
  modello: string | null;
  stato: MezzoStato;
  contatore: number | null;
  contatore_unita: ContatoreUnita;
  contatore_aggiornato_il: string | null;
  foto_path: string | null;
  su_mezzo_id: string | null;
  documenti: Array<Pick<MezzoDocumento, "id" | "categoria" | "titolo" | "ente" | "data_scadenza" | "alert_giorni_prima" | "file_path" | "file_name">>;
}

export const TIPI_SEGNALAZIONE: { value: SegnalazioneTipo; label: string }[] = [
  { value: "guasto", label: "Guasto" },
  { value: "danno", label: "Danno o incidente" },
  { value: "km", label: "Km aggiornati" },
  { value: "altro", label: "Altro" },
];

export const STATI_SEGNALAZIONE: { value: SegnalazioneStato; label: string; cls: string }[] = [
  { value: "aperta", label: "Da vedere", cls: "bg-red-50 text-red-700 border-red-200" },
  { value: "in_lavorazione", label: "In lavorazione", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  { value: "chiusa", label: "Chiusa", cls: "bg-slate-100 text-slate-600 border-slate-200" },
];

export interface MezzoDocumento {
  id: string;
  company_id: string;
  mezzo_id: string;
  categoria: MezzoDocumentoCategoria;
  titolo: string | null;
  ente: string | null;
  importo: number | null;
  data_inizio: string | null;
  data_scadenza: string | null;
  alert_giorni_prima: number;
  file_path: string | null;
  file_name: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MezzoManutenzione {
  id: string;
  company_id: string;
  mezzo_id: string;
  tipo: MezzoManutenzioneTipo;
  data: string;
  contatore: number | null;
  officina: string | null;
  costo: number | null;
  descrizione: string | null;
  prossima_data: string | null;
  prossimo_contatore: number | null;
  file_path: string | null;
  file_name: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Una riga della vista mezzi_scadenze. */
export interface MezzoScadenza {
  company_id: string;
  mezzo_id: string;
  mezzo_nome: string;
  targa: string | null;
  origine: "documento" | "manutenzione";
  riferimento_id: string;
  categoria: string;
  titolo: string | null;
  data_scadenza: string | null;
  contatore_scadenza: number | null;
  contatore_attuale: number | null;
  contatore_unita: ContatoreUnita;
  alert_giorni_prima: number;
  stato: "scaduto" | "in_scadenza" | "valido";
}

export const TIPI_MEZZO: { value: MezzoTipo; label: string }[] = [
  { value: "furgone", label: "Furgone" },
  { value: "autocarro", label: "Autocarro / camion" },
  { value: "autovettura", label: "Auto" },
  { value: "macchina_movimento_terra", label: "Escavatore / movimento terra" },
  { value: "sollevamento", label: "Gru / piattaforma / sollevatore" },
  { value: "rimorchio", label: "Rimorchio" },
  { value: "attrezzatura", label: "Attrezzatura" },
  { value: "altro", label: "Altro" },
];

export const POSSESSI: { value: MezzoPossesso; label: string }[] = [
  { value: "proprieta", label: "Di proprietà" },
  { value: "leasing", label: "Leasing" },
  { value: "noleggio_lungo", label: "Noleggio a lungo termine" },
  { value: "noleggio_breve", label: "Noleggio a breve" },
];

export const STATI_MEZZO: { value: MezzoStato; label: string; cls: string }[] = [
  { value: "in_servizio", label: "In servizio", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "in_officina", label: "In officina", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "fuori_servizio", label: "Fuori servizio", cls: "bg-slate-100 text-slate-600 border-slate-200" },
];

export const CATEGORIE_DOCUMENTO: { value: MezzoDocumentoCategoria; label: string; alert: number }[] = [
  { value: "assicurazione", label: "Assicurazione", alert: 30 },
  { value: "bollo", label: "Bollo", alert: 30 },
  { value: "revisione", label: "Revisione", alert: 30 },
  { value: "contratto", label: "Contratto leasing / noleggio", alert: 60 },
  { value: "verifica_periodica", label: "Verifica periodica (gru, PLE)", alert: 60 },
  { value: "libretto", label: "Libretto di circolazione", alert: 30 },
  { value: "altro", label: "Altro documento", alert: 30 },
];

export const TIPI_MANUTENZIONE: { value: MezzoManutenzioneTipo; label: string }[] = [
  { value: "tagliando", label: "Tagliando" },
  { value: "riparazione", label: "Riparazione" },
  { value: "gomme", label: "Gomme" },
  { value: "carrozzeria", label: "Carrozzeria" },
  { value: "altro", label: "Altro intervento" },
];

export const STATO_SCADENZA_BADGE: Record<StatoScadenza, { label: string; cls: string }> = {
  scaduto: { label: "Scaduto", cls: "bg-red-100 text-red-700 border-red-200" },
  in_scadenza: { label: "In scadenza", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  valido: { label: "In regola", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  senza_scadenza: { label: "Senza scadenza", cls: "bg-muted text-muted-foreground border-transparent" },
  sostituito: { label: "Rinnovato", cls: "bg-slate-100 text-slate-500 border-slate-200" },
};

const labelDi = <T extends string>(elenco: { value: T; label: string }[], v: string, riserva: string) =>
  elenco.find((x) => x.value === v)?.label ?? riserva;

export const tipoMezzoLabel = (v: string) => labelDi(TIPI_MEZZO, v, "Mezzo");
export const possessoLabel = (v: string) => labelDi(POSSESSI, v, v);
export const categoriaDocumentoLabel = (v: string) =>
  v === "tagliando" ? "Tagliando" : labelDi(CATEGORIE_DOCUMENTO, v, "Documento");
export const tipoManutenzioneLabel = (v: string) => labelDi(TIPI_MANUTENZIONE, v, "Intervento");
export const tipoSegnalazioneLabel = (v: string) => labelDi(TIPI_SEGNALAZIONE, v, "Segnalazione");
export const statoSegnalazione = (v: string) => STATI_SEGNALAZIONE.find((s) => s.value === v) ?? STATI_SEGNALAZIONE[0];
export const statoMezzo = (v: string) => STATI_MEZZO.find((s) => s.value === v) ?? STATI_MEZZO[0];

// ── Date ─────────────────────────────────────────────────────────────────────
// Date come 'YYYY-MM-DD' confrontate come testo: niente fusi orari in mezzo, la
// scadenza di oggi è di oggi anche alle 23:30.

export function oggiIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const g = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${g}`;
}

export function aggiungiGiorni(iso: string, giorni: number): string {
  const [y, m, g] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, g + giorni));
  return t.toISOString().slice(0, 10);
}

export function aggiungiAnni(iso: string, anni: number): string {
  const [y, m, g] = iso.split("-").map(Number);
  // 29 febbraio + 1 anno → 28 febbraio, non 1 marzo.
  const t = new Date(Date.UTC(y + anni, m - 1, 1));
  const ultimo = new Date(Date.UTC(y + anni, m, 0)).getUTCDate();
  t.setUTCDate(Math.min(g, ultimo));
  return t.toISOString().slice(0, 10);
}

export function giorniTra(daIso: string, aIso: string): number {
  const [y1, m1, g1] = daIso.split("-").map(Number);
  const [y2, m2, g2] = aIso.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, g2) - Date.UTC(y1, m1 - 1, g1)) / 864e5);
}

export function formatData(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, g] = iso.split("-");
  return `${g}/${m}/${y}`;
}

// "always": il formato italiano omette il punto delle migliaia sotto le cinque
// cifre (1260 accanto a 58.500). È nello standard ma non nei tipi della lib
// TypeScript del progetto, da qui il cast (come in lib/formatters.ts).
const NUMERO_IT = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 1,
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);

export function formatContatore(n: number | null | undefined, unita: ContatoreUnita): string {
  if (n == null) return "—";
  return `${NUMERO_IT.format(n)} ${unita}`;
}

/** Quanto prima del traguardo di km/ore il tagliando diventa "in scadenza". */
export function margineContatore(unita: ContatoreUnita): number {
  return unita === "ore" ? 50 : 1000;
}

// ── Stati ────────────────────────────────────────────────────────────────────

export function statoPerData(dataScadenza: string | null, alertGiorni: number | null, oggi: string): StatoScadenza {
  if (!dataScadenza) return "senza_scadenza";
  if (dataScadenza < oggi) return "scaduto";
  if (dataScadenza <= aggiungiGiorni(oggi, alertGiorni ?? 30)) return "in_scadenza";
  return "valido";
}

/**
 * Stato di ogni documento del mezzo. Quando si rinnova (nuova assicurazione,
 * nuova revisione) la polizza vecchia non è più "scaduta": è "rinnovata". Vale
 * per tutte le categorie tranne "altro", dove ogni documento fa storia a sé.
 */
export function documentiConStato<T extends Pick<MezzoDocumento, "id" | "categoria" | "data_scadenza" | "alert_giorni_prima">>(
  docs: T[],
  oggi: string,
): Array<T & { stato: StatoScadenza }> {
  const ultimaPerCategoria = new Map<string, string>();
  for (const d of docs) {
    if (d.categoria === "altro" || !d.data_scadenza) continue;
    const cur = ultimaPerCategoria.get(d.categoria);
    if (!cur || d.data_scadenza > cur) ultimaPerCategoria.set(d.categoria, d.data_scadenza);
  }
  return docs.map((d) => {
    const ultima = ultimaPerCategoria.get(d.categoria);
    const sostituito =
      d.categoria !== "altro" && !!d.data_scadenza && !!ultima && d.data_scadenza < ultima;
    return { ...d, stato: sostituito ? "sostituito" : statoPerData(d.data_scadenza, d.alert_giorni_prima, oggi) };
  });
}

export interface ProssimoTagliando {
  manutenzioneId: string;
  prossimaData: string | null;
  prossimoContatore: number | null;
  stato: "scaduto" | "in_scadenza" | "valido";
}

/**
 * Il prossimo tagliando lo dice l'ultimo intervento che lo indica (per data o
 * per km/ore). Scaduto se la data è passata o i km sono stati superati; in
 * scadenza a 30 giorni o a 1.000 km / 50 ore dal traguardo.
 */
export function prossimoTagliando(
  manutenzioni: Pick<MezzoManutenzione, "id" | "data" | "created_at" | "prossima_data" | "prossimo_contatore">[],
  contatoreAttuale: number | null,
  unita: ContatoreUnita,
  oggi: string,
): ProssimoTagliando | null {
  const conProssimo = manutenzioni
    .filter((m) => m.prossima_data || m.prossimo_contatore != null)
    .sort((a, b) => (a.data === b.data ? b.created_at.localeCompare(a.created_at) : b.data.localeCompare(a.data)));
  const t = conProssimo[0];
  if (!t) return null;
  const perData = t.prossima_data;
  const perKm = t.prossimo_contatore;
  const km = contatoreAttuale;
  let stato: ProssimoTagliando["stato"] = "valido";
  if ((perData && perData < oggi) || (perKm != null && km != null && km >= perKm)) {
    stato = "scaduto";
  } else if (
    (perData && perData <= aggiungiGiorni(oggi, 30)) ||
    (perKm != null && km != null && km >= perKm - margineContatore(unita))
  ) {
    stato = "in_scadenza";
  }
  return { manutenzioneId: t.id, prossimaData: perData, prossimoContatore: perKm, stato };
}

const GRAVITA: Record<string, number> = { scaduto: 3, in_scadenza: 2, valido: 1 };

/** Lo stato peggiore di un mezzo, per il pallino nell'elenco. */
export function statoPeggiore(stati: string[]): "scaduto" | "in_scadenza" | "valido" | null {
  let peggiore: "scaduto" | "in_scadenza" | "valido" | null = null;
  for (const s of stati) {
    if (!(s in GRAVITA)) continue;
    if (!peggiore || GRAVITA[s] > GRAVITA[peggiore]) peggiore = s as "scaduto" | "in_scadenza" | "valido";
  }
  return peggiore;
}

/** Una riga di scadenza in parole: "Revisione · scadenza passata il 21/09/2026", "Bollo · scade il 04/10/2026", "Tagliando · a 59.000 km". */
export function descriviScadenza(s: Pick<MezzoScadenza, "categoria" | "data_scadenza" | "contatore_scadenza" | "contatore_unita" | "stato">): string {
  const cosa = categoriaDocumentoLabel(s.categoria);
  const parti: string[] = [];
  if (s.data_scadenza) parti.push(`${s.stato === "scaduto" ? "scadenza passata il" : "scade il"} ${formatData(s.data_scadenza)}`);
  if (s.contatore_scadenza != null) parti.push(`a ${formatContatore(s.contatore_scadenza, s.contatore_unita)}`);
  return parti.length ? `${cosa} · ${parti.join(" o ")}` : cosa;
}

// ── Storico: chi aveva il mezzo ──────────────────────────────────────────────

const GIORNO_ITALIANO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit",
});

/** Il giorno ('YYYY-MM-DD') di un istante in ora italiana, ovunque sia il telefono. */
export function giornoItaliano(istante: string): string {
  return GIORNO_ITALIANO.format(new Date(istante));
}

/**
 * I periodi che toccano un giorno: quando arriva una multa del 12 marzo, chi
 * aveva il mezzo quel giorno. Un periodo aperto (al = null) arriva fino a oggi.
 * Le date del periodo sono istanti (timestamptz): si confrontano col giorno in
 * ora italiana, perché multe e cantieri sono in Italia.
 */
export function periodiDelGiorno<T extends Pick<MezzoAssegnazione, "dal" | "al">>(periodi: T[], giorno: string): T[] {
  return periodi.filter((p) => {
    const inizio = giornoItaliano(p.dal);
    const fine = p.al ? giornoItaliano(p.al) : "9999-12-31";
    return inizio <= giorno && giorno <= fine;
  });
}

/** Giorni di calendario in cui un periodo si sovrappone a [da, a] (estremi inclusi). */
export function giorniSovrapposti(dal: string, al: string | null, da: string, a: string): number {
  const inizio = giornoItaliano(dal);
  const fine = al ? giornoItaliano(al) : a;
  const s = inizio > da ? inizio : da;
  const e = fine < a ? fine : a;
  if (s > e) return 0;
  return giorniTra(s, e) + 1;
}

// ── Costi ────────────────────────────────────────────────────────────────────

export interface CostoAnnuoMezzo {
  /** Assicurazione e bollo in corso (l'importo del documento più recente di ciascuno). */
  documenti: number;
  /** Rata di leasing o noleggio × 12. */
  rate: number;
  /** Tagliandi e interventi degli ultimi 12 mesi. */
  manutenzioni: number;
  totale: number;
  /** Il totale diviso 365: per stimare quanto pesa il mezzo su un cantiere. */
  alGiorno: number;
}

/**
 * Quanto costa il mezzo in un anno: assicurazione e bollo in corso, rate di
 * leasing o noleggio, manutenzioni degli ultimi 12 mesi. È una stima per
 * decidere (tenerlo, cambiarlo, noleggiare): non entra nei margini ufficiali.
 */
export function costoAnnuoMezzo(
  mezzo: Pick<Mezzo, "rata_mensile">,
  documenti: Pick<MezzoDocumento, "categoria" | "importo" | "data_scadenza" | "created_at">[],
  manutenzioni: Pick<MezzoManutenzione, "data" | "costo">[],
  oggi: string,
): CostoAnnuoMezzo {
  let doc = 0;
  for (const categoria of ["assicurazione", "bollo"] as const) {
    const ultimo = documenti
      .filter((d) => d.categoria === categoria && d.importo != null)
      .sort((a, b) => (b.data_scadenza ?? "").localeCompare(a.data_scadenza ?? "") || b.created_at.localeCompare(a.created_at))[0];
    if (ultimo) doc += Number(ultimo.importo);
  }
  const rate = mezzo.rata_mensile != null ? Number(mezzo.rata_mensile) * 12 : 0;
  const da = aggiungiGiorni(oggi, -365);
  const man = manutenzioni.filter((m) => m.data >= da && m.costo != null).reduce((t, m) => t + Number(m.costo), 0);
  const totale = Math.round((doc + rate + man) * 100) / 100;
  return { documenti: doc, rate, manutenzioni: man, totale, alGiorno: Math.round((totale / 365) * 100) / 100 };
}

// ── Valori letti dall'AI (arrivano come unknown) ─────────────────────────────

/** Testo o null: i campi letti dall'AI arrivano come unknown. */
export function testoLetto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Data ISO 'YYYY-MM-DD' o null. */
export function dataLetta(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null;
}

/** Numero o null (accetta anche "1.234,56"). */
export function numeroLetto(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const n = Number(v.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && v.trim() !== "" ? n : null;
}
