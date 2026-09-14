// ============================================================================
// socialPublishLogic — regole pure del publisher social (niente rete, niente DB)
// ============================================================================
// Separate da socialPublishCore perché le leggono sia le edge function (Deno)
// sia i test vitest: questo file non importa nulla.
//
// Cosa decide:
//  - su quale pagina/account esce il post (resolveTargetPage)
//  - quali file manda a Meta e quali rifiuta (normalizePostMedia, checkMediaUrl)
//  - come si traduce un errore della Graph API (translateMetaError)
//  - che stato prende il post dopo un giro (planPostStatus)
// ============================================================================

export type SocialMediaKind = "image" | "video";

export interface SocialPostMedia {
  url?: string | null;
  bucket?: string | null;
  path?: string | null;
  type?: string | null;
}

export interface SocialAccountLite {
  platform_id: string;
  page_id: string;
  page_name?: string | null;
}

export interface PlatformResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** messaggio originale di Meta, per chi deve fare assistenza */
  raw_error?: string;
  code?: number;
  retryable?: boolean;
  reconnect?: boolean;
  attempts?: number;
  /** errore temporaneo: non ritentare prima di quest'ora */
  retry_at?: string;
  /** Instagram sta ancora elaborando: il cron riprende da creation_id/children */
  pending?: boolean;
  stage?: "children" | "container";
  creation_id?: string;
  children?: string[];
  ig_user_id?: string;
  page_id?: string;
  started_at?: string;
  warnings?: string[];
  first_comment?: { ok: boolean; id?: string; error?: string };
}

export type PublishResult = Record<string, PlatformResult>;

export interface MetaErrorLike {
  message?: string;
  type?: string;
  code?: number | string;
  error_subcode?: number | string;
  is_transient?: boolean;
  error_user_msg?: string;
  http_status?: number;
  network?: boolean;
}

export interface TranslatedMetaError {
  message: string;
  retryable: boolean;
  reconnect: boolean;
}

export type PostPublishStatus = "published" | "failed" | "processing";

export const SOCIAL_MEDIA_BUCKET = "social-media";
/** Oltre questo tempo un media Instagram ancora in elaborazione è fallito. */
export const IG_PROCESSING_TIMEOUT_MS = 30 * 60_000;
/** Ogni quanto il cron ricontrolla un contenitore Instagram in elaborazione. */
export const IG_POLL_DELAY_MS = 60_000;
/** Tentativi per piattaforma sugli errori temporanei (rete, limiti, 5xx). */
export const MAX_RETRY_ATTEMPTS = 3;
/** Giri del cron su uno stesso post, qualunque sia il motivo: poi 'failed'. */
export const MAX_SCHEDULER_CLAIMS = 45;
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 10;

export function captionFor(
  post: { text?: string | null; platform_texts?: Record<string, string> | null; hashtags?: string[] | null },
  platform: string,
): string {
  const perPlatform = post.platform_texts?.[platform];
  const body = (perPlatform ?? post.text ?? "").trim();
  const tags = Array.isArray(post.hashtags) ? post.hashtags.join(" ").trim() : "";
  return [body, tags].filter(Boolean).join("\n\n");
}

function mediaKind(item: SocialPostMedia, fallbackVideo: boolean): SocialMediaKind {
  if (item.type === "video" || item.type === "image") return item.type;
  const ref = `${item.path ?? ""} ${item.url ?? ""}`.toLowerCase();
  if (/\.(mp4|mov|m4v)(\?|\s|$)/.test(ref)) return "video";
  return fallbackVideo ? "video" : "image";
}

/**
 * I file del post. `media` (caroselli, video caricati nel bucket) vince;
 * i post vecchi hanno solo `image_url`.
 */
export function normalizePostMedia(post: {
  media?: unknown;
  image_url?: string | null;
  content_type?: string | null;
}): Array<SocialPostMedia & { type: SocialMediaKind }> {
  const isVideoType = post.content_type === "video" || post.content_type === "reel";
  const list = Array.isArray(post.media)
    ? post.media.filter((m): m is SocialPostMedia => !!m && typeof m === "object")
    : [];
  const usable = list.filter((m) =>
    (typeof m.url === "string" && m.url.trim() !== "")
    || (typeof m.bucket === "string" && m.bucket !== "" && typeof m.path === "string" && m.path !== ""),
  );
  if (usable.length > 0) return usable.map((m) => ({ ...m, type: mediaKind(m, isVideoType) }));
  const url = (post.image_url ?? "").trim();
  return url ? [{ url, type: isVideoType ? "video" : "image" }] : [];
}

/** null se Meta può scaricare il file, altrimenti il motivo in italiano. */
export function checkMediaUrl(url: string | null | undefined): string | null {
  const value = (url ?? "").trim();
  if (!value) return "File del post mancante: ricaricalo dal composer.";
  if (/^data:/i.test(value)) {
    return "Il file è salvato dentro il post e Meta non può scaricarlo: ricaricalo dal composer (serve un indirizzo https).";
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return "Meta scarica i file solo da indirizzi https: ricarica il file dal composer.";
  } catch {
    return "Indirizzo del file non valido: ricaricalo dal composer.";
  }
  return null;
}

/**
 * Pagina Facebook da usare per la piattaforma. Per Instagram è la pagina a cui
 * è legato l'account business (token e ig id si risolvono da lì).
 * Mai a caso: con più pagine e nessuna scelta nel post, errore.
 */
export function resolveTargetPage(
  platform: string,
  accounts: SocialAccountLite[],
  targetPageIds: Record<string, string> | null | undefined,
  igByPage: ReadonlyMap<string, string>,
): { pageId: string } | { error: string } {
  const isIg = platform === "instagram";
  let candidates = accounts
    .filter((a) => a.platform_id === platform && a.page_id)
    .map((a) => a.page_id);
  if (isIg) {
    candidates = candidates.filter((id) => igByPage.has(id));
    if (candidates.length === 0) {
      candidates = accounts
        .filter((a) => a.platform_id === "facebook" && igByPage.has(a.page_id))
        .map((a) => a.page_id);
    }
  }
  candidates = Array.from(new Set(candidates));

  const chosen = targetPageIds && typeof targetPageIds === "object" ? targetPageIds[platform] : undefined;
  if (typeof chosen === "string" && chosen) {
    if (candidates.includes(chosen)) return { pageId: chosen };
    return {
      error: isIg
        ? "L'account Instagram scelto non è più collegato: ricollega Meta o scegli un altro account nel post."
        : "La pagina Facebook scelta non è più collegata: ricollega Meta o scegli un'altra pagina nel post.",
    };
  }
  if (candidates.length === 1) return { pageId: candidates[0] };
  if (candidates.length === 0) {
    return {
      error: isIg
        ? "Nessun account Instagram business collegato a una pagina Facebook."
        : "Nessuna pagina Facebook collegata.",
    };
  }
  return {
    error: isIg
      ? `Ci sono ${candidates.length} account Instagram collegati: scegli nel post su quale pubblicare.`
      : `Ci sono ${candidates.length} pagine Facebook collegate: scegli nel post su quale pubblicare.`,
  };
}

// Codici dalla guida ufficiale "Graph API — Error Handling".
const AUTH_SUBCODES = new Set([458, 459, 460, 463, 464, 467, 492]);
const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613]);

export function translateMetaError(
  err: MetaErrorLike | null | undefined,
  context: "publish" | "comment" = "publish",
): TranslatedMetaError {
  const e = err ?? {};
  const code = Number(e.code);
  const sub = Number(e.error_subcode);
  const detail = String(e.error_user_msg || e.message || "").trim();
  const withDetail = (m: string) => (detail ? `${m} (Meta: ${detail})` : m);

  if (e.network) {
    return { message: withDetail("Meta non ha risposto: riprovo tra poco."), retryable: true, reconnect: false };
  }
  if (code === 190 || code === 102 || AUTH_SUBCODES.has(sub)) {
    return {
      message: withDetail("Il collegamento con Meta è scaduto o revocato. Ricollega Meta dalle Integrazioni."),
      retryable: false,
      reconnect: true,
    };
  }
  if (code === 10 || (code >= 200 && code <= 299)) {
    return {
      message: withDetail(
        context === "comment"
          ? "Permesso mancante per commentare. Ricollega Meta e concedi la gestione dei commenti."
          : "Permesso mancante. Ricollega Meta e concedi la pubblicazione.",
      ),
      retryable: false,
      reconnect: true,
    };
  }
  if (RATE_LIMIT_CODES.has(code)) {
    return {
      message: withDetail("Meta ha limitato temporaneamente le richieste: riprovo tra qualche minuto."),
      retryable: true,
      reconnect: false,
    };
  }
  if (code === 1 || code === 2 || e.is_transient === true || (e.http_status ?? 0) >= 500) {
    return { message: withDetail("Problema temporaneo di Meta: riprovo tra poco."), retryable: true, reconnect: false };
  }
  if (code === 368) {
    return {
      message: withDetail("Meta ha bloccato la pubblicazione per le regole della piattaforma: controlla il contenuto e la pagina."),
      retryable: false,
      reconnect: false,
    };
  }
  if (code === 506) {
    return {
      message: withDetail("Meta rifiuta il post perché è uguale a uno appena pubblicato: cambia il testo."),
      retryable: false,
      reconnect: false,
    };
  }
  return {
    message: detail ? `Meta ha rifiutato la richiesta: ${detail}` : "Meta ha rifiutato la richiesta.",
    retryable: false,
    reconnect: false,
  };
}

export function failureFromMetaError(
  err: MetaErrorLike | null | undefined,
  previousAttempts: number,
  context: "publish" | "comment" = "publish",
): PlatformResult {
  const t = translateMetaError(err, context);
  const code = Number(err?.code);
  return {
    ok: false,
    error: t.message,
    raw_error: err?.message,
    ...(Number.isFinite(code) ? { code } : {}),
    retryable: t.retryable,
    reconnect: t.reconnect,
    attempts: previousAttempts + 1,
  };
}

export function retryDelayMs(attempts: number): number {
  const steps = [60_000, 5 * 60_000, 15 * 60_000];
  return steps[Math.min(Math.max(attempts, 1), steps.length) - 1];
}

/** Errore temporaneo con tentativi ancora disponibili. */
export function canRetry(r: PlatformResult | null | undefined): boolean {
  return !!r && !r.ok && !r.pending && r.retryable === true && (r.attempts ?? 1) < MAX_RETRY_ATTEMPTS;
}

/**
 * Cosa fare di una piattaforma in un giro successivo, dato l'esito precedente:
 * - "keep": già uscita, o fallita in modo definitivo, o retry non ancora dovuto
 * - "run": da (ri)pubblicare o da far avanzare (contenitore IG in elaborazione)
 */
export function platformAction(before: PlatformResult | null | undefined, now = Date.now()): "keep" | "run" {
  if (!before) return "run";
  if (before.ok) return "keep";
  if (before.pending) return "run";
  if (!canRetry(before)) return "keep";
  if (before.retry_at && Date.parse(before.retry_at) > now) return "keep";
  return "run";
}

export type ContainerVerdict = "ready" | "wait" | "error" | "published";

/** status_code di un contenitore IG: EXPIRED, ERROR, FINISHED, IN_PROGRESS, PUBLISHED. */
export function interpretContainerStatus(statusCode: string | null | undefined): ContainerVerdict {
  switch (statusCode) {
    case "FINISHED": return "ready";
    case "PUBLISHED": return "published";
    case "ERROR":
    case "EXPIRED": return "error";
    default: return "wait";
  }
}

/**
 * Stato del post dopo un giro. Un contenitore Instagram in elaborazione o un
 * errore temporaneo con tentativi rimasti → 'processing' (lo riprende il cron).
 * Almeno una piattaforma uscita → 'published'; nessuna → 'failed'.
 */
export function planPostStatus(
  platforms: string[],
  result: PublishResult,
  previousStatus: string | null | undefined,
  now = Date.now(),
): { status: PostPublishStatus; nextAttemptAt: string | null } {
  let delay: number | null = null;
  for (const platform of platforms) {
    const r = result[platform];
    if (!r || r.ok) continue;
    if (r.pending) {
      delay = Math.min(delay ?? Number.POSITIVE_INFINITY, IG_POLL_DELAY_MS);
    } else if (canRetry(r)) {
      const wait = r.retry_at ? Date.parse(r.retry_at) - now : retryDelayMs(r.attempts ?? 1);
      delay = Math.min(delay ?? Number.POSITIVE_INFINITY, Math.max(Number.isFinite(wait) ? wait : 0, 5_000));
    }
  }
  if (delay !== null) return { status: "processing", nextAttemptAt: new Date(now + delay).toISOString() };
  const anyOk = platforms.some((p) => result[p]?.ok === true);
  if (anyOk || previousStatus === "published") return { status: "published", nextAttemptAt: null };
  return { status: "failed", nextAttemptAt: null };
}
