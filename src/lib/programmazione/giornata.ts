/**
 * Programmazione della giornata (26/11/2026, richiesta di Florin).
 *
 * «La sera prima preparo il cantiere del giorno dopo»: chi va dove, a che ora,
 * con quali mezzi. L'unità è l'INTERVENTO, non il cantiere: la stessa persona
 * può stare in più interventi nello stesso giorno (il geometra in tre cantieri,
 * il manutentore in cinque manutenzioni, la squadra di posa in quattro pose).
 *
 * Qui solo logica pura: proposta di partenza dalle squadre e dalle date delle
 * commesse, spostamenti, avvisi. Niente rete, niente React.
 */

/**
 * «commissione»: non un cantiere ma una cosa da fare fuori (ritirare merce in
 * magazzino, comprare qualcosa, portare un attrezzo), eventualmente per una commessa.
 */
export type TipoIntervento = "commessa" | "sopralluogo" | "manutenzione" | "commissione" | "altro";

export interface Intervento {
  id: string;
  tipo: TipoIntervento;
  orderId: string | null;
  codice: string | null;
  titolo: string;
  indirizzo: string | null;
  faseId: string | null;
  /** «08:00»; null = in giornata, senza orario. */
  inizio: string | null;
  fine: string | null;
  /** hr_profili.id delle persone. */
  persone: string[];
  capoId: string | null;
  mezzi: string[];
  note: string | null;
  /** Sopralluogo o assistenza da cui nasce (surveys.id / tickets.id). */
  fonteId?: string | null;
  /** Quante persone servono (null = non detto). */
  servono?: number | null;
  /** Dove si va, se si sa (per mappa, meteo e giri). */
  punto?: Punto | null;
  /** Abilitazioni che servono (gru, PLE…): chiavi di ABILITAZIONI. */
  richiede?: string[];
  /** Squadre esterne / subappaltatori (external_teams.id). */
  esterni?: string[];
  /**
   * Senza orario ma con un momento: «prima» o «dopo» il cantiere (passare in
   * magazzino stasera). Non si accavalla con la giornata in cantiere.
   */
  momento?: "prima" | "dopo" | null;
}

export interface Punto {
  lat: number;
  lng: number;
}

export interface Giornata {
  giorno: string;
  interventi: Intervento[];
  /**
   * Preparata solo in parte da un altro giorno («fisso fino a fine lavori»,
   * «porta a domani»): all'apertura si unisce alla proposta del giorno.
   */
  parziale?: boolean;
}

/** Una giornata parziale unita alla proposta: gli interventi fissati sostituiscono quelli della stessa commessa. */
export function completaConProposta(parziale: Giornata, proposta: Giornata): Giornata {
  let g: Giornata = { giorno: proposta.giorno, interventi: proposta.interventi };
  for (const i of parziale.interventi) g = unisciInterventoTenendoId(g, i);
  return g;
}

function unisciInterventoTenendoId(g: Giornata, i: Intervento): Giornata {
  const k = g.interventi.findIndex((x) => x.tipo === i.tipo && !!i.orderId && x.orderId === i.orderId);
  if (k < 0) return { ...g, interventi: ordina([...g.interventi, i]) };
  const interventi = [...g.interventi];
  interventi[k] = { ...i, punto: i.punto ?? interventi[k].punto };
  return { ...g, interventi };
}

export interface PersonaGiorno {
  id: string;
  nome: string;
  cognome: string;
  colore: string | null;
  mansione: string | null;
  /** Operaio di cantiere; false = ufficio, tecnici, geometri. */
  operaio: boolean;
  /** Chi esce: operaio o tecnico (geometra, manutentore, chi fa sopralluoghi). L'ufficio no. */
  ruolo: RuoloPersona;
  squadraId: string | null;
  /** Commessa su cui la sua squadra è prevista quel giorno. */
  previstoOrderId: string | null;
  /** «In ferie», «A riposo»…; null = disponibile. */
  assenza: string | null;
  /** Documenti (sicurezza, visita medica…): scaduti e prossima scadenza. */
  documenti?: { scaduti: number; prossima: string | null } | null;
  /** Com'è andata davvero (dalle timbrature e dal rapportino), per oggi e i giorni passati. */
  consuntivo?: Consuntivo | null;
  /** Abilitazioni valide (chiavi di ABILITAZIONI), dai corsi del Personale. */
  abilitazioni?: string[];
  /** Ha l'app di cantiere (account collegato). */
  haApp?: boolean;
  telefono?: string | null;
  /** €/ora, solo per chi può vedere i costi. */
  costoOrario?: number | null;
}

export interface Consuntivo {
  stato: string;
  /** Commessa dove ha timbrato. */
  cantiereId: string | null;
  ore: number | null;
  rapportino: boolean;
}

export type RuoloPersona = "operaio" | "tecnico" | "altro";

const MANSIONI_TECNICHE = /(geometr|tecnic|direttor\w* (dei )?lavori|manutent|install|rilev|sopralluog|commercial|vendit|perit|architett|ingegner|progettist|assistenza|capocantier|caposquadr|posator|autista)/;

/**
 * Operai di cantiere (lavora_in_cantiere), tecnici che escono per sopralluoghi e
 * manutenzioni (dalla mansione, o perché hanno un sopralluogo o un'assistenza
 * quel giorno), il resto è ufficio o senza mansione.
 */
export function ruoloPersona(operaio: boolean, mansione: string | null | undefined, haUscite = false): RuoloPersona {
  if (operaio) return "operaio";
  if (haUscite || MANSIONI_TECNICHE.test((mansione ?? "").toLowerCase())) return "tecnico";
  return "altro";
}

/** «Mario  Rossi» e «rossi mario» sono la stessa persona (per abbinare per nome). */
export function chiaveNome(nome: string | null | undefined, cognome: string | null | undefined): string {
  return [nome, cognome].map((x) => (x ?? "").trim().toLowerCase()).filter(Boolean).sort().join(" ");
}

/** Un sopralluogo o un'assistenza in programma quel giorno. */
export interface UscitaGiorno {
  id: string;
  tipo: "sopralluogo" | "manutenzione";
  titolo: string;
  codice: string | null;
  orderId: string | null;
  indirizzo: string | null;
  inizio: string | null;
  fine: string | null;
  persone: string[];
  note: string | null;
  punto?: Punto | null;
}

export interface SquadraGiorno {
  id: string;
  nome: string;
  colore: string | null;
  responsabileId: string | null;
  componenti: string[];
}

export interface MezzoGiorno {
  id: string;
  nome: string;
  targa: string | null;
  /** Commessa a cui è assegnato in questo periodo. */
  orderId: string | null;
  /** Attrezzatura (betoniera, trabattello…) e non mezzo con targa. */
  attrezzatura?: boolean;
}

/** Squadra esterna o subappaltatore (external_teams). */
export interface EsternoGiorno {
  id: string;
  nome: string;
  colore: string | null;
  telefono: string | null;
}

/** Merce che arriva quel giorno (ordini ai fornitori). */
export interface MerceGiorno {
  id: string;
  numero: string;
  orderId: string | null;
  fornitore: string | null;
  giorno: string;
  /** In magazzino (da ritirare) o direttamente in cantiere. */
  magazzino: string | null;
  magazzinoIndirizzo: string | null;
  indirizzo: string | null;
}

export interface CommessaGiorno {
  id: string;
  codice: string | null;
  cliente: string | null;
  descrizione: string | null;
  indirizzo: string | null;
  inizio: string | null;
  dal?: string | null;
  al?: string | null;
  avanzamento?: number | null;
  telefono?: string | null;
  punto?: Punto | null;
}

export type Risorsa = { tipo: "persona" | "mezzo"; id: string };

export function nuovoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `i-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** «08:00:00» → «08:00»; tutto ciò che non è un'ora → null. */
export function ora(v: string | null | undefined): string | null {
  const m = v?.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function interventoDaCommessa(c: CommessaGiorno, extra: Partial<Intervento> = {}): Intervento {
  return {
    id: nuovoId(),
    tipo: "commessa",
    orderId: c.id,
    codice: c.codice,
    titolo: c.cliente || c.descrizione || c.codice || "Commessa",
    indirizzo: c.indirizzo,
    faseId: null,
    inizio: ora(c.inizio),
    fine: null,
    persone: [],
    capoId: null,
    mezzi: [],
    note: null,
    punto: c.punto ?? null,
    ...extra,
  };
}

/**
 * La giornata di partenza: un intervento per ogni commessa in calendario quel
 * giorno, con dentro chi ci è previsto con la squadra e i mezzi assegnati.
 * Chi è assente non viene messo da nessuna parte.
 */
export function proponiGiornata(input: {
  giorno: string;
  commesse: CommessaGiorno[];
  persone: PersonaGiorno[];
  squadre: SquadraGiorno[];
  mezzi: MezzoGiorno[];
  uscite?: UscitaGiorno[];
  /** Capocantiere della commessa (hr_profili.id), se c'è. */
  capi?: Map<string, string>;
}): Giornata {
  const perCommessa = new Map<string, Intervento>();
  for (const c of input.commesse) perCommessa.set(c.id, interventoDaCommessa(c));
  const squadraDi = new Map(input.squadre.map((s) => [s.id, s]));

  for (const p of input.persone) {
    if (p.assenza || !p.previstoOrderId) continue;
    const i = perCommessa.get(p.previstoOrderId);
    if (!i) continue;
    i.persone.push(p.id);
    const sq = p.squadraId ? squadraDi.get(p.squadraId) : undefined;
    if (sq?.responsabileId === p.id) i.capoId = p.id;
  }
  for (const m of input.mezzi) {
    const i = m.orderId ? perCommessa.get(m.orderId) : undefined;
    if (i) i.mezzi.push(m.id);
  }
  // Il capocantiere della commessa, se c'è quel giorno, fa da capo prima del responsabile di squadra.
  for (const [orderId, capo] of input.capi ?? []) {
    const i = perCommessa.get(orderId);
    if (i?.persone.includes(capo)) i.capoId = capo;
  }
  const uscite = (input.uscite ?? []).map((u): Intervento => ({
    id: nuovoId(),
    tipo: u.tipo,
    orderId: u.orderId,
    codice: u.codice,
    titolo: u.titolo,
    indirizzo: u.indirizzo,
    faseId: null,
    inizio: u.inizio,
    fine: u.fine,
    persone: u.persone,
    capoId: null,
    mezzi: [],
    note: u.note,
    fonteId: u.id,
    punto: u.punto ?? null,
  }));
  return { giorno: input.giorno, interventi: ordina([...perCommessa.values(), ...uscite]) };
}

/** Prima gli interventi con orario, in ordine di ora; poi gli altri come sono. */
export function ordina(interventi: Intervento[]): Intervento[] {
  // «Prima del cantiere» in testa, poi gli orari, poi la giornata, poi «dopo il cantiere».
  const fascia = (i: Intervento) => (i.inizio ? 1 : i.momento === "prima" ? 0 : i.momento === "dopo" ? 3 : 2);
  return interventi
    .map((i, pos) => ({ i, pos }))
    .sort((a, b) => {
      const fa = fascia(a.i);
      const fb = fascia(b.i);
      if (fa !== fb) return fa - fb;
      if (a.i.inizio && b.i.inizio) return a.i.inizio.localeCompare(b.i.inizio) || a.pos - b.pos;
      return a.pos - b.pos;
    })
    .map(({ i }) => i);
}

function campo(r: Risorsa): "persone" | "mezzi" {
  return r.tipo === "persona" ? "persone" : "mezzi";
}

/**
 * Trascinamento. Dall'elenco (da = null) AGGIUNGE: la persona resta disponibile
 * per altri interventi. Da un intervento all'altro SPOSTA, a meno di `copia`.
 * Verso l'elenco (a = null) TOGLIE.
 */
export function sposta(g: Giornata, r: Risorsa, da: string | null, a: string | null, copia = false): Giornata {
  if (da === a) return g;
  const k = campo(r);
  const interventi = g.interventi.map((i) => {
    let lista = i[k];
    let capoId = i.capoId;
    if (i.id === da && !copia) {
      lista = lista.filter((x) => x !== r.id);
      if (r.tipo === "persona" && capoId === r.id) capoId = null;
    }
    if (i.id === a && !lista.includes(r.id)) lista = [...lista, r.id];
    return lista === i[k] && capoId === i.capoId ? i : { ...i, [k]: lista, capoId };
  });
  return { ...g, interventi };
}

/** Tutta la squadra disponibile nell'intervento; il responsabile fa da capo se manca. */
export function aggiungiSquadra(g: Giornata, sq: SquadraGiorno, a: string, assenti: Set<string>): Giornata {
  const presenti = sq.componenti.filter((id) => !assenti.has(id));
  const resp = sq.responsabileId && !assenti.has(sq.responsabileId) ? sq.responsabileId : null;
  return {
    ...g,
    interventi: g.interventi.map((i) => {
      if (i.id !== a) return i;
      const persone = [...i.persone];
      for (const id of resp ? [resp, ...presenti] : presenti) if (!persone.includes(id)) persone.push(id);
      return { ...i, persone, capoId: i.capoId ?? resp };
    }),
  };
}

export function aggiorna(g: Giornata, id: string, patch: Partial<Intervento>): Giornata {
  const interventi = g.interventi.map((i) => (i.id === id ? { ...i, ...patch } : i));
  return { ...g, interventi: "inizio" in patch ? ordina(interventi) : interventi };
}

export function togliIntervento(g: Giornata, id: string): Giornata {
  return { ...g, interventi: g.interventi.filter((i) => i.id !== id) };
}

/** Copia gli interventi di un altro giorno (persone, mezzi, orari) su questo. */
export function copiaGiornata(da: Giornata, giorno: string, assenti: Set<string>): Giornata {
  return {
    giorno,
    interventi: da.interventi.map((i) => ({
      ...i,
      id: nuovoId(),
      persone: i.persone.filter((p) => !assenti.has(p)),
      capoId: i.capoId && !assenti.has(i.capoId) ? i.capoId : null,
    })),
  };
}

function minuti(h: string): number {
  const [a, b] = h.split(":").map(Number);
  return a * 60 + b;
}

/**
 * Due interventi si pestano i piedi? Senza orario non si può sapere: sì. Ma
 * «prima» o «dopo il cantiere» non si scontra con una giornata senza orario
 * (né con un orario), salvo due cose nello stesso momento.
 */
export function siSovrappongono(a: Intervento, b: Intervento): boolean {
  if (!a.inizio && !b.inizio && a.momento && b.momento) return a.momento === b.momento;
  if ((!a.inizio && a.momento) || (!b.inizio && b.momento)) return false;
  if (!a.inizio || !b.inizio) return true;
  const fa = a.fine ? minuti(a.fine) : minuti(a.inizio) + 60;
  const fb = b.fine ? minuti(b.fine) : minuti(b.inizio) + 60;
  return minuti(a.inizio) < fb && minuti(b.inizio) < fa;
}

export type Avviso =
  | { tipo: "assente"; personaId: string; interventoId: string }
  | { tipo: "documenti"; personaId: string; interventoId: string }
  | { tipo: "mancano"; interventoId: string; mancano: number }
  | { tipo: "abilitazione"; interventoId: string; manca: string }
  | { tipo: "senza_capo"; interventoId: string; proposto: string | null }
  | { tipo: "doppio_persona"; personaId: string; interventi: [string, string] }
  | { tipo: "doppio_mezzo"; mezzoId: string; interventi: [string, string] }
  | { tipo: "vuoto"; interventoId: string };

export function avvisi(g: Giornata, assenti: Set<string>, senzaDocumenti: Set<string> = new Set(), abilitazioniDi?: Map<string, string[]>): Avviso[] {
  const out: Avviso[] = [];
  if (abilitazioniDi) {
    for (const i of g.interventi) {
      for (const k of i.richiede ?? []) {
        if (i.persone.length && !i.persone.some((p) => abilitazioniDi.get(p)?.includes(k))) out.push({ tipo: "abilitazione", interventoId: i.id, manca: k });
      }
    }
  }
  const doppi = (k: "persone" | "mezzi") => {
    const dove = new Map<string, Intervento[]>();
    for (const i of g.interventi) for (const id of i[k]) dove.set(id, [...(dove.get(id) ?? []), i]);
    for (const [id, lista] of dove) {
      for (let x = 0; x < lista.length; x++) {
        for (let y = x + 1; y < lista.length; y++) {
          if (!siSovrappongono(lista[x], lista[y])) continue;
          const coppia: [string, string] = [lista[x].id, lista[y].id];
          out.push(k === "persone" ? { tipo: "doppio_persona", personaId: id, interventi: coppia } : { tipo: "doppio_mezzo", mezzoId: id, interventi: coppia });
        }
      }
    }
  };
  for (const i of g.interventi) {
    if (i.persone.length === 0 && !(i.esterni?.length)) out.push({ tipo: "vuoto", interventoId: i.id });
    for (const p of i.persone) if (assenti.has(p)) out.push({ tipo: "assente", personaId: p, interventoId: i.id });
    for (const p of i.persone) if (senzaDocumenti.has(p)) out.push({ tipo: "documenti", personaId: p, interventoId: i.id });
    if (i.servono && i.persone.length > 0 && i.persone.length < i.servono) out.push({ tipo: "mancano", interventoId: i.id, mancano: i.servono - i.persone.length });
  }
  doppi("persone");
  doppi("mezzi");
  return out;
}

/** In quanti interventi è ciascuna risorsa (per il numerino nell'elenco). */
export function conteggi(g: Giornata): { persone: Map<string, number>; mezzi: Map<string, number> } {
  const persone = new Map<string, number>();
  const mezzi = new Map<string, number>();
  for (const i of g.interventi) {
    for (const p of i.persone) persone.set(p, (persone.get(p) ?? 0) + 1);
    for (const m of i.mezzi) mezzi.set(m, (mezzi.get(m) ?? 0) + 1);
  }
  return { persone, mezzi };
}

/** Ora e giorno italiani di un istante (timestamptz): «2026-11-27», «09:30». */
export function giornoOraRoma(iso: string): { giorno: string; ora: string } {
  const d = new Date(iso);
  const giorno = d.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const ora = d.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hour12: false });
  return { giorno, ora };
}

/**
 * Giorno n di m del cantiere (1 = primo giorno); `ritardo` = giorni oltre la
 * fine prevista; `traGiorni` = quanti giorni mancano all'inizio. null se manca l'inizio.
 */
export function giornoDelCantiere(giorno: string, dal: string | null, al: string | null): { n: number; di: number | null; ritardo: number; traGiorni: number } | null {
  if (!dal) return null;
  const g = (x: string) => Date.UTC(+x.slice(0, 4), +x.slice(5, 7) - 1, +x.slice(8, 10)) / 86_400_000;
  const n = g(giorno) - g(dal) + 1;
  const di = al ? g(al) - g(dal) + 1 : null;
  return { n: Math.max(n, 0), di, ritardo: di != null && n > di ? n - di : 0, traGiorni: n < 1 ? 1 - n : 0 };
}

/** «Giorno 3 di 10», «In ritardo di 4 gg», «Inizia tra 2 gg». */
export function testoGiornoCantiere(x: ReturnType<typeof giornoDelCantiere>): string | null {
  if (!x) return null;
  if (x.traGiorni > 0) return `Inizia tra ${x.traGiorni} gg`;
  if (x.ritardo > 0) return `Oltre la fine di ${x.ritardo} gg`;
  return `Giorno ${x.n}${x.di ? ` di ${x.di}` : ""}`;
}

/** Giorno ± n come AAAA-MM-GG, senza passare dal fuso del browser. */
export function spostaGiorno(giorno: string, n: number): string {
  const [y, m, d] = giorno.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/**
 * Orario scritto a mano, come lo direbbe un capo: «8», «8:30», «830»,
 * «8-12», «8.30 - 12.15». null = non si capisce.
 */
export function leggiOrario(testo: string): { inizio: string; fine: string | null } | null {
  const parti = testo.trim().split(/\s*[-–àa]\s*/).filter(Boolean);
  if (parti.length === 0 || parti.length > 2) return null;
  const una = (t: string): string | null => {
    const s = t.replace(/[.,h]/g, ":").replace(/:$/, "");
    const m = s.match(/^(\d{1,2})(?::?(\d{2}))?$/);
    if (!m) return null;
    return ora(`${m[1]}:${m[2] ?? "00"}`);
  };
  const inizio = una(parti[0]);
  if (!inizio) return null;
  if (parti.length === 1) return { inizio, fine: null };
  const fine = una(parti[1]);
  if (!fine || fine <= inizio) return null;
  return { inizio, fine };
}

/** «08:00» + 90 minuti → «09:30» (si ferma a 23:59). */
export function aggiungiMinuti(h: string, n: number): string {
  const t = Math.min(minuti(h) + n, 23 * 60 + 59);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}


/** Documenti scaduti quel giorno: già scaduti, o la prossima scadenza cade entro il giorno. */
export function documentiScaduti(p: PersonaGiorno, giorno: string): boolean {
  const d = p.documenti;
  if (!d) return false;
  return d.scaduti > 0 || (!!d.prossima && d.prossima.slice(0, 10) <= giorno);
}

/** I prossimi n giorni lavorativi (lunedì–venerdì) dopo il giorno dato. */
export function giorniLavorativiDopo(giorno: string, n: number): string[] {
  const out: string[] = [];
  let g = giorno;
  while (out.length < n) {
    g = spostaGiorno(g, 1);
    const dow = new Date(`${g}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(g);
  }
  return out;
}

/** La stessa giornata copiata su altri giorni (chi è assente quel giorno resta a casa). */
export function ripetiSuGiorni(g: Giornata, giorni: string[], assentiDi: (giorno: string) => Set<string> = () => new Set()): Giornata[] {
  return giorni.filter((x) => x !== g.giorno).map((x) => copiaGiornata(g, x, assentiDi(x)));
}

/** La giornata di ogni persona: i suoi interventi in ordine di ora (senza orario in fondo). */
export function agendaPersone(g: Giornata): Map<string, Intervento[]> {
  const out = new Map<string, Intervento[]>();
  for (const i of ordina(g.interventi)) for (const p of i.persone) out.set(p, [...(out.get(p) ?? []), i]);
  return out;
}

export type EsitoSera = "come_previsto" | "altrove" | "presente" | "non_timbrato" | "assente";

/** Previsto contro realtà, per una persona in un intervento. null = niente da confrontare (giorno futuro). */
export function esitoSera(i: Intervento, c: Consuntivo | null | undefined): EsitoSera | null {
  if (!c) return null;
  if (c.stato === "assente" || c.stato === "riposo") return "assente";
  if (c.stato === "non_timbrato") return "non_timbrato";
  if (!c.cantiereId) return "presente";
  if (i.orderId && c.cantiereId === i.orderId) return "come_previsto";
  return i.orderId ? "altrove" : "presente";
}

/** Distanza in linea d'aria, in metri. */
export function metriTra(a: Punto, b: Punto): number {
  const r = 6_371_000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

/**
 * Il giro di una persona: gli interventi con orario nel loro ordine; quelli
 * senza orario messi dopo, ciascuno il più vicino al precedente.
 */
export function giro(interventi: Intervento[]): Intervento[] {
  const conOra = interventi.filter((i) => i.inizio).sort((a, b) => a.inizio!.localeCompare(b.inizio!));
  const senza = interventi.filter((i) => !i.inizio);
  const out = [...conOra];
  while (senza.length) {
    const ultimo = out[out.length - 1]?.punto;
    let k = 0;
    if (ultimo) {
      let meglio = Infinity;
      senza.forEach((i, idx) => {
        const d = i.punto ? metriTra(ultimo, i.punto) : Infinity;
        if (d < meglio) { meglio = d; k = idx; }
      });
    }
    out.push(senza.splice(k, 1)[0]);
  }
  return out;
}

/** Chilometri in linea d'aria di un giro (solo le tappe con posizione). */
export function kmGiro(tappe: Intervento[]): number {
  const punti = tappe.map((t) => t.punto).filter((p): p is Punto => !!p);
  let m = 0;
  for (let k = 1; k < punti.length; k++) m += metriTra(punti[k - 1], punti[k]);
  return Math.round(m / 100) / 10;
}


/** Abilitazioni riconosciute dai titoli dei corsi di sicurezza del Personale. */
export const ABILITAZIONI: { chiave: string; nome: string; regola: RegExp }[] = [
  { chiave: "gru", nome: "Gru", regola: /gru/i },
  { chiave: "mmt", nome: "Escavatori e terne", regola: /escavator|terne|pale caricatrici|movimento terra|\bmmt\b/i },
  { chiave: "ple", nome: "Piattaforme (PLE)", regola: /\bple\b|piattaform/i },
  { chiave: "carrelli", nome: "Carrelli elevatori", regola: /carrell|muletto/i },
  { chiave: "ponteggi", nome: "Ponteggi", regola: /ponteg/i },
  { chiave: "quota", nome: "Lavori in quota / funi", regola: /quota|funi|anticaduta|dpi.*terza/i },
  { chiave: "confinati", nome: "Spazi confinati", regola: /confinat/i },
  { chiave: "preposto", nome: "Preposto", regola: /prepost/i },
  { chiave: "primo_soccorso", nome: "Primo soccorso", regola: /primo soccorso/i },
  { chiave: "antincendio", nome: "Antincendio", regola: /antincendio/i },
];

export function abilitazioniDaTitoli(titoli: string[]): string[] {
  return ABILITAZIONI.filter((a) => titoli.some((t) => a.regola.test(t))).map((a) => a.chiave);
}

/** Un intervento inserito (o sostituito, se la stessa commessa c'è già) in una giornata. */
export function unisciIntervento(g: Giornata, i: Intervento, assenti: Set<string> = new Set()): Giornata {
  const copia: Intervento = { ...i, id: nuovoId(), persone: i.persone.filter((p) => !assenti.has(p)), capoId: i.capoId && !assenti.has(i.capoId) ? i.capoId : null };
  // Lo stesso intervento: stessa commessa (e lavorazione), oppure — senza commessa — stesso tipo e titolo.
  const k = g.interventi.findIndex((x) => x.tipo === i.tipo && (i.orderId
    ? x.orderId === i.orderId && (x.faseId ?? null) === (i.faseId ?? null)
    : !x.orderId && x.titolo.trim().toLowerCase() === i.titolo.trim().toLowerCase()));
  if (k < 0) return { ...g, interventi: ordina([...g.interventi, copia]) };
  const interventi = [...g.interventi];
  interventi[k] = { ...copia, id: interventi[k].id };
  return { ...g, interventi };
}

/** Sposta l'orario di un intervento di n minuti (passo di 15), dentro la giornata. Senza orario parte dalle 8. */
export function spostaOrario(i: Intervento, delta: number, inizioSenzaOra = "08:00"): Pick<Intervento, "inizio" | "fine"> {
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const passo = Math.round(delta / 15) * 15;
  const da = i.inizio ? m(i.inizio) : m(inizioSenzaOra);
  const durata = i.inizio && i.fine ? m(i.fine) - m(i.inizio) : i.inizio ? 0 : 60;
  const nuovo = Math.min(Math.max(da + (i.inizio ? passo : 0), 5 * 60), 22 * 60);
  return { inizio: fmt(nuovo), fine: durata > 0 ? fmt(Math.min(nuovo + durata, 23 * 60 + 45)) : null };
}

/** Allunga o accorcia la fine (passo di 15, almeno 15 minuti). */
export function cambiaDurata(i: Intervento, delta: number): Pick<Intervento, "fine"> {
  if (!i.inizio) return { fine: i.fine };
  const m = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const fine = i.fine ? m(i.fine) : m(i.inizio) + 60;
  return { fine: fmt(Math.min(Math.max(fine + Math.round(delta / 15) * 15, m(i.inizio) + 15), 23 * 60 + 45)) };
}

export interface Suggerimento {
  interventoId: string;
  personaId: string;
  motivo: string;
}

/**
 * «Riempi i buchi»: per ogni intervento a cui mancano persone, propone chi è
 * libero. Prima la stessa squadra di chi c'è già, poi chi è previsto lì con la
 * sua squadra, poi chi ha l'abilitazione richiesta, poi il più vicino al suo
 * ultimo intervento. Mai assenti, mai documenti scaduti, mai doppioni d'orario.
 * Senza «servono» si propone una persona solo agli interventi vuoti.
 */
export function proponiRiempimento(input: {
  giornata: Giornata;
  persone: PersonaGiorno[];
  squadraDi: Map<string, string | null>;
  senzaDocumenti: Set<string>;
  puntoDi: (i: Intervento) => Punto | null;
}): Suggerimento[] {
  const { giornata, persone, squadraDi, senzaDocumenti, puntoDi } = input;
  const out: Suggerimento[] = [];
  const occupati = new Map<string, Intervento[]>();
  for (const i of giornata.interventi) for (const p of i.persone) occupati.set(p, [...(occupati.get(p) ?? []), i]);
  const candidati = persone.filter((p) => !p.assenza && !senzaDocumenti.has(p.id) && p.ruolo !== "altro");

  const bisogni = giornata.interventi
    .filter((i) => i.tipo !== "commissione" || i.persone.length === 0)
    // Un intervento affidato a un subappaltatore non chiede i nostri, se non si è detto quanti ne servono.
    .map((i) => ({ i, servono: i.servono ? i.servono - i.persone.length : i.persone.length === 0 && !(i.esterni?.length) ? 1 : 0 }))
    .filter((b) => b.servono > 0);

  for (const { i, servono } of bisogni) {
    const squadreQui = new Set(i.persone.map((p) => squadraDi.get(p)).filter(Boolean));
    const qui = puntoDi(i);
    const punteggio = (p: PersonaGiorno): { voto: number; motivo: string } | null => {
      const sue = occupati.get(p.id) ?? [];
      if (sue.some((x) => x.id === i.id || siSovrappongono(x, i))) return null;
      let voto = 0;
      const motivi: string[] = [];
      if (sue.length === 0) { voto += 30; motivi.push("libero"); }
      const sq = squadraDi.get(p.id);
      if (sq && squadreQui.has(sq)) { voto += 40; motivi.push("stessa squadra"); }
      if (i.orderId && p.previstoOrderId === i.orderId) { voto += 50; motivi.push("previsto qui con la squadra"); }
      for (const k of i.richiede ?? []) if (p.abilitazioni?.includes(k)) { voto += 25; motivi.push(`ha ${ABILITAZIONI.find((a) => a.chiave === k)?.nome ?? k}`); }
      if (i.tipo === "commessa" && p.ruolo === "operaio") voto += 10;
      if ((i.tipo === "sopralluogo" || i.tipo === "manutenzione") && p.ruolo === "tecnico") { voto += 20; motivi.push("tecnico"); }
      const ultimo = sue.map(puntoDi).filter((x): x is Punto => !!x).at(-1);
      if (qui && ultimo) {
        const km = metriTra(ultimo, qui) / 1000;
        voto += Math.max(0, 20 - km);
        if (km < 10) motivi.push(`a ${Math.round(km)} km dall'altro intervento`);
      }
      return { voto, motivo: motivi.join(", ") || "disponibile" };
    };
    const scelti = candidati
      .map((p) => ({ p, s: punteggio(p) }))
      .filter((x): x is { p: PersonaGiorno; s: { voto: number; motivo: string } } => !!x.s)
      .sort((a, b) => b.s.voto - a.s.voto)
      .slice(0, servono);
    for (const { p, s } of scelti) {
      out.push({ interventoId: i.id, personaId: p.id, motivo: s.motivo });
      occupati.set(p.id, [...(occupati.get(p.id) ?? []), i]);
    }
  }
  return out;
}

/** Il programma di una persona come messaggio da mandare (WhatsApp, SMS). */
export function testoProgramma(nome: string, giornoTesto: string, interventi: Intervento[], nomeDi: (id: string) => string, mezzoDi: (id: string) => string): string {
  const righe = interventi.map((i) => {
    const ora = i.inizio ? `${i.inizio}${i.fine ? `-${i.fine}` : ""}` : "In giornata";
    const con = i.persone.map(nomeDi).filter((n) => !n.startsWith(nome)).join(", ");
    const parti = [`• ${ora} ${i.titolo}`, i.indirizzo ? `  ${i.indirizzo}` : null, con ? `  con ${con}` : null, i.mezzi.length ? `  mezzo: ${i.mezzi.map(mezzoDi).join(", ")}` : null, i.note ? `  ${i.note}` : null];
    return parti.filter(Boolean).join("\n");
  });
  return `Ciao ${nome}, ${giornoTesto}:\n${righe.join("\n")}`;
}


/**
 * Cantiere con due o più persone e nessun capo: chi proporre. Prima il
 * capocantiere della commessa se è lì, poi il responsabile di una squadra
 * presente, poi chi della squadra più numerosa compare per primo.
 */
export function capoMancante(i: Intervento, capoCommessa: string | null | undefined, squadre: SquadraGiorno[]): string | null {
  if (i.capoId || i.persone.length < 2 || i.tipo !== "commessa") return null;
  if (capoCommessa && i.persone.includes(capoCommessa)) return capoCommessa;
  const qui = squadre
    .map((s) => ({ s, n: s.componenti.filter((c) => i.persone.includes(c)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  for (const { s } of qui) if (s.responsabileId && i.persone.includes(s.responsabileId)) return s.responsabileId;
  return qui[0] ? i.persone.find((p) => qui[0].s.componenti.includes(p)) ?? i.persone[0] : i.persone[0];
}

/** Sposta un gruppo di persone (es. i componenti di una squadra) da un intervento all'altro; il capo segue se è del gruppo. */
export function spostaGruppo(g: Giornata, persone: string[], da: string, a: string): Giornata {
  if (da === a || persone.length === 0) return g;
  const origine = g.interventi.find((i) => i.id === da);
  const capoSegue = !!origine?.capoId && persone.includes(origine.capoId);
  return {
    ...g,
    interventi: g.interventi.map((i) => {
      if (i.id === da) return { ...i, persone: i.persone.filter((p) => !persone.includes(p)), capoId: capoSegue ? null : i.capoId };
      if (i.id === a) {
        const nuove = [...i.persone, ...persone.filter((p) => !i.persone.includes(p))];
        return { ...i, persone: nuove, capoId: i.capoId ?? (capoSegue ? origine!.capoId : null) };
      }
      return i;
    }),
  };
}

/** Una tappa del giro con il viaggio per arrivarci. */
export interface TappaViaggio {
  intervento: Intervento;
  /** Km dalla tappa prima (o dalla sede). null = manca una posizione. */
  km: number | null;
  /** Minuti di strada stimati. */
  minuti: number | null;
  /** «07:25»: quando partire dalla tappa prima per arrivare all'ora giusta. */
  partenza: string | null;
  /** Minuti che mancano per arrivare puntuali (0 = ci sta). */
  ritardo: number;
}

/** Strada ≈ linea d'aria × 1,3; in media 45 km/h fra cantieri. Stime, non navigatore. */
export const FATTORE_STRADA = 1.3;
export const KMH_MEDI = 45;

function minutiDi(h: string) {
  return Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
}
function oraDiMinuti(n: number) {
  const m = ((n % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * I viaggi di un giro: per ogni tappa la strada dalla precedente (o dalla
 * sede), quando partire e se l'orario regge. Le tappe senza posizione non
 * spezzano il conto: il viaggio dopo riparte dall'ultima posizione nota.
 */
/** Oltre questa distanza dalla sede al primo cantiere si è in trasferta: il giro parte dal cantiere. */
export const KM_TRASFERTA = 150;

/** Un tratto di strada vero (metri e secondi), dal servizio dei percorsi. */
export interface TrattoStrada { metri: number; secondi: number }

/**
 * I punti del giro nell'ordine in cui si percorrono: sede (se non in trasferta),
 * le tappe con una posizione, di nuovo la sede. È la richiesta per i percorsi
 * stradali: il tratto k della risposta è il k-esimo viaggio di viaggiDelGiro.
 */
export function puntiDelGiro(tappe: Intervento[], sedeData: Punto | null): Punto[] {
  const posizioni = tappe.map((t) => t.punto).filter((p): p is Punto => !!p);
  if (!posizioni.length) return [];
  const trasferta = !!sedeData && metriTra(sedeData, posizioni[0]) / 1000 > KM_TRASFERTA;
  const sede = trasferta ? null : sedeData;
  // Due tappe nello stesso posto (il magazzino nella sede, due lavori nello
  // stesso cantiere) non sono un viaggio: un punto solo.
  const out: Punto[] = [];
  for (const p of sede ? [sede, ...posizioni, sede] : posizioni) {
    if (!out.length || !stessoPosto(out[out.length - 1], p)) out.push(p);
  }
  return out.length >= 2 ? out : [];
}

/** Entro 150 metri è lo stesso posto: nessun viaggio fra i due. */
export function stessoPosto(a: Punto, b: Punto): boolean {
  return metriTra(a, b) < 150;
}

export function viaggiDelGiro(tappe: Intervento[], sedeData: Punto | null, strade?: (TrattoStrada | null)[] | null): {
  tappe: TappaViaggio[]; km: number; minuti: number; rientroKm: number | null; trasferta: boolean;
  /** Minuti di strada per rientrare in sede (null = nessun rientro). */
  rientroMinuti: number | null;
  /** «17:40»: quando si è di nuovo in sede, se l'ultima tappa ha un orario. */
  rientroAlle: string | null;
  /** true se tutti i tratti vengono dalla strada vera (nessuna stima). */
  stradale: boolean;
} {
  const out: TappaViaggio[] = [];
  const primo = tappe.find((t) => t.punto)?.punto ?? null;
  const trasferta = !!sedeData && !!primo && metriTra(sedeData, primo) / 1000 > KM_TRASFERTA;
  const sede = trasferta ? null : sedeData;
  let ultimo = sede;
  let finePrecedente: number | null = null;
  let km = 0;
  let minuti = 0;
  let tratto = 0;
  let stimati = 0;
  // Un tratto: dalla strada vera se c'è, altrimenti la stima in linea d'aria.
  const viaggio = (da: Punto, a: Punto): { km: number; minuti: number } => {
    const vero = strade?.[tratto++];
    if (vero && vero.metri >= 0 && vero.secondi >= 0) {
      return { km: Math.round(vero.metri / 100) / 10, minuti: Math.max(1, Math.round(vero.secondi / 60)) };
    }
    stimati++;
    const k = Math.round((metriTra(da, a) / 1000) * FATTORE_STRADA * 10) / 10;
    return { km: k, minuti: Math.max(5, Math.round((k / KMH_MEDI) * 60)) };
  };
  for (const i of tappe) {
    const qui = i.punto ?? null;
    let strada: { km: number; minuti: number } | null = null;
    if (ultimo && qui && stessoPosto(ultimo, qui)) {
      strada = { km: 0, minuti: 0 };
    } else if (ultimo && qui) {
      strada = viaggio(ultimo, qui);
      km += strada.km;
      minuti += strada.minuti;
    }
    const inizio = i.inizio ? minutiDi(i.inizio) : null;
    const partenza = inizio != null && strada ? oraDiMinuti(inizio - strada.minuti) : null;
    const ritardo = inizio != null && strada && finePrecedente != null ? Math.max(0, finePrecedente + strada.minuti - inizio) : 0;
    out.push({ intervento: i, km: strada?.km ?? null, minuti: strada?.minuti ?? null, partenza, ritardo });
    if (qui) ultimo = qui;
    finePrecedente = i.fine ? minutiDi(i.fine) : inizio != null ? inizio + 60 : finePrecedente;
  }
  const rientro = sede && ultimo && ultimo !== sede && !stessoPosto(ultimo, sede) ? viaggio(ultimo, sede) : null;
  // L'ora del rientro: dalla fine dell'ultima tappa che ha un orario.
  const rientroAlle = rientro && finePrecedente != null ? oraDiMinuti(finePrecedente + rientro.minuti) : null;
  return {
    tappe: out,
    km: Math.round((km + (rientro?.km ?? 0)) * 10) / 10,
    minuti: minuti + (rientro?.minuti ?? 0),
    rientroKm: rientro?.km ?? null,
    rientroMinuti: rientro?.minuti ?? null,
    rientroAlle,
    trasferta,
    stradale: tratto > 0 && stimati === 0,
  };
}

/** Il giro nel navigatore del telefono (Google Maps: partenza, fino a 9 tappe, arrivo). */
export function linkNavigatore(punti: Punto[]): string | null {
  if (punti.length < 2) return null;
  const c = (p: Punto) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const tappe = punti.slice(1, -1).slice(0, 9);
  const q = new URLSearchParams({ api: "1", origin: c(punti[0]), destination: c(punti[punti.length - 1]), travelmode: "driving" });
  if (tappe.length) q.set("waypoints", tappe.map(c).join("|"));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/**
 * Carico e scarico in magazzino «prima»/«dopo» il cantiere stanno dentro la scheda
 * del cantiere a cui servono, non in una scheda loro (26/11/2026): una commissione
 * con momento, le cui persone quel giorno sono tutte in UN SOLO intervento senza
 * momento, si aggancia a quello. Se le persone stanno in più cantieri (o in
 * nessuno) resta da sola: non si indovina.
 * Restituisce cantiere → commissioni agganciate (prima quelle «prima»).
 */
export function commissioniAgganciate(interventi: Intervento[]): Map<string, Intervento[]> {
  const out = new Map<string, Intervento[]>();
  for (const c of interventi) {
    if (c.tipo !== "commissione" || !c.momento || c.persone.length === 0) continue;
    const dove = interventi.filter((x) => x.id !== c.id && !x.momento && c.persone.every((p) => x.persone.includes(p)));
    if (dove.length !== 1) continue;
    const lista = out.get(dove[0].id) ?? [];
    lista.push(c);
    out.set(dove[0].id, lista);
  }
  for (const lista of out.values()) lista.sort((a, b) => (a.momento === b.momento ? 0 : a.momento === "prima" ? -1 : 1));
  return out;
}

/** Dove si trova un giro a una certa ora (cursore dell'ora sulla mappa). */
export interface PosizioneAlle {
  punto: Punto;
  stato: "sede" | "viaggio" | "cantiere" | "attesa" | "rientrato";
  /** In cantiere: dove. In viaggio: verso dove (null = rientro in sede). */
  intervento: Intervento | null;
  /** In viaggio: a che ora arriva. */
  arrivo: string | null;
}

function lungoLaLinea(linea: Punto[], frazione: number): Punto {
  if (linea.length < 2) return linea[0];
  const pezzi = linea.slice(1).map((b, k) => metriTra(linea[k], b));
  let resto = pezzi.reduce((s, x) => s + x, 0) * Math.min(Math.max(frazione, 0), 1);
  for (let k = 0; k < pezzi.length; k++) {
    if (resto <= pezzi[k] || k === pezzi.length - 1) {
      const f = pezzi[k] ? resto / pezzi[k] : 0;
      return { lat: linea[k].lat + (linea[k + 1].lat - linea[k].lat) * f, lng: linea[k].lng + (linea[k + 1].lng - linea[k].lng) * f };
    }
    resto -= pezzi[k];
  }
  return linea[linea.length - 1];
}

/**
 * La posizione di un giro al minuto `minuto` del giorno, dai suoi viaggi
 * (viaggiDelGiro), dai punti (puntiDelGiro) e, se ci sono, dalle geometrie
 * stradali di ogni tratto (allineate ai punti). Si parte all'ultimo momento utile
 * («parti alle»), si sta in cantiere dall'inizio alla fine, si rientra subito dopo.
 * null se il giro non ha punti.
 */
export function doveAlle(viaggi: ReturnType<typeof viaggiDelGiro>, punti: Punto[], geometrie: (Punto[] | undefined)[] | undefined, minuto: number): PosizioneAlle | null {
  if (!punti.length) return null;
  type Pezzo = { da: number; a: number; linea: Punto[]; verso: Intervento | null } | { da: number; a: number; punto: Punto; qui: Intervento };
  const pezzi: Pezzo[] = [];
  let tratto = 0;
  let qui = punti[0];
  let liberoDa: number | null = null;
  for (const t of viaggi.tappe) {
    const p = t.intervento.punto;
    if (!p) continue;
    const inizio = t.intervento.inizio ? minutiDi(t.intervento.inizio) : null;
    if (t.km != null && t.km > 0 && t.minuti != null) {
      const arriva = inizio ?? (liberoDa != null ? liberoDa + t.minuti : null);
      const linea = geometrie?.[tratto]?.length ? geometrie[tratto]! : [punti[tratto], punti[tratto + 1] ?? p];
      if (arriva != null) pezzi.push({ da: arriva - t.minuti, a: arriva, linea, verso: t.intervento });
      tratto++;
    }
    qui = p;
    const da = inizio ?? liberoDa;
    const a = t.intervento.fine ? minutiDi(t.intervento.fine) : da != null ? da + 60 : null;
    if (da != null && a != null) pezzi.push({ da, a, punto: p, qui: t.intervento });
    if (a != null) liberoDa = a;
  }
  if (viaggi.rientroMinuti && liberoDa != null && punti.length >= 2) {
    const linea = geometrie?.[tratto]?.length ? geometrie[tratto]! : [qui, punti[punti.length - 1]];
    pezzi.push({ da: liberoDa, a: liberoDa + viaggi.rientroMinuti, linea, verso: null });
  }
  if (!pezzi.length) return { punto: punti[0], stato: "sede", intervento: null, arrivo: null };
  if (minuto < pezzi[0].da) return { punto: punti[0], stato: "sede", intervento: null, arrivo: null };
  let ultimo: Punto = punti[0];
  let dove: Intervento | null = null;
  for (const x of pezzi) {
    if (minuto >= x.da && minuto <= x.a) {
      if ("linea" in x) {
        return { punto: lungoLaLinea(x.linea, (minuto - x.da) / Math.max(1, x.a - x.da)), stato: "viaggio", intervento: x.verso, arrivo: oraDiMinuti(x.a) };
      }
      return { punto: x.punto, stato: "cantiere", intervento: x.qui, arrivo: null };
    }
    if (minuto > x.a) {
      ultimo = "linea" in x ? x.linea[x.linea.length - 1] : x.punto;
      dove = "linea" in x ? x.verso : x.qui;
    }
  }
  const finito = minuto > pezzi[pezzi.length - 1].a;
  return { punto: ultimo, stato: finito && viaggi.rientroMinuti ? "rientrato" : "attesa", intervento: finito && viaggi.rientroMinuti ? null : dove, arrivo: null };
}
