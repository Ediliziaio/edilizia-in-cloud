import {getOutlookAccessToken} from '../_shared/outlookAccessToken.ts';
/**
 * outlook-calendar-sync — sincronizza eventi da Outlook Calendar via Microsoft Graph
 *
 * POST /functions/v1/outlook-calendar-sync
 * Body: { calendar_id?: string, from?: ISO, to?: ISO }
 *   calendar_id: override del calendario sincronizzato (default: primary)
 *   from/to: range temporale (default: oggi → +60 giorni)
 *
 * API: GET /me/calendars/{id}/calendarView?startDateTime=..&endDateTime=..
 * Token refresh automatico via refresh_token.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function getFreshAccessToken(connectionId:string){return getOutlookAccessToken(admin(),connectionId);}

interface GraphEvent {
  id: string;
  iCalUId?: string;
  subject?: string;
  bodyPreview?: string;
  start?: { dateTime: string; timeZone?: string };
  end?: { dateTime: string; timeZone?: string };
  isAllDay?: boolean;
  location?: { displayName?: string };
  organizer?: { emailAddress?: { address?: string; name?: string } };
  attendees?: Array<{
    emailAddress?: { address?: string; name?: string };
    status?: { response?: string };
  }>;
  showAs?: string;
  seriesMasterId?: string;
  isCancelled?: boolean;
  webLink?: string;
}

interface ConnRow {
  id: string; company_id: string; user_id: string;
  primary_calendar_id: string | null; synced_calendar_ids?: string[] | null;
}

/**
 * Sincronizza UN calendario di UNA connessione (finestra default: oggi → +60
 * giorni). Usata sia dalla chiamata dell'utente sia dal cron: prima esisteva
 * solo dentro il handler utente, quindi Outlook si aggiornava SOLO quando
 * qualcuno premeva "Sincronizza" — Google invece gira ogni 15 minuti.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncConnection(db: any, conn: ConnRow, calendarId: string, opts: { from?: string; to?: string }): Promise<number> {
  // Default range: today → +60 days
  const now = new Date();
  const from = opts.from ?? now.toISOString();
  const toDefault = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const to = opts.to ?? toDefault.toISOString();
  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))
      || Date.parse(from) >= Date.parse(to)) throw new Error("Finestra Outlook non valida.");

  const accessToken = await getFreshAccessToken(conn.id);

  // Paginated fetch via @odata.nextLink
  const eventi = new Map<string, GraphEvent>();
  const pagineVisitate = new Set<string>();
  let url: string | null = `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarView`
    + `?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}`
    + "&$top=100&$select=id,iCalUId,subject,bodyPreview,start,end,isAllDay,location,organizer,attendees,showAs,seriesMasterId,isCancelled,webLink";
  const tempoLettura = AbortSignal.timeout(90000);

  try {
    while (url) {
      if (new URL(url).origin !== "https://graph.microsoft.com") throw new Error("Graph: pagina successiva con indirizzo non valido.");
      if (pagineVisitate.has(url)) throw new Error("Graph: la paginazione ha restituito una pagina già visitata.");
      pagineVisitate.add(url);
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
        redirect: "error",
        signal: AbortSignal.any([tempoLettura, AbortSignal.timeout(20000)]),
      });
      if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = await res.json() as { value?: GraphEvent[]; "@odata.nextLink"?: string };
      if (!Array.isArray(json.value) || json.value.some(e => typeof e?.id !== "string" || !e.id)) {
        throw new Error("Graph: pagina eventi incompleta.");
      }
      for (const evento of json.value) eventi.set(evento.id, evento);
      url = json["@odata.nextLink"] ?? null;
    }
  } catch (error) {
    await db.from("outlook_calendar_connections").update({
      last_error: error instanceof Error ? error.message.slice(0, 250) : "Lettura del calendario Outlook interrotta.",
    }).eq("id", conn.id);
    throw error;
  }

  // Graph restituisce l’orario in UTC per il Prefer della richiesta. Alcuni
  // eventi riportano già un suffisso, anche quando la zona è la stessa.
  const dataGraph = (value: string | undefined) => {
    if (!value) return null;
    return new Date(/(?:z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : value + "Z").toISOString();
  };
  const eventsAll = [...eventi.values()];
  const rows = eventsAll.map((e) => ({
    outlook_event_id: e.id,
    outlook_ical_uid: e.iCalUId ?? null,
    subject: e.subject ?? null,
    body_preview: e.bodyPreview ?? null,
    start_time: dataGraph(e.start?.dateTime),
    end_time: dataGraph(e.end?.dateTime),
    is_all_day: e.isAllDay ?? false,
    location_display_name: e.location?.displayName ?? null,
    organizer_email: e.organizer?.emailAddress?.address ?? null,
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.emailAddress?.address ?? null,
      name: a.emailAddress?.name ?? null,
      response_status: a.status?.response ?? null,
    })),
    show_as: e.showAs ?? null,
    series_master_id: e.seriesMasterId ?? null,
    is_cancelled: e.isCancelled ?? false,
    web_link: e.webLink ?? null,
    raw: e,
  }));

  const { data: applicato, error } = await db.rpc("outlook_applica_snapshot", {
    p_connessione: conn.id,
    p_calendario: calendarId,
    p_da: from,
    p_fino: to,
    p_letto_da: now.toISOString(),
    p_eventi: rows,
  });
  if (error) throw error;
  return applicato ? eventsAll.length : 0;
}

/** Cron: tutte le connessioni col calendario scelto, una alla volta, errori isolati. */
async function cronFullSync(): Promise<Response> {
  const db = admin();
  const { data: conns } = await db
    .from("outlook_calendar_connections")
    .select("id, company_id, user_id, primary_calendar_id, synced_calendar_ids")
    .not("primary_calendar_id", "is", null);
  const esito = { connessioni: (conns ?? []).length, ok: 0, errori: 0, eventi: 0 };
  for (const conn of (conns ?? []) as ConnRow[]) {
    try {
      // Il principale, gli altri scelti nelle impostazioni e i calendari
      // agganciati ai calendari di marketing (passo 3): fino al 09/09/2026 quella
      // scelta si salvava e poi non la leggeva nessuno.
      const { data: agganciati } = await db
        .from("marketing_calendars")
        .select("external_calendar_id")
        .eq("external_connection_id", conn.id)
        .eq("external_provider", "outlook")
        .eq("is_active", true);
      const calendari = new Set<string>([conn.primary_calendar_id!]);
      for (const id of conn.synced_calendar_ids ?? []) if (id) calendari.add(id);
      for (const a of (agganciati ?? []) as Array<{ external_calendar_id: string | null }>) if (a.external_calendar_id) calendari.add(a.external_calendar_id);
      for (const calendarId of calendari) {
        esito.eventi += await syncConnection(db, conn, calendarId, {});
      }
      esito.ok++;
    } catch (e) {
      // L'errore e' gia' annotato su last_error dalla sync: qui si passa oltre,
      // una connessione rotta non deve fermare le altre.
      console.error("[outlook-calendar-sync] cron, connessione", conn.id, (e as Error)?.message);
      esito.errori++;
    }
  }
  return new Response(JSON.stringify(esito), { headers: { "Content-Type": "application/json" } });
}

serveConMetriche("outlook-calendar-sync", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      companyId?: string;
      calendar_id?: string;
      from?: string;
      to?: string;
    };

    // Cron: solo col segreto interno (x-cron-secret dal Vault, job
    // outlook-calendar-sync-every-15min). Prima bastava la chiave anon, che è
    // pubblica: chiunque poteva far sincronizzare tutti i calendari.
    if (body.action === "cron-full-sync") {
      if (!cronSecretValido(req)) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      return await cronFullSync();
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const db = admin();
    // Un collegamento per azienda: si usa quello dell'azienda attiva.
    const companyId = typeof body.companyId === "string" && body.companyId ? body.companyId : null;
    let q = db
      .from("outlook_calendar_connections")
      .select("id, company_id, user_id, primary_calendar_id, synced_calendar_ids")
      .eq("user_id", user.id);
    if (companyId) q = q.eq("company_id", companyId);
    const { data: righe } = await q.limit(2);
    const conn = (righe ?? []).length === 1 ? righe![0] : null;
    if (!conn) {
      return new Response(JSON.stringify({ error: (righe ?? []).length > 1 ? "Indica l'azienda da sincronizzare" : "Outlook non collegato" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Tutti i calendari spuntati, come fa il giro automatico. Prima la sync
    // manuale leggeva solo il principale e ignorava le spunte.
    let calendari: string[];
    if (body.calendar_id) {
      calendari = [body.calendar_id];
    } else {
      const { data: agganciati } = await db
        .from("marketing_calendars")
        .select("external_calendar_id")
        .eq("external_connection_id", conn.id)
        .eq("external_provider", "outlook")
        .eq("is_active", true);
      calendari = Array.from(new Set([
        conn.primary_calendar_id,
        ...((conn.synced_calendar_ids as string[] | null) ?? []),
        ...((agganciati ?? []) as Array<{ external_calendar_id: string | null }>).map((a) => a.external_calendar_id),
      ].filter((x): x is string => !!x)));
    }
    if (calendari.length === 0) {
      return new Response(JSON.stringify({ error: "Nessun calendario selezionato" }), {
        status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let synced = 0;
    for (const calendarId of calendari) {
      synced += await syncConnection(db, conn as ConnRow, calendarId, { from: body.from, to: body.to });
    }

    return new Response(JSON.stringify({ ok: true, synced, calendari: calendari.length }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[outlook-calendar-sync] error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
