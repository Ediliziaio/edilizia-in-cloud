// bot-routine-dispatch — le automazioni del bot operativo che partono da sole
// (28/09/2026). Gira ogni 15 minuti (pg_cron). Per ora: il report del mattino.
// Legge bot_routine, per ogni routine dovuta manda il messaggio ai destinatari
// via whatsapp-send (testo se la finestra 24h è aperta, altrimenti il modello
// Meta), e logga in wa_operational_reminder_log per non ripetere.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/headers.ts";
import { chiamataInternaValida, rispostaNonAutorizzata } from "../_shared/chiamataInterna.ts";
import { routineDovutaOra } from "../_shared/routineOperativa.ts";
import { componiReportMattino, type DatiReport } from "../_shared/reportMattino.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

interface RoutineRow {
  id: string;
  company_id: string;
  wa_number_id: string;
  ora: string | null;
  giorni: number[] | null;
  destinatari: { utenti?: string[]; ruoli?: string[] } | null;
  template_nome: string | null;
}

function cleanPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/[^0-9]/g, "");
  if (d.length < 9) return null;
  return d.startsWith("39") ? d : `39${d}`;
}

function dataOggiRoma(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function risolviDestinatari(supabase: DB, companyId: string, dest: RoutineRow["destinatari"]): Promise<Array<{ userId: string; phone: string }>> {
  const out = new Map<string, string>();
  const aggiungi = (userId: string | null, phone: string | null) => {
    const p = cleanPhone(phone);
    if (userId && p && !out.has(userId)) out.set(userId, p);
  };
  const utenti = Array.isArray(dest?.utenti) ? dest!.utenti : [];
  if (utenti.length > 0) {
    const { data } = await supabase.from("profiles").select("id, phone").in("id", utenti).eq("company_id", companyId);
    for (const r of data ?? []) aggiungi(r.id, r.phone);
  }
  const ruoli = Array.isArray(dest?.ruoli) ? dest!.ruoli : [];
  if (ruoli.includes("admin")) {
    const { data } = await supabase
      .from("profiles").select("id, phone, user_roles!inner(role)")
      .eq("company_id", companyId).in("user_roles.role", ["company_admin", "super_admin"]);
    for (const r of data ?? []) aggiungi(r.id, r.phone);
  }
  return [...out.entries()].map(([userId, phone]) => ({ userId, phone }));
}

async function invia(
  supabase: DB,
  waNumberId: string,
  companyId: string,
  phone: string,
  testo: string,
  templateNome: string | null,
): Promise<{ ok: boolean; detail?: string }> {
  const base = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const intest = { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` };
  const testoRes = await fetch(`${base}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: intest,
    body: JSON.stringify({ wa_number_id: waNumberId, company_id: companyId, to: phone, text: testo }),
  });
  if (testoRes.ok) return { ok: true };
  const j = await testoRes.json().catch(() => null) as { code?: string } | null;
  // Fuori dalla finestra 24h: serve il modello approvato.
  if (j?.code === "window_closed" && templateNome) {
    const modRes = await fetch(`${base}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: intest,
      body: JSON.stringify({
        wa_number_id: waNumberId,
        company_id: companyId,
        to: phone,
        type: "template",
        template: { name: templateNome, language: "it", variables: { "1": testo } },
      }),
    });
    if (modRes.ok) return { ok: true };
    return { ok: false, detail: (await modRes.text()).slice(0, 400) };
  }
  return { ok: false, detail: (await testoRes.text()).slice(0, 400) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!chiamataInternaValida(req)) return rispostaNonAutorizzata(corsHeaders);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({} as { force?: boolean; company_id?: string }));
  const force = body?.force === true;
  const now = new Date();
  const oggi = dataOggiRoma(now);

  let q = supabase.from("bot_routine")
    .select("id, company_id, wa_number_id, ora, giorni, destinatari, template_nome")
    .eq("attiva", true).eq("tipo", "report_mattino");
  if (body?.company_id) q = q.eq("company_id", body.company_id);
  const { data: routines } = await q;

  let sent = 0, skipped = 0, failed = 0;
  for (const r of (routines ?? []) as RoutineRow[]) {
    if (!routineDovutaOra({ ora: r.ora, giorni: r.giorni ?? [1, 2, 3, 4, 5] }, now, force)) continue;
    const destinatari = await risolviDestinatari(supabase, r.company_id, r.destinatari);
    if (destinatari.length === 0) { skipped++; continue; }

    const { data: comp } = await supabase.from("companies").select("name").eq("id", r.company_id).maybeSingle();
    const { data: dati } = await supabase.rpc("bot_report_mattino_dati", { p_company_id: r.company_id });
    const testo = componiReportMattino(comp?.name ?? null, (dati ?? {}) as DatiReport, now);

    for (const { userId, phone } of destinatari) {
      if (!force) {
        const { data: gia } = await supabase.from("wa_operational_reminder_log").select("id")
          .eq("company_id", r.company_id).eq("reminder_date", oggi).eq("reminder_kind", "report_mattino")
          .eq("employee_user_id", userId).eq("status", "sent").maybeSingle();
        if (gia) { skipped++; continue; }
      }
      const esito = await invia(supabase, r.wa_number_id, r.company_id, phone, testo, r.template_nome);
      await supabase.from("wa_operational_reminder_log").insert({
        company_id: r.company_id, wa_number_id: r.wa_number_id, employee_user_id: userId,
        reminder_date: oggi, reminder_kind: "report_mattino", phone,
        status: esito.ok ? "sent" : "failed", error_detail: esito.ok ? null : esito.detail ?? null,
        sent_at: esito.ok ? new Date().toISOString() : null,
      });
      esito.ok ? sent++ : failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, sent, skipped, failed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
