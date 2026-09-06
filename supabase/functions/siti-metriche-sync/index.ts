/**
 * siti-metriche-sync — porta in casa i numeri di Google Analytics 4 e di
 * Search Console per i siti della rete.
 *
 * Perché un service account e non OAuth: OAuth lega i dati all'account di una
 * persona e prima o poi chiede di riconnettersi, di solito il giorno in cui
 * serve il dato. Un service account è un'identità della piattaforma, lo si
 * aggiunge come lettore sulle proprietà e non scade.
 *
 * Perché salvare invece di interrogare al volo: GA4 tiene lo storico finché
 * tiene la proprietà, Search Console solo sedici mesi. Qui restano.
 *
 * Due azioni:
 *   scopri      → elenca proprietà GA4 e siti Search Console che il service
 *                 account riesce a vedere, così non si va a caccia di ID a mano
 *   sincronizza → scarica gli ultimi giorni e li salva
 *
 * Chiamabile dal cron (x-cron-secret) o da un super admin dalla pagina.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

// ── Autenticazione Google ────────────────────────────────────────────────────

function base64url(dati: Uint8Array): string {
  let s = "";
  for (const b of dati) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Da PEM a chiave utilizzabile: il PEM è base64 con capo riga, va spogliato. */
function pemToBuffer(pem: string): ArrayBuffer {
  const corpo = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const grezzo = atob(corpo);
  const buf = new Uint8Array(grezzo.length);
  for (let i = 0; i < grezzo.length; i++) buf[i] = grezzo.charCodeAt(i);
  return buf.buffer;
}

/**
 * Il token si ottiene firmando un JWT con la chiave privata del service
 * account e scambiandolo su oauth2.googleapis.com. Dura un'ora: qui se ne
 * chiede uno per esecuzione, non vale la pena tenerlo.
 */
async function tokenGoogle(sa: ServiceAccount): Promise<string> {
  const adesso = Math.floor(Date.now() / 1000);
  const testata = { alg: "RS256", typ: "JWT" };
  const pretesa = {
    iss: sa.client_email,
    scope: SCOPES.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: adesso + 3600,
    iat: adesso,
  };
  const codifica = new TextEncoder();
  const parte = (o: unknown) => base64url(codifica.encode(JSON.stringify(o)));
  const daFirmare = `${parte(testata)}.${parte(pretesa)}`;

  const chiave = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", chiave, codifica.encode(daFirmare));
  const jwt = `${daFirmare}.${base64url(new Uint8Array(firma))}`;

  const risposta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const corpo = await risposta.json().catch(() => ({}));
  if (!risposta.ok || !corpo.access_token) {
    // L'errore di Google qui è prezioso e va riportato tale e quale:
    // "invalid_grant" significa chiave sbagliata, "access_denied" significa
    // che il service account non è stato aggiunto alla proprietà.
    throw new Error(
      `Google non ha rilasciato il token (${risposta.status}): ${JSON.stringify(corpo)}`,
    );
  }
  return corpo.access_token as string;
}

async function chiamaGoogle(
  url: string, token: string, corpo?: unknown,
): Promise<Record<string, unknown>> {
  const risposta = await fetch(url, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dati = await risposta.json().catch(() => ({}));
  if (!risposta.ok) {
    throw new Error(`${risposta.status} ${JSON.stringify(dati).slice(0, 400)}`);
  }
  return dati as Record<string, unknown>;
}

// ── Scoperta ─────────────────────────────────────────────────────────────────

async function scopri(token: string) {
  const proprieta: Array<{ id: string; nome: string; account: string }> = [];
  try {
    const dati = await chiamaGoogle(
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
      token,
    );
    for (const acc of (dati.accountSummaries as Array<Record<string, unknown>>) ?? []) {
      for (const p of (acc.propertySummaries as Array<Record<string, string>>) ?? []) {
        proprieta.push({
          id: String(p.property ?? "").replace("properties/", ""),
          nome: p.displayName ?? "",
          account: String(acc.displayName ?? ""),
        });
      }
    }
  } catch (e) {
    proprieta.push({ id: "", nome: `errore: ${(e as Error).message}`, account: "" });
  }

  const siti: string[] = [];
  try {
    const dati = await chiamaGoogle("https://www.googleapis.com/webmasters/v3/sites", token);
    for (const s of (dati.siteEntry as Array<Record<string, string>>) ?? []) {
      if (s.siteUrl) siti.push(s.siteUrl);
    }
  } catch (e) {
    siti.push(`errore: ${(e as Error).message}`);
  }

  return { proprieta_ga4: proprieta, siti_search_console: siti };
}

// ── Raccolta ─────────────────────────────────────────────────────────────────

function giornoIso(scostamento: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - scostamento);
  return d.toISOString().slice(0, 10);
}

/** GA4: totali per giorno + le pagine più viste, in due chiamate. */
async function raccogliGa4(token: string, propertyId: string, da: string, a: string) {
  const totali = await chiamaGoogle(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    token,
    {
      dateRanges: [{ startDate: da, endDate: a }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "totalUsers" }, { name: "sessions" },
        { name: "screenPageViews" }, { name: "averageSessionDuration" },
      ],
      limit: 400,
    },
  );

  const pagine = await chiamaGoogle(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    token,
    {
      dateRanges: [{ startDate: da, endDate: a }],
      dimensions: [{ name: "date" }, { name: "pagePath" }],
      metrics: [
        { name: "screenPageViews" }, { name: "totalUsers" },
        { name: "userEngagementDuration" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 2000,
    },
  );

  return { totali, pagine };
}

function dataGa4(grezza: string): string {
  // GA4 restituisce "20260906": va riportata a "2026-09-06".
  return `${grezza.slice(0, 4)}-${grezza.slice(4, 6)}-${grezza.slice(6, 8)}`;
}

async function raccogliGsc(token: string, siteUrl: string, da: string, a: string) {
  const base = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const totali = await chiamaGoogle(base, token, {
    startDate: da, endDate: a, dimensions: ["date"], rowLimit: 400,
  });
  const pagine = await chiamaGoogle(base, token, {
    startDate: da, endDate: a, dimensions: ["date", "page"], rowLimit: 2000,
  });
  return { totali, pagine };
}

// ── Autorizzazione della chiamata ────────────────────────────────────────────

async function autorizzato(req: Request, db: SupabaseClient): Promise<boolean> {
  const segreto = Deno.env.get("CRON_SECRET") ?? "";
  const inviato = req.headers.get("x-cron-secret") ?? "";
  if (segreto && inviato && segreto === inviato) return true;

  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!jwt) return false;
  const { data: utente } = await db.auth.getUser(jwt);
  if (!utente?.user) return false;
  const { data: ruoli } = await db
    .from("user_roles").select("role").eq("user_id", utente.user.id);
  return (ruoli ?? []).some((r: { role: string }) =>
    r.role === "super_admin" || String(r.role).startsWith("platform"));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (!await autorizzato(req, db)) {
      return new Response(JSON.stringify({ error: "Non autorizzato" }), {
        status: 401, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const corpo = await req.json().catch(() => ({}));
    const azione = corpo.azione === "scopri" ? "scopri" : "sincronizza";
    const giorni = Math.min(Math.max(Number(corpo.giorni) || 14, 1), 90);

    const { data: chiaveGrezza, error: erroreChiave } = await db.rpc("google_service_account");
    if (erroreChiave) throw new Error(`Vault non raggiungibile: ${erroreChiave.message}`);
    if (!chiaveGrezza) {
      return new Response(JSON.stringify({
        ok: false,
        configurato: false,
        messaggio: "Manca il service account: caricare il JSON nel Vault come 'google_service_account'.",
      }), { headers: { ...CORS, "Content-Type": "application/json" } });
    }

    let sa: ServiceAccount;
    try {
      sa = JSON.parse(String(chiaveGrezza));
    } catch {
      throw new Error("Il segreto 'google_service_account' non è un JSON valido");
    }
    if (!sa.client_email || !sa.private_key) {
      throw new Error("Il JSON del service account non contiene client_email e private_key");
    }

    const token = await tokenGoogle(sa);

    if (azione === "scopri") {
      const trovato = await scopri(token);
      return new Response(JSON.stringify({ ok: true, account: sa.client_email, ...trovato }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Search Console pubblica i dati con due o tre giorni di ritardo: si
    // riscarica sempre una finestra, non solo il giorno prima, e si sovrascrive.
    const a = giornoIso(1);
    const da = giornoIso(giorni);

    const { data: siti } = await db
      .from("siti_monitorati").select("*").eq("attivo", true);

    const esito: Array<Record<string, unknown>> = [];

    for (const sito of (siti ?? []) as Array<Record<string, string>>) {
      const righeMetriche: Record<string, unknown>[] = [];
      const righePagine: Record<string, unknown>[] = [];
      let errore: string | null = null;

      if (sito.ga4_property_id) {
        try {
          const { totali, pagine } = await raccogliGa4(token, sito.ga4_property_id, da, a);
          for (const r of (totali.rows as Array<Record<string, Array<{ value: string }>>>) ?? []) {
            righeMetriche.push({
              sito_id: sito.id, giorno: dataGa4(r.dimensionValues[0].value), fonte: "ga4",
              utenti: Number(r.metricValues[0].value) || 0,
              sessioni: Number(r.metricValues[1].value) || 0,
              visualizzazioni: Number(r.metricValues[2].value) || 0,
              durata_media_s: Math.round((Number(r.metricValues[3].value) || 0) * 10) / 10,
              raccolto_il: new Date().toISOString(),
            });
          }
          for (const r of (pagine.rows as Array<Record<string, Array<{ value: string }>>>) ?? []) {
            righePagine.push({
              sito_id: sito.id, giorno: dataGa4(r.dimensionValues[0].value), fonte: "ga4",
              percorso: r.dimensionValues[1].value.slice(0, 500),
              visualizzazioni: Number(r.metricValues[0].value) || 0,
              utenti: Number(r.metricValues[1].value) || 0,
              durata_media_s: Math.round((Number(r.metricValues[2].value) || 0) * 10) / 10,
            });
          }
        } catch (e) {
          errore = `GA4: ${(e as Error).message}`;
        }
      }

      if (sito.gsc_site_url) {
        try {
          const { totali, pagine } = await raccogliGsc(token, sito.gsc_site_url, da, a);
          for (const r of (totali.rows as Array<Record<string, unknown>>) ?? []) {
            righeMetriche.push({
              sito_id: sito.id, giorno: String((r.keys as string[])[0]), fonte: "gsc",
              impressioni: Math.round(Number(r.impressions) || 0),
              clic: Math.round(Number(r.clicks) || 0),
              posizione_media: Math.round((Number(r.position) || 0) * 100) / 100,
              raccolto_il: new Date().toISOString(),
            });
          }
          for (const r of (pagine.rows as Array<Record<string, unknown>>) ?? []) {
            const chiavi = r.keys as string[];
            righePagine.push({
              sito_id: sito.id, giorno: String(chiavi[0]), fonte: "gsc",
              percorso: String(chiavi[1] ?? "").slice(0, 500),
              impressioni: Math.round(Number(r.impressions) || 0),
              clic: Math.round(Number(r.clicks) || 0),
              posizione_media: Math.round((Number(r.position) || 0) * 100) / 100,
            });
          }
        } catch (e) {
          errore = errore ? `${errore} · Search Console: ${(e as Error).message}`
                          : `Search Console: ${(e as Error).message}`;
        }
      }

      if (righeMetriche.length) {
        await db.from("siti_metriche_giornaliere")
          .upsert(righeMetriche, { onConflict: "sito_id,giorno,fonte" });
      }
      if (righePagine.length) {
        await db.from("siti_pagine_giornaliere")
          .upsert(righePagine, { onConflict: "sito_id,giorno,fonte,percorso" });
      }

      await db.from("siti_monitorati")
        .update({ ultimo_sync: new Date().toISOString(), ultimo_errore: errore })
        .eq("id", sito.id);

      esito.push({
        sito: sito.dominio, giorni_metriche: righeMetriche.length,
        righe_pagine: righePagine.length, errore,
      });
    }

    return new Response(JSON.stringify({ ok: true, dal: da, al: a, siti: esito }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[siti-metriche-sync]", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
