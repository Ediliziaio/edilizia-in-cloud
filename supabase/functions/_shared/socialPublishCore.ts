// ============================================================================
// socialPublishCore — pubblicazione organica reale su Meta (Facebook + Instagram)
// ============================================================================
// Usato sia da `social-publish` (pubblica-ora, user-auth) sia da
// `social-publish-scheduler` (cron, service-role). Pubblica un social_post
// sulle piattaforme collegate e scrive l'esito in social_posts.publish_result.
//
// Pagina: social_accounts (popolata dal trigger su meta_assets) + la scelta
// del post in target_page_ids. Con più pagine e nessuna scelta → errore.
// Token: integration_credentials.meta_page_tokens[page_id] (criptato).
// IG business account id: meta_assets.metadata.instagram_business_account.id.
// File: social_posts.media ([{bucket,path,url,type}]) o image_url; i file nel
// bucket privato ricevono un URL firmato a ogni giro. I data: URL si rifiutano.
//
// Un giro può non chiudere il post: un contenitore Instagram ancora in
// elaborazione o un errore temporaneo lasciano il post in 'processing' con
// next_attempt_at, e il cron lo riprende. Le piattaforme già uscite non si
// ripubblicano (publish_result del giro precedente).
//
// Permessi Meta:
//  - Facebook: pages_manage_posts, pages_read_engagement, pages_show_list
//  - Instagram: instagram_basic, instagram_content_publish, pages_read_engagement
//  - primo commento: pages_manage_engagement (FB), instagram_manage_comments (IG)
//    — se manca, il post esce lo stesso e publish_result porta un avviso.
// ============================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

import { decrypt, getEncryptionKey } from "./encryption.ts";
import {
  CAROUSEL_MAX,
  IG_PROCESSING_TIMEOUT_MS,
  MAX_RETRY_ATTEMPTS,
  captionFor,
  checkMediaUrl,
  failureFromMetaError,
  interpretContainerStatus,
  normalizePostMedia,
  planPostStatus,
  platformAction,
  resolveTargetPage,
  retryDelayMs,
  translateMetaError,
  type ContainerVerdict,
  type MetaErrorLike,
  type PlatformResult,
  type PublishResult,
  type SocialAccountLite,
  type SocialMediaKind,
  type SocialPostMedia,
} from "./socialPublishLogic.ts";

export type { PlatformResult, PublishResult } from "./socialPublishLogic.ts";

const GRAPH = "https://graph.facebook.com/v21.0";
/** Il contenitore Instagram scade in 24 h: l'URL firmato non serve più a lungo. */
const SIGNED_URL_TTL_S = 60 * 60 * 24;
const POLL_EVERY_MS = 4_000;
const DEFAULT_INLINE_WAIT_MS = 20_000;

export interface SocialPostRow {
  id: string;
  company_id: string;
  platforms: string[] | null;
  content_type: string | null;
  text: string | null;
  platform_texts: Record<string, string> | null;
  image_url: string | null;
  hashtags: string[] | null;
  status: string | null;
  scheduled_at: string | null;
  first_comment?: string | null;
  target_page_ids?: Record<string, string> | null;
  media?: SocialPostMedia[] | null;
  publish_result?: PublishResult | null;
  next_attempt_at?: string | null;
  publish_attempts?: number | null;
}

export interface PublishOptions {
  /** Quanto aspettare in questo giro un contenitore Instagram prima di rimandarlo al cron. */
  inlineWaitMs?: number;
}

export interface PublishOutcome {
  ok: boolean;
  pending: boolean;
  status: string;
  result: PublishResult;
}

type GraphJson = { id?: string; post_id?: string; status_code?: string; status?: string; error?: MetaErrorLike };
type GraphResponse =
  | { ok: true; json: GraphJson }
  | { ok: false; json: GraphJson; error: MetaErrorLike };
type ReadyMedia = { url: string; type: SocialMediaKind };

async function graph(path: string, params: Record<string, string>, method: "GET" | "POST" = "POST"): Promise<GraphResponse> {
  try {
    const res = method === "GET"
      ? await fetch(`${GRAPH}/${path}?${new URLSearchParams(params)}`)
      : await fetch(`${GRAPH}/${path}`, { method: "POST", body: new URLSearchParams(params) });
    const json = (await res.json().catch(() => ({}))) as GraphJson;
    if (!res.ok || json.error) {
      return {
        ok: false,
        json,
        error: { ...(json.error ?? {}), message: json.error?.message ?? `HTTP ${res.status}`, http_status: res.status },
      };
    }
    return { ok: true, json };
  } catch (e) {
    return { ok: false, json: {}, error: { message: e instanceof Error ? e.message : String(e), network: true } };
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Pubblica (o fa avanzare) un singolo post. Aggiorna la riga social_posts e ritorna l'esito. */
export async function publishSocialPost(
  admin: Admin,
  post: SocialPostRow,
  opts: PublishOptions = {},
): Promise<PublishOutcome> {
  const inlineWaitMs = opts.inlineWaitMs ?? DEFAULT_INLINE_WAIT_MS;
  const platforms = Array.isArray(post.platforms) ? post.platforms : [];
  // Solo un post ripreso dal cron eredita gli esiti: un post nuovo o ri-programmato riparte da zero.
  const previous: PublishResult = post.status === "processing" && post.publish_result && typeof post.publish_result === "object"
    ? post.publish_result
    : {};
  const result: PublishResult = {};

  if (platforms.length === 0) {
    result._error = { ok: false, error: "Nessuna piattaforma selezionata" };
    return await finish(admin, post, platforms, result);
  }

  // ── Integrazione Meta + token pagine ──
  const { data: integ } = await admin
    .from("integrations").select("id").eq("company_id", post.company_id).eq("provider", "meta").maybeSingle();
  if (!integ) {
    for (const p of platforms) result[p] = { ok: false, error: "Nessuna integrazione Meta collegata", reconnect: true };
    return await finish(admin, post, platforms, result);
  }

  const { data: creds } = await admin
    .from("integration_credentials").select("meta_page_tokens").eq("integration_id", integ.id).maybeSingle();
  const pageTokensEnc = (creds?.meta_page_tokens ?? {}) as Record<string, string>;
  const encKey = getEncryptionKey();

  const { data: assets } = await admin
    .from("meta_assets").select("asset_id, metadata").eq("integration_id", integ.id).eq("asset_type", "page");
  const igByPage = new Map<string, string>();
  for (const a of assets ?? []) {
    const ig = (a.metadata as { instagram_business_account?: { id?: string } } | null)?.instagram_business_account?.id;
    if (ig) igByPage.set(a.asset_id as string, ig);
  }

  const { data: accounts } = await admin
    .from("social_accounts").select("platform_id, page_id, page_name").eq("company_id", post.company_id).eq("is_active", true);
  const accountList = (accounts ?? []) as SocialAccountLite[];

  const getPageToken = async (pageId: string): Promise<string | null> => {
    const enc = pageTokensEnc[pageId];
    if (!enc) return null;
    try { return await decrypt(enc, encKey); } catch { return null; }
  };

  // ── File del post → URL che Meta può scaricare ──
  const ready: ReadyMedia[] = [];
  let mediaError: string | null = null;
  for (const item of normalizePostMedia(post)) {
    if (item.bucket && item.path) {
      const { data, error } = await admin.storage.from(item.bucket).createSignedUrl(item.path, SIGNED_URL_TTL_S);
      if (error || !data?.signedUrl) {
        mediaError = "Un file del post non si trova più nell'archivio: ricaricalo dal composer.";
        break;
      }
      ready.push({ url: data.signedUrl as string, type: item.type });
    } else {
      const problem = checkMediaUrl(item.url);
      if (problem) {
        mediaError = problem;
        break;
      }
      ready.push({ url: String(item.url).trim(), type: item.type });
    }
  }

  for (const platform of platforms) {
    const before = previous[platform];
    if (before && platformAction(before) === "keep") {
      result[platform] = before;
      continue;
    }
    if (platform !== "facebook" && platform !== "instagram") {
      result[platform] = { ok: false, error: "Piattaforma non supportata dal publisher" };
      continue;
    }

    let pageId: string;
    if (before?.pending && before.page_id) {
      pageId = before.page_id; // il contenitore IG esiste già su quella pagina
    } else {
      const target = resolveTargetPage(platform, accountList, post.target_page_ids, igByPage);
      if ("error" in target) {
        result[platform] = { ok: false, error: target.error };
        continue;
      }
      pageId = target.pageId;
    }

    const token = await getPageToken(pageId);
    if (!token) {
      result[platform] = { ok: false, error: "Token della pagina mancante. Ricollega Meta dalle Integrazioni.", reconnect: true, page_id: pageId };
      continue;
    }
    if (mediaError && !before?.pending) {
      result[platform] = { ok: false, error: mediaError, page_id: pageId };
      continue;
    }

    let outcome: PlatformResult;
    if (platform === "facebook") {
      outcome = await publishFacebook(post, pageId, token, ready, before);
    } else {
      const igUserId = before?.ig_user_id ?? igByPage.get(pageId);
      if (!igUserId) {
        result.instagram = { ok: false, error: "Account Instagram business non collegato alla pagina", page_id: pageId };
        continue;
      }
      outcome = await publishInstagram(post, pageId, igUserId, token, ready, before, inlineWaitMs);
    }

    if (!outcome.ok && !outcome.pending && outcome.retryable) {
      outcome.retry_at = new Date(Date.now() + retryDelayMs(outcome.attempts ?? 1)).toISOString();
    }
    if (outcome.ok && outcome.id) await publishFirstComment(post, outcome, token);
    result[platform] = outcome;
  }

  return await finish(admin, post, platforms, result);
}

// ── Facebook ────────────────────────────────────────────────────────────────

async function publishFacebook(
  post: SocialPostRow,
  pageId: string,
  token: string,
  media: ReadyMedia[],
  before: PlatformResult | undefined,
): Promise<PlatformResult> {
  const attempts = before?.attempts ?? 0;
  const base = { page_id: pageId };
  const fail = (err: MetaErrorLike): PlatformResult => ({ ...failureFromMetaError(err, attempts), ...base });

  if (post.content_type === "story") {
    return { ok: false, error: "Le storie Facebook non si pubblicano ancora da qui: usa Post, Reel o Carosello.", ...base };
  }
  const caption = captionFor(post, "facebook");

  // Solo testo
  if (media.length === 0) {
    if (!caption) return { ok: false, error: "Il post Facebook è vuoto: scrivi un testo o aggiungi un file.", ...base };
    const r = await graph(`${pageId}/feed`, { message: caption, access_token: token });
    return r.ok ? { ok: true, id: r.json.id, ...base } : fail(r.error);
  }

  // Un file
  if (media.length === 1) {
    const m = media[0];
    if (m.type === "video") {
      const params: Record<string, string> = { file_url: m.url, access_token: token };
      if (caption) params.description = caption;
      const r = await graph(`${pageId}/videos`, params);
      return r.ok ? { ok: true, id: r.json.id, ...base } : fail(r.error);
    }
    const params: Record<string, string> = { url: m.url, access_token: token };
    if (caption) params.caption = caption;
    const r = await graph(`${pageId}/photos`, params);
    return r.ok ? { ok: true, id: r.json.post_id ?? r.json.id, ...base } : fail(r.error);
  }

  // Più foto: caricate non pubblicate, poi un post con attached_media
  if (media.some((m) => m.type === "video")) {
    return { ok: false, error: "Su Facebook il carosello accetta solo immagini: togli i video o pubblicali a parte.", ...base };
  }
  if (media.length > CAROUSEL_MAX) {
    return { ok: false, error: `Il carosello accetta al massimo ${CAROUSEL_MAX} immagini.`, ...base };
  }
  const photoIds: string[] = [];
  for (const m of media) {
    const r = await graph(`${pageId}/photos`, { url: m.url, published: "false", access_token: token });
    if (!r.ok) return fail(r.error);
    if (!r.json.id) return { ok: false, error: "Facebook non ha restituito l'id di una foto del carosello.", ...base };
    photoIds.push(r.json.id);
  }
  const params: Record<string, string> = { access_token: token };
  if (caption) params.message = caption;
  photoIds.forEach((id, i) => {
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });
  const r = await graph(`${pageId}/feed`, params);
  return r.ok ? { ok: true, id: r.json.id, ...base } : fail(r.error);
}

// ── Instagram ───────────────────────────────────────────────────────────────

async function containerStatus(id: string | undefined, token: string): Promise<{ verdict: ContainerVerdict; detail?: string }> {
  if (!id) return { verdict: "error", detail: "contenitore mancante" };
  const res = await graph(id, { fields: "status_code,status", access_token: token }, "GET");
  if (!res.ok) {
    const t = translateMetaError(res.error);
    return t.retryable ? { verdict: "wait" } : { verdict: "error", detail: t.message };
  }
  return { verdict: interpretContainerStatus(res.json.status_code), detail: res.json.status };
}

async function publishInstagram(
  post: SocialPostRow,
  pageId: string,
  igUserId: string,
  token: string,
  media: ReadyMedia[],
  before: PlatformResult | undefined,
  inlineWaitMs: number,
): Promise<PlatformResult> {
  const attempts = before?.attempts ?? 0;
  const base = { page_id: pageId, ig_user_id: igUserId };
  const caption = captionFor(post, "instagram");
  let state: PlatformResult | null = before?.pending && before.stage ? { ...before } : null;

  // ── 1. Crea i contenitori ──
  if (!state) {
    if (media.length === 0) return { ok: false, error: "Instagram richiede almeno un'immagine o un video.", ...base };
    if (media.length > CAROUSEL_MAX) {
      return { ok: false, error: `Instagram accetta al massimo ${CAROUSEL_MAX} file in un carosello.`, ...base };
    }
    const isStory = post.content_type === "story";
    const startedAt = new Date().toISOString();

    if (media.length === 1) {
      const m = media[0];
      const params: Record<string, string> = { access_token: token };
      if (isStory) {
        params.media_type = "STORIES";
        params[m.type === "video" ? "video_url" : "image_url"] = m.url;
      } else if (m.type === "video") {
        params.media_type = "REELS";
        params.video_url = m.url;
        if (caption) params.caption = caption;
      } else {
        params.image_url = m.url;
        if (caption) params.caption = caption;
      }
      const created = await graph(`${igUserId}/media`, params);
      if (!created.ok) return { ...failureFromMetaError(created.error, attempts), ...base };
      if (!created.json.id) return { ok: false, error: "Instagram non ha restituito il contenitore del file.", ...base };
      state = { ok: false, pending: true, stage: "container", creation_id: created.json.id, started_at: startedAt, attempts, ...base };
    } else {
      if (isStory) return { ok: false, error: "Una storia Instagram accetta un solo file.", ...base };
      const children: string[] = [];
      for (const m of media) {
        const params: Record<string, string> = { access_token: token, is_carousel_item: "true" };
        if (m.type === "video") {
          params.media_type = "VIDEO";
          params.video_url = m.url;
        } else {
          params.image_url = m.url;
        }
        const created = await graph(`${igUserId}/media`, params);
        if (!created.ok) return { ...failureFromMetaError(created.error, attempts), ...base };
        if (!created.json.id) return { ok: false, error: "Instagram non ha restituito il contenitore di un file del carosello.", ...base };
        children.push(created.json.id);
      }
      state = { ok: false, pending: true, stage: "children", children, started_at: startedAt, attempts, ...base };
    }
  }

  // ── 2. Aspetta che Instagram finisca, poi pubblica ──
  const startedMs = Date.parse(state.started_at ?? "") || Date.now();
  const stopWaitingAt = Date.now() + Math.max(0, inlineWaitMs);
  for (;;) {
    if (Date.now() - startedMs > IG_PROCESSING_TIMEOUT_MS) {
      return {
        ok: false,
        error: "Instagram non ha finito di elaborare il file entro 30 minuti: controlla formato e durata del video e riprova.",
        ...base,
      };
    }

    if (state.stage === "children") {
      const checks = await Promise.all((state.children ?? []).map((id) => containerStatus(id, token)));
      const rejected = checks.find((c) => c.verdict === "error");
      if (rejected) {
        return { ok: false, error: `Instagram ha rifiutato un file del carosello${rejected.detail ? ` (${rejected.detail})` : ""}.`, ...base };
      }
      if (checks.every((c) => c.verdict === "ready")) {
        const params: Record<string, string> = {
          access_token: token,
          media_type: "CAROUSEL",
          children: (state.children ?? []).join(","),
        };
        if (caption) params.caption = caption;
        const created = await graph(`${igUserId}/media`, params);
        if (!created.ok) return { ...failureFromMetaError(created.error, attempts), ...base };
        if (!created.json.id) return { ok: false, error: "Instagram non ha restituito il contenitore del carosello.", ...base };
        state = { ...state, stage: "container", creation_id: created.json.id };
        continue;
      }
    } else {
      const check = await containerStatus(state.creation_id, token);
      if (check.verdict === "error") {
        return {
          ok: false,
          error: `Instagram non ha accettato il file${check.detail ? ` (${check.detail})` : ""}: controlla formato, proporzioni e durata.`,
          ...base,
        };
      }
      if (check.verdict === "published") {
        return { ok: true, ...base, warnings: ["Il contenuto risultava già pubblicato su Instagram da un giro precedente."] };
      }
      if (check.verdict === "ready") {
        const published = await graph(`${igUserId}/media_publish`, { creation_id: state.creation_id ?? "", access_token: token });
        if (published.ok && published.json.id) return { ok: true, id: published.json.id, ...base };
        const failure = failureFromMetaError(
          published.ok ? { message: "media_publish senza id" } : published.error,
          state.attempts ?? 0,
        );
        // Il contenitore resta valido 24 h: sugli errori temporanei si ritenta lo stesso.
        if (failure.retryable && (failure.attempts ?? 1) < MAX_RETRY_ATTEMPTS) {
          return { ...state, pending: true, attempts: failure.attempts, error: failure.error, raw_error: failure.raw_error };
        }
        return { ...failure, ...base };
      }
    }

    if (Date.now() + POLL_EVERY_MS > stopWaitingAt) {
      return { ...state, pending: true, error: "Instagram sta ancora elaborando il file: lo pubblichiamo appena è pronto." };
    }
    await sleep(POLL_EVERY_MS);
  }
}

// ── Primo commento ──────────────────────────────────────────────────────────

async function publishFirstComment(post: SocialPostRow, outcome: PlatformResult, token: string): Promise<void> {
  const message = (post.first_comment ?? "").trim();
  if (!message || !outcome.id || outcome.first_comment) return;
  // FB: POST /{post-id}/comments (pages_manage_engagement)
  // IG: POST /{ig-media-id}/comments (instagram_manage_comments)
  const res = await graph(`${outcome.id}/comments`, { message, access_token: token });
  if (res.ok) {
    outcome.first_comment = { ok: true, id: res.json.id };
    return;
  }
  const t = translateMetaError(res.error, "comment");
  outcome.first_comment = { ok: false, error: t.message };
  outcome.warnings = [...(outcome.warnings ?? []), `Primo commento non pubblicato: ${t.message}`];
}

// ── Salvataggio dell'esito ──────────────────────────────────────────────────

async function finish(admin: Admin, post: SocialPostRow, platforms: string[], result: PublishResult): Promise<PublishOutcome> {
  const plan = planPostStatus(platforms, result, post.status);
  const now = new Date().toISOString();
  const ok = platforms.some((p) => result[p]?.ok === true);

  const { error } = await admin.from("social_posts").update({
    publish_result: result,
    status: plan.status,
    next_attempt_at: plan.nextAttemptAt,
    updated_at: now,
  }).eq("id", post.id);

  if (error) {
    // Migrazione 20280916910000 non ancora applicata (niente next_attempt_at né
    // 'processing'): si salva come prima, e ciò che resterebbe in sospeso è 'failed'.
    const legacyStatus = plan.status === "processing" ? (ok ? "published" : "failed") : plan.status;
    await admin.from("social_posts").update({
      publish_result: result,
      status: legacyStatus,
      updated_at: now,
    }).eq("id", post.id);
    return { ok, pending: false, status: legacyStatus, result };
  }

  return { ok, pending: plan.status === "processing", status: plan.status, result };
}

/** Il cron ha già ripreso il post troppe volte: si chiude con un motivo. */
export async function markPostExhausted(admin: Admin, post: SocialPostRow): Promise<void> {
  const result: PublishResult = { ...(post.publish_result ?? {}) };
  for (const [key, r] of Object.entries(result)) {
    if (r && !r.ok) result[key] = { ...r, pending: false, retryable: false };
  }
  result._error = { ok: false, error: "Pubblicazione interrotta dopo troppi tentativi: controlla il post e riprova." };
  const anyOk = Object.values(result).some((r) => r?.ok === true);
  await admin.from("social_posts").update({
    publish_result: result,
    status: anyOk ? "published" : "failed",
    next_attempt_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", post.id);
}
