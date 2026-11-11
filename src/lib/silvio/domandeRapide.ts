/**
 * Domande rapide della «Regia Silvio» (popover del tondo in basso a destra).
 *
 * Sotto la casella «Scrivi a Silvio…» stanno 3-4 domande legate alla pagina
 * aperta: un clic apre la chat già compilata. L'area si ricava dal percorso e,
 * se c'è, dall'etichetta del contesto pagina (`useSilvioPageContext`).
 *
 * Qui sta anche la regola delle priorità: vengono SOLO dal briefing del
 * mattino. Prima, senza briefing, il pannello mostrava tre voci fisse e il
 * badge diceva «3 priorità»: un'informazione falsa.
 */

export type AreaSilvio =
  | "marketing"
  | "preventivi"
  | "commesse"
  | "acquisti"
  | "fatturazione"
  | "personale"
  | "home"
  | "admin"
  | "generale";

/**
 * `etichetta` è il chip (corto: due per riga in un pannello di 380 px);
 * `domanda` è il testo che entra nella chat.
 */
export interface DomandaRapida {
  etichetta: string;
  domanda: string;
}

const d = (etichetta: string, domanda: string): DomandaRapida => ({ etichetta, domanda });

export const DOMANDE_PER_AREA: Record<AreaSilvio, readonly DomandaRapida[]> = {
  marketing: [
    d("Lead da richiamare oggi", "Quali lead richiamare oggi?"),
    d("Preventivi in scadenza", "Quali preventivi scadono questa settimana?"),
    d("Andamento campagne", "Come stanno andando le campagne?"),
    d("Lead fermi da 7 giorni", "Quali lead sono fermi da più di 7 giorni?"),
  ],
  preventivi: [
    d("Preventivi in scadenza", "Quali preventivi scadono questa settimana?"),
    d("Da sollecitare oggi", "Quali preventivi devo sollecitare oggi?"),
    d("Tasso di chiusura", "Qual è il tasso di chiusura dei preventivi negli ultimi 30 giorni?"),
  ],
  commesse: [
    d("Commesse in perdita", "Quali commesse sono in perdita?"),
    d("Cantieri in ritardo", "Quali cantieri sono in ritardo sul cronoprogramma?"),
    d("Rate da incassare", "Quali rate devo incassare questo mese?"),
  ],
  acquisti: [
    d("DDT senza ordine", "Quali DDT non sono ancora abbinati a un ordine?"),
    d("Ordini in ritardo", "Quali ordini ai fornitori sono in ritardo?"),
    d("Cosa ordinare", "Cosa devo ordinare questa settimana?"),
  ],
  fatturazione: [
    d("Fatture scadute", "Quali fatture scadute devo incassare?"),
    d("Pagamenti della settimana", "Cosa devo pagare questa settimana?"),
    d("Cassa a fine mese", "Quale sarà il saldo di cassa a fine mese?"),
  ],
  personale: [
    d("Rapportini mancanti", "Chi non ha compilato il rapportino ieri?"),
    d("Ore per cantiere", "Quante ore sono state lavorate questa settimana per cantiere?"),
    d("Documenti in scadenza", "Quali documenti del personale sono in scadenza?"),
  ],
  home: [
    d("Cosa fare oggi", "Cosa devo fare oggi?"),
    d("Incassi e pagamenti", "Quali incassi e pagamenti ho questa settimana?"),
    d("Commesse da guardare", "Quali commesse richiedono attenzione?"),
  ],
  admin: [
    d("Aziende a rischio", "Quali aziende rischiano di disdire?"),
    d("Approvazioni AI", "Quali approvazioni AI sono in attesa?"),
    d("MRR del mese", "Come va l'MRR questo mese?"),
  ],
  generale: [
    d("Cosa fare oggi", "Cosa devo fare oggi?"),
    d("Riassumi la pagina", "Riassumimi questa pagina."),
    d("Cosa richiede attenzione", "Cosa richiede attenzione questa settimana?"),
  ],
};

/** Ordine conta: «preventivi» sta sotto /marketing, quindi va prima. */
const REGOLE_PERCORSO: Array<{ area: AreaSilvio; re: RegExp }> = [
  { area: "preventivi", re: /preventiv|template-preventivi|computo/ },
  { area: "acquisti", re: /acquist|\/ddt|ordini-acquisto|richieste-offerta|fornitori|magazzino|fabbisogno|merce|materiali/ },
  { area: "fatturazione", re: /fattur|cassa|tesoreria|banca|scadenzario|prima-nota|contabilita|insoluti|incass|costi|previsionale/ },
  { area: "personale", re: /personale|\/campo|rapportin|manodopera|presenze|timbratur|cedolini|ferie|squadra|giornale-lavori/ },
  { area: "commesse", re: /commess|\/ordini|cantier|\/sal\b|gantt|avanzamento|subappaltatori|sopralluoghi/ },
  { area: "marketing", re: /marketing|\/crm|lead|clienti|committenti|campagne|contatti|appuntamenti|opportunit|whatsapp|annunci/ },
  { area: "home", re: /^\/azienda\/?$|cruscotto|come-stiamo-andando/ },
];

const AREA_DA_ETICHETTA: Record<string, AreaSilvio> = {
  Preventivo: "preventivi",
  Commessa: "commesse",
  Commesse: "commesse",
  Cantieri: "commesse",
  Subappaltatore: "commesse",
  Cliente: "marketing",
  Committente: "marketing",
  Marketing: "marketing",
  Magazzino: "acquisti",
  "Documento fiscale": "fatturazione",
  Cassa: "fatturazione",
  Personale: "personale",
  Dipendente: "personale",
  "Selezioni HR": "personale",
};

export function areaSilvio(
  pathname: string,
  routeLabel?: string | null,
  mode: "azienda" | "admin" = "azienda",
): AreaSilvio {
  if (mode === "admin") return "admin";
  // Il percorso è più preciso dell'etichetta («Marketing» copre anche
  // /azienda/marketing/preventivi, che è un elenco di preventivi).
  const percorso = pathname.toLowerCase();
  for (const { area, re } of REGOLE_PERCORSO) {
    if (re.test(percorso)) return area;
  }
  if (routeLabel && AREA_DA_ETICHETTA[routeLabel]) return AREA_DA_ETICHETTA[routeLabel];
  return "generale";
}

export function domandeRapide(
  pathname: string,
  routeLabel?: string | null,
  mode: "azienda" | "admin" = "azienda",
): DomandaRapida[] {
  return DOMANDE_PER_AREA[areaSilvio(pathname, routeLabel, mode)].slice(0, 4);
}

export interface PuntoBriefing {
  text: string;
  severity?: "info" | "attention" | "urgent";
  action_hint?: string;
}

/**
 * Le priorità vere: i punti del briefing di oggi, nient'altro. Senza
 * briefing (o con un briefing senza punti) l'elenco è vuoto e il pannello
 * non mostra né la sezione né il badge.
 */
export function prioritaDalBriefing(
  briefing: { key_points?: PuntoBriefing[] | null } | null | undefined,
): PuntoBriefing[] {
  const punti = Array.isArray(briefing?.key_points) ? briefing!.key_points! : [];
  return punti.filter((p) => typeof p?.text === "string" && p.text.trim() !== "").slice(0, 4);
}

/**
 * Badge della testata: quanti punti veri ha il briefing di oggi, e se è
 * ancora da leggere (badge pieno) o già letto (badge chiaro). Senza briefing
 * il conteggio è zero e il badge non c'è. Il briefing diventa «letto»
 * appena si apre il pannello: se il badge contasse solo i non letti
 * sparirebbe nel momento stesso in cui lo si guarda.
 */
export function badgePriorita(
  briefing: { key_points?: PuntoBriefing[] | null; read_at?: string | null } | null | undefined,
): { conteggio: number; nonLetto: boolean } {
  const conteggio = prioritaDalBriefing(briefing).length;
  return { conteggio, nonLetto: conteggio > 0 && !briefing?.read_at };
}
