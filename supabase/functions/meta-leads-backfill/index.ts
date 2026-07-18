// meta-leads-backfill
// ─────────────────────────────────────────────────────────────────────────────
// Rete di sicurezza "near-realtime" per i lead Meta (Facebook/Instagram Lead Ads).
//
// PERCHÉ ESISTE: il webhook leadgen in tempo reale può NON essere consegnato da
// Meta anche quando la pagina risulta iscritta (es. app in Accesso Standard /
// non-Live per le pagine dei clienti). In quel caso i lead esistono su Meta ma
// non entrano mai nel CRM. Questa funzione, girando a cadenza breve (cron ogni
// 15 min), interroga Graph e ripesca i lead recenti di TUTTI i moduli di ogni
// pagina selezionata, mettendoli in coda in integration_webhook_events (pending).
// Il cron meta-process-leads (ogni 2 min) li trasforma poi in contatti/opportunità.
//
// - Dedup idempotente su (company_id, provider, event_id): rilanciare non duplica.
// - Scopre i form da Meta (/{page}/leadgen_forms), non solo quelli registrati nel
//   wizard: una campagna nuova con un modulo mai configurato è comunque coperta.
// - Auth: header x-cron-secret (CRON_SECRET) oppure Bearer JWT.
// - Body opzionale: { company_id?: string, days?: number } per un backfill mirato.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ── Decrypt AES-GCM (allineato a _shared/encryption.ts) ──────────────────────
const AES_PREFIX = "aes:";
function getEncryptionKey(): string {
  const key = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (key) return key;
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!srk) throw new Error("Encryption key mancante");
  return srk.substring(0, 32);
}
async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").substring(0, 32));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["decrypt"]);
}
async function decrypt(encoded: string, key: string): Promise<string> {
  if (!encoded.startsWith(AES_PREFIX)) throw new Error("Formato token non AES");
  const aesKey = await deriveAesKey(key);
  const combined = Uint8Array.from(atob(encoded.slice(AES_PREFIX.length)), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ── Backfill di una pagina: scopri i form su Meta e ripesca i lead recenti ───
async function backfillPage(
  admin: ReturnType<typeof createClient>,
  integ: { id: string; company_id: string },
  pageId: string,
  pageToken: string,
  days: number,
): Promise<number> {
  const sinceTs = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);

  const formIds = new Set<string>();
  try {
    let formsUrl: string | null =
      `https://graph.facebook.com/${apiVersion}/${pageId}/leadgen_forms?fields=id&limit=100&access_token=${pageToken}`;
    while (formsUrl) {
      const r = await fetch(formsUrl);
      const d = await r.json();
      if (d.error) {
        console.warn(`meta-leads-backfill: elenco form ${pageId} errore:`, d.error.message);
        break;
      }
      for (const f of d.data ?? []) if (f.id) formIds.add(String(f.id));
      formsUrl = d.paging?.next || null;
    }
  } catch (e) {
    console.warn(`meta-leads-backfill: elenco form ${pageId} errore rete:`, e);
  }

  let imported = 0;
  for (const formId of formIds) {
    let nextUrl: string | null =
      `https://graph.facebook.com/${apiVersion}/${formId}/leads` +
      `?fields=id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name` +
      `&limit=50&filtering=[{"field":"time_created","operator":"GREATER_THAN","value":${sinceTs}}]` +
      `&access_token=${pageToken}`;
    while (nextUrl) {
      const res = await fetch(nextUrl);
      const data = await res.json();
      if (data.error) {
        console.warn(`meta-leads-backfill: lead form ${formId} errore:`, data.error.message);
        break;
      }
      for (const lead of data.data ?? []) {
        await admin.from("integration_webhook_events").upsert(
          {
            company_id: integ.company_id,
            integration_id: integ.id,
            provider: "meta",
            event_type: "leadgen",
            event_id: lead.id,
            payload: { ...lead, leadgen_id: lead.id, form_id: formId, page_id: pageId },
            received_at: new Date().toISOString(),
            status: "pending",
            fail_count: 0,
          },
          { onConflict: "company_id,provider,event_id", ignoreDuplicates: true },
        );
        imported++;
      }
      nextUrl = data.paging?.next || null;
    }
  }
  return imported;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("Authorization");
  const authorized = (cronSecret && reqSecret === cronSecret) || authHeader?.startsWith("Bearer ");
  if (!authorized) return json({ error: "Unauthorized" }, 401);

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const onlyCompany = (body as { company_id?: string })?.company_id ?? null;
    const daysRaw = (body as { days?: number })?.days;
    const days = Number.isFinite(Number(daysRaw)) && Number(daysRaw) > 0 ? Number(daysRaw) : 2;

    let q = admin
      .from("integrations")
      .select("id, company_id")
      .eq("provider", "meta")
      .in("status", ["connected", "error"]);
    if (onlyCompany) q = q.eq("company_id", onlyCompany);
    const { data: integrations, error } = await q;
    if (error) throw error;

    const encKey = getEncryptionKey();
    const out: Array<Record<string, unknown>> = [];

    for (const integ of integrations ?? []) {
      try {
        const { data: pages } = await admin
          .from("meta_assets")
          .select("asset_id")
          .eq("integration_id", integ.id)
          .eq("company_id", integ.company_id)
          .eq("asset_type", "page")
          .eq("selected", true);
        if (!pages?.length) continue;

        const { data: creds } = await admin
          .from("integration_credentials")
          .select("meta_page_tokens")
          .eq("integration_id", integ.id)
          .maybeSingle();
        const tokens = (creds?.meta_page_tokens ?? {}) as Record<string, string>;

        for (const page of pages) {
          const enc = tokens[page.asset_id];
          if (!enc) continue;
          let pageToken: string;
          try {
            pageToken = await decrypt(enc, encKey);
          } catch {
            console.warn(`meta-leads-backfill: token pagina ${page.asset_id} non decifrabile`);
            continue;
          }
          const imported = await backfillPage(admin, integ, page.asset_id, pageToken, days);
          out.push({ company_id: integ.company_id, page_id: page.asset_id, imported });
        }
      } catch (e) {
        out.push({ company_id: integ.company_id, error: String(e) });
      }
    }

    return json({ ok: true, integrations: (integrations ?? []).length, results: out });
  } catch (e) {
    console.error("meta-leads-backfill error:", e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
