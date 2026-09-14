// supabase/functions/_shared/statisticheSocialLogica.ts
//
// Logica pura (nessun import, nessuna rete) delle statistiche di Pagina
// Facebook e profilo Instagram: quali metriche chiedere, come leggere le
// risposte di Meta, come classificare gli errori. Testata in
// src/test/logic/statisticheSocialMeta.test.ts.
//
// METRICHE — scelte sulla documentazione ufficiale (settembre 2026):
//
// Pagina Facebook — https://developers.facebook.com/docs/graph-api/reference/insights
//   e https://developers.facebook.com/documentation/pages-api/platforminsights/page/deprecated-metrics
//   Deprecate e quindi NON usate: page_impressions (15/11/2025),
//   page_impressions_unique e tutte le *_impressions_*_unique (15/06/2025),
//   il blocco page_reach / post_reach / video_views_unique (15/06/2026).
//   La sostituta indicata da Meta per la copertura è page_total_media_view_unique.
//
// Instagram (Facebook Login) —
//   https://developers.facebook.com/docs/instagram-platform/api-reference/instagram-user/insights
//   https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights
//   `impressions` deprecata (21/04/2025) → `views`. `profile_views`,
//   `website_clicks` non più elencate → `profile_links_taps`. Metriche di
//   account con metric_type=total_value e period=day.
//
// Se Meta rifiuta comunque una metrica (#100 invalid metric), la
// sincronizzazione la riprova da sola e la registra come «non disponibile»:
// non si inventa uno zero.

export const METRICHE_PAGINA = [
  "page_follows",
  "page_daily_follows_unique",
  "page_daily_unfollows_unique",
  "page_media_view",
  "page_total_media_view_unique",
  "page_post_engagements",
  "page_views_total",
] as const;

export const METRICHE_POST_FACEBOOK = [
  "post_media_view",
  "post_total_media_view_unique",
  "post_clicks",
] as const;

export const METRICHE_INSTAGRAM_GIORNO = [
  "reach",
  "views",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "shares",
  "saves",
  "profile_links_taps",
] as const;

export const METRICHE_INSTAGRAM_MEDIA = [
  "reach",
  "views",
  "saved",
  "shares",
  "total_interactions",
] as const;

/** Instagram: le metriche di account si chiedono un giorno alla volta. */
export const MAX_GIORNI_INSTAGRAM = 30;
/** Facebook: since/until accetta al massimo 90 giorni. */
export const MAX_GIORNI_FACEBOOK = 90;

const GIORNO_MS = 86_400_000;

export interface ErroreMeta {
  code?: number;
  error_subcode?: number;
  message?: string;
  type?: string;
}

export type TipoErroreMeta = "permesso" | "metrica_non_valida" | "limite" | "altro";

/**
 * #10 e #200-#299 = permesso non concesso (read_insights,
 * instagram_manage_insights…), #190 = token scaduto o revocato: per chi
 * guarda la pagina è la stessa cosa, «ricollega Meta».
 * #4/#17/#32/#613 = limite di chiamate. #100 = parametro o metrica non validi.
 */
export function classificaErroreMeta(e: ErroreMeta | null | undefined): TipoErroreMeta {
  if (!e) return "altro";
  const code = Number(e.code ?? 0);
  const msg = String(e.message ?? "").toLowerCase();
  if ([4, 17, 32, 613].includes(code) || (code >= 80000 && code < 80100)) return "limite";
  if (code === 10 || code === 190 || (code >= 200 && code <= 299)) return "permesso";
  if (code === 100 && /permission|not authorized|insufficient|access token/.test(msg)) return "permesso";
  if (code === 100) return "metrica_non_valida";
  return "altro";
}

/** Un valore Meta come numero: numeri, stringhe numeriche, oggetti (somma dei valori). */
export function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Math.round(Number(v));
  if (v && typeof v === "object" && !Array.isArray(v)) {
    let tot = 0;
    let visto = false;
    for (const x of Object.values(v as Record<string, unknown>)) {
      const n = numero(x);
      if (n !== null) { tot += n; visto = true; }
    }
    return visto ? tot : null;
  }
  return null;
}

/** YYYY-MM-DD di una data UTC. */
export function giornoIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Le insights giornaliere di Pagina hanno end_time = fine del giorno
 * (es. "2026-09-13T07:00:00+0000" è il 12 settembre): il giorno è end_time
 * meno 24 ore.
 */
export function giornoDaEndTime(endTime: string): string | null {
  const normalizzato = endTime.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const t = Date.parse(normalizzato);
  if (!Number.isFinite(t)) return null;
  return giornoIso(new Date(t - GIORNO_MS));
}

/**
 * Quanti giorni riscrivere: quelli chiesti (7/30/90 dalla UI), altrimenti 3
 * se l'account ha già uno storico (Meta rettifica a posteriori), 30 la prima
 * volta. Mai oltre il limite della piattaforma.
 */
export function giorniDaSincronizzare(
  richiesti: number | undefined,
  haStorico: boolean,
  massimo: number,
): number {
  const base = richiesti && richiesti > 0 ? richiesti : haStorico ? 3 : 30;
  return Math.max(1, Math.min(massimo, Math.round(base)));
}

/** I giorni interi da `n` giorni fa a ieri (oggi non è ancora chiuso). */
export function elencoGiorni(n: number, adesso = new Date()): string[] {
  const oggi = Date.UTC(adesso.getUTCFullYear(), adesso.getUTCMonth(), adesso.getUTCDate());
  const out: string[] = [];
  for (let i = n; i >= 1; i--) out.push(giornoIso(new Date(oggi - i * GIORNO_MS)));
  return out;
}

/** Secondi unix dell'inizio (UTC) di un giorno YYYY-MM-DD. */
export function unixGiorno(giorno: string): number {
  return Math.floor(Date.parse(`${giorno}T00:00:00Z`) / 1000);
}

export interface RispostaInsights {
  data?: Array<{
    name?: string;
    period?: string;
    values?: Array<{ value?: unknown; end_time?: string }>;
    total_value?: {
      value?: unknown;
      breakdowns?: Array<{
        dimension_keys?: string[];
        results?: Array<{ dimension_values?: string[]; value?: unknown }>;
      }>;
    };
  }>;
}

/** Insights di Pagina (period=day) → giorno → { metrica: valore }. */
export function valoriPaginaPerGiorno(r: RispostaInsights | null | undefined): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
  for (const m of r?.data ?? []) {
    if (!m.name || (m.period && m.period !== "day")) continue;
    for (const v of m.values ?? []) {
      if (!v.end_time) continue;
      const giorno = giornoDaEndTime(v.end_time);
      const n = numero(v.value);
      if (!giorno || n === null) continue;
      if (!out.has(giorno)) out.set(giorno, {});
      out.get(giorno)![m.name] = n;
    }
  }
  return out;
}

/** Insights Instagram con metric_type=total_value → { metrica: valore }. */
export function valoriTotali(r: RispostaInsights | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of r?.data ?? []) {
    if (!m.name) continue;
    const n = numero(m.total_value?.value ?? m.values?.[0]?.value);
    if (n !== null) out[m.name] = n;
  }
  return out;
}

/**
 * follows_and_unfollows con breakdown=follow_type: FOLLOWER = chi ha
 * iniziato a seguire, NON_FOLLOWER = chi ha smesso.
 */
export function seguitiEPersi(r: RispostaInsights | null | undefined): { nuovi: number | null; persi: number | null } {
  let nuovi: number | null = null;
  let persi: number | null = null;
  for (const m of r?.data ?? []) {
    if (m.name !== "follows_and_unfollows") continue;
    for (const b of m.total_value?.breakdowns ?? []) {
      for (const res of b.results ?? []) {
        const tipo = res.dimension_values?.[0];
        const n = numero(res.value);
        if (n === null) continue;
        if (tipo === "FOLLOWER") nuovi = (nuovi ?? 0) + n;
        else if (tipo === "NON_FOLLOWER") persi = (persi ?? 0) + n;
      }
    }
  }
  return { nuovi, persi };
}

export interface ValoriGiorno {
  follower: number | null;
  nuovi_follower: number | null;
  follower_persi: number | null;
  copertura: number | null;
  visualizzazioni: number | null;
  interazioni: number | null;
  visite_profilo: number | null;
  click_link: number | null;
  metriche: Record<string, number>;
}

export function valoriGiornoFacebook(v: Record<string, number>): ValoriGiorno {
  return {
    follower: v.page_follows ?? null,
    nuovi_follower: v.page_daily_follows_unique ?? null,
    follower_persi: v.page_daily_unfollows_unique ?? null,
    copertura: v.page_total_media_view_unique ?? null,
    visualizzazioni: v.page_media_view ?? null,
    interazioni: v.page_post_engagements ?? null,
    visite_profilo: v.page_views_total ?? null,
    click_link: null,
    metriche: v,
  };
}

export function valoriGiornoInstagram(
  v: Record<string, number>,
  seguiti: { nuovi: number | null; persi: number | null },
): ValoriGiorno {
  const metriche = { ...v };
  if (seguiti.nuovi !== null) metriche.follows = seguiti.nuovi;
  if (seguiti.persi !== null) metriche.unfollows = seguiti.persi;
  return {
    follower: null,
    nuovi_follower: seguiti.nuovi,
    follower_persi: seguiti.persi,
    copertura: v.reach ?? null,
    visualizzazioni: v.views ?? null,
    interazioni: v.total_interactions ?? null,
    visite_profilo: null,
    click_link: v.profile_links_taps ?? null,
    metriche,
  };
}

export interface PostFacebookApi {
  id?: string;
  message?: string;
  story?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  status_type?: string;
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
  insights?: RispostaInsights;
}

export interface ValoriPost {
  post_id: string;
  pubblicato_il: string | null;
  tipo: string | null;
  testo: string | null;
  permalink: string | null;
  immagine_url: string | null;
  copertura: number | null;
  visualizzazioni: number | null;
  reazioni: number | null;
  commenti: number | null;
  condivisioni: number | null;
  salvataggi: number | null;
  clic: number | null;
  interazioni: number | null;
  metriche: Record<string, number>;
}

function tipoPostFacebook(statusType: string | undefined): string {
  if (!statusType) return "post";
  if (statusType.includes("video")) return "video";
  if (statusType.includes("photo")) return "foto";
  return "post";
}

const somma = (...xs: Array<number | null>): number | null => {
  const validi = xs.filter((x): x is number => x !== null);
  return validi.length ? validi.reduce((a, b) => a + b, 0) : null;
};

export function valoriPostFacebook(p: PostFacebookApi): ValoriPost | null {
  if (!p.id) return null;
  const metriche: Record<string, number> = {};
  for (const m of p.insights?.data ?? []) {
    const n = numero(m.values?.[0]?.value);
    if (m.name && n !== null) metriche[m.name] = n;
  }
  const reazioni = numero(p.reactions?.summary?.total_count);
  const commenti = numero(p.comments?.summary?.total_count);
  const condivisioni = numero(p.shares?.count) ?? (p.reactions ? 0 : null);
  return {
    post_id: p.id,
    pubblicato_il: p.created_time ?? null,
    tipo: tipoPostFacebook(p.status_type),
    testo: (p.message ?? p.story ?? "").slice(0, 2000) || null,
    permalink: p.permalink_url ?? null,
    immagine_url: p.full_picture ?? null,
    copertura: metriche.post_total_media_view_unique ?? null,
    visualizzazioni: metriche.post_media_view ?? null,
    reazioni,
    commenti,
    condivisioni,
    salvataggi: null,
    clic: metriche.post_clicks ?? null,
    interazioni: somma(reazioni, commenti, condivisioni),
    metriche,
  };
}

export interface MediaInstagramApi {
  id?: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  timestamp?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  like_count?: number;
  comments_count?: number;
}

export function tipoMediaInstagram(m: MediaInstagramApi): string {
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_type === "CAROUSEL_ALBUM") return "carosello";
  if (m.media_type === "VIDEO") return "video";
  return "foto";
}

export function valoriPostInstagram(m: MediaInstagramApi, insights: Record<string, number>): ValoriPost | null {
  if (!m.id) return null;
  const reazioni = numero(m.like_count);
  const commenti = numero(m.comments_count);
  const condivisioni = insights.shares ?? null;
  const salvataggi = insights.saved ?? null;
  return {
    post_id: m.id,
    pubblicato_il: m.timestamp ?? null,
    tipo: tipoMediaInstagram(m),
    testo: (m.caption ?? "").slice(0, 2000) || null,
    permalink: m.permalink ?? null,
    immagine_url: m.media_type === "VIDEO" ? (m.thumbnail_url ?? null) : (m.media_url ?? m.thumbnail_url ?? null),
    copertura: insights.reach ?? null,
    visualizzazioni: insights.views ?? null,
    reazioni,
    commenti,
    condivisioni,
    salvataggi,
    clic: null,
    interazioni: insights.total_interactions ?? somma(reazioni, commenti, condivisioni, salvataggi),
    metriche: insights,
  };
}

/**
 * Se una riga di insights non ha il follower (metrica non disponibile), si
 * tiene quello già salvato per quel giorno (la fotografia di followers_count
 * scritta il giorno stesso) invece di cancellarlo con un null.
 */
export function unisciFollower(nuovo: number | null, esistente: number | null | undefined): number | null {
  return nuovo ?? esistente ?? null;
}

export type EsitoAccount = "ok" | "parziale" | "permesso_mancante" | "errore";

export function esitoAccount(s: { permesso: boolean; errore: boolean; nonDisponibili: string[] }): EsitoAccount {
  if (s.permesso) return "permesso_mancante";
  if (s.errore) return "errore";
  if (s.nonDisponibili.length) return "parziale";
  return "ok";
}
