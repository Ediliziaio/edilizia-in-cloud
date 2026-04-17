import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

/**
 * GET /admin-export-financials?month=2025-03&format=csv
 *
 * Exports: topups per company + usage per service + P&L aggregate for the given month.
 * CSV columns: azienda, piva, servizio, tipo, data, importo_eur, invoice_number
 */

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(row: Record<string, unknown>): string {
  return Object.values(row).map(escapeCsv).join(",");
}

const CSV_HEADERS = ["azienda", "piva", "servizio", "tipo", "data", "importo_eur", "invoice_number"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    const url = new URL(req.url);
    const month = url.searchParams.get("month"); // e.g. "2025-03"
    const format = url.searchParams.get("format") ?? "csv";

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return errorResponse("Parametro month richiesto nel formato YYYY-MM", 400, corsH);
    }

    const [year, mon] = month.split("-").map(Number);
    const periodStart = new Date(year, mon - 1, 1).toISOString();
    const periodEnd   = new Date(year, mon, 1).toISOString();

    const rows: Record<string, unknown>[] = [];

    // ── 1. Email topups ─────────────────────────────────────────────────────
    const { data: emailTopups } = await supabaseAdmin
      .from("email_credit_topups" as never)
      .select("company_id, amount_eur, invoice_number, created_at")
      .gte("created_at" as never, periodStart as never)
      .lt("created_at" as never, periodEnd as never)
      .eq("status" as never, "completed" as never);

    for (const t of (emailTopups ?? []) as any[]) {
      const company = await getCompanyInfo(supabaseAdmin, t.company_id);
      rows.push({
        azienda:        company.name,
        piva:           company.piva,
        servizio:       "email",
        tipo:           "topup",
        data:           t.created_at,
        importo_eur:    t.amount_eur,
        invoice_number: t.invoice_number ?? "",
      });
    }

    // ── 2. WhatsApp topups ───────────────────────────────────────────────────
    const { data: waTopups } = await supabaseAdmin
      .from("whatsapp_credit_topups" as never)
      .select("company_id, amount_eur, invoice_number, created_at")
      .gte("created_at" as never, periodStart as never)
      .lt("created_at" as never, periodEnd as never)
      .eq("status" as never, "completed" as never);

    for (const t of (waTopups ?? []) as any[]) {
      const company = await getCompanyInfo(supabaseAdmin, t.company_id);
      rows.push({
        azienda:        company.name,
        piva:           company.piva,
        servizio:       "whatsapp",
        tipo:           "topup",
        data:           t.created_at,
        importo_eur:    t.amount_eur,
        invoice_number: t.invoice_number ?? "",
      });
    }

    // ── 3. AI credits topups ─────────────────────────────────────────────────
    const { data: aiTopups } = await supabaseAdmin
      .from("ai_credit_topups" as never)
      .select("company_id, amount_eur, invoice_number, created_at")
      .gte("created_at" as never, periodStart as never)
      .lt("created_at" as never, periodEnd as never)
      .eq("status" as never, "completed" as never);

    for (const t of (aiTopups ?? []) as any[]) {
      const company = await getCompanyInfo(supabaseAdmin, t.company_id);
      rows.push({
        azienda:        company.name,
        piva:           company.piva,
        servizio:       "ai_agents",
        tipo:           "topup",
        data:           t.created_at,
        importo_eur:    t.amount_eur,
        invoice_number: t.invoice_number ?? "",
      });
    }

    // ── 4. Email usage (deduzioni) ───────────────────────────────────────────
    const { data: emailUsage } = await supabaseAdmin
      .from("email_credits_log" as never)
      .select("company_id, amount_eur, created_at")
      .gte("created_at" as never, periodStart as never)
      .lt("created_at" as never, periodEnd as never)
      .eq("type" as never, "deduct" as never);

    for (const u of (emailUsage ?? []) as any[]) {
      const company = await getCompanyInfo(supabaseAdmin, u.company_id);
      rows.push({
        azienda:        company.name,
        piva:           company.piva,
        servizio:       "email",
        tipo:           "consumo",
        data:           u.created_at,
        importo_eur:    Math.abs(u.amount_eur),
        invoice_number: "",
      });
    }

    // ── 5. WhatsApp usage ─────────────────────────────────────────────────────
    const { data: waUsage } = await supabaseAdmin
      .from("whatsapp_credits_log" as never)
      .select("company_id, amount_eur, created_at")
      .gte("created_at" as never, periodStart as never)
      .lt("created_at" as never, periodEnd as never)
      .eq("type" as never, "deduct" as never);

    for (const u of (waUsage ?? []) as any[]) {
      const company = await getCompanyInfo(supabaseAdmin, u.company_id);
      rows.push({
        azienda:        company.name,
        piva:           company.piva,
        servizio:       "whatsapp",
        tipo:           "consumo",
        data:           u.created_at,
        importo_eur:    Math.abs(u.amount_eur),
        invoice_number: "",
      });
    }

    // ── 6. AI agents usage ────────────────────────────────────────────────────
    const { data: aiUsage } = await supabaseAdmin
      .from("ai_credit_usage" as never)
      .select("company_id, cost_eur, created_at")
      .gte("created_at" as never, periodStart as never)
      .lt("created_at" as never, periodEnd as never);

    for (const u of (aiUsage ?? []) as any[]) {
      const company = await getCompanyInfo(supabaseAdmin, u.company_id);
      rows.push({
        azienda:        company.name,
        piva:           company.piva,
        servizio:       "ai_agents",
        tipo:           "consumo",
        data:           u.created_at,
        importo_eur:    u.cost_eur,
        invoice_number: "",
      });
    }

    // Sort by date asc
    rows.sort((a, b) => String(a.data).localeCompare(String(b.data)));

    if (format === "json") {
      return new Response(JSON.stringify({ month, rows }), {
        headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    // Build CSV
    const lines = [CSV_HEADERS.join(","), ...rows.map(rowToCsv)];
    const csv = lines.join("\n");

    return new Response(csv, {
      headers: {
        ...corsH,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="export-financials-${month}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin-export-financials] error:", err);
    return errorResponse((err as Error).message, 500, corsH);
  }
});

// Simple company info cache within a single request lifecycle
const companyCache = new Map<string, { name: string; piva: string }>();

async function getCompanyInfo(
  supabase: ReturnType<typeof createClient>,
  companyId: string
): Promise<{ name: string; piva: string }> {
  if (companyCache.has(companyId)) return companyCache.get(companyId)!;
  const { data } = await supabase
    .from("companies" as never)
    .select("name, piva")
    .eq("id" as never, companyId as never)
    .maybeSingle();
  const info = { name: (data as any)?.name ?? companyId, piva: (data as any)?.piva ?? "" };
  companyCache.set(companyId, info);
  return info;
}
