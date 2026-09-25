import type {
  SocialConnectedAccount,
  SocialMediaItem,
  SocialPostMedia,
  SocialPostStatus,
  SocialPublishResultEntry,
  SocialScheduledPost,
} from "./types";

const STORAGE_PREFIX = "eic_social_manager_v1_";
const LEGACY_PREFIX = "eic_social_connections_";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const postStatuses = new Set<SocialPostStatus>(["draft", "scheduled", "processing", "published", "failed", "review"]);
const mediaTypes = new Set<SocialMediaItem["type"]>(["image", "video", "story"]);
const mediaFormats = new Set<SocialMediaItem["format"]>(["9:16", "4:5", "1:1", "16:9"]);
const mediaCategories = new Set<SocialMediaItem["category"]>(["portfolio", "promo", "team", "cantiere", "prodotto"]);

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function getSocialStorageKey(companyId: string, kind: "accounts" | "posts" | "media") {
  return `${STORAGE_PREFIX}${companyId}_${kind}`;
}

export function normalizeSocialPostStatus(value: unknown): SocialPostStatus {
  return typeof value === "string" && postStatuses.has(value as SocialPostStatus)
    ? (value as SocialPostStatus)
    : "draft";
}

export function normalizeSocialMediaType(value: unknown): SocialMediaItem["type"] {
  return typeof value === "string" && mediaTypes.has(value as SocialMediaItem["type"])
    ? (value as SocialMediaItem["type"])
    : "image";
}

export function normalizeSocialMediaFormat(value: unknown): SocialMediaItem["format"] {
  return typeof value === "string" && mediaFormats.has(value as SocialMediaItem["format"])
    ? (value as SocialMediaItem["format"])
    : "4:5";
}

export function normalizeSocialMediaCategory(value: unknown): SocialMediaItem["category"] {
  return typeof value === "string" && mediaCategories.has(value as SocialMediaItem["category"])
    ? (value as SocialMediaItem["category"])
    : "portfolio";
}

export function sanitizeSocialMediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:") return url.toString();
    if (url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname)) {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function readJson<T>(key: string, fallback: T): T {
  const storage = getStorage();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore local quota/private-mode failures
  }
}

export function loadSocialAccountsLocal(companyId: string): SocialConnectedAccount[] {
  const nextKey = getSocialStorageKey(companyId, "accounts");
  const next = readJson<SocialConnectedAccount[]>(nextKey, []);
  if (next.length > 0) return next;
  return readJson<SocialConnectedAccount[]>(LEGACY_PREFIX + companyId, []);
}

export function loadSocialPostsLocal(companyId: string): SocialScheduledPost[] {
  const nextKey = getSocialStorageKey(companyId, "posts");
  const next = readJson<SocialScheduledPost[]>(nextKey, []);
  if (next.length > 0) return next;
  return readJson<SocialScheduledPost[]>(`${LEGACY_PREFIX}${companyId}_posts`, []);
}

export function loadSocialMediaLocal(companyId: string): SocialMediaItem[] {
  return readJson<SocialMediaItem[]>(getSocialStorageKey(companyId, "media"), []);
}

export function saveSocialPostsLocal(companyId: string, posts: SocialScheduledPost[]) {
  writeJson(getSocialStorageKey(companyId, "posts"), posts);
}

export function saveSocialMediaLocal(companyId: string, media: SocialMediaItem[]) {
  writeJson(getSocialStorageKey(companyId, "media"), media);
}

export function upsertSocialMediaLocal(mediaItems: SocialMediaItem[], item: SocialMediaItem) {
  const withoutExisting = mediaItems.filter((media) => media.id !== item.id);
  return [item, ...withoutExisting];
}

export function upsertSocialPostLocal(posts: SocialScheduledPost[], post: SocialScheduledPost) {
  const withoutExisting = posts.filter((item) => item.id !== post.id);
  return [post, ...withoutExisting];
}

export function updateSocialPostLocal(
  posts: SocialScheduledPost[],
  id: string,
  changes: Partial<SocialScheduledPost>,
) {
  return posts.map((post) => (post.id === id ? { ...post, ...changes } : post));
}

export function parseTargetPageIds(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [platform, pageId] of Object.entries(value as Record<string, unknown>)) {
    if (typeof pageId === "string" && pageId) out[platform] = pageId;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseSocialPostMedia(value: unknown): SocialPostMedia[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: SocialPostMedia[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const media: SocialPostMedia = {
      url: sanitizeSocialMediaUrl(item.url) ?? undefined,
      bucket: typeof item.bucket === "string" && item.bucket ? item.bucket : undefined,
      path: typeof item.path === "string" && item.path ? item.path : undefined,
      type: item.type === "video" ? "video" : "image",
    };
    if (media.url || (media.bucket && media.path)) out.push(media);
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Colonna `media` solo quando serve (più file, o file nello Storage): i post a
 * immagine singola restano su image_url e si salvano anche prima della
 * migrazione 20280916910000. I data: URL non finiscono nel jsonb.
 */
function mediaForDb(media: SocialPostMedia[] | undefined, force = false) {
  const list = (media ?? []).filter((m) => m.url || (m.bucket && m.path));
  if (!force && list.length <= 1 && !list.some((m) => m.path)) return undefined;
  return list.map((m) => ({
    bucket: m.bucket ?? null,
    path: m.path ?? null,
    url: m.url && !/^data:/i.test(m.url) ? m.url : null,
    type: m.type,
  }));
}

function publishResultFromRow(value: unknown): Record<string, SocialPublishResultEntry> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return Object.keys(value).length > 0 ? (value as Record<string, SocialPublishResultEntry>) : undefined;
}

export function socialPostFromRow(row: Record<string, any>): SocialScheduledPost {
  const media = parseSocialPostMedia(row.media);
  return {
    id: String(row.id),
    platforms: Array.isArray(row.platforms) ? row.platforms : [],
    contentType: row.content_type ?? "post",
    text: row.text ?? "",
    platformTexts: row.platform_texts && Object.keys(row.platform_texts).length > 0 ? row.platform_texts : undefined,
    image_url: sanitizeSocialMediaUrl(row.image_url) ?? media?.[0]?.url ?? undefined,
    targetPageIds: parseTargetPageIds(row.target_page_ids),
    media,
    publishResult: publishResultFromRow(row.publish_result),
    hashtags: Array.isArray(row.hashtags) ? row.hashtags : [],
    firstComment: row.first_comment ?? undefined,
    // Una bozza senza data resta senza data: prima prendeva quella di creazione.
    scheduled_at: row.scheduled_at
      ?? (normalizeSocialPostStatus(row.status) === "draft" ? "" : row.created_at ?? new Date().toISOString()),
    status: normalizeSocialPostStatus(row.status),
    created_at: row.created_at ?? new Date().toISOString(),
    createdBy: row.created_by ?? undefined,
    approvatoDa: row.approvato_da ?? undefined,
    approvatoIl: row.approvato_il ?? undefined,
    argomento: typeof row.argomento === "string" && row.argomento ? row.argomento : undefined,
    reviewNote: row.review_note ?? undefined,
    mediaItemId: row.media_item_id ?? undefined,
  };
}

export function socialPostToInsert(companyId: string, post: SocialScheduledPost) {
  const media = mediaForDb(post.media);
  const targets = parseTargetPageIds(post.targetPageIds);
  return {
    ...(media ? { media } : {}),
    ...(targets ? { target_page_ids: targets } : {}),
    company_id: companyId,
    platforms: post.platforms,
    content_type: post.contentType,
    text: post.text,
    platform_texts: post.platformTexts ?? {},
    image_url: sanitizeSocialMediaUrl(post.image_url) ?? null,
    hashtags: post.hashtags,
    first_comment: post.firstComment ?? null,
    scheduled_at: post.scheduled_at || null,
    status: normalizeSocialPostStatus(post.status),
    review_note: post.reviewNote ?? null,
    argomento: post.argomento ?? null,
    media_item_id: isUuid(post.mediaItemId) ? post.mediaItemId : null,
  };
}

export function socialPostChangesToPatch(changes: Partial<SocialScheduledPost>) {
  const patch: Record<string, any> = {};
  if ("platforms" in changes) patch.platforms = changes.platforms;
  if ("contentType" in changes) patch.content_type = changes.contentType;
  if ("text" in changes) patch.text = changes.text;
  if ("platformTexts" in changes) patch.platform_texts = changes.platformTexts ?? {};
  if ("image_url" in changes) patch.image_url = sanitizeSocialMediaUrl(changes.image_url) ?? null;
  if ("hashtags" in changes) patch.hashtags = changes.hashtags ?? [];
  if ("firstComment" in changes) patch.first_comment = changes.firstComment ?? null;
  if ("scheduled_at" in changes) patch.scheduled_at = changes.scheduled_at || null;
  if ("status" in changes) patch.status = normalizeSocialPostStatus(changes.status);
  if ("reviewNote" in changes) patch.review_note = changes.reviewNote ?? null;
  if ("argomento" in changes) patch.argomento = changes.argomento ?? null;
  if ("mediaItemId" in changes) patch.media_item_id = isUuid(changes.mediaItemId) ? changes.mediaItemId : null;
  if ("targetPageIds" in changes) patch.target_page_ids = parseTargetPageIds(changes.targetPageIds) ?? {};
  if ("media" in changes) patch.media = mediaForDb(changes.media, true) ?? [];
  return patch;
}

export function socialAccountFromRow(row: Record<string, any>): SocialConnectedAccount {
  return {
    platform_id: row.platform_id,
    page_id: row.page_id,
    page_name: row.page_name,
    followers: row.followers ?? undefined,
    connected_at: row.connected_at ?? row.created_at ?? new Date().toISOString(),
  };
}

export function socialMediaFromRow(row: Record<string, any>): SocialMediaItem {
  return {
    id: String(row.id),
    type: normalizeSocialMediaType(row.media_type ?? row.type),
    format: normalizeSocialMediaFormat(row.format),
    title: row.title ?? "Media social",
    tags: Array.isArray(row.tags) ? row.tags : [],
    usedInPosts: row.used_in_posts ?? row.usedInPosts ?? 0,
    usedInAds: row.used_in_ads ?? row.usedInAds ?? 0,
    created_at: row.created_at ?? new Date().toISOString(),
    gradient: row.gradient ?? "from-slate-400 to-slate-700",
    category: normalizeSocialMediaCategory(row.category),
    aiGenerated: row.ai_generated ?? row.aiGenerated ?? false,
    fileSize: row.file_size_label ?? row.fileSize ?? "media",
    public_url: sanitizeSocialMediaUrl(row.public_url) ?? undefined,
    thumbnail_url: sanitizeSocialMediaUrl(row.thumbnail_url) ?? undefined,
    storage_path: row.storage_path ?? undefined,
  };
}

export function socialMediaToInsert(companyId: string, item: SocialMediaItem) {
  return {
    company_id: companyId,
    title: item.title,
    media_type: normalizeSocialMediaType(item.type),
    format: normalizeSocialMediaFormat(item.format),
    public_url: sanitizeSocialMediaUrl(item.public_url) ?? null,
    thumbnail_url: sanitizeSocialMediaUrl(item.thumbnail_url) ?? null,
    storage_path: item.storage_path ?? null,
    gradient: item.gradient,
    category: normalizeSocialMediaCategory(item.category),
    tags: item.tags,
    ai_generated: item.aiGenerated,
    file_size_label: item.fileSize,
    used_in_posts: item.usedInPosts,
    used_in_ads: item.usedInAds,
  };
}

export function getSocialMediaPreviewUrl(item: SocialMediaItem | null | undefined) {
  return sanitizeSocialMediaUrl(item?.public_url) ?? sanitizeSocialMediaUrl(item?.thumbnail_url);
}

export function mergeSocialMediaItems(dbItems: SocialMediaItem[], localItems: SocialMediaItem[]) {
  if (dbItems.length === 0) return localItems;
  const seen = new Set(dbItems.map((item) => item.id));
  return [...dbItems, ...localItems.filter((item) => !seen.has(item.id))];
}
