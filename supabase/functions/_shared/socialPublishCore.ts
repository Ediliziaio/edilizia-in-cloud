// ============================================================================
// socialPublishCore — pubblicazione organica reale su Meta (Facebook + Instagram)
// ============================================================================
// Usato sia da `social-publish` (pubblica-ora, user-auth) sia da
// `social-publish-scheduler` (cron, service-role). Pubblica un social_post
// sulle piattaforme collegate e scrive l'esito in social_posts.publish_result.
//
// Token: integration_credentials.meta_page_tokens[page_id] (criptato) →
// decrypt(); IG business account id: meta_assets.metadata.instagram_business_account.id.
//
// NB: richiede i permessi Meta `pages_manage_posts` (FB) e
// `instagram_content_publish` (IG) approvati in App Review. Senza, la Graph API
// risponde con errore di permesso, riportato fedelmente in publish_result.
// ============================================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

import { decrypt, getEncryptionKey } from "./encryption.ts";

const GRAPH = "https://graph.facebook.com/v21.0";

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
}

export type PlatformResult = { ok: boolean; id?: string; error?: string };
export type PublishResult = Record<string, PlatformResult>;

function captionFor(post: SocialPostRow, platform: string): string {
  const perPlatform = post.platform_texts?.[platform];
  const body = (perPlatform ?? post.text ?? "").trim();
  const tags = Array.isArray(post.hashtags) ? post.hashtags.join(" ").trim() : "";
  return [body, tags].filter(Boolean).join("\n\n");
}

async function graphPost(url: string, params: URLSearchParams): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch(url, { method: "POST", body: params });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, id: json.id ?? json.post_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Pubblica un singolo post. Aggiorna la riga social_posts e ritorna il risultato. */
export async function publishSocialPost(admin: Admin, post: SocialPostRow): Promise<{ ok: boolean; result: PublishResult }> {
  const result: PublishResult = {};
  const platforms = Array.isArray(post.platforms) ? post.platforms : [];

  if (platforms.length === 0) {
    return { ok: false, result: { _error: { ok: false, error: "Nessuna piattaforma selezionata" } } };
  }

  // ── Integrazione Meta + token pagine ──
  const { data: integ } = await admin
    .from("integrations").select("id").eq("company_id", post.company_id).eq("provider", "meta").maybeSingle();
  if (!integ) {
    for (const p of platforms) result[p] = { ok: false, error: "Nessuna integrazione Meta collegata" };
    await persist(admin, post, result);
    return { ok: false, result };
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
    .from("social_accounts").select("platform_id, page_id").eq("company_id", post.company_id).eq("is_active", true);
  const pageByPlatform = new Map<string, string>();
  for (const acc of accounts ?? []) if (acc.page_id) pageByPlatform.set(acc.platform_id as string, acc.page_id as string);

  const getPageToken = async (pageId: string | undefined): Promise<string | null> => {
    if (!pageId) return null;
    const enc = pageTokensEnc[pageId];
    if (!enc) return null;
    try { return await decrypt(enc, encKey); } catch { return null; }
  };

  const imageUrl = (post.image_url ?? "").trim() || null;
  const isVideo = post.content_type === "video" || post.content_type === "reel";

  for (const platform of platforms) {
    if (platform === "facebook") {
      const pageId = pageByPlatform.get("facebook");
      const token = await getPageToken(pageId);
      if (!pageId) { result.facebook = { ok: false, error: "Pagina Facebook non collegata" }; continue; }
      if (!token) { result.facebook = { ok: false, error: "Token pagina mancante — ricollega la pagina dalle Integrazioni" }; continue; }
      const caption = captionFor(post, "facebook");
      if (imageUrl && !isVideo) {
        result.facebook = await graphPost(`${GRAPH}/${pageId}/photos`, new URLSearchParams({ url: imageUrl, caption, access_token: token }));
      } else {
        result.facebook = await graphPost(`${GRAPH}/${pageId}/feed`, new URLSearchParams({ message: caption, access_token: token }));
      }
    } else if (platform === "instagram") {
      const pageId = pageByPlatform.get("instagram") || pageByPlatform.get("facebook");
      const igUserId = pageId ? igByPage.get(pageId) : undefined;
      const token = await getPageToken(pageId);
      if (!igUserId) { result.instagram = { ok: false, error: "Account Instagram business non collegato alla pagina" }; continue; }
      if (!token) { result.instagram = { ok: false, error: "Token pagina mancante — ricollega la pagina" }; continue; }
      if (!imageUrl) { result.instagram = { ok: false, error: "Instagram richiede un'immagine o un video (URL pubblico)" }; continue; }
      const caption = captionFor(post, "instagram");

      // Step 1 — crea il container media
      const containerParams = new URLSearchParams({ caption, access_token: token });
      if (isVideo) { containerParams.set("media_type", "REELS"); containerParams.set("video_url", imageUrl); }
      else containerParams.set("image_url", imageUrl);
      const container = await graphPost(`${GRAPH}/${igUserId}/media`, containerParams);
      if (!container.ok || !container.id) { result.instagram = { ok: false, error: container.error ?? "Errore creazione media IG" }; continue; }

      // Step 1b — per i video attendi che il container sia pronto (FINISHED)
      if (isVideo) {
        const ready = await waitForContainer(igUserId, container.id, token);
        if (!ready) { result.instagram = { ok: false, error: "Video ancora in elaborazione su Instagram — riprova tra poco" }; continue; }
      }

      // Step 2 — pubblica
      result.instagram = await graphPost(`${GRAPH}/${igUserId}/media_publish`, new URLSearchParams({ creation_id: container.id, access_token: token }));
    } else {
      result[platform] = { ok: false, error: "Piattaforma non supportata dal publisher" };
    }
  }

  const anyOk = Object.values(result).some((r) => r.ok);
  await persist(admin, post, result, anyOk);
  return { ok: anyOk, result };
}

async function waitForContainer(igUserId: string, creationId: string, token: string, tries = 6, delayMs = 3000): Promise<boolean> {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`${GRAPH}/${creationId}?fields=status_code&access_token=${token}`);
      const json = await res.json().catch(() => ({}));
      if (json.status_code === "FINISHED") return true;
      if (json.status_code === "ERROR") return false;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function persist(admin: Admin, post: SocialPostRow, result: PublishResult, anyOk = false): Promise<void> {
  // social_posts NON ha colonne fail_count/last_error: l'errore per-piattaforma
  // resta in publish_result (unico canale d'errore esistente).
  // Bug fix: su fallimento totale marchiamo 'failed' invece di lasciare il post
  // 'scheduled' con scheduled_at nel passato — altrimenti il cron lo ripubblicava
  // a ogni giro all'infinito senza mai marcarlo fallito. Un post già 'published'
  // resta 'published' (un re-publish fallito non deve declassarlo né rimetterlo in coda).
  const nextStatus = anyOk
    ? "published"
    : (post.status === "published" ? "published" : "failed");
  await admin.from("social_posts").update({
    publish_result: result,
    status: nextStatus,
    updated_at: new Date().toISOString(),
  }).eq("id", post.id);
}
