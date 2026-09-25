/**
 * Griglia Instagram: il profilo vero, nell'ordine in cui lo vedrà il cliente (25/09/2026).
 *
 * Prima: profilo finto uguale per tutti (nome e follower inventati), i
 * post programmati SOTTO quelli pubblicati (su Instagram il più nuovo sta in
 * alto a sinistra), i pubblicati come quadrati grigi, le storie nella griglia,
 * gli account mischiati, l'argomento indovinato dal testo.
 */
import { haData, statoCalendario, type InfoStato } from "./calendario";
import type { SocialPostMedia, SocialScheduledPost } from "./types";

/** Un post già su Instagram, dal database (social_statistiche_post, aggiornato ogni 4 ore). */
export interface PostInstagramReale {
  postId: string;
  pageId: string;
  quando: string;
  formato: FormatoGriglia;
  testo: string;
  link: string | null;
  immagine: string | null;
  numeri: {
    reazioni: number | null;
    commenti: number | null;
    copertura: number | null;
    salvataggi: number | null;
    visualizzazioni: number | null;
  };
  sincronizzatoIl: string | null;
  /** Solo per la Demo Azienda: il colore al posto della foto. */
  gradiente?: string;
}

export type FormatoGriglia = "foto" | "carosello" | "reel" | "video";

export type CellaGriglia =
  | {
    tipo: "app";
    id: string;
    quando: Date | null;
    post: SocialScheduledPost;
    info: InfoStato;
    /** Non ancora su Instagram: programmato, da approvare, in ritardo, in pubblicazione, bozza. */
    futura: boolean;
    formato: FormatoGriglia;
    immagine: string | null;
  }
  | {
    tipo: "instagram";
    id: string;
    quando: Date;
    reale: PostInstagramReale;
    formato: FormatoGriglia;
    immagine: string | null;
  };

export function formatoDaTipo(tipo: string | null | undefined): FormatoGriglia {
  const t = (tipo ?? "").toLowerCase();
  if (t === "carosello" || t === "carousel" || t === "carousel_album") return "carosello";
  if (t === "reel" || t === "reels") return "reel";
  if (t === "video") return "video";
  return "foto";
}

/** La foto da mostrare: la prima immagine del post, mai l'indirizzo di un video. */
export function immagineDelPost(post: Pick<SocialScheduledPost, "media" | "image_url" | "contentType">): string | null {
  const media: SocialPostMedia[] = post.media ?? [];
  const foto = media.find((m) => m.type !== "video" && m.url);
  if (foto?.url) return foto.url;
  if (media.length > 0) return null; // solo video: nessuna foto
  if (post.contentType === "reel" || post.contentType === "video") return null;
  return post.image_url ?? null;
}

/**
 * Su quale account Instagram (id della pagina Facebook) esce il post: quello
 * scelto, o l'unico collegato. Con più account e nessuna scelta: null (il
 * publisher lo rifiuterebbe, e la griglia non lo mette su un account a caso).
 */
export function accountInstagramDelPost(
  post: Pick<SocialScheduledPost, "targetPageIds">,
  accountIds: string[],
): string | null {
  const scelto = post.targetPageIds?.instagram;
  if (scelto) return accountIds.includes(scelto) ? scelto : null;
  return accountIds.length === 1 ? accountIds[0] : null;
}

/** Instagram è uscito (o sta uscendo) per questo post? Uno uscito solo su Facebook non va nel profilo. */
function uscitoSuInstagram(post: SocialScheduledPost): boolean {
  const esito = post.publishResult?.instagram;
  if (!esito) return post.status === "published";
  return esito.ok === true;
}

const STATI_FUTURI = new Set(["programmato", "da_approvare", "in_ritardo", "in_pubblicazione"]);

export interface OpzioniGriglia {
  posts: SocialScheduledPost[];
  reali: PostInstagramReale[];
  pageId: string;
  accountIds: string[];
  mostraBozze: boolean;
  adesso?: number;
}

/**
 * Le celle del profilo, come le vedrà il cliente: in alto a sinistra la più
 * nuova. Prima i post non ancora usciti (il più lontano per primo; le bozze
 * senza data in cima), poi quelli già su Instagram. Niente storie: su
 * Instagram non stanno nel profilo.
 */
export function costruisciGriglia({ posts, reali, pageId, accountIds, mostraBozze, adesso = Date.now() }: OpzioniGriglia): {
  celle: CellaGriglia[];
  senzaAccount: number;
} {
  const futuri: CellaGriglia[] = [];
  const pubblicatiApp: CellaGriglia[] = [];
  let senzaAccount = 0;
  const idReali = new Set(reali.map((r) => r.postId));

  for (const post of posts) {
    if (!post.platforms.includes("instagram") || post.contentType === "story") continue;
    const account = accountInstagramDelPost(post, accountIds);
    if (!account) {
      if (post.status !== "published" && post.status !== "failed") senzaAccount += 1;
      continue;
    }
    if (account !== pageId) continue;
    const info = statoCalendario(post, adesso);
    const base = {
      tipo: "app" as const,
      id: post.id,
      quando: haData(post) ? new Date(post.scheduled_at) : null,
      post,
      info,
      formato: formatoDaTipo(post.contentType),
      immagine: immagineDelPost(post),
    };
    if (STATI_FUTURI.has(info.stato) || (info.stato === "bozza" && mostraBozze)) {
      futuri.push({ ...base, futura: true });
    } else if ((info.stato === "pubblicato" || info.stato === "uscito_in_parte") && uscitoSuInstagram(post)) {
      // Già tra i post letti da Instagram: si tiene quello, che ha i numeri.
      const idInstagram = post.publishResult?.instagram?.id;
      if (idInstagram && idReali.has(String(idInstagram))) continue;
      pubblicatiApp.push({ ...base, futura: false });
    }
  }

  const tempo = (c: CellaGriglia) => (c.quando ? c.quando.getTime() : Number.POSITIVE_INFINITY);
  futuri.sort((a, b) => tempo(b) - tempo(a));

  const giaSu: CellaGriglia[] = [
    ...pubblicatiApp,
    ...reali
      .filter((r) => r.pageId === pageId)
      .map((r) => ({
        tipo: "instagram" as const,
        id: `ig-${r.postId}`,
        quando: new Date(r.quando),
        reale: r,
        formato: r.formato,
        immagine: r.immagine,
      })),
  ]
    .filter((c) => c.quando && Number.isFinite(c.quando.getTime()))
    .sort((a, b) => (b.quando?.getTime() ?? 0) - (a.quando?.getTime() ?? 0));

  return { celle: [...futuri, ...giaSu], senzaAccount };
}

/** Due post si scambiano giorno e ora solo se non sono ancora usciti e la data è ad almeno 5 minuti. */
export function scambiabile(cella: CellaGriglia | null | undefined, adesso = Date.now()): boolean {
  if (!cella || cella.tipo !== "app" || !cella.quando) return false;
  if (!["scheduled", "review", "draft"].includes(cella.post.status)) return false;
  return cella.quando.getTime() >= adesso + 5 * 60_000;
}

/** «15.137», «1,2 mila» no: il numero intero, come lo scrive Instagram in italiano. */
export function numeroIntero(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("it-IT") : "—";
}
