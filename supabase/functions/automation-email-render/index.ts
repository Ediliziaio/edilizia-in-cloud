/**
 * automation-email-render — anteprima e invio di prova per le email dei nodi
 * automazione. Usa lo STESSO wrapping brandizzato del send reale (brandEmailBody),
 * con dati sintetici: non verifica il destinatario, il provider o il recapito.
 *
 * Body: { corpo, oggetto, mittente_nome?, vars?, mode: "preview" | "test" }
 *  - mode "preview" → ritorna { ok, html, subject } (HTML brandizzato finale).
 *  - mode "test"    → invia l'email all'INDIRIZZO DELL'UTENTE LOGGATO (mai ad altri,
 *                     per sicurezza) e ritorna { ok, sentTo }.
 *
 * Auth: JWT valido e accesso all'azienda richiesta. Le variabili {{...}} vengono
 * sostituite con valori d'esempio (mergeabili dal client).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { brandEmailBody } from "../_shared/brandEmailBody.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { requireCompanyAccess } from "../_shared/auth.ts";
import { emailContentEmpty, renderEmailSample } from "../_shared/automationEmail.ts";
import { automationEmailSampleValues } from "../_shared/automationEmailSamples.ts";

export async function handleAutomationEmailRender(req: Request): Promise<Response> {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // ── Auth: utente loggato (qualsiasi ruolo) ──────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  if (!user) return json({ error: "Unauthorized" }, 401);

  let payload: { corpo?: string; oggetto?: string; mittente_nome?: string; vars?: Record<string, string>; mode?: string; company_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body JSON non valido" }, 400);
  }

  if (!payload || typeof payload !== "object" || (payload.mode && !["preview", "test"].includes(payload.mode))) return json({ error: "Modalità non valida" }, 400);
  if (typeof payload.corpo !== "string" || typeof payload.oggetto !== "string" || !payload.oggetto.trim() || emailContentEmpty(payload.corpo)) return json({ error: "Oggetto e corpo email sono obbligatori" }, 400);
  if (payload.corpo.length > 200_000 || payload.oggetto.length > 1000) return json({ error: "Contenuto email troppo lungo" }, 400);
  if (payload.vars && (typeof payload.vars !== "object" || Array.isArray(payload.vars) || Object.values(payload.vars).some(value => typeof value !== "string" || value.length > 10_000))) return json({ error: "Variabili di prova non valide" }, 400);
  let companyId: string | null = payload.company_id || null;
  if (!companyId) {
    const { data: profile, error } = await admin.from("profiles").select("company_id").eq("id", user.id).maybeSingle();
    if (error) return json({ error: "Impossibile verificare l’azienda" }, 403);
    companyId = profile?.company_id || null;
  }
  if (companyId) {
    try { await requireCompanyAccess(admin, user.id, companyId, cors); }
    catch (error) { return error instanceof Response ? error : json({ error: "Accesso azienda negato" }, 403); }
  }
  const mode = payload.mode === "test" ? "test" : "preview";
  const vars = { ...automationEmailSampleValues(), ...(payload.vars || {}) };
  const resolvedSubject = renderEmailSample(payload.oggetto, vars);
  const resolvedBody = renderEmailSample(payload.corpo, vars, true);
  const subject = resolvedSubject.text.replace(/[\r\n]/g, " ");
  const missingVariables = Array.from(new Set([...resolvedSubject.missing, ...resolvedBody.missing]));

  let branded: { html: string; text: string };
  try {
    branded = await brandEmailBody(admin, companyId, resolvedBody.text, subject);
  } catch (e) {
    return json({ error: `Render fallito: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }

  if (mode === "preview") {
    return json({ ok: true, html: branded.html, subject, missingVariables });
  }

  // mode === "test": invia SOLO all'email dell'utente loggato
  const to = user.email;
  if (!to) return json({ error: "Il tuo account non ha un'email per il test" }, 400);
  try {
    const res = await sendEmailUnified({
      companyId,
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
}
Deno.serve(handleAutomationEmailRender);
