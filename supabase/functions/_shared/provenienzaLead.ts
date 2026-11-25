/**
 * Da dove è arrivato il lead, detto in italiano.
 *
 * `attribution_sessions` registra referrer, UTM e click-id di ogni visita, ma
 * l'email di avviso che arriva al titolare mostrava solo pagina e `source`
 * (il nome del form): per sapere se il lead veniva da Google, da Bing, da
 * ChatGPT o da una campagna bisognava aprire il CRM. Qui quella riga si
 * costruisce una volta sola, così vale per l'email, per la nota sul contatto
 * e per l'attività.
 *
 * L'ordine conta: un click-id o una UTM dicono la campagna e battono sempre
 * il referrer (una visita da Google Ads ha referrer google.com e sembrerebbe
 * organica).
 */

export type SessioneProvenienza = {
  referrer?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  li_fat_id?: string | null;
  pages_viewed?: number | null;
};

export type Provenienza = {
  /** Riga breve pronta da mostrare: «Bing (organico)», «Google Ads». */
  etichetta: string;
  /** Il dominio da cui è arrivato, quando c'è: «www.bing.com». */
  dominio: string | null;
  /** Campagna UTM, quando c'è. */
  campagna: string | null;
  /** Quante pagine ha visto prima di scrivere. */
  pagineViste: number | null;
};

/** I domini che riconosciamo, dal più specifico al più generico. */
const CONOSCIUTI: Array<[RegExp, string]> = [
  [/(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/, "ChatGPT"],
  [/(^|\.)perplexity\.ai$/, "Perplexity"],
  [/(^|\.)gemini\.google\.com$|(^|\.)bard\.google\.com$/, "Gemini"],
  [/(^|\.)copilot\.microsoft\.com$/, "Copilot"],
  [/(^|\.)claude\.ai$/, "Claude"],
  [/(^|\.)google\.[a-z.]+$/, "Google (organico)"],
  [/(^|\.)bing\.com$/, "Bing (organico)"],
  [/search\.yahoo\.com$/, "Yahoo (organico)"],
  [/(^|\.)duckduckgo\.com$/, "DuckDuckGo"],
  [/(^|\.)ecosia\.org$|search\.brave\.com$|(^|\.)qwant\.com$/, "Motore di ricerca"],
  [/(^|\.)facebook\.com$|^fb$|^m\.facebook\.com$/, "Facebook"],
  [/(^|\.)instagram\.com$|^ig$/, "Instagram"],
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, "LinkedIn"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)youtube\.com$|^youtu\.be$/, "YouTube"],
  [/(^|\.)whatsapp\.com$|^wa\.me$/, "WhatsApp"],
  [/(^|\.)t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, "X / Twitter"],
];

function pulisci(valore: string | null | undefined): string | null {
  const testo = typeof valore === "string" ? valore.trim() : "";
  return testo ? testo : null;
}

/** Il dominio nudo di un referrer, senza protocollo, porta né percorso. */
export function dominioDiReferrer(referrer: string | null | undefined): string | null {
  const grezzo = pulisci(referrer);
  if (!grezzo) return null;
  try {
    return new URL(grezzo).hostname.toLowerCase() || null;
  } catch {
    // Alcuni referrer arrivano già senza protocollo («fb», «ig», «ilgiornaleedile»).
    const senzaProtocollo = grezzo.replace(/^[a-z]+:\/\//i, "");
    const dominio = senzaProtocollo.split("/")[0].split("?")[0].split(":")[0];
    return dominio.toLowerCase() || null;
  }
}

function nomeDelDominio(dominio: string): string {
  for (const [regola, nome] of CONOSCIUTI) {
    if (regola.test(dominio)) return nome;
  }
  return dominio.replace(/^www\./, "");
}

/**
 * @param hostSito il dominio del sito stesso: un referrer interno non è una
 *   provenienza, è navigazione (succede quando la sessione riparte).
 */
export function leggiProvenienza(
  sessione: SessioneProvenienza | null | undefined,
  hostSito?: string | null,
): Provenienza {
  const pagineViste =
    sessione && typeof sessione.pages_viewed === "number" && sessione.pages_viewed > 0
      ? sessione.pages_viewed
      : null;

  if (!sessione) {
    return { etichetta: "Non rilevata", dominio: null, campagna: null, pagineViste: null };
  }

  const campagna = pulisci(sessione.utm_campaign);
  const utmSource = pulisci(sessione.utm_source);
  const utmMedium = pulisci(sessione.utm_medium);
  const dominio = dominioDiReferrer(sessione.referrer);
  const nostro = pulisci(hostSito)?.toLowerCase().replace(/^www\./, "") ?? null;
  const dominioEsterno =
    dominio && (!nostro || dominio.replace(/^www\./, "") !== nostro) ? dominio : null;

  // 1. I click-id: dicono la piattaforma pubblicitaria con certezza.
  const adv = pulisci(sessione.gclid)
    ? "Google Ads"
    : pulisci(sessione.fbclid)
      ? "Meta Ads"
      : pulisci(sessione.msclkid)
        ? "Microsoft Ads"
        : pulisci(sessione.ttclid)
          ? "TikTok Ads"
          : pulisci(sessione.li_fat_id)
            ? "LinkedIn Ads"
            : null;
  if (adv) {
    return {
      etichetta: campagna ? `${adv} — ${campagna}` : adv,
      dominio: dominioEsterno,
      campagna,
      pagineViste,
    };
  }

  // 2. Le UTM: le mettiamo noi sui link che distribuiamo.
  if (utmSource) {
    const pezzi = [utmSource, utmMedium].filter(Boolean).join(" / ");
    return {
      etichetta: campagna ? `${pezzi} — ${campagna}` : pezzi,
      dominio: dominioEsterno,
      campagna,
      pagineViste,
    };
  }

  // 3. Il referrer: traffico organico, social, AI, siti che ci linkano.
  if (dominioEsterno) {
    return { etichetta: nomeDelDominio(dominioEsterno), dominio: dominioEsterno, campagna: null, pagineViste };
  }

  // 4. Niente di niente: digitato, segnalibro, app, email senza tracciamento.
  return {
    etichetta: "Diretto (nessun referrer)",
    dominio: null,
    campagna: null,
    pagineViste,
  };
}

/** La riga per l'email e per la nota: «Bing (organico) · 9 pagine viste». */
export function rigaProvenienza(provenienza: Provenienza): string {
  if (!provenienza.pagineViste) return provenienza.etichetta;
  const pagine = provenienza.pagineViste === 1 ? "1 pagina vista" : `${provenienza.pagineViste} pagine viste`;
  return `${provenienza.etichetta} · ${pagine}`;
}
