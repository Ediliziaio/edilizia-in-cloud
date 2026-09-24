/**
 * Il profilo WhatsApp di un numero collegato (24/09/2026): foto, info,
 * descrizione, indirizzo, email, siti e categoria, quelli che il cliente vede
 * aprendo la chat. Le regole di Meta stanno qui, una volta sola: le usano la
 * finestra «Profilo» dell'app e la funzione `whatsapp-profilo` che lo salva.
 *
 * I limiti sono quelli di Meta (whatsapp_business_profile della Cloud API):
 *  - info (about): da 1 a 139 caratteri e non può restare vuota;
 *  - descrizione fino a 512, indirizzo fino a 256, email fino a 128;
 *  - al massimo 2 siti, fino a 256 caratteri, con http:// o https://;
 *  - categoria (vertical) da un elenco fisso: una volta scelta non torna vuota.
 * Il nome visualizzato non è qui: lo cambia solo Meta, dopo una revisione.
 *
 * Nessun import: il file lo leggono sia Deno sia l'app.
 */

export const LIMITI_PROFILO = {
  info: 139,
  descrizione: 512,
  indirizzo: 256,
  email: 128,
  sito: 256,
  siti: 2,
} as const;

/** La foto: WhatsApp la mostra quadrata; si manda già ritagliata a 640×640. */
export const FOTO_PROFILO = {
  lato: 640,
  maxByte: 5 * 1024 * 1024,
  tipiAmmessi: ["image/jpeg", "image/png"] as const,
} as const;

/** Le categorie di Meta, in italiano. «UNDEFINED» vuol dire «non scelta». */
export const CATEGORIE_WHATSAPP: ReadonlyArray<{ valore: string; etichetta: string }> = [
  { valore: "PROF_SERVICES", etichetta: "Servizi professionali" },
  { valore: "OTHER", etichetta: "Altro" },
  { valore: "AUTO", etichetta: "Auto e motori" },
  { valore: "BEAUTY", etichetta: "Bellezza e benessere" },
  { valore: "APPAREL", etichetta: "Abbigliamento" },
  { valore: "EDU", etichetta: "Istruzione" },
  { valore: "ENTERTAIN", etichetta: "Intrattenimento" },
  { valore: "EVENT_PLAN", etichetta: "Organizzazione eventi" },
  { valore: "FINANCE", etichetta: "Finanza e banche" },
  { valore: "GROCERY", etichetta: "Alimentari" },
  { valore: "GOVT", etichetta: "Enti pubblici" },
  { valore: "HOTEL", etichetta: "Hotel e alloggi" },
  { valore: "HEALTH", etichetta: "Salute" },
  { valore: "NONPROFIT", etichetta: "Non profit" },
  { valore: "RETAIL", etichetta: "Negozi" },
  { valore: "TRAVEL", etichetta: "Viaggi e trasporti" },
  { valore: "RESTAURANT", etichetta: "Ristoranti" },
  { valore: "NOT_A_BIZ", etichetta: "Non è un'attività" },
];

const CATEGORIE_AMMESSE = new Set(CATEGORIE_WHATSAPP.map((c) => c.valore));

/** I campi da chiedere a Meta in lettura. */
export const CAMPI_META_PROFILO = "about,address,description,email,profile_picture_url,websites,vertical";

export interface ProfiloWhatsApp {
  info: string;
  descrizione: string;
  indirizzo: string;
  email: string;
  siti: string[];
  /** Codice Meta della categoria; "" se non è ancora stata scelta. */
  categoria: string;
  /** Solo lettura: l'indirizzo della foto attuale, se c'è. */
  fotoUrl: string | null;
}

export type CampoProfilo = "info" | "descrizione" | "indirizzo" | "email" | "siti" | "categoria";
export type ErroriProfilo = Partial<Record<CampoProfilo, string>>;

function testo(valore: unknown): string {
  return typeof valore === "string" ? valore : "";
}

/** Il profilo come lo restituisce Meta (`data[0]`), nella forma dell'app. */
export function profiloDaMeta(dati: unknown): ProfiloWhatsApp {
  const d = (dati && typeof dati === "object" ? dati : {}) as Record<string, unknown>;
  const categoria = testo(d.vertical);
  return {
    info: testo(d.about),
    descrizione: testo(d.description),
    indirizzo: testo(d.address),
    email: testo(d.email),
    siti: Array.isArray(d.websites) ? d.websites.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [],
    categoria: categoria === "UNDEFINED" ? "" : categoria,
    fotoUrl: testo(d.profile_picture_url) || null,
  };
}

/** Un sito scritto senza http:// (www.sito.it) diventa https://www.sito.it. */
export function normalizzaSito(sito: string): string {
  const pulito = sito.trim();
  if (!pulito) return "";
  return /^https?:\/\//i.test(pulito) ? pulito : `https://${pulito}`;
}

/** Spazi in testa e in coda tolti, siti vuoti e doppi scartati. */
export function normalizzaProfilo(profilo: Partial<ProfiloWhatsApp>): ProfiloWhatsApp {
  const siti: string[] = [];
  for (const sito of profilo.siti ?? []) {
    const n = normalizzaSito(typeof sito === "string" ? sito : "");
    if (n && !siti.includes(n)) siti.push(n);
  }
  return {
    info: testo(profilo.info).trim(),
    descrizione: testo(profilo.descrizione).trim(),
    indirizzo: testo(profilo.indirizzo).trim(),
    email: testo(profilo.email).trim(),
    siti,
    categoria: testo(profilo.categoria).trim(),
    fotoUrl: profilo.fotoUrl ?? null,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sitoValido(sito: string): boolean {
  if (sito.length > LIMITI_PROFILO.sito) return false;
  try {
    const url = new URL(sito);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Cosa non va, campo per campo, con la frase da mostrare. `precedente` è il
 * profilo com'è adesso su WhatsApp: l'info si può lasciare vuota solo se lo è
 * già (Meta non la lascia svuotare).
 */
export function erroriProfilo(profilo: ProfiloWhatsApp, precedente?: ProfiloWhatsApp | null): ErroriProfilo {
  const errori: ErroriProfilo = {};
  if (!profilo.info && precedente?.info) {
    errori.info = "WhatsApp non permette di lasciarla vuota: scrivi una frase o lasciala com'era.";
  } else if (profilo.info.length > LIMITI_PROFILO.info) {
    errori.info = `Al massimo ${LIMITI_PROFILO.info} caratteri.`;
  }
  if (profilo.descrizione.length > LIMITI_PROFILO.descrizione) {
    errori.descrizione = `Al massimo ${LIMITI_PROFILO.descrizione} caratteri.`;
  }
  if (profilo.indirizzo.length > LIMITI_PROFILO.indirizzo) {
    errori.indirizzo = `Al massimo ${LIMITI_PROFILO.indirizzo} caratteri.`;
  }
  if (profilo.email.length > LIMITI_PROFILO.email) {
    errori.email = `Al massimo ${LIMITI_PROFILO.email} caratteri.`;
  } else if (profilo.email && !EMAIL.test(profilo.email)) {
    errori.email = "Indirizzo email non valido.";
  }
  if (profilo.siti.length > LIMITI_PROFILO.siti) {
    errori.siti = `Al massimo ${LIMITI_PROFILO.siti} siti.`;
  } else if (profilo.siti.some((sito) => !sitoValido(sito))) {
    errori.siti = "Indirizzo del sito non valido (es. https://www.miosito.it).";
  }
  if (profilo.categoria && !CATEGORIE_AMMESSE.has(profilo.categoria)) {
    errori.categoria = "Categoria non valida.";
  } else if (!profilo.categoria && precedente?.categoria) {
    errori.categoria = "Una volta scelta, la categoria non si può togliere: scegline un'altra.";
  }
  return errori;
}

/**
 * Il corpo per `POST /{numero}/whatsapp_business_profile`: solo i campi
 * cambiati, così quello che non si è toccato su WhatsApp resta com'è. Null se
 * non è cambiato niente.
 */
export function corpoPerMeta(
  profilo: ProfiloWhatsApp,
  precedente: ProfiloWhatsApp,
): Record<string, unknown> | null {
  const corpo: Record<string, unknown> = {};
  if (profilo.info && profilo.info !== precedente.info) corpo.about = profilo.info;
  if (profilo.descrizione !== precedente.descrizione) corpo.description = profilo.descrizione;
  if (profilo.indirizzo !== precedente.indirizzo) corpo.address = profilo.indirizzo;
  if (profilo.email !== precedente.email) corpo.email = profilo.email;
  if (profilo.siti.join("\n") !== precedente.siti.join("\n")) corpo.websites = profilo.siti;
  if (profilo.categoria && profilo.categoria !== precedente.categoria) corpo.vertical = profilo.categoria;
  if (Object.keys(corpo).length === 0) return null;
  return { messaging_product: "whatsapp", ...corpo };
}
