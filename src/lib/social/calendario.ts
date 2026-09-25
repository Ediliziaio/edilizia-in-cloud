/**
 * Calendario social: stati veri, azioni possibili, orari (24/09/2026).
 *
 * Prima il calendario mostrava lo stato grezzo del database: un post
 * programmato e mai uscito restava blu «Programmato», uno uscito su Facebook
 * ma non su Instagram era verde «Pubblicato», le bozze stavano su «domani».
 * Qui si decide cosa vede la persona e cosa può fare, in funzioni pure.
 */
import { metaAccountsFor } from "./publishing";
import {
  motivoPiattaforma,
  paginePronte,
  piattaformePronte,
  spiegaMotivo,
  type StatoPubblicazioneSocial,
} from "./statoPubblicazione";
import type { SocialScheduledPost } from "./types";

const NOMI_PIATTAFORME: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
};

export const nomePiattaforma = (id: string): string => NOMI_PIATTAFORME[id] ?? id;

/** «Facebook», «Facebook e Instagram», «LinkedIn, YouTube e TikTok». */
export function elencoNomi(nomi: string[]): string {
  if (nomi.length <= 1) return nomi.join("");
  return `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

/** Il cron pubblica ogni 5 minuti: passato un quarto d'ora dall'orario, il post è in ritardo. */
export const RITARDO_DOPO_MS = 15 * 60_000;

export type StatoCalendario =
  | "bozza"
  | "da_approvare"
  | "programmato"
  | "in_ritardo"
  | "in_pubblicazione"
  | "pubblicato"
  | "uscito_in_parte"
  | "fallito";

export interface InfoStato {
  stato: StatoCalendario;
  etichetta: string;
  /** Qualcosa da sistemare: in ritardo, uscito in parte, non uscito. */
  problema: boolean;
}

const ETICHETTE: Record<StatoCalendario, string> = {
  bozza: "Bozza",
  da_approvare: "Da approvare",
  programmato: "Programmato",
  in_ritardo: "In ritardo",
  in_pubblicazione: "In pubblicazione",
  pubblicato: "Pubblicato",
  uscito_in_parte: "Uscito in parte",
  fallito: "Non uscito",
};

const info = (stato: StatoCalendario): InfoStato => ({
  stato,
  etichetta: ETICHETTE[stato],
  problema: stato === "in_ritardo" || stato === "uscito_in_parte" || stato === "fallito",
});

/** Le piattaforme su cui il post non è uscito (esclusa la voce generale _error). */
export function piattaformeFallite(post: Pick<SocialScheduledPost, "publishResult">): string[] {
  return Object.entries(post.publishResult ?? {})
    .filter(([chiave, esito]) => chiave !== "_error" && esito && esito.ok === false && !esito.pending)
    .map(([chiave]) => chiave);
}

/** Ha una data vera? Le bozze senza data hanno scheduled_at vuoto. */
export function haData(post: Pick<SocialScheduledPost, "scheduled_at">): boolean {
  return Boolean(post.scheduled_at) && Number.isFinite(Date.parse(post.scheduled_at));
}

export function statoCalendario(
  post: Pick<SocialScheduledPost, "status" | "scheduled_at" | "publishResult">,
  adesso = Date.now(),
): InfoStato {
  switch (post.status) {
    case "draft":
      return info("bozza");
    case "review":
      return info("da_approvare");
    case "processing":
      return info("in_pubblicazione");
    case "failed":
      return info("fallito");
    case "published":
      return info(piattaformeFallite(post).length > 0 ? "uscito_in_parte" : "pubblicato");
    case "scheduled":
    default: {
      const quando = Date.parse(post.scheduled_at);
      return info(Number.isFinite(quando) && quando < adesso - RITARDO_DOPO_MS ? "in_ritardo" : "programmato");
    }
  }
}

export type GruppoStato = "programmati" | "da_approvare" | "pubblicati" | "da_sistemare";

/** In quale contatore finisce uno stato; le bozze non stanno nel calendario. */
export function gruppoDi(stato: StatoCalendario): GruppoStato | null {
  switch (stato) {
    case "programmato":
    case "in_pubblicazione":
      return "programmati";
    case "da_approvare":
      return "da_approvare";
    case "pubblicato":
      return "pubblicati";
    case "in_ritardo":
    case "uscito_in_parte":
    case "fallito":
      return "da_sistemare";
    default:
      return null;
  }
}

export function contaPerGruppo(
  posts: Array<Pick<SocialScheduledPost, "status" | "scheduled_at" | "publishResult">>,
  adesso = Date.now(),
): Record<GruppoStato, number> {
  const conti: Record<GruppoStato, number> = { programmati: 0, da_approvare: 0, pubblicati: 0, da_sistemare: 0 };
  for (const post of posts) {
    const gruppo = gruppoDi(statoCalendario(post, adesso).stato);
    if (gruppo) conti[gruppo] += 1;
  }
  return conti;
}

/** Chiave del giorno LOCALE «YYYY-MM-DD» (mai toISOString: sposterebbe i post vicino a mezzanotte). */
export function chiaveGiorno(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lunedì della settimana, alle 00:00 locali. */
export function inizioSettimana(d: Date): Date {
  const lunedi = new Date(d);
  const giorno = lunedi.getDay() === 0 ? 6 : lunedi.getDay() - 1;
  lunedi.setDate(lunedi.getDate() - giorno);
  lunedi.setHours(0, 0, 0, 0);
  return lunedi;
}

/**
 * Le ore da mostrare nella settimana: 8-20, allargate a ogni ora che ha un post.
 * Prima erano fisse 8-20 e i post delle 7:00 o delle 21:30 non si vedevano.
 */
export function fasceOrarie(oreConPost: number[], da = 8, a = 20): number[] {
  const valide = oreConPost.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  const inizio = Math.min(da, ...valide);
  const fine = Math.max(a, ...valide);
  return Array.from({ length: fine - inizio + 1 }, (_, i) => inizio + i);
}

/**
 * Data e ora proposte per un post nuovo creato dal calendario, o null se il
 * momento è già passato. Senza ora: 9:00, oppure oggi la prima ora piena ad
 * almeno mezz'ora da adesso.
 */
export function dataPerNuovoPost(
  giorno: Date,
  ora: number | null,
  adesso = new Date(),
): { data: string; ora: string } | null {
  const scelto = new Date(giorno);
  if (ora == null) {
    scelto.setHours(9, 0, 0, 0);
    if (chiaveGiorno(giorno) === chiaveGiorno(adesso) && scelto.getTime() < adesso.getTime() + 30 * 60_000) {
      const prossima = new Date(adesso.getTime() + 30 * 60_000);
      prossima.setMinutes(0, 0, 0);
      prossima.setHours(prossima.getHours() + 1);
      if (chiaveGiorno(prossima) !== chiaveGiorno(adesso)) return null;
      scelto.setHours(prossima.getHours(), 0, 0, 0);
    }
  } else {
    scelto.setHours(ora, 0, 0, 0);
  }
  if (scelto.getTime() < adesso.getTime() + 10 * 60_000) return null;
  return { data: chiaveGiorno(scelto), ora: `${String(scelto.getHours()).padStart(2, "0")}:00` };
}

export type AzionePost =
  | "approva"
  | "rimanda"
  | "pubblica_ora"
  | "riprova"
  | "programma"
  | "sposta"
  | "annulla_programmazione"
  | "modifica"
  | "duplica"
  | "elimina";

/** Cosa si può fare su un post, nell'ordine in cui si propone. */
export function azioniPost(
  post: Pick<SocialScheduledPost, "status" | "scheduled_at" | "publishResult">,
  opzioni: { puoApprovare: boolean; adesso?: number },
): AzionePost[] {
  const { stato } = statoCalendario(post, opzioni.adesso);
  switch (stato) {
    case "bozza":
      return ["modifica", "programma", "pubblica_ora", "duplica", "elimina"];
    case "da_approvare":
      return [
        ...(opzioni.puoApprovare ? (["approva", "rimanda"] as AzionePost[]) : []),
        "modifica",
        "sposta",
        "duplica",
        "elimina",
      ];
    case "programmato":
      return ["modifica", "sposta", "pubblica_ora", "annulla_programmazione", "duplica", "elimina"];
    case "in_ritardo":
      return ["pubblica_ora", "sposta", "annulla_programmazione", "modifica", "duplica", "elimina"];
    case "fallito":
      return ["riprova", "modifica", "sposta", "duplica", "elimina"];
    case "uscito_in_parte":
      return ["riprova", "duplica", "elimina"];
    case "pubblicato":
      return ["duplica", "elimina"];
    case "in_pubblicazione":
    default:
      return ["duplica"];
  }
}

/** Un post già pubblicato, letto da Facebook o da Instagram (anche fuori dall'app). */
export interface PostEsterno {
  id: string;
  pageId: string;
  pagina: string;
  testo: string;
  quando: string;
  link: string | null;
  immagine: string | null;
  /** Assente = Facebook (i post letti dalle pagine per il calendario). */
  piattaforma?: "facebook" | "instagram";
  numeri?: {
    reazioni: number | null;
    commenti: number | null;
    copertura: number | null;
    salvataggi: number | null;
    visualizzazioni: number | null;
  };
}

const inizioTesto = (testo: string) => testo.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);

/**
 * I post letti da Facebook meno quelli già nel calendario perché pubblicati
 * dall'app: stesso id (anche nella forma pagina_post), o stesso inizio del
 * testo entro due ore.
 */
export function postEsterniNuovi(
  esterni: PostEsterno[],
  postApp: Array<Pick<SocialScheduledPost, "text" | "scheduled_at" | "publishResult">>,
): PostEsterno[] {
  const idApp = new Set<string>();
  const testiApp: Array<{ testo: string; quando: number }> = [];
  for (const post of postApp) {
    const id = post.publishResult?.facebook?.ok ? post.publishResult.facebook.id : undefined;
    if (id) idApp.add(String(id));
    if (post.publishResult?.facebook?.ok && post.text) {
      testiApp.push({ testo: inizioTesto(post.text), quando: Date.parse(post.scheduled_at) });
    }
  }
  return esterni.filter((esterno) => {
    const suffisso = esterno.id.includes("_") ? esterno.id.split("_").pop() ?? "" : esterno.id;
    if (idApp.has(esterno.id) || idApp.has(suffisso)) return false;
    const testo = inizioTesto(esterno.testo);
    const quando = Date.parse(esterno.quando);
    return !testiApp.some((p) => testo !== "" && p.testo === testo && Math.abs(p.quando - quando) < 2 * 3_600_000);
  });
}

export type Destinazioni =
  | { platforms: string[]; targetPageIds: Record<string, string>; tolte: string[] }
  | { errore: string };

/**
 * Dove può uscire adesso un post del calendario (approvazione, «Pubblica
 * adesso», «Riprova», «Programma»): solo le piattaforme con una pagina pronta,
 * e la pagina sempre esplicita. Se nessuna è pronta, il motivo in una frase.
 */
export function destinazioniPronte(
  post: Pick<SocialScheduledPost, "platforms" | "targetPageIds">,
  stato: StatoPubblicazioneSocial | null,
  soloPiattaforme?: string[],
): Destinazioni {
  if (!stato) return { errore: "Non so ancora se le pagine possono pubblicare: riprova tra poco." };
  const ok = piattaformePronte(stato);
  const scelte = soloPiattaforme ?? post.platforms;
  const platforms = scelte.filter((p) => ok.includes(p));
  const tolte = scelte.filter((p) => !ok.includes(p));
  if (platforms.length === 0) {
    const bloccata = scelte.find((p) => motivoPiattaforma(stato, p));
    const motivo = bloccata ? motivoPiattaforma(stato, bloccata) : null;
    if (bloccata && motivo) return { errore: `${nomePiattaforma(bloccata)}. ${spiegaMotivo(motivo).lungo}` };
    if (scelte.length === 0) return { errore: "Il post non ha piattaforme: aprilo con «Modifica» e scegline una." };
    return {
      errore: `${elencoNomi(scelte.map(nomePiattaforma))} ${scelte.length === 1 ? "non è collegato" : "non sono collegati"}: da qui si pubblica su Facebook e Instagram.`,
    };
  }
  const pronte = paginePronte(stato);
  const targetPageIds: Record<string, string> = {};
  for (const p of platforms) {
    const opzioni = metaAccountsFor(pronte, p);
    const scelta = post.targetPageIds?.[p];
    if (scelta && opzioni.some((o) => o.page_id === scelta)) targetPageIds[p] = scelta;
    else if (opzioni.length === 1) targetPageIds[p] = opzioni[0].page_id;
    else return { errore: `Scegli su quale pagina ${nomePiattaforma(p)} pubblicare: apri il post con «Modifica».` };
  }
  return { platforms, targetPageIds, tolte };
}
