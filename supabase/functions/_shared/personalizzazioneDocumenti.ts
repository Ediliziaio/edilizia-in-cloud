/**
 * La veste dei PDF per le aziende che ne hanno una propria (09/11/2026).
 *
 * Oggi solo Impresa Vulcano: logo molto più grande e piè di pagina in EB Garamond blu scuro. Il contenuto del piè
 * non cambia (righeSocietarie, art. 2250 c.c.). Per tutte le altre il valore neutro lascia ogni documento com'era.
 *
 * Modulo puro: lo importano frontend, edge e bundle. Misure in punti PDF.
 */
export interface PersonalizzazioneDocumento {
  /** Il logo nelle pagine interne. */
  logoAltezza: number | null;
  logoLarghezzaMax: number | null;
  /** Il logo in copertina o in prima pagina. */
  logoCopertinaAltezza: number | null;
  logoCopertinaLarghezzaMax: number | null;
  piedeFont: string | null;
  piedeColore: string | null;
}

export const SENZA_PERSONALIZZAZIONE: PersonalizzazioneDocumento = Object.freeze({
  logoAltezza: null,
  logoLarghezzaMax: null,
  logoCopertinaAltezza: null,
  logoCopertinaLarghezzaMax: null,
  piedeFont: null,
  piedeColore: null,
});

const IMPRESA_VULCANO = "7c87c209-7868-42d0-ad98-6c95ac6de196";

export const FONT_EB_GARAMOND = "EB Garamond";

// Logo 6,17:1: a 340 punti si leggono nome e marchi di certificazione.
const VESTE_VULCANO: PersonalizzazioneDocumento = Object.freeze({
  logoAltezza: 55,
  logoLarghezzaMax: 340,
  logoCopertinaAltezza: 75,
  logoCopertinaLarghezzaMax: 460,
  piedeFont: FONT_EB_GARAMOND,
  piedeColore: "#1C1650",
});

export function personalizzazioneDocumento(companyId: string | null | undefined): PersonalizzazioneDocumento {
  return companyId === IMPRESA_VULCANO ? VESTE_VULCANO : SENZA_PERSONALIZZAZIONE;
}

/** Punti PDF in millimetri, per i documenti disegnati con jsPDF. */
export const puntiInMm = (punti: number): number => (punti * 25.4) / 72;

export const PERCORSO_FONT_PIEDE = "/fonts/EBGaramond-Regular.ttf";

/** Nel browser il file dello stesso sito (vale anche sulle anteprime); sul server l'indirizzo pubblico. */
export function urlFontPiede(): string {
  try {
    const origine = (globalThis as { location?: { origin?: string } }).location?.origin;
    if (origine && /^https?:/.test(origine)) return `${origine}${PERCORSO_FONT_PIEDE}`;
  } catch { /* Deno senza --location: la lettura stessa lancia. */ }
  return `https://app.ediliziaincloud.com${PERCORSO_FONT_PIEDE}`;
}

let fontBase64: Promise<string | null> | null = null;

/**
 * Il TTF in base64 per jsPDF, scaricato una volta. null se non si carica: il documento esce col carattere di serie
 * (e al prossimo si riprova).
 */
export function fontPiedeBase64(): Promise<string | null> {
  fontBase64 ??= (async () => {
    try {
      const risposta = await fetch(urlFontPiede(), { signal: AbortSignal.timeout(8000) });
      if (!risposta.ok) throw new Error(String(risposta.status));
      const byte = new Uint8Array(await risposta.arrayBuffer());
      // Un TTF comincia con 00 01 00 00: una pagina HTML al suo posto non è un carattere.
      if (byte[0] !== 0 || byte[1] !== 1) throw new Error("non è un TTF");
      let binario = "";
      for (let i = 0; i < byte.length; i += 8192) binario += String.fromCharCode(...byte.subarray(i, i + 8192));
      return btoa(binario);
    } catch {
      fontBase64 = null;
      return null;
    }
  })();
  return fontBase64;
}
