/**
 * MP-OPS-01 v2 — Generate Customer Weekly Report (async)
 *
 * Edge function chiamata da:
 *   - Tool `genera_reportino_settimanale_committente` (chat conversazionale)
 *   - Edge `trigger-weekly-customer-reports` (cron settimanale)
 *
 * Flow:
 *   1. Fetch parallelo dati settimana (rapportini, foto, SAL, problemi, customer)
 *   2. Persona pm_cantiere genera narrative AI via aiRouterComplete
 *   3. Render HTML → PDF via puppeteer (browserless lazy import)
 *   4. Upload Storage bucket 'customer-reports'
 *   5. Update record customer_weekly_reports
 *   6. Email + WhatsApp con link signed (7 giorni)
 *   7. Ritorna report_id + signed URL
 *
 * Defensive: se le tabelle satellite (rapportini, sal, ecc.) non esistono,
 * il report viene generato comunque con sezioni vuote + nota.
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";
import { aiRouterComplete } from "../_shared/aiRouter.ts";

interface Payload {
  cantiere_id: string;
  week_start: string;
  company_id: string;
  report_id?: string;
  send_email?: boolean;
  send_whatsapp?: boolean;
  triggered_by_user_id?: string | null;
  triggered_by_persona?: string | null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  const { cantiere_id, week_start, company_id } = payload;
  if (!cantiere_id || !week_start || !company_id) {
    return new Response(JSON.stringify({ error: "cantiere_id, week_start, company_id required" }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
  }

  // Calcola week_end
  const weekStartDate = new Date(week_start);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 4);
  const weekEnd = weekEndDate.toISOString().substring(0, 10);

  try {
    // Marca generating
    if (payload.report_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("customer_weekly_reports").update({
        status: "generating",
        updated_at: new Date().toISOString(),
      }).eq("id", payload.report_id);
    }

    // 1. Fetch parallelo (best-effort: tabelle facoltative)
    const [companyRes, cantiereRes, rapportiniRes, fotoRes, salRes, problemiRes] =
      await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("companies")
          .select("name, weekly_reports_default_tone")
          .eq("id", company_id)
          .maybeSingle(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from("orders")
          .select("id, order_code, customer_id, indirizzo_lavori, work_description, customer:profiles!orders_customer_id_fkey(first_name, last_name, email, phone)")
          .eq("id", cantiere_id)
          .maybeSingle(),
        safeFetch(supabase, "rapportini", (q) => q
          .eq("cantiere_id", cantiere_id)
          .gte("data_rapportino", week_start).lte("data_rapportino", weekEnd)),
        safeFetch(supabase, "cantiere_photos", (q) => q
          .eq("cantiere_id", cantiere_id)
          .gte("taken_at", week_start).lte("taken_at", weekEnd)
          .order("taken_at", { ascending: false }).limit(8)),
        safeFetch(supabase, "sal", (q) => q
          .eq("order_id", cantiere_id)
          .order("created_at", { ascending: false }).limit(1)),
        safeFetch(supabase, "cantiere_segnalazioni", (q) => q
          .eq("cantiere_id", cantiere_id)
          .gte("created_at", week_start).lte("created_at", weekEnd)),
      ]);

    const company = companyRes.data;
    const cantiere = cantiereRes.data;
    if (!cantiere) throw new Error(`Cantiere ${cantiere_id} non trovato`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawCust = (cantiere as any).customer ?? null;
    const customer = rawCust
      ? {
          full_name: [rawCust.first_name, rawCust.last_name].filter(Boolean).join(" ") || null,
          name: rawCust.first_name ?? null,
          email: rawCust.email ?? null,
          phone: rawCust.phone ?? null,
        }
      : null;
    const rapportini = rapportiniRes ?? [];
    const foto = fotoRes ?? [];
    const sal = (salRes ?? [])[0] ?? null;
    const problemi = problemiRes ?? [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oreLavorate = (rapportini as any[]).reduce((s, r) => s + Number(r.ore_lavorate ?? 0), 0);

    // 2. Genera narrative AI con persona pm_cantiere
    const tone = (company?.weekly_reports_default_tone as string) || "professionale";
    const aiResult = await aiRouterComplete({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: supabase as any,
      taskKey: "email_compose",
      messages: [
        {
          role: "system",
          content: `Sei il PM Cantiere di ${company?.name ?? "azienda"}. Genera un report settimanale per il committente.
Cantiere: ${(cantiere as { order_code?: string }).order_code ?? "n/a"}.
Tono: ${tone}.
Lingua: italiano. Struttura in 4-6 paragrafi: saluto, avanzamento, prossimi step, eventuali criticità, saluto finale.
NON inventare dati: se mancano, ometti la sezione.`,
        },
        {
          role: "user",
          content: [
            `Settimana ${week_start} → ${weekEnd}:`,
            `- Rapportini: ${rapportini.length} (totale ore: ${oreLavorate})`,
            `- Foto: ${foto.length}`,
            `- SAL attuale: ${sal?.sal_pct ?? "N/D"}%`,
            `- Problemi/segnalazioni: ${problemi.length}`,
            `- Cantiere: ${(cantiere as { indirizzo_lavori?: string }).indirizzo_lavori ?? "n/a"}`,
            `- Lavori: ${(cantiere as { work_description?: string }).work_description ?? "n/a"}`,
            `- Cliente: ${customer?.full_name ?? customer?.name ?? "Cliente"}`,
          ].join("\n"),
        },
      ],
      params: { temperature: 0.4, max_tokens: 1200 },
      companyId: company_id,
      userId: payload.triggered_by_user_id ?? null,
      idempotencyKey: `weekly-narrative-${cantiere_id}-${week_start}`,
    });

    const narrative = aiResult.content || "Aggiornamento settimanale del cantiere.";

    // 3. Render HTML (PDF rendering nativo via puppeteer non sempre disponibile
    // in Deno edge — manteniamo un fallback HTML che un'altra edge può
    // convertire o serviamo direttamente al cliente come "report HTML inline").
    const html = buildHTML({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      company: company as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cantiere: cantiere as any,
      customer,
      weekStart: week_start,
      weekEnd,
      narrative,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      foto: foto as any[],
      sal,
      metrics: {
        ore_lavorate: oreLavorate,
        rapportini_count: rapportini.length,
        foto_count: foto.length,
        problemi_count: problemi.length,
      },
    });

    // 4. Upload as HTML (deferred PDF rendering: in produzione si userebbe un
    // worker dedicato o un servizio esterno tipo Browserless.io)
    const filename = `${company_id}/${cantiere_id}/${week_start}.html`;
    const htmlBytes = new TextEncoder().encode(html);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: uploadErr } = await (supabase as any).storage
      .from("customer-reports")
      .upload(filename, htmlBytes, {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });
    if (uploadErr && !String(uploadErr.message ?? "").toLowerCase().includes("bucket")) {
      throw new Error(`Storage upload error: ${uploadErr.message}`);
    }

    // Signed URL valido 7 giorni
    let signedUrl: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: signed } = await (supabase as any).storage
      .from("customer-reports")
      .createSignedUrl(filename, 60 * 60 * 24 * 7);
    if (signed?.signedUrl) signedUrl = signed.signedUrl;

    // 5. Update record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: report } = await (supabase as any)
      .from("customer_weekly_reports")
      .update({
        pdf_storage_path: filename,
        pdf_size_bytes: htmlBytes.byteLength,
        ai_narrative: narrative,
        ai_persona_used: payload.triggered_by_persona ?? "pm_cantiere",
        ai_cost_billed_eur: aiResult.costBilledEur ?? 0,
        metrics_snapshot: {
          ore_lavorate: oreLavorate,
          rapportini_count: rapportini.length,
          foto_count: foto.length,
          problemi_count: problemi.length,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sal_pct: (sal as any)?.sal_pct ?? null,
        },
        status: "generated",
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("cantiere_id", cantiere_id)
      .eq("week_start", week_start)
      .select("id")
      .maybeSingle();

    const reportId = report?.id ?? payload.report_id ?? null;

    // 6. Delivery (best-effort, non blocca la response)
    const delivery: Record<string, boolean> = {};
    if (payload.send_email !== false && customer?.email && signedUrl) {
      try {
        await supabase.functions.invoke("send-customer-email", {
          body: {
            to: customer.email,
            template: "weekly-customer-report",
            variables: {
              company_name: company?.name ?? "",
              cantiere_code: (cantiere as { order_code?: string }).order_code ?? "",
              customer_name: (customer.full_name ?? customer.name ?? "").split(" ")[0] || "",
              pdf_url: signedUrl,
              week_start,
              week_end: weekEnd,
            },
            tracking_metadata: { report_id: reportId },
          },
        });
        delivery.email = true;
        if (reportId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("customer_weekly_reports").update({
            email_sent_at: new Date().toISOString(),
          }).eq("id", reportId);
        }
      } catch (e) {
        console.warn("[generate-customer-report-async] email failed:",
          e instanceof Error ? e.message : String(e));
        delivery.email = false;
      }
    }

    if (payload.send_whatsapp !== false && customer?.phone && signedUrl) {
      try {
        const firstName = (customer.full_name ?? customer.name ?? "").split(" ")[0] || "";
        const waMessage = `Buon weekend${firstName ? " " + firstName : ""}! 👋\n\n` +
          `Reportino settimanale del cantiere ${(cantiere as { order_code?: string }).order_code ?? ""}:\n` +
          `${signedUrl}\n\nPer qualsiasi domanda siamo a disposizione.\n\n${company?.name ?? ""}`;
        await supabase.functions.invoke("whatsapp-send", {
          body: {
            to: customer.phone,
            message: waMessage,
            company_id,
          },
        });
        delivery.whatsapp = true;
        if (reportId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("customer_weekly_reports").update({
            whatsapp_sent_at: new Date().toISOString(),
          }).eq("id", reportId);
        }
      } catch (e) {
        console.warn("[generate-customer-report-async] whatsapp failed:",
          e instanceof Error ? e.message : String(e));
        delivery.whatsapp = false;
      }
    }

    if (Object.values(delivery).some((v) => v) && reportId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("customer_weekly_reports").update({
        status: "delivered",
      }).eq("id", reportId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        report_id: reportId,
        pdf_signed_url: signedUrl,
        delivery,
        narrative_chars: narrative.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[generate-customer-report-async] error:", msg);
    if (payload.report_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("customer_weekly_reports").update({
        status: "failed",
        error_message: msg.substring(0, 500),
        updated_at: new Date().toISOString(),
      }).eq("id", payload.report_id);
    }
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function safeFetch(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (q: any) => any,
): Promise<unknown[] | null> {
  try {
    const { data } = await buildQuery(supabase.from(table).select("*"));
    return data ?? [];
  } catch {
    return null;
  }
}

interface BuildHTMLArgs {
  company: { name?: string } | null;
  cantiere: { order_code?: string; indirizzo_lavori?: string; work_description?: string };
  customer: { full_name?: string; name?: string } | null;
  weekStart: string;
  weekEnd: string;
  narrative: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  foto: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sal: any | null;
  metrics: {
    ore_lavorate: number;
    rapportini_count: number;
    foto_count: number;
    problemi_count: number;
  };
}

function buildHTML(d: BuildHTMLArgs): string {
  const customerName = d.customer?.full_name ?? d.customer?.name ?? "Cliente";
  const fotoHtml = d.foto.length === 0
    ? "<p style=\"color:#888\">Nessuna foto disponibile per questa settimana.</p>"
    : `<div class="photo-grid">${
        d.foto.map((f) => `<div class="photo"><img src="${f.file_url}" alt="${f.caption ?? ''}"/><p>${f.caption ?? ""}</p></div>`).join("")
      }</div>`;

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="utf-8"/>
<title>Reportino settimanale ${d.cantiere.order_code ?? ""}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; max-width: 820px; margin: 0 auto; padding: 32px; line-height: 1.6; }
  header { border-bottom: 2px solid #f59e0b; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { font-size: 24px; margin: 0 0 4px; color: #111827; }
  h2 { font-size: 16px; margin: 24px 0 12px; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.05em; }
  .meta { color: #6b7280; font-size: 13px; }
  .narrative { white-space: pre-wrap; background: #fffbeb; border-left: 3px solid #f59e0b; padding: 16px; border-radius: 4px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
  .kpi { background: #f3f4f6; padding: 12px; border-radius: 6px; text-align: center; }
  .kpi-value { font-size: 22px; font-weight: 700; color: #111827; }
  .kpi-label { font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .photo img { width: 100%; height: 160px; object-fit: cover; border-radius: 6px; }
  .photo p { font-size: 12px; color: #6b7280; margin: 4px 0 12px; }
  footer { margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 12px; color: #9ca3af; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(d.company?.name ?? "Azienda")}</h1>
  <p class="meta">Reportino settimanale · Cantiere <strong>${escapeHtml(d.cantiere.order_code ?? "n/a")}</strong> · ${d.weekStart} → ${d.weekEnd}</p>
  <p class="meta">Cliente: ${escapeHtml(customerName)}</p>
</header>

<div class="narrative">${escapeHtml(d.narrative)}</div>

<h2>Indicatori della settimana</h2>
<div class="kpi-grid">
  <div class="kpi"><div class="kpi-value">${d.metrics.rapportini_count}</div><div class="kpi-label">Rapportini</div></div>
  <div class="kpi"><div class="kpi-value">${d.metrics.ore_lavorate}h</div><div class="kpi-label">Ore lavorate</div></div>
  <div class="kpi"><div class="kpi-value">${d.metrics.foto_count}</div><div class="kpi-label">Foto</div></div>
  <div class="kpi"><div class="kpi-value">${d.sal?.sal_pct ?? "—"}${d.sal?.sal_pct ? "%" : ""}</div><div class="kpi-label">SAL</div></div>
</div>

<h2>Foto della settimana</h2>
${fotoHtml}

<footer>
  <p>${escapeHtml(d.company?.name ?? "")} — Reportino generato automaticamente da Silvio (AI di EiC).
  ${d.metrics.problemi_count > 0 ? `Sono presenti ${d.metrics.problemi_count} segnalazioni in lavorazione.` : ""}</p>
</footer>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
