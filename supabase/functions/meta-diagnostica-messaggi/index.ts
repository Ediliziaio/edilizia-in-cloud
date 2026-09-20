/**
 * Sonda dei messaggi social (Messenger/Instagram), sola lettura.
 *
 * Risponde a una domanda sola: le chat che l'azienda vede su Meta arrivano
 * fino a noi? Per ogni pagina collegata legge da Graph:
 *  - subscribed_apps → i campi a cui la NOSTRA app è iscritta (serve "messages");
 *  - conversations di Messenger (token pagina) e di Instagram (token pagina
 *    sull'account IG) → quante e quando è stata aggiornata l'ultima.
 * E le confronta con social_messaggi, cioè con quello che ci è davvero arrivato.
 *
 * Se l'ultima conversazione su Meta è più recente del nostro ultimo messaggio,
 * stiamo perdendo pezzi. Se Instagram risponde "(#3) Application does not have
 * the capability", il permesso instagram_manage_messages non è ancora approvato:
 * i DM non arriveranno finché Meta non chiude la App Review.
 *
 * Non scrive niente: nessuna iscrizione, nessun messaggio, nessun contatto.
 * Protetta dal segreto cron (x-cron-secret); senza dipendenze da _shared così
 * resta una sonda isolata.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";
const AES_PREFIX = "aes:";
// Graph sulle conversazioni Instagram resta appeso quando manca la capability:
// meglio tagliare corto che tenere occupata la coda di chi ci chiama.
const TIMEOUT_MS = 12_000;

function chiaveCifratura(): string {
  const key = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (key) return key;
  return (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").substring(0, 32);
}

async function decifra(valore: string, segreto: string): Promise<string> {
  if (!valore.startsWith(AES_PREFIX)) throw new Error("formato non AES");
  const raw = new TextEncoder().encode(segreto.padEnd(32, "0").substring(0, 32));
  const aesKey = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
  const bin = atob(valore.slice(AES_PREFIX.length));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    aesKey,
    bytes.slice(12),
  );
  return new TextDecoder().decode(plain);
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: impApp } = await admin
    .from("platform_settings").select("value").eq("key", "meta_app_id").maybeSingle();
  const metaAppId = String(impApp?.value ?? "");
  const encKey = chiaveCifratura();

  const body = await req.json().catch(() => ({}));
  const soloAzienda: string | null = body?.company_id ?? null;

  let q = admin
    .from("integrations")
    .select("id, company_id")
    .eq("provider", "meta")
    .eq("status", "connected");
  if (soloAzienda) q = q.eq("company_id", soloAzienda);
  const { data: integrations } = await q;

  const out: unknown[] = [];

  for (const integ of integrations ?? []) {
    const { data: pages } = await admin
      .from("meta_assets")
      .select("asset_id, asset_name, metadata")
      .eq("integration_id", integ.id)
      .eq("asset_type", "page")
      .eq("selected", true);

    const { data: creds } = await admin
      .from("integration_credentials")
      .select("meta_page_tokens")
      .eq("integration_id", integ.id)
      .maybeSingle();
    const pageTokens = (creds?.meta_page_tokens ?? {}) as Record<string, string>;

    const { data: ultimoNostro } = await admin
      .from("social_messaggi")
      .select("inviato_at")
      .eq("company_id", integ.company_id)
      .order("inviato_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    for (const page of pages ?? []) {
      const ig = (page.metadata as
        | { instagram_business_account?: { id?: string; username?: string } }
        | null)?.instagram_business_account ?? null;

      const riga: Record<string, unknown> = {
        company_id: integ.company_id,
        page_id: page.asset_id,
        page_name: page.asset_name,
        instagram: ig?.username ?? null,
        nostro_ultimo_messaggio: ultimoNostro?.inviato_at ?? null,
      };

      const encTok = pageTokens[page.asset_id];
      if (!encTok) {
        riga.errore = "nessun token di pagina salvato";
        out.push(riga);
        continue;
      }
      let pageToken: string;
      try {
        pageToken = await decifra(encTok, encKey);
      } catch {
        riga.errore = "token di pagina non decifrabile";
        out.push(riga);
        continue;
      }

      const G = async (base: string, path: string) => {
        const sep = path.includes("?") ? "&" : "?";
        try {
          const r = await fetch(
            `https://graph.facebook.com/${apiVersion}/${base}/${path}${sep}access_token=${pageToken}`,
            { signal: AbortSignal.timeout(TIMEOUT_MS) },
          );
          const j = await r.json();
          return j?.error ? { errore: j.error.message, code: j.error.code } : j;
        } catch (e) {
          return { errore: String(e) };
        }
      };

      const riassumi = (r: { errore?: string; data?: { updated_time?: string }[] }) =>
        r.errore
          ? { errore: r.errore }
          : {
              quante: (r.data ?? []).length,
              ultima: (r.data ?? [])[0]?.updated_time ?? null,
            };

      const sub = await G(page.asset_id, "subscribed_apps?fields=id,subscribed_fields");
      riga.iscrizione = sub.errore
        ? { errore: sub.errore }
        : (sub.data ?? [])
            .filter((a: { id?: string }) => !metaAppId || String(a.id) === metaAppId)
            .map((a: { subscribed_fields?: string[] }) => a.subscribed_fields ?? []);

      riga.messenger = riassumi(
        await G(page.asset_id, "conversations?platform=messenger&fields=id,updated_time&limit=25"),
      );
      riga.instagram_chat = ig?.id
        ? riassumi(await G(ig.id, "conversations?platform=instagram&fields=id,updated_time&limit=5"))
        : { errore: "nessun account Instagram collegato alla pagina" };

      out.push(riga);
    }
  }

  return new Response(JSON.stringify({ pagine: out }), {
    headers: { "Content-Type": "application/json" },
  });
});
