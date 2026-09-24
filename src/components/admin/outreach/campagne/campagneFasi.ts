/**
 * Logica PURA della pipeline di una campagna cold: dalle righe di
 * outreach_campagna_fasi (una per fase, con il conteggio) alle colonne da
 * disegnare, nell'ordine in cui un contatto le attraversa.
 *
 *   Nel flusso   Da contattare → Email 1 → … → Email N → Flusso finito
 *   Risposte     Interessati · Domande · Altre risposte · Non interessati
 *   Usciti       Rimbalzate · Esclusi prima dell'invio · Disiscritti · Fermati
 *
 * «Email 3» conta chi ha ricevuto la terza email e aspetta la quarta: è dove
 * il contatto si trova ADESSO, non quante volte la terza email è partita (quello
 * lo dicono le statistiche, passo per passo).
 */

/** Stato di una campagna (outreach_sequences.status) come lo legge chi la guarda. */
export const STATO_CAMPAGNA: Record<string, { etichetta: string; punto: string }> = {
  active: { etichetta: "Attiva", punto: "bg-emerald-500" },
  paused: { etichetta: "In pausa", punto: "bg-amber-500" },
  draft: { etichetta: "Bozza", punto: "bg-muted-foreground/40" },
  archived: { etichetta: "Archiviata", punto: "bg-muted-foreground/25" },
};

export type GruppoFase = "flusso" | "risposta" | "uscita";
export type TonoFase = "neutro" | "attivo" | "buono" | "info" | "spento" | "allerta";

export interface FaseRiga {
  fase: string;
  contatti: number;
  in_pausa: number;
  prossimo_invio: string | null;
  ultimo_programmato: string | null;
}

export interface PassoDef {
  /** 1-based, nell'ordine della sequenza */
  passo: number;
  canale: string;
  /** giorno del passo dall'iscrizione (i ritardi delle sequenze lineari sono cumulativi) */
  giorno: number | null;
  oggetto: string | null;
}

export interface FaseVista {
  chiave: string;
  gruppo: GruppoFase;
  titolo: string;
  sottotitolo: string;
  contatti: number;
  inPausa: number;
  prossimoInvio: string | null;
  ultimoProgrammato: string | null;
  tono: TonoFase;
}

const CANALE: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS", call: "Chiamata" };

export function etichettaCanale(canale: string | null | undefined): string {
  return CANALE[canale ?? "email"] ?? "Messaggio";
}

const RISPOSTE: Array<{ chiave: string; titolo: string; sottotitolo: string; tono: TonoFase }> = [
  { chiave: "risposta_interessato", titolo: "Interessati", sottotitolo: "vogliono saperne di più", tono: "buono" },
  { chiave: "risposta_domanda", titolo: "Domande", sottotitolo: "chiedono prezzi o dettagli", tono: "info" },
  { chiave: "risposta_altro", titolo: "Altre risposte", sottotitolo: "da leggere e classificare", tono: "neutro" },
  { chiave: "risposta_non_interessato", titolo: "Non interessati", sottotitolo: "hanno detto di no", tono: "spento" },
];

const USCITE: Array<{ chiave: string; titolo: string; sottotitolo: string; tono: TonoFase }> = [
  { chiave: "rimbalzato", titolo: "Rimbalzate", sottotitolo: "indirizzo inesistente o rifiutato", tono: "allerta" },
  // Chiusi per un rimbalzo senza che da questo flusso sia partita un'email:
  // l'indirizzo era già rimbalzato con un altro flusso, o il dominio non riceve
  // posta. Non sono rimbalzi del flusso (24/09/2026: erano la metà dei 243).
  { chiave: "escluso", titolo: "Esclusi prima dell'invio", sottotitolo: "già rimbalzati con un altro flusso o dominio senza posta: nessuna email partita", tono: "spento" },
  { chiave: "disiscritto", titolo: "Disiscritti", sottotitolo: "hanno chiesto di non ricevere più", tono: "spento" },
  { chiave: "fermato", titolo: "Fermati", sottotitolo: "a mano o per un errore d'invio", tono: "spento" },
];

/** Numero del passo da una chiave "passo_3" → 3; altrimenti null. */
export function numeroPasso(chiave: string): number | null {
  const m = /^passo_(\d+)$/.exec(chiave);
  return m ? Number(m[1]) : null;
}

/**
 * Tutte le colonne della campagna, anche quelle vuote: una pipeline con i
 * buchi («Email 2» che manca perché nessuno è lì oggi) fa perdere la forma del
 * flusso. I passi arrivano dalla definizione della sequenza; se ci sono
 * contatti oltre l'ultimo passo definito (sequenze modificate strada facendo)
 * le loro colonne compaiono comunque.
 */
export function costruisciFasi(righe: FaseRiga[], passi: PassoDef[]): FaseVista[] {
  const perChiave = new Map(righe.map((r) => [r.fase, r]));
  const vista = (chiave: string, gruppo: GruppoFase, titolo: string, sottotitolo: string, tono: TonoFase): FaseVista => {
    const r = perChiave.get(chiave);
    return {
      chiave, gruppo, titolo, sottotitolo, tono,
      contatti: Number(r?.contatti ?? 0),
      inPausa: Number(r?.in_pausa ?? 0),
      prossimoInvio: r?.prossimo_invio ?? null,
      ultimoProgrammato: r?.ultimo_programmato ?? null,
    };
  };

  const ordinati = [...passi].sort((a, b) => a.passo - b.passo);
  const nDefiniti = ordinati.length;
  const nOsservati = Math.max(0, ...righe.map((r) => numeroPasso(r.fase) ?? 0));
  const nPassi = Math.max(nDefiniti, nOsservati);
  const defDi = (k: number) => ordinati.find((p) => p.passo === k);

  const out: FaseVista[] = [
    vista("da_contattare", "flusso", "Da contattare",
      defDi(1) ? `aspettano ${etichettaCanale(defDi(1)?.canale).toLowerCase()} 1` : "nessun messaggio ancora partito", "attivo"),
  ];
  for (let k = 1; k <= nPassi; k++) {
    const qui = defDi(k);
    const dopo = defDi(k + 1);
    const titolo = `${etichettaCanale(qui?.canale)} ${k}`;
    const sottotitolo = k < nPassi
      ? (dopo?.giorno != null ? `ricevuta · la ${k + 1}ª parte al giorno ${dopo.giorno}` : `ricevuta · in attesa della ${k + 1}ª`)
      : "ultima del flusso · si aspetta una risposta";
    out.push(vista(`passo_${k}`, "flusso", titolo, sottotitolo, "attivo"));
  }
  out.push(vista("completato", "flusso", "Flusso finito", "ricevute tutte, nessuna risposta", "neutro"));
  for (const r of RISPOSTE) out.push(vista(r.chiave, "risposta", r.titolo, r.sottotitolo, r.tono));
  for (const u of USCITE) out.push(vista(u.chiave, "uscita", u.titolo, u.sottotitolo, u.tono));
  return out;
}

/**
 * La colonna da aprire per prima: le risposte (sono il lavoro da fare), poi il
 * primo passo con qualcuno dentro, altrimenti chi deve ancora partire.
 */
export function faseIniziale(fasi: FaseVista[]): string {
  const risposta = ["risposta_interessato", "risposta_domanda", "risposta_altro", "risposta_non_interessato"]
    .find((k) => (fasi.find((f) => f.chiave === k)?.contatti ?? 0) > 0);
  if (risposta) return risposta;
  const inCorso = fasi.find((f) => numeroPasso(f.chiave) != null && f.contatti > 0);
  if (inCorso) return inCorso.chiave;
  const conQualcuno = fasi.find((f) => f.contatti > 0);
  return conQualcuno?.chiave ?? "da_contattare";
}

/**
 * Rimbalzi oltre il 3% degli invii: sopra quella soglia i provider iniziano a
 * mandare in spam anche le email buone. È la stessa soglia delle Statistiche;
 * sotto i 20 invii un paio di rimbalzi non dice ancora niente.
 */
export function rimbalziAlti(rimbalzi: number, invii: number): boolean {
  return invii >= 20 && rimbalzi / invii > 0.03;
}

/**
 * Percentuale leggibile: «0%», «<1%» (qualcuno c'è ma è meno dell'1%), «12%»,
 * «4,5%» sotto il 10%. «—» se il denominatore è zero: 0 su 0 non è 0%.
 */
export function percentuale(n: number, d: number): string {
  if (!d) return "—";
  if (!n) return "0%";
  const p = (n / d) * 100;
  if (p < 1) return "<1%";
  if (p < 10) return `${(Math.round(p * 10) / 10).toLocaleString("it-IT")}%`;
  return `${Math.round(p)}%`;
}

/** L'oggetto di un passo com'è scritto nella sequenza: varianti separate da "===", vuoto = risposta nel thread. */
export function oggettoLeggibile(oggetto: string | null | undefined): { testo: string; varianti: number; risposta: boolean } {
  const parti = String(oggetto ?? "").split("===").map((s) => s.trim()).filter(Boolean);
  if (parti.length === 0) return { testo: "Re: nella stessa conversazione", varianti: 0, risposta: true };
  return { testo: parti[0], varianti: parti.length - 1, risposta: false };
}

/**
 * Numeri interi all'italiana con il punto delle migliaia anche a quattro cifre:
 * toLocaleString("it-IT") scrive «1676», ma nelle schede accanto a «42.979»
 * sembra un altro tipo di numero.
 */
export function numero(v: number): string {
  const n = Math.round(Number.isFinite(v) ? v : 0);
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return n < 0 ? `-${s}` : s;
}

const NOMI_GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

/** Giorni d'invio in parole: [1,2,3,4,5] → «lun–ven», [1,3,5] → «lun, mer, ven». */
export function giorniLeggibili(giorni: number[]): string {
  const g = [...new Set(giorni)].filter((x) => x >= 0 && x <= 6).sort((a, b) => a - b);
  if (g.length === 0) return "nessun giorno";
  if (g.length === 7) return "tutti i giorni";
  const consecutivi = g.every((x, i) => i === 0 || x === g[i - 1] + 1);
  if (consecutivi && g.length >= 3) return `${NOMI_GIORNI[g[0]]}–${NOMI_GIORNI[g[g.length - 1]]}`;
  return g.map((x) => NOMI_GIORNI[x]).join(", ");
}

// ── Ritmo e tempi ────────────────────────────────────────────────────────────
//
// La data scritta in coda è un minimo, non una promessa: il dispatcher spedisce
// solo nei giorni della finestra e dentro il tetto di ogni casella (con la rampa
// del warm-up) e dei «nuovi al giorno». Qui si rifà lo stesso conto
// (effectiveDailyCap / statoPerPrimiContatti di _shared/outreach-dispatch-logic)
// giorno per giorno, per dire quando finiscono davvero i primi contatti e il
// resto della sequenza.

export interface CasellaRitmo {
  tetto: number;
  base: number;
  passo: number;
  giorno: number;
  /** false = warm-up non ancora partito: il giro quotidiano lo avvia domani */
  avviato: boolean;
  inviati_oggi: number;
}

export interface RitmoBrand {
  brand_id: string;
  brand: string;
  stato: string;
  nuovi_al_giorno: number | null;
  /** 0 = domenica … 6 = sabato */
  giorni_invio: number[];
  /** ora di apertura della finestra del brand (0-23) */
  ora_inizio: number;
  ora_fine: number;
  caselle: CasellaRitmo[];
}

/** Tetto di una casella fra `k` giorni di calendario: la rampa sale di un giorno al giorno. */
export function tettoCasella(c: CasellaRitmo, k: number): number {
  const giorno = c.avviato ? c.giorno + k : Math.max(0, k - 1);
  return Math.max(0, Math.min(c.tetto, c.base + giorno * c.passo));
}

/** Quanti messaggi può spedire il brand fra `k` giorni: in tutto, e di cui primi contatti. */
export function capacitaBrand(r: RitmoBrand, k: number): { totale: number; nuovi: number } {
  let totale = 0;
  let nuovi = 0;
  for (const c of r.caselle) {
    const t = tettoCasella(c, k);
    const giaOggi = k === 0 ? Math.max(0, c.inviati_oggi) : 0;
    const libero = Math.max(0, t - giaOggi);
    totale += libero;
    const tettoNuovi = r.nuovi_al_giorno && r.nuovi_al_giorno > 0 ? Math.min(t, r.nuovi_al_giorno) : t;
    nuovi += Math.min(libero, Math.max(0, tettoNuovi - giaOggi));
  }
  return { totale, nuovi };
}

/** I follow-up restano indietro se i primi contatti possono prendersi l'intero tetto di una casella. */
export function followupSchiacciati(r: RitmoBrand): boolean {
  const n = r.nuovi_al_giorno;
  if (!n || n <= 0) return r.caselle.length > 0;
  return r.caselle.some((c) => c.tetto > 0 && c.tetto <= n);
}

export interface StimaTempi {
  capOggi: number;
  capRegime: number;
  /** giorni d'invio (lavorativi) e data in cui finiscono; null se non c'è niente da mandare */
  primi: { giorni: number; fine: Date } | null;
  tutto: { giorni: number; fine: Date } | null;
  /** oltre l'orizzonte simulato: «più di tre anni» */
  oltre: boolean;
  /** stima dei messaggi di QUESTA campagna per i prossimi giorni di calendario, da oggi */
  perGiorno: Array<{ giorno: string; stima: number }>;
}

const ORIZZONTE_GIORNI = 1100; // ~3 anni di calendario

function chiaveGiorno(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Stima i tempi di UNA campagna. Il ritmo del brand è condiviso tra le sue
 * campagne attive: a questa tocca una quota proporzionale a quanto le resta da
 * mandare (primi contatti per i nuovi, messaggi in tutto per il resto). Come il
 * dispatcher, ogni giorno passano prima i primi contatti (fino ai «nuovi al
 * giorno») e i follow-up prendono i posti che restano.
 */
export function stimaTempi(o: {
  ritmo: RitmoBrand;
  primiDaMandare: number;
  messaggiDaMandare: number;
  quotaPrimi: number;
  quotaTotale: number;
  adesso: Date;
  /** ora corrente a Roma (0-23), per sapere se oggi la finestra è già chiusa */
  oraAdesso: number;
  giorniGrafico?: number;
}): StimaTempi {
  const { ritmo } = o;
  const capOggi = ritmo.caselle.reduce((s, c) => s + tettoCasella(c, 0), 0);
  const capRegime = ritmo.caselle.reduce((s, c) => s + Math.max(0, c.tetto), 0);
  const giorniGrafico = o.giorniGrafico ?? 14;
  // Quote frazionarie: niente arrotondamenti giorno per giorno, che su quote
  // piccole azzererebbero una campagna per sempre.
  let primi = Math.max(0, o.primiDaMandare);
  let tutto = Math.max(primi, o.messaggiDaMandare);
  const perGiorno: StimaTempi["perGiorno"] = [];
  let lavorativi = 0;
  let finePrimi: StimaTempi["primi"] = null;
  let fineTutto: StimaTempi["tutto"] = null;
  const nienteDaFare = tutto === 0 || capRegime === 0 || o.quotaTotale <= 0;
  const EPS = 1e-6;

  for (let k = 0; k < ORIZZONTE_GIORNI; k++) {
    const d = new Date(o.adesso);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + k);
    const giornoInvio = ritmo.giorni_invio.includes(d.getDay()) && !(k === 0 && o.oraAdesso >= ritmo.ora_fine);
    let oggiCampagna = 0;
    if (giornoInvio && !nienteDaFare && tutto > EPS) {
      lavorativi++;
      const cap = capacitaBrand(ritmo, k);
      const nuovi = Math.min(primi, cap.nuovi * Math.max(0, o.quotaPrimi));
      const resto = Math.max(0, cap.totale * o.quotaTotale - nuovi);
      oggiCampagna = Math.min(tutto, nuovi + resto);
      primi -= nuovi;
      tutto -= oggiCampagna;
      if (primi <= EPS && !finePrimi && o.primiDaMandare > 0) finePrimi = { giorni: lavorativi, fine: new Date(d) };
      if (tutto <= EPS && !fineTutto) fineTutto = { giorni: lavorativi, fine: new Date(d) };
    }
    if (k < giorniGrafico) perGiorno.push({ giorno: chiaveGiorno(d), stima: Math.round(oggiCampagna) });
    if (k >= giorniGrafico && (fineTutto || nienteDaFare)) break;
  }

  return {
    capOggi,
    capRegime,
    primi: finePrimi,
    tutto: fineTutto,
    oltre: !nienteDaFare && !fineTutto,
    perGiorno,
  };
}

/** Il passo che fa rispondere di più, solo se ha abbastanza invii per dirlo (default 20). */
export function passoMigliore(passi: Array<{ passo: number; inviati: number; risposte: number }>, minimo = 20): number | null {
  let migliore: { passo: number; tasso: number } | null = null;
  for (const p of passi) {
    if (p.inviati < minimo || p.risposte === 0) continue;
    const tasso = p.risposte / p.inviati;
    if (!migliore || tasso > migliore.tasso) migliore = { passo: p.passo, tasso };
  }
  return migliore?.passo ?? null;
}
