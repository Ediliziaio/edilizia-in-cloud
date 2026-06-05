/**
 * automation-email-render — anteprima e invio di prova per le email dei nodi
 * automazione. Usa lo STESSO wrapping brandizzato del send reale (brandEmailBody),
 * quindi l'anteprima è fedele a quello che arriva davvero.
 *
 * Body: { corpo, oggetto, mittente_nome?, vars?, mode: "preview" | "test" }
 *  - mode "preview" → ritorna { ok, html, subject } (HTML brandizzato finale).
 *  - mode "test"    → invia l'email all'INDIRIZZO DELL'UTENTE LOGGATO (mai ad altri,
 *                     per sicurezza) e ritorna { ok, sentTo }.
 *
 * Auth: JWT valido (qualsiasi utente loggato). Le variabili {{...}} vengono
 * sostituite con valori d'esempio (mergeabili dal client).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { brandEmailBody } from "../_shared/brandEmailBody.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";

const SAMPLE_VARS: Record<string, string> = {
  nome: "Marco",
  cognome: "Rossi",
  azienda: "Costruzioni Rossi",
  "azienda.name": "Costruzioni Rossi",
  "azienda.email": "marco@costruzionirossi.it",
  "contatto.first_name": "Marco",
  "contatto.last_name": "Rossi",
  "contatto.email": "marco@costruzionirossi.it",
  "contatto.company_name": "Costruzioni Rossi",
  "opportunita.name": "Ristrutturazione Via Roma",
  giorni_rimasti: "5",
  data_scadenza: "12/06/2026",
};

function resolveVars(s: string, vars: Record<string, string>): string {
  return String(s || "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    return v == null ? "" : String(v);
  });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── Auth: utente loggato (qualsiasi ruolo) ──────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  let payload: { corpo?: string; oggetto?: string; mittente_nome?: string; vars?: Record<string, string>; mode?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body JSON non valido" }, 400);
  }

  const mode = payload.mode === "test" ? "test" : "preview";
  const vars = { ...SAMPLE_VARS, ...(payload.vars || {}) };
  const subject = resolveVars(payload.oggetto || "(nessun oggetto)", vars);
  const resolvedBody = resolveVars(payload.corpo || "", vars);

  let branded: { html: string; text: string };
  try {
    branded = await brandEmailBody(admin, null, resolvedBody, subject);
  } catch (e) {
    return json({ error: `Render fallito: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }

  if (mode === "preview") {
    return json({ ok: true, html: branded.html, subject });
  }

  // mode === "test": invia SOLO all'email dell'utente loggato
  const to = user.email;
  if (!to) return json({ error: "Il tuo account non ha un'email per il test" }, 400);
  try {
    const res = await sendEmailUnified({
      companyId: null,
      stream: "transactional",
      to,
      subject: `[PROVA] ${subject}`,
      html: branded.html,
      text: branded.text,
      skipCredits: true,
      adminClient: admin,
      metadata: { source: "automation_email_test", user_id: user.id },
    });
    if (!res?.ok) return json({ error: `Invio fallito (status ${res?.status ?? "?"})` }, 502);
    return json({ ok: true, sentTo: to });
  } catch (e) {
    return json({ error: `Invio fallito: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
});
