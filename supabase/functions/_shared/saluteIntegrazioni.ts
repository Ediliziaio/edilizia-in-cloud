// Come si legge la salute di un'integrazione (20/09/2026).
//
// Qui ci sono solo le regole, senza chiamate di rete: check-api-health fa le
// richieste e passa le risposte, così le regole si provano da sole.
//
// Perché esiste. Due controlli dicevano il falso da mesi:
//  · Cloudflare: «HTTP 403» a ogni giro, mai una volta verde. Si chiedeva
//    GET /accounts/{id}, che vuole il permesso «Account Settings: Read»; il
//    nostro token ha i permessi del suo mestiere (Pages, DNS) e quello no.
//    Risultato: un avviso email al giorno per un guasto che non c'era, e
//    nessun modo di sapere se il token funzionasse davvero.
//  · Email marketing: verde con il piano Elastic Email scaduto dal 25/07.
//    La sonda manda un corpo vuoto e prende per buono il 400 di validazione;
//    il piano scaduto si scopre solo spedendo davvero. Intanto ogni notifica
//    usciva dal canale di riserva (177 in venti giorni) e la pagina diceva
//    «tutto bene».

export type StatoSalute = "healthy" | "degraded" | "down" | "unconfigured";

export interface EsitoSalute {
  status: StatoSalute;
  error: string | null;
}

// ── Cloudflare ───────────────────────────────────────────────────────────────

/** Una risposta dell'API di Cloudflare, ridotta a ciò che serve per decidere. */
export interface RispostaCloudflare {
  /** Codice HTTP; 0 se la chiamata non è nemmeno partita (rete, timeout). */
  http: number;
  /** `success` del corpo JSON. */
  success?: boolean;
  /** `result.status` di /tokens/verify: active, disabled, expired. */
  statoToken?: string | null;
  /** Errore di rete, se c'è stato. */
  erroreRete?: string | null;
}

const tokenAttivo = (r?: RispostaCloudflare | null) =>
  !!r && r.http === 200 && r.success === true && r.statoToken === "active";

/**
 * Il token Cloudflare è valido, e fa il suo mestiere?
 *
 * - `verificaUtente`: GET /user/tokens/verify (token creati da un utente);
 * - `verificaAccount`: GET /accounts/{id}/tokens/verify (token dell'account),
 *   chiamata solo se la prima non basta;
 * - `pages`: GET /accounts/{id}/pages/projects/{progetto}/domains, cioè la
 *   stessa risorsa su cui scrive provision-custom-domain. `null` = manca
 *   l'id dell'account, quindi non si è potuto provare.
 */
export function esitoCloudflare(args: {
  verificaUtente: RispostaCloudflare;
  verificaAccount?: RispostaCloudflare | null;
  pages?: RispostaCloudflare | null;
  progetto: string;
}): EsitoSalute {
  const { verificaUtente, verificaAccount, pages, progetto } = args;
  const verifiche = [verificaUtente, verificaAccount].filter(Boolean) as RispostaCloudflare[];

  if (verifiche.every((v) => v.http === 0)) {
    return { status: "down", error: `Cloudflare non raggiungibile: ${verificaUtente.erroreRete || "nessuna risposta"}` };
  }

  if (!verifiche.some(tokenAttivo)) {
    const spento = verifiche.find((v) => v.statoToken && v.statoToken !== "active");
    if (spento) {
      return { status: "down", error: `Il token Cloudflare risulta «${spento.statoToken}»: va rigenerato nel pannello Cloudflare.` };
    }
    const codice = verifiche.find((v) => v.http > 0)?.http ?? 0;
    return { status: "down", error: `Il token Cloudflare non è valido (HTTP ${codice}): va rigenerato nel pannello Cloudflare.` };
  }

  // Da qui il token è buono: resta da vedere se può fare ciò per cui lo usiamo.
  if (!pages) {
    return {
      status: "degraded",
      error: "Token valido, ma manca CLOUDFLARE_ACCOUNT_ID: i domini personalizzati delle aziende vanno aggiunti a mano.",
    };
  }
  if (pages.http === 200 && pages.success !== false) return { status: "healthy", error: null };
  if (pages.http === 401 || pages.http === 403) {
    return {
      status: "degraded",
      error: "Token valido, ma senza il permesso «Cloudflare Pages»: i domini personalizzati delle aziende non si possono aggiungere da qui.",
    };
  }
  if (pages.http === 404) {
    return {
      status: "degraded",
      error: `Token valido, ma il progetto Pages «${progetto}» non si trova in questo account: controllare CLOUDFLARE_PROJECT_NAME e CLOUDFLARE_ACCOUNT_ID.`,
    };
  }
  if (pages.http === 0) {
    return { status: "degraded", error: `Token valido, ma Cloudflare Pages non risponde: ${pages.erroreRete || "nessuna risposta"}` };
  }
  return { status: "degraded", error: `Token valido, ma Cloudflare Pages risponde HTTP ${pages.http}.` };
}

// ── Email: la sonda dice una cosa, gli invii veri un'altra ───────────────────

/** Cosa è successo davvero agli invii del canale, letto da email_delivery_log. */
export interface ProveInvii {
  /** Email uscite dal canale di riserva nelle ultime 24 ore perché questo non consegnava. */
  ripieghi24h: number;
  /** Email consegnate da questo canale nelle ultime 24 ore. */
  riuscite24h: number;
  /** Ultimo invio riuscito del canale (ISO), se c'è mai stato. */
  ultimoRiuscito: string | null;
  /** Ultimo errore del provider su questo canale, e quando (ISO). */
  ultimoErrore: string | null;
  ultimoErroreIl: string | null;
}

const giornoMese = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Rome" });
};

/** Il testo del provider senza JSON attorno: {"Error":"Your plan expired…"} → Your plan expired… */
export function erroreProviderLeggibile(grezzo: string | null, max = 140): string | null {
  if (!grezzo) return null;
  let testo = grezzo.trim();
  try {
    const dato = JSON.parse(testo);
    const candidato = dato?.Error ?? dato?.error ?? dato?.message ?? dato?.error_message;
    if (typeof candidato === "string" && candidato.trim()) testo = candidato.trim();
  } catch {
    // non era JSON: si tiene com'è
  }
  return testo.length > max ? `${testo.slice(0, max - 1)}…` : testo;
}

/** Una risposta del provider, e quando è arrivata. */
export interface ErroreProvider { testo: string | null; il: string | null }

/**
 * Fra due risposte del provider vale la più recente. Le fonti sono due: gli
 * invii falliti e il motivo scritto accanto alle email uscite dalla riserva.
 * Il 20/09 la prima era ferma al 29/08 («From email address not allowed»),
 * mentre il provider quel giorno rispondeva «Your plan expired».
 */
export function erroreProviderPiuFresco(a: ErroreProvider, b: ErroreProvider): ErroreProvider {
  const candidati = [a, b].filter((c) => !!c.testo);
  if (candidati.length === 0) return { testo: null, il: null };
  const tempo = (c: ErroreProvider) => {
    const t = c.il ? new Date(c.il).getTime() : NaN;
    return Number.isNaN(t) ? -Infinity : t;
  };
  return candidati.reduce((meglio, c) => (tempo(c) > tempo(meglio) ? c : meglio));
}

/**
 * Corregge l'esito della sonda con le prove degli invii veri.
 *
 * La sonda resta la prima parola: se dice che la chiave è rifiutata, è così.
 * Ma un «sano» della sonda non vale contro le prove: se nelle ultime 24 ore
 * le email sono uscite dal canale di riserva e da questo nemmeno una, il
 * canale non consegna, qualunque cosa risponda a un corpo vuoto.
 */
export function esitoEmailConProve(sonda: EsitoSalute, prove: ProveInvii | null): EsitoSalute {
  if (sonda.status !== "healthy" || !prove) return sonda;
  if (prove.ripieghi24h <= 0 || prove.riuscite24h > 0) return sonda;

  const pezzi = [
    `Il provider non consegna: nelle ultime 24 ore ${prove.ripieghi24h} email sono uscite dal canale di riserva e nessuna da questo.`,
  ];
  const errore = erroreProviderLeggibile(prove.ultimoErrore);
  if (errore) {
    const quando = giornoMese(prove.ultimoErroreIl);
    pezzi.push(`Ultima risposta del provider${quando ? ` (${quando})` : ""}: «${errore}».`);
  }
  const riuscito = giornoMese(prove.ultimoRiuscito);
  pezzi.push(riuscito ? `Ultimo invio riuscito: ${riuscito}.` : "Nessun invio riuscito in archivio.");
  return { status: "down", error: pezzi.join(" ") };
}
