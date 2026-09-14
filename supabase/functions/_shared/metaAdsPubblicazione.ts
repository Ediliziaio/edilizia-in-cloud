// supabase/functions/_shared/metaAdsPubblicazione.ts
//
// Pezzi puri della pubblicazione delle sponsorizzate Meta, condivisi da
// meta-ads-create-campaign, meta-ads-update-campaign e meta-ads-spend-check.
// Niente import: così li provano anche i test vitest in src/test/logic.
//
// Riferimenti Graph API verificati sulla documentazione ufficiale:
//   • POST /act_{id}/adimages accetta `bytes` (immagine in base64) oppure
//     `copy_from`: NON accetta un URL. Risposta: { images: { <nome>: { hash, url, … } } }
//   • AdCreativeLinkData: `image_hash` (hash della libreria dell'account)
//     oppure `picture` (URL), mai entrambi.
//   • AdCreativeObjectStorySpec: `instagram_user_id`. `instagram_actor_id` è
//     deprecato da v22.0 e, dal 9 settembre 2025, in tutte le versioni.
//   • Codici errore: 10 = permesso dell'app mancante, 200 = errore di permesso,
//     294 = serve ads_management, 190 = token non valido, 17/4/32/613 = limiti.

/** Meta vuole l'account come `act_<numero>`; il picker spesso salva solo il numero. */
export function normalizzaActId(id: string): string {
  const pulito = String(id ?? "").trim();
  return pulito.startsWith("act_") ? pulito : `act_${pulito}`;
}

export function eUuid(valore: unknown): valore is string {
  return typeof valore === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valore);
}

export interface ErroreMetaLeggibile {
  /** Codice stabile per il frontend. */
  codice: "permesso_mancante" | "token_scaduto" | "limite_richieste" | "dato_rifiutato" | "bloccato_da_meta" | "errore_meta";
  /** Frase in italiano da mostrare così com'è. */
  messaggio: string;
  codice_meta?: number;
  sottocodice_meta?: number;
}

interface CorpoErroreGraph {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

/**
 * Traduce la risposta d'errore di Graph in una frase che il titolare capisce.
 * Accetta il testo grezzo (anche non JSON) o l'oggetto già letto.
 */
export function traduciErroreMeta(risposta: unknown): ErroreMetaLeggibile {
  let corpo: CorpoErroreGraph | null = null;
  let grezzo = "";
  if (typeof risposta === "string") {
    grezzo = risposta;
    try {
      corpo = JSON.parse(risposta) as CorpoErroreGraph;
    } catch {
      corpo = null;
    }
  } else if (risposta && typeof risposta === "object") {
    corpo = risposta as CorpoErroreGraph;
  }

  const err = corpo?.error;
  const codiceMeta = typeof err?.code === "number" ? err.code : undefined;
  const sottocodice = typeof err?.error_subcode === "number" ? err.error_subcode : undefined;
  const dettaglio = (err?.error_user_msg || err?.message || grezzo || "").toString().trim().slice(0, 300);
  const base = { codice_meta: codiceMeta, sottocodice_meta: sottocodice };

  if (codiceMeta === 190) {
    return {
      ...base,
      codice: "token_scaduto",
      messaggio: "Il collegamento con Meta è scaduto o è stato revocato: ricollega Meta dalle Integrazioni.",
    };
  }
  if (codiceMeta === 10 || codiceMeta === 200 || codiceMeta === 294 || (codiceMeta !== undefined && codiceMeta >= 200 && codiceMeta < 300)) {
    return {
      ...base,
      codice: "permesso_mancante",
      messaggio:
        "Ricollega Meta per concedere il permesso di gestire le inserzioni" +
        " (e controlla di avere un ruolo sull'account pubblicitario e sulla Pagina)." +
        (dettaglio ? ` Meta dice: ${dettaglio}` : ""),
    };
  }
  if (codiceMeta === 4 || codiceMeta === 17 || codiceMeta === 32 || codiceMeta === 613 || codiceMeta === 80004) {
    return {
      ...base,
      codice: "limite_richieste",
      messaggio: "Meta sta limitando le richieste di questo account: riprova tra qualche minuto.",
    };
  }
  if (codiceMeta === 368) {
    return {
      ...base,
      codice: "bloccato_da_meta",
      messaggio: `Meta ha bloccato temporaneamente l'operazione.${dettaglio ? ` Meta dice: ${dettaglio}` : ""}`,
    };
  }
  if (codiceMeta === 100) {
    return {
      ...base,
      codice: "dato_rifiutato",
      messaggio: `Meta ha rifiutato un dato della campagna.${dettaglio ? ` Meta dice: ${dettaglio}` : ""}`,
    };
  }
  return {
    ...base,
    codice: "errore_meta",
    messaggio: dettaglio ? `Meta ha risposto con un errore: ${dettaglio}` : "Meta ha risposto con un errore senza spiegazioni.",
  };
}

const MIME_IMMAGINE = /^image\/(png|jpe?g|gif|webp|bmp|tiff)$/i;

/** `data:image/png;base64,....` → mime + base64. Null se non è un'immagine in base64. */
export function datiDaDataUrl(valore: string): { mime: string; base64: string } | null {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(String(valore ?? "").trim());
  if (!m || !MIME_IMMAGINE.test(m[1])) return null;
  const base64 = m[2].replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  return { mime: m[1].toLowerCase(), base64 };
}

/** Dimensione in byte di un base64, senza decodificarlo. */
export function byteDaBase64(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** Uint8Array → base64, a blocchi (String.fromCharCode con spread va in stack overflow sui MB). */
export function base64DaBytes(bytes: Uint8Array): string {
  let binario = "";
  const blocco = 0x8000;
  for (let i = 0; i < bytes.length; i += blocco) {
    binario += String.fromCharCode(...bytes.subarray(i, i + blocco));
  }
  return btoa(binario);
}

/**
 * L'hash dalla risposta di /adimages. La documentazione descrive una mappa di
 * mappe (`images` → nome → { hash }): con `bytes` il nome è "bytes". Si cerca
 * l'hash al primo e al secondo livello, senza fidarsi della chiave.
 */
export function hashDaRispostaAdImages(risposta: unknown): string | null {
  const images = (risposta as { images?: unknown } | null)?.images;
  if (!images || typeof images !== "object") return null;
  for (const valore of Object.values(images as Record<string, unknown>)) {
    if (!valore || typeof valore !== "object") continue;
    const hash = (valore as { hash?: unknown }).hash;
    if (typeof hash === "string" && hash) return hash;
    for (const interno of Object.values(valore as Record<string, unknown>)) {
      const h = (interno as { hash?: unknown } | null)?.hash;
      if (typeof h === "string" && h) return h;
    }
  }
  return null;
}

/** L'account Instagram collegato alla Pagina, come lo salva meta-oauth-callback. */
export function igUserIdDallaPagina(metadata: unknown): string | null {
  const id = (metadata as { instagram_business_account?: { id?: unknown } | null } | null)
    ?.instagram_business_account?.id;
  return typeof id === "string" && id.trim() ? id.trim() : typeof id === "number" ? String(id) : null;
}

/**
 * Senza un account Instagram collegato alla Pagina gli annunci non hanno
 * un'identità su Instagram: invece di far fallire la creatività si tengono
 * solo i posizionamenti Facebook.
 */
export function limitaPiattaformeSenzaInstagram(
  targeting: Record<string, unknown>,
): { targeting: Record<string, unknown>; cambiato: boolean } {
  const copia: Record<string, unknown> = { ...targeting };
  const attuali = Array.isArray(copia.publisher_platforms)
    ? (copia.publisher_platforms as unknown[]).filter((p): p is string => typeof p === "string")
    : null;
  const avevaPosizioniIg = Array.isArray(copia.instagram_positions) && (copia.instagram_positions as unknown[]).length > 0;
  delete copia.instagram_positions;

  if (!attuali || attuali.length === 0) {
    // Posizionamenti automatici: Meta userebbe anche Instagram.
    copia.publisher_platforms = ["facebook"];
    return { targeting: copia, cambiato: true };
  }
  const senzaIg = attuali.filter((p) => p !== "instagram");
  copia.publisher_platforms = senzaIg.length > 0 ? senzaIg : ["facebook"];
  const cambiato = senzaIg.length !== attuali.length || avevaPosizioniIg;
  return { targeting: copia, cambiato };
}

export interface DatiCreativita {
  pageId?: string | null;
  igUserId?: string | null;
  messaggio: string;
  link: string;
  cta?: string | null;
  imageHash?: string | null;
  titolo?: string | null;
}

/** object_story_spec di un annuncio link con immagine (se c'è) e identità Instagram (se c'è). */
export function costruisciObjectStorySpec(dati: DatiCreativita): Record<string, unknown> {
  const linkData: Record<string, unknown> = {
    message: dati.messaggio,
    link: dati.link,
    call_to_action: { type: dati.cta || "GET_QUOTE", value: { link: dati.link } },
  };
  if (dati.imageHash) linkData.image_hash = dati.imageHash;
  if (dati.titolo) linkData.name = dati.titolo;
  return {
    ...(dati.pageId ? { page_id: dati.pageId } : {}),
    ...(dati.igUserId ? { instagram_user_id: dati.igUserId } : {}),
    link_data: linkData,
  };
}

/**
 * Da dove si può scaricare un'immagine per conto del cliente: data: URL o lo
 * storage pubblico di questo progetto. Un URL qualsiasi passato dal browser
 * farebbe della funzione un proxy verso la rete interna.
 */
export function sorgenteImmagineAmmessa(sorgente: string, supabaseUrl: string): boolean {
  const s = String(sorgente ?? "").trim();
  if (datiDaDataUrl(s)) return true;
  if (!supabaseUrl) return false;
  const base = supabaseUrl.replace(/\/+$/, "");
  return s.startsWith(`${base}/storage/v1/object/public/`) && !s.includes("..");
}
