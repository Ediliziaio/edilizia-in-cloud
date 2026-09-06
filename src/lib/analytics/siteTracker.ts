/**
 * Tracciamento first-party del sito pubblico.
 *
 * Serve a rispondere a due domande che oggi restano senza risposta quando
 * arriva una richiesta: da dove è entrato, e cosa ha guardato prima di
 * scrivere. PostHog c'è ma la sua chiave non è configurata, quindi non
 * traccia niente; qui i dati restano in casa, in `attribution_sessions` e
 * `attribution_pageviews`, dove la UI del CRM li sa già leggere.
 *
 * - `visitor_id` vive in localStorage: la stessa persona che torna fra tre
 *   giorni resta riconoscibile e le sue sessioni si sommano.
 * - `session_id` vive in sessionStorage: una visita, dal primo click alla
 *   chiusura della scheda.
 * - ogni vista ha un `client_id` proprio, che serve al beacon di uscita per
 *   scrivere il tempo di permanenza sulla riga giusta.
 */
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/site-track`;

const CHIAVE_VISITATORE = "eic_visitor_id";
const CHIAVE_SESSIONE = "eic_session_id";

/** Parametri di provenienza raccolti all'ingresso e tenuti per tutta la visita. */
const CHIAVE_PROVENIENZA = "eic_session_origine";

function id(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function leggi(store: Storage, chiave: string): string | null {
  try {
    return store.getItem(chiave);
  } catch {
    return null; // Safari in navigazione privata, storage bloccato, ecc.
  }
}

function scrivi(store: Storage, chiave: string, valore: string): void {
  try {
    store.setItem(chiave, valore);
  } catch {
    /* senza storage si traccia comunque, solo senza continuità */
  }
}

export function visitorId(): string {
  const esistente = leggi(localStorage, CHIAVE_VISITATORE);
  if (esistente) return esistente;
  const nuovo = id();
  scrivi(localStorage, CHIAVE_VISITATORE, nuovo);
  return nuovo;
}

export function sessionId(): string {
  const esistente = leggi(sessionStorage, CHIAVE_SESSIONE);
  if (esistente) return esistente;
  const nuovo = id();
  scrivi(sessionStorage, CHIAVE_SESSIONE, nuovo);
  return nuovo;
}

interface Provenienza {
  referrer?: string;
  landing_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  li_fat_id?: string;
}

/**
 * La provenienza si fotografa all'ingresso e non si tocca più: se la
 * rileggessimo a ogni pagina, un visitatore arrivato da Google risulterebbe
 * "diretto" dalla seconda pagina in poi.
 */
function provenienza(): Provenienza {
  const salvata = leggi(sessionStorage, CHIAVE_PROVENIENZA);
  if (salvata) {
    try {
      return JSON.parse(salvata) as Provenienza;
    } catch {
      /* ricalcola sotto */
    }
  }

  const q = new URLSearchParams(window.location.search);
  const dato: Provenienza = {
    referrer: document.referrer || undefined,
    landing_url: window.location.href,
    utm_source: q.get("utm_source") ?? undefined,
    utm_medium: q.get("utm_medium") ?? undefined,
    utm_campaign: q.get("utm_campaign") ?? undefined,
    utm_content: q.get("utm_content") ?? undefined,
    utm_term: q.get("utm_term") ?? undefined,
    gclid: q.get("gclid") ?? undefined,
    fbclid: q.get("fbclid") ?? undefined,
    ttclid: q.get("ttclid") ?? undefined,
    msclkid: q.get("msclkid") ?? undefined,
    li_fat_id: q.get("li_fat_id") ?? undefined,
  };
  scrivi(sessionStorage, CHIAVE_PROVENIENZA, JSON.stringify(dato));
  return dato;
}

/**
 * Il sito serve le pagine con lo slash finale ("/prezzi/") ma la navigazione
 * interna di React Router usa "/prezzi": senza normalizzare, la stessa pagina
 * comparirebbe come due voci diverse in ogni classifica.
 */
function normalizza(percorso: string): string {
  const senzaQuery = percorso.split("?")[0].split("#")[0];
  if (senzaQuery.length > 1 && senzaQuery.endsWith("/")) return senzaQuery.slice(0, -1);
  return senzaQuery || "/";
}

/**
 * Il prerender del build apre tutte le pagine del sito a ogni deploy. Senza
 * questo controllo le conta come visite: 243 pagine in novanta secondi, per
 * sette deploy in un giorno, hanno prodotto il 96% delle righe raccolte nelle
 * prime trenta ore. `navigator.webdriver` è true in Puppeteer e in ogni
 * browser pilotato da un automatismo.
 *
 * Lo stesso controllo esiste anche lato server sull'user agent, perché una
 * scheda aperta su un bundle vecchio continuerebbe a mandare dati comunque.
 */
function automatismo(): boolean {
  try {
    return navigator.webdriver === true;
  } catch {
    return false;
  }
}

/** La vista aperta adesso: serve a chiuderla quando se ne apre un'altra. */
let vistaAperta: { clientId: string; iniziata: number } | null = null;
let ascoltatoriPronti = false;

/**
 * Quanto è rimasto su questa pagina.
 *
 * Si manda con `sendBeacon`, l'unico modo perché parta davvero mentre la
 * scheda si chiude: una fetch normale viene annullata. Sotto il secondo non
 * si manda niente — non è una lettura, è un rimbalzo, e lo si vede già dal
 * fatto che la pagina è l'ultima della sessione.
 *
 * Se il visitatore torna sulla scheda, il tempo successivo non viene contato:
 * la misura è il tempo di attenzione, non quello a schermo aperto.
 */
function chiudiVista(): void {
  const vista = vistaAperta;
  vistaAperta = null;
  if (!vista) return;

  const durata = Date.now() - vista.iniziata;
  if (durata < 1000) return;

  const corpo = JSON.stringify({
    tipo: "uscita",
    client_id: vista.clientId,
    durata_ms: durata,
  });

  try {
    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, new Blob([corpo], { type: "application/json" }));
      return;
    }
  } catch {
    /* si ripiega sulla fetch */
  }

  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo,
    keepalive: true,
  }).catch(() => {
    /* il tempo di quella pagina resta ignoto: non è un errore da mostrare */
  });
}

function preparaAscoltatori(): void {
  if (ascoltatoriPronti) return;
  ascoltatoriPronti = true;
  // `pagehide` copre la chiusura e la navigazione via, `visibilitychange`
  // copre il passaggio a un'altra scheda: su mobile spesso arriva solo il
  // secondo, e senza di lui non si chiuderebbe mai niente.
  window.addEventListener("pagehide", chiudiVista);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") chiudiVista();
  });
}

/** Il tracciamento non deve mai rallentare né rompere la navigazione. */
export function tracciaPagina(percorso: string, titolo?: string): void {
  if (typeof window === "undefined") return;
  if (automatismo()) return;

  // La pagina precedente si chiude qui: dentro una SPA il cambio rotta è
  // l'unico momento in cui si sa che quella vista è finita.
  chiudiVista();
  preparaAscoltatori();

  const clientId = id();
  vistaAperta = { clientId, iniziata: Date.now() };

  const corpo = {
    session_id: sessionId(),
    visitor_id: visitorId(),
    client_id: clientId,
    path: normalizza(percorso),
    title: titolo ?? document.title,
    ...provenienza(),
  };

  void fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
    body: JSON.stringify(corpo),
    keepalive: true,
  }).catch(() => {
    /* offline o funzione giù: si perde la pagina, non la visita dell'utente */
  });
}
