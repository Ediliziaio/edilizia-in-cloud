/**
 * task-riepilogo-email — il riepilogo del mattino sulle proprie attività.
 *
 * IL BUCO CHE QUESTA FUNZIONE CHIUDE (gap check del 2026-09-02)
 * ------------------------------------------------------------
 * Le attività avevano UNA sola forma di avviso: la campanella dentro
 * l'applicativo. Chi sta in cantiere l'applicativo non lo apre, e infatti in
 * produzione c'erano 46 attività scadute su 54 aperte. Le colonne
 * `task_assigned_email`, `task_due_soon_email` e `task_overdue_email` esistono
 * dal marzo 2026 e nessuna riga di codice le leggeva.
 *
 * Qui parte UNA email al giorno per persona, non una per attività: un
 * riepilogo con le assegnate di fresco, quelle in scadenza oggi e quelle già
 * scadute. Chi non ha nulla non riceve niente.
 *
 * Rispetta le preferenze per utente; se un utente non ha mai salvato le sue
 * preferenze valgono i default della tabella (assegnazione e scadenza: no;
 * scadute: sì), perché è l'avviso che serve davvero.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { cronSecretValido } from "../_shared/cronAuth.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { getBrandingForCompany } from "../_shared/getBranding.ts";

const STATI_CHIUSI = ["completata", "completato", "completed", "done", "fatto", "annullata"];

interface TaskRiga {
  id: string;
  title: string;
  due_date: string | null;
  priority: string | null;
  status: string | null;
  assigned_to: string;
  company_id: string;
  created_at: string;
  order_id: string | null;
}

interface Preferenze {
  user_id: string;
  task_assigned_email: boolean;
  task_due_soon_email: boolean;
  task_overdue_email: boolean;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function dataIt(iso: string | null): string {
  if (!iso) return "senza scadenza";
  const [a, m, g] = iso.split("T")[0].split("-");
  return `${g}/${m}/${a}`;
}

function bloccoTask(titolo: string, colore: string, righe: TaskRiga[], mostraData: boolean): string {
  if (righe.length === 0) return "";
  const voci = righe
    .slice(0, 15)
    .map((t) => {
      const urgente = (t.priority === "urgente" || t.priority === "alta")
        ? ` <span style="color:#B45309;font-weight:600;">${esc(t.priority === "urgente" ? "urgente" : "alta priorità")}</span>`
        : "";
      const quando = mostraData ? ` <span style="color:#6B7280;">— ${esc(dataIt(t.due_date))}</span>` : "";
      return `<li style="margin:0 0 6px 0;">${esc(t.title)}${quando}${urgente}</li>`;
    })
    .join("");
  const extra = righe.length > 15 ? `<p style="margin:6px 0 0 0;color:#6B7280;font-size:13px;">…e altre ${righe.length - 15}.</p>` : "";
  return `
    <div style="margin:0 0 20px 0;">
      <h3 style="margin:0 0 8px 0;font-size:15px;color:${colore};">${esc(titolo)} (${righe.length})</h3>
      <ul style="margin:0;padding-left:18px;font-size:14px;color:#111827;">${voci}</ul>
      ${extra}
    </div>`;
}

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const autorizzato = cronSecretValido(req) ||
    (req.headers.get("Authorization") ?? "").slice(7) === serviceRoleKey;
  if (!autorizzato) {
    return errorResponse("Unauthorized: serve il secret del cron", 401, corsH);
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // dry_run: calcola tutto e non spedisce. Serve per collaudare su dati demo
  // (indirizzi inesistenti: spedirci davvero rovina la reputazione del mittente)
  // e per capire, in produzione, chi riceverebbe cosa prima di far partire il giro.
  let dryRun = false;
  try {
    const corpo = req.method === "POST" ? await req.json() : {};
    dryRun = corpo?.dry_run === true;
  } catch { /* corpo vuoto: invio reale */ }

  const esito = { dry_run: dryRun, destinatari: 0, email_inviate: 0, saltate: 0, errori: [] as string[], anteprima: [] as Array<Record<string, unknown>> };

  try {
    const oggi = new Date().toISOString().split("T")[0];
    const ieri = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    // Tutte le attività aperte con un assegnatario e una scadenza già arrivata,
    // più quelle assegnate nelle ultime 24 ore (che una scadenza può non averla).
    const { data: aperte, error: errTasks } = await supabase
      .from("tasks")
      .select("id, title, due_date, priority, status, assigned_to, company_id, created_at, order_id")
      .not("assigned_to", "is", null)
      .not("status", "in", `(${STATI_CHIUSI.join(",")})`)
      .or(`due_date.lte.${oggi},created_at.gte.${ieri}`);
    if (errTasks) throw new Error(`Lettura attività: ${errTasks.message}`);

    const righe = (aperte ?? []) as TaskRiga[];
    if (righe.length === 0) return jsonResponse({ success: true, ...esito, nota: "nessuna attività da segnalare" }, 200, corsH);

    // Raggruppo per persona: una email a testa, non una per attività.
    const perUtente = new Map<string, TaskRiga[]>();
    for (const t of righe) {
      const lista = perUtente.get(t.assigned_to) ?? [];
      lista.push(t);
      perUtente.set(t.assigned_to, lista);
    }
    const utenti = Array.from(perUtente.keys());

    const [{ data: profili }, { data: preferenze }] = await Promise.all([
      supabase.from("profiles").select("id, email, first_name, company_id").in("id", utenti),
      supabase
        .from("user_notification_preferences")
        .select("user_id, task_assigned_email, task_due_soon_email, task_overdue_email")
        .in("user_id", utenti),
    ]);

    const prefPerUtente = new Map<string, Preferenze>();
    for (const p of (preferenze ?? []) as Preferenze[]) prefPerUtente.set(p.user_id, p);

    // Default della tabella quando l'utente non ha mai toccato le preferenze.
    const DEFAULT_PREF: Omit<Preferenze, "user_id"> = {
      task_assigned_email: false,
      task_due_soon_email: false,
      task_overdue_email: true,
    };

    const brandingCache = new Map<string, Awaited<ReturnType<typeof getBrandingForCompany>>>();

    for (const profilo of (profili ?? []) as Array<{ id: string; email: string | null; first_name: string | null; company_id: string | null }>) {
      const mie = perUtente.get(profilo.id) ?? [];
      if (!profilo.email || !profilo.company_id) { esito.saltate++; continue; }

      const pref = { ...DEFAULT_PREF, ...(prefPerUtente.get(profilo.id) ?? {}) };

      const scadute = pref.task_overdue_email
        ? mie.filter((t) => t.due_date && t.due_date < oggi)
        : [];
      const oggiInScadenza = pref.task_due_soon_email
        ? mie.filter((t) => t.due_date === oggi)
        : [];
      const nuove = pref.task_assigned_email
        ? mie.filter((t) => t.created_at >= ieri)
        : [];

      if (scadute.length === 0 && oggiInScadenza.length === 0 && nuove.length === 0) { esito.saltate++; continue; }
      esito.destinatari++;
      esito.anteprima.push({
        destinatario: profilo.email,
        scadute: scadute.length,
        in_scadenza_oggi: oggiInScadenza.length,
        assegnate_di_recente: nuove.length,
        prima_scaduta: scadute[0]?.title ?? null,
      });

      // Una sola email al giorno per destinatario, anche se la funzione viene
      // richiamata a mano: il log degli invii è la memoria.
      const { data: giaInviata } = await supabase
        .from("email_delivery_log")
        .select("id")
        .eq("recipient", profilo.email)
        .eq("template_type", "task_riepilogo")
        .gte("created_at", `${oggi}T00:00:00Z`)
        .limit(1)
        .maybeSingle();
      if (giaInviata) { esito.saltate++; continue; }

      if (!brandingCache.has(profilo.company_id)) {
        brandingCache.set(profilo.company_id, await getBrandingForCompany(supabase, profilo.company_id));
      }
      const branding = brandingCache.get(profilo.company_id)!;
      const appUrl = branding.siteUrl || Deno.env.get("SITE_URL") || "";

      const titoloEmail = scadute.length > 0
        ? `${scadute.length} attività scadut${scadute.length === 1 ? "a" : "e"} da recuperare`
        : oggiInScadenza.length > 0
          ? `${oggiInScadenza.length} attività in scadenza oggi`
          : `${nuove.length} nuova attività assegnata`;

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827;">
          <h2 style="margin:0 0 4px 0;font-size:19px;color:#1E3A5F;">Le tue attività</h2>
          <p style="margin:0 0 18px 0;color:#6B7280;font-size:14px;">
            Ciao ${esc(profilo.first_name || "")}, ecco come sei messo stamattina.
          </p>
          ${bloccoTask("Scadute", "#B91C1C", scadute, true)}
          ${bloccoTask("In scadenza oggi", "#B45309", oggiInScadenza, false)}
          ${bloccoTask("Assegnate di recente", "#1D4ED8", nuove, true)}
          ${appUrl ? `<p style="margin:22px 0 0 0;">
            <a href="${esc(appUrl)}/azienda/attivita" style="background:#F97316;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;font-weight:600;font-size:14px;display:inline-block;">Apri le attività</a>
          </p>` : ""}
          <p style="margin:22px 0 0 0;color:#9CA3AF;font-size:12px;">
            Ricevi questo messaggio perché sei l'assegnatario. Puoi cambiare gli avvisi dalle impostazioni di notifica.
          </p>
        </div>`;

      const testo = [
        `Le tue attività — ${titoloEmail}`,
        scadute.length ? `Scadute (${scadute.length}): ${scadute.slice(0, 10).map((t) => `${t.title} (${dataIt(t.due_date)})`).join("; ")}` : "",
        oggiInScadenza.length ? `In scadenza oggi (${oggiInScadenza.length}): ${oggiInScadenza.slice(0, 10).map((t) => t.title).join("; ")}` : "",
        nuove.length ? `Assegnate di recente (${nuove.length}): ${nuove.slice(0, 10).map((t) => t.title).join("; ")}` : "",
      ].filter(Boolean).join("\n");

      if (dryRun) continue;

      const invio = await sendEmailUnified({
        companyId: profilo.company_id,
        stream: "transactional",
        to: [profilo.email],
        subject: titoloEmail,
        html,
        text: testo,
        templateName: "task_riepilogo",
        skipCredits: false,
        adminClient: supabase,
        metadata: { scadute: scadute.length, in_scadenza: oggiInScadenza.length, nuove: nuove.length },
      });

      if (invio.ok) esito.email_inviate++;
      else esito.errori.push(`${profilo.email}: ${JSON.stringify(invio.body).slice(0, 160)}`);
    }

    return jsonResponse({ success: true, ...esito }, 200, corsH);
  } catch (e) {
    console.error("task-riepilogo-email:", e);
    return errorResponse(`Errore interno: ${e instanceof Error ? e.message : String(e)}`, 500, corsH);
  }
});
