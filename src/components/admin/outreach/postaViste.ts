/**
 * La Posta dell'Outreach divisa per brand e per tipo di risposta (22/09/2026).
 *
 * Florin: «non riesco a dividere le email dei brand, capire le risposte, e se
 * clicco su una mail poi non riesco a tornare indietro». In 24 ore partono più
 * di mille email: la lista caricava le ultime 500 inviate più le risposte, e
 * le 57 risposte vere (di cui un terzo automatiche) finivano sotto centinaia
 * di «Tu: …», tutte insieme per i tre brand.
 *
 * Qui solo logica pura, senza import: che tipo è una conversazione, se aspetta
 * una nostra risposta, i filtri della lista e i contatori per brand. Provata da
 * src/test/logic/postaViste.test.ts.
 */

/**
 * Gli intenti dei risponditori automatici. «Fuori sede» (out_of_office) resta
 * fra le risposte vere: è anche il bottone «Dopo», cioè una persona che dice
 * «non ora».
 */
export const INTENTI_AUTOMATICI: ReadonlySet<string> = new Set(["auto_reply"]);

/** Risposte che non chiedono una nostra risposta: un no, una disiscrizione. */
export const INTENTI_SENZA_RISPOSTA: ReadonlySet<string> = new Set(["not_interested", "unsubscribe"]);

/** Conversazioni senza brand (casella senza brand, risposte vecchie). */
export const SENZA_BRAND = "__senza_brand__";

export interface MessaggioPosta {
  direction: "out" | "in";
  intent: string | null;
}

/**
 * - "risposta": c'è almeno una risposta scritta da una persona;
 * - "automatica": sono arrivate solo risposte automatiche;
 * - "inviata": abbiamo solo scritto noi.
 */
export type TipoConversazione = "risposta" | "automatica" | "inviata";

export function eAutomatica(m: MessaggioPosta): boolean {
  return m.direction === "in" && !!m.intent && INTENTI_AUTOMATICI.has(m.intent);
}

export function tipoConversazione(messaggi: MessaggioPosta[]): TipoConversazione {
  const arrivati = messaggi.filter((m) => m.direction === "in");
  if (arrivati.length === 0) return "inviata";
  return arrivati.some((m) => !eAutomatica(m)) ? "risposta" : "automatica";
}

/** Indice dell'ultima risposta scritta da una persona (messaggi in ordine di tempo), o -1. */
function ultimaRispostaVera(messaggi: MessaggioPosta[]): number {
  for (let i = messaggi.length - 1; i >= 0; i--) {
    if (messaggi[i].direction === "in" && !eAutomatica(messaggi[i])) return i;
  }
  return -1;
}

/**
 * La persona ha scritto e noi non le abbiamo ancora risposto. Un no o una
 * disiscrizione non aspettano niente. I messaggi vanno in ordine di tempo.
 */
export function daRispondere(messaggi: MessaggioPosta[]): boolean {
  const i = ultimaRispostaVera(messaggi);
  if (i < 0) return false;
  const intent = messaggi[i].intent;
  if (intent && INTENTI_SENZA_RISPOSTA.has(intent)) return false;
  return !messaggi.slice(i + 1).some((m) => m.direction === "out");
}

/** Dopo l'ultima risposta della persona c'è una nostra email. */
export function abbiamoRisposto(messaggi: MessaggioPosta[]): boolean {
  const i = ultimaRispostaVera(messaggi);
  return i >= 0 && messaggi.slice(i + 1).some((m) => m.direction === "out");
}

/** Una conversazione per brand e per persona: gli stessi contatti ricevono più brand. */
export function chiaveConversazione(brandId: string | null, contactId: string | null, email: string | null): string {
  const chi = contactId ?? (email ? `email:${email.toLowerCase()}` : "sconosciuto");
  return `${brandId ?? SENZA_BRAND}|${chi}`;
}

// ── Filtri e contatori della lista ──────────────────────────────────────────

export type VistaPosta = "risposte" | "automatiche" | "inviate" | "archiviate";
export type FiltroRisposte = "tutte" | "da_leggere" | "da_rispondere" | "interessati" | "posticipate";

/** Quello che serve ai filtri di una conversazione. */
export interface ConversazionePosta {
  brandId: string | null;
  tipo: TipoConversazione;
  unread: boolean;
  archived: boolean;
  snoozedUntil: string | null;
  lastIntent: string | null;
  daRispondere: boolean;
  senderAccountIds: string[];
  sequenceIds: string[];
  lastAt: string | null;
  /** Nome, email e azienda in minuscolo, per la ricerca. */
  testoRicerca: string;
}

export interface FiltriPosta {
  vista: VistaPosta;
  filtro: FiltroRisposte;
  /** null = tutti i brand; SENZA_BRAND = quelle senza brand. */
  brand: string | null;
  casellaId?: string | null;
  sequenzaId?: string | null;
  /** Ultima attività da questo istante (epoch ms), o null. */
  daQuando?: number | null;
  ricerca?: string;
}

export function delBrand(c: Pick<ConversazionePosta, "brandId">, brand: string | null): boolean {
  if (brand == null) return true;
  return (c.brandId ?? SENZA_BRAND) === brand;
}

function nellaVista(c: ConversazionePosta, vista: VistaPosta): boolean {
  if (vista === "archiviate") return c.archived;
  if (c.archived) return false;
  if (vista === "risposte") return c.tipo === "risposta";
  if (vista === "automatiche") return c.tipo === "automatica";
  return c.tipo === "inviata";
}

/**
 * Le posticipate spariscono dalle risposte finché non scadono, tranne sotto
 * «Posticipate». Nelle altre viste il posticipo non conta: serve a smistare
 * le risposte.
 */
export function filtraPosta<T extends ConversazionePosta>(convs: T[], f: FiltriPosta): T[] {
  const q = (f.ricerca ?? "").trim().toLowerCase();
  return convs.filter((c) => {
    if (!nellaVista(c, f.vista)) return false;
    if (f.vista === "risposte") {
      if (f.filtro === "posticipate") {
        if (!c.snoozedUntil) return false;
      } else {
        if (c.snoozedUntil) return false;
        if (f.filtro === "da_leggere" && !c.unread) return false;
        if (f.filtro === "da_rispondere" && !c.daRispondere) return false;
        if (f.filtro === "interessati" && c.lastIntent !== "interested") return false;
      }
    }
    if (!delBrand(c, f.brand)) return false;
    if (f.casellaId && !c.senderAccountIds.includes(f.casellaId)) return false;
    if (f.sequenzaId && !c.sequenceIds.includes(f.sequenzaId)) return false;
    if (f.daQuando != null) {
      const t = c.lastAt ? Date.parse(c.lastAt) : 0;
      if (!(t >= f.daQuando)) return false;
    }
    if (q && !c.testoRicerca.includes(q)) return false;
    return true;
  });
}

export interface ContatoriPosta {
  risposte: number;
  automatiche: number;
  inviate: number;
  archiviate: number;
  daLeggere: number;
  daRispondere: number;
  interessati: number;
  posticipate: number;
}

/** I numeri delle viste e dei filtri, dentro il brand scelto (null = tutti). */
export function contaPosta(convs: ConversazionePosta[], brand: string | null): ContatoriPosta {
  const n: ContatoriPosta = {
    risposte: 0, automatiche: 0, inviate: 0, archiviate: 0,
    daLeggere: 0, daRispondere: 0, interessati: 0, posticipate: 0,
  };
  for (const c of convs) {
    if (!delBrand(c, brand)) continue;
    if (c.archived) { n.archiviate++; continue; }
    if (c.tipo === "automatica") { n.automatiche++; continue; }
    if (c.tipo === "inviata") { n.inviate++; continue; }
    if (c.snoozedUntil) { n.posticipate++; continue; }
    n.risposte++;
    if (c.unread) n.daLeggere++;
    if (c.daRispondere) n.daRispondere++;
    if (c.lastIntent === "interested") n.interessati++;
  }
  return n;
}

/** Per ogni brand: risposte vere da leggere e in tutto (per le linguette in alto). */
export function contaPerBrand(convs: ConversazionePosta[]): Map<string, { daLeggere: number; risposte: number }> {
  const m = new Map<string, { daLeggere: number; risposte: number }>();
  for (const c of convs) {
    if (c.archived || c.tipo !== "risposta" || c.snoozedUntil) continue;
    const k = c.brandId ?? SENZA_BRAND;
    const v = m.get(k) ?? { daLeggere: 0, risposte: 0 };
    v.risposte++;
    if (c.unread) v.daLeggere++;
    m.set(k, v);
  }
  return m;
}

// ── Colore del brand ────────────────────────────────────────────────────────

export type TintaBrand = "violet" | "rose" | "sky" | "emerald" | "amber" | "teal" | "fuchsia";

/** I tre brand del freddo hanno un colore fisso, gli altri uno stabile dal nome. */
const TINTA_NOTA: Record<string, TintaBrand> = {
  "marketing edile": "violet",
  thermodmr: "rose",
  "edilizia in cloud": "sky",
};
const TINTE_LIBERE: TintaBrand[] = ["emerald", "amber", "teal", "fuchsia"];

export function tintaBrand(nome: string | null | undefined): TintaBrand {
  const n = String(nome ?? "").trim().toLowerCase();
  if (TINTA_NOTA[n]) return TINTA_NOTA[n];
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return TINTE_LIBERE[h % TINTE_LIBERE.length];
}
