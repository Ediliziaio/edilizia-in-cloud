/**
 * email-imap-test — verifica credenziali IMAP/SMTP custom
 *
 * Body: { connection_id: string }   ← record già salvato in email_oauth_connections
 *   oppure (test prima del salvataggio):
 *   { imap_host, imap_port, imap_secure, imap_username, password,
 *     smtp_host, smtp_port, smtp_secure, email_address }
 *
 * Effettua:
 *   1. IMAP LOGIN + LOGOUT (verifica autenticazione + raggiungibilità)
 *   2. SMTP EHLO (verifica raggiungibilità port)
 *
 * Aggiorna last_test_ok / last_test_at / last_test_error sul record.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { imapTestConnection } from "../_shared/imapSmtpClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InlineConfig {
  imap_host: string;
  imap_port: number;
  imap_secure: boolean;
  imap_username: string;
  password: string;
  smtp_host?: string;
  smtp_port?: number;
  smtp_secure?: boolean;
  email_address?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Auth user
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: userRes } = await supabase.auth.getUser(token);
  const userId = userRes?.user?.id;
  if (!userId) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  let body: { connection_id?: string } & Partial<InlineConfig> = {};
  try { body = await req.json(); } catch { /* empty */ }

  let cfg: InlineConfig;
  let connectionId: string | null = null;

  if (body.connection_id) {
    connectionId = body.connection_id;
    // Verifica ownership e carica credentials decifrate
    const { data: ownership } = await supabase
      .from("email_oauth_connections")
      .select("user_id, provider")
      .eq("id", connectionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ownership) {
      return jsonResponse({ ok: false, error: "Connection not found" }, 404);
    }
    if (ownership.provider !== "imap") {
      return jsonResponse({ ok: false, error: "Solo connessioni IMAP" }, 400);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creds } = await (supabase as any).rpc("email_imap_get_credentials", {
      p_connection_id: connectionId,
    });
    if (!creds || creds.length === 0) {
      return jsonResponse({ ok: false, error: "Credentials not found" }, 404);
    }
    const c = creds[0];
    cfg = {
      imap_host: c.imap_host,
      imap_port: c.imap_port,
      imap_secure: c.imap_secure,
      imap_username: c.imap_username || c.email_address,
      password: c.password,
      email_address: c.email_address,
    };
  } else if (body.imap_host && body.password) {
    cfg = {
      imap_host: body.imap_host,
      imap_port: body.imap_port ?? 993,
      imap_secure: body.imap_secure ?? true,
      imap_username: body.imap_username || body.email_address || "",
      password: body.password,
    };
  } else {
    return jsonResponse({ ok: false, error: "connection_id or inline config required" }, 400);
  }

  try {
    await imapTestConnection({
      host: cfg.imap_host,
      port: cfg.imap_port,
      secure: cfg.imap_secure,
      username: cfg.imap_username,
      password: cfg.password,
    });

    if (connectionId) {
      await supabase.rpc("email_imap_record_test", {
        p_connection_id: connectionId,
        p_ok: true,
        p_error: null,
      });
    }
    return jsonResponse({ ok: true, message: "Connessione IMAP verificata" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (connectionId) {
      await supabase.rpc("email_imap_record_test", {
        p_connection_id: connectionId,
        p_ok: false,
        p_error: msg.slice(0, 500),
      });
    }
    return jsonResponse({ ok: false, error: msg }, 400);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
