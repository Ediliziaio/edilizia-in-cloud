/**
 * notify-password-changed — invia l'email di sicurezza "La tua password è stata
 * cambiata" (2.2) all'utente che ha appena cambiato la propria password.
 *
 * Chiamata dal frontend (ChangePasswordForm) SUBITO DOPO un auth.updateUser
 * andato a buon fine. Auth: JWT dell'utente stesso (verify_jwt default = true).
 * Best-effort: il chiamante non deve bloccarsi se questa fallisce.
 *
 * NB: copre il cambio password SELF-SERVICE. Il flusso "password dimenticata"
 * (recovery) e il reset admin passano da altri percorsi; per coprirli al 100%
 * serve un Auth Hook "Send Email" di Supabase (config di progetto).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { renderEmailTemplate } from "../_shared/renderTemplate.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401, cors);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: { user } } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user?.email) return json({ error: "Unauthorized" }, 401, cors);

    const { data: profile } = await admin
      .from("profiles").select("first_name, company_id").eq("id", user.id).maybeSingle();
    const companyId = (profile?.company_id as string | null) ?? null;
    const supportEmail =
      (await getPlatformSetting("email_default_support_mail", "")) || "support@ediliziaincloud.it";

    const now = new Date();
    const dz = (opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", ...opts }).format(now);

    const rendered = await renderEmailTemplate({
      templateName: "password_changed",
      companyId,
      adminClient: admin,
      props: {
        recipientName: (profile?.first_name as string | undefined) || user.email.split("@")[0],
        changedDate: dz({ day: "2-digit", month: "2-digit", year: "numeric" }),
        changedTime: dz({ hour: "2-digit", minute: "2-digit" }),
        supportEmail,
      },
    });

    await sendEmailUnified({
      companyId,
      stream: "transactional",
      to: user.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      templateName: "password_changed",
      skipCredits: true,
      adminClient: admin,
    });

    return json({ ok: true }, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
  }
});
