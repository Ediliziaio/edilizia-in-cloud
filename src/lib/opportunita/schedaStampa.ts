/**
 * La scheda dell'opportunità da stampare su A4: tutto quello che si vede nella scheda, in sezioni.
 *
 * Qui solo la parte senza interfaccia: i dati arrivano già letti, escono sezioni di righe
 * «etichetta · valore». Un campo vuoto si stampa lo stesso (con un trattino): la stampa è la copia
 * fedele della scheda, e un campo mancante è un'informazione.
 */

export const VUOTO = "—";

export interface RigaScheda {
  etichetta: string;
  valore: string;
}

export interface BloccoTesto {
  intestazione: string;
  testo: string;
}

export interface SezioneScheda {
  titolo: string;
  /** Campi a coppie etichetta · valore. */
  righe?: RigaScheda[];
  /** Testi lunghi (appunti, appuntamenti): un blocco ciascuno, mai spezzato fra due pagine. */
  blocchi?: BloccoTesto[];
  /** Messaggio quando la sezione è vuota («Nessun appunto»). */
  vuota?: string;
}

export interface SchedaStampa {
  titolo: string;
  sottotitolo: string;
  sezioni: SezioneScheda[];
  stampataIl: string;
}

export interface CampoPersonalizzato {
  id: string;
  name: string;
  field_type?: string | null;
}

export interface NotaStampa {
  created_at: string;
  content: string | null;
  autore?: string | null;
}

export interface AppuntamentoStampa {
  appointment_date: string | null;
  appointment_time: string | null;
  appointment_end_time: string | null;
  title: string | null;
  appointment_type: string | null;
  status: string | null;
  formatted_address: string | null;
  meeting_url: string | null;
  assegnato: string | null;
  description: string | null;
}

export interface DatiSchedaStampa {
  nomeOpportunita: string;
  creazione: string;
  contatto: {
    nome: string;
    cognome: string;
    email: string;
    telefono: string;
    indirizzo: string;
    citta: string;
    provincia: string;
    regione: string;
  };
  campiContatto: CampoPersonalizzato[];
  valoriContatto: Record<string, string>;
  pipeline: string;
  fase: string;
  stato: string;
  valore: number | string | null;
  venditore: string;
  follower: string;
  callCenter: string;
  azienda: string;
  fonte: string;
  etichette: string[];
  campiOpportunita: CampoPersonalizzato[];
  valoriOpportunita: Record<string, string>;
  probabilita: number | null;
  chiusuraPrevista: string | null;
  prossimaAzione: string | null;
  dataProssimaAzione: string | null;
  motivoPerdita: string;
  note: NotaStampa[];
  appuntamenti: AppuntamentoStampa[];
  adesso?: Date;
}

const pulito = (v: unknown): string => String(v ?? "").trim();
const oVuoto = (v: unknown): string => pulito(v) || VUOTO;

/** 1.234,50 € */
export function euro(v: number | string | null | undefined): string {
  if (v === null || v === undefined || pulito(v) === "") return VUOTO;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return VUOTO;
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

/** 9 ottobre 2026 (da yyyy-MM-dd o da una data ISO). */
export function dataLunga(v: string | null | undefined): string {
  const s = pulito(v);
  if (!s) return VUOTO;
  const solaData = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = solaData ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10))) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function dataEOra(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

const valoreCampo = (campo: CampoPersonalizzato, v: string | undefined): string => {
  const s = pulito(v);
  if (!s) return VUOTO;
  return campo.field_type === "date" ? dataLunga(s) : s;
};

const ETICHETTE_TIPO: Record<string, string> = {
  videocall: "Videochiamata",
  call: "Chiamata",
  chiamata: "Chiamata",
  appuntamento: "Appuntamento",
  sopralluogo_preventivo: "Sopralluogo preventivo",
  rilievo_tecnico: "Rilievo tecnico",
  misurazione: "Misurazione",
  conferma_ordine: "Conferma ordine",
  riunione: "Riunione",
  cliente: "Appuntamento cliente",
  generico: "Generico",
};

const ETICHETTE_STATO_APPUNTAMENTO: Record<string, string> = {
  confermato: "Confermato",
  in_attesa: "In attesa",
  completato: "Completato",
  annullato: "Annullato",
};

export function costruisciSchedaStampa(d: DatiSchedaStampa): SchedaStampa {
  const nomeCompleto = [d.contatto.nome, d.contatto.cognome].map(pulito).filter(Boolean).join(" ");

  const contatto: RigaScheda[] = [
    { etichetta: "Nome", valore: oVuoto(d.contatto.nome) },
    { etichetta: "Cognome", valore: oVuoto(d.contatto.cognome) },
    { etichetta: "Email", valore: oVuoto(d.contatto.email) },
    { etichetta: "Telefono", valore: oVuoto(d.contatto.telefono) },
    { etichetta: "Indirizzo", valore: oVuoto(d.contatto.indirizzo) },
    { etichetta: "Città", valore: oVuoto(d.contatto.citta) },
    { etichetta: "Provincia", valore: oVuoto(d.contatto.provincia) },
    { etichetta: "Regione", valore: oVuoto(d.contatto.regione) },
    ...d.campiContatto.map((c) => ({ etichetta: c.name, valore: valoreCampo(c, d.valoriContatto[c.id]) })),
  ];

  const opportunita: RigaScheda[] = [
    { etichetta: "Nome opportunità", valore: oVuoto(d.nomeOpportunita) },
    { etichetta: "Sequenza (pipeline)", valore: oVuoto(d.pipeline) },
    { etichetta: "Fase", valore: oVuoto(d.fase) },
    { etichetta: "Stato", valore: oVuoto(d.stato) },
    { etichetta: "Valore", valore: euro(d.valore) },
    { etichetta: "Venditore", valore: oVuoto(d.venditore) },
    { etichetta: "Follower", valore: oVuoto(d.follower) },
    { etichetta: "Call Center", valore: oVuoto(d.callCenter) },
    { etichetta: "Nome dell'azienda", valore: oVuoto(d.azienda) },
    { etichetta: "Fonte", valore: oVuoto(d.fonte) },
    { etichetta: "Etichette", valore: d.etichette.length ? d.etichette.join(", ") : VUOTO },
    ...d.campiOpportunita.map((c) => ({ etichetta: c.name, valore: valoreCampo(c, d.valoriOpportunita[c.id]) })),
  ];

  const avanzamento: RigaScheda[] = [
    { etichetta: "Chiusura prevista", valore: dataLunga(d.chiusuraPrevista) },
    { etichetta: "Probabilità", valore: d.probabilita === null || d.probabilita === undefined ? VUOTO : `${d.probabilita}%` },
    { etichetta: "Prossima azione", valore: oVuoto(d.prossimaAzione) },
    { etichetta: "Data della prossima azione", valore: dataLunga(d.dataProssimaAzione) },
    ...(pulito(d.motivoPerdita) ? [{ etichetta: "Motivo della perdita", valore: pulito(d.motivoPerdita) }] : []),
  ];

  const appunti: SezioneScheda = {
    titolo: `Appunti (${d.note.length})`,
    blocchi: d.note.map((n) => ({
      intestazione: [dataEOra(n.created_at), pulito(n.autore)].filter(Boolean).join(" · "),
      testo: pulito(n.content) || VUOTO,
    })),
    vuota: "Nessun appunto.",
  };

  const appuntamenti: SezioneScheda = {
    titolo: `Appuntamenti (${d.appuntamenti.length})`,
    blocchi: d.appuntamenti.map((a) => {
      const ora = pulito(a.appointment_time).slice(0, 5);
      const fine = pulito(a.appointment_end_time).slice(0, 5);
      const quando = [dataLunga(a.appointment_date), ora ? (fine ? `${ora}–${fine}` : ora) : ""].filter(Boolean).join(", ");
      const tipo = ETICHETTE_TIPO[pulito(a.appointment_type)] ?? pulito(a.appointment_type);
      const stato = ETICHETTE_STATO_APPUNTAMENTO[pulito(a.status)] ?? pulito(a.status);
      const dove = pulito(a.meeting_url) ? `Videochiamata: ${pulito(a.meeting_url)}` : pulito(a.formatted_address) ? `Luogo: ${pulito(a.formatted_address)}` : "";
      return {
        intestazione: [quando, tipo, stato].filter(Boolean).join(" · "),
        testo: [pulito(a.title), dove, pulito(a.assegnato) ? `Assegnato a: ${pulito(a.assegnato)}` : "", pulito(a.description)].filter(Boolean).join("\n") || VUOTO,
      };
    }),
    vuota: "Nessun appuntamento.",
  };

  return {
    titolo: nomeCompleto || oVuoto(d.nomeOpportunita),
    sottotitolo: [pulito(d.nomeOpportunita) && pulito(d.nomeOpportunita) !== nomeCompleto ? d.nomeOpportunita : "", pulito(d.creazione)].filter(Boolean).join(" · "),
    sezioni: [
      { titolo: "Contatto", righe: contatto },
      { titolo: "Opportunità", righe: opportunita },
      { titolo: "Avanzamento commerciale", righe: avanzamento },
      appuntamenti,
      appunti,
    ],
    stampataIl: dataEOra((d.adesso ?? new Date()).toISOString()),
  };
}
