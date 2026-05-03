/**
 * cg-bootstrap-scenari
 *
 * Idempotente: se la company NON ha ancora assumption salvate, crea 3 scenari
 * pre-calibrati ('prudente', 'base', 'aggressivo') con orizzonte 5 anni.
 * `is_default = true` solo per 'base'.
 */

import { getCorsHeaders, errorResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface ScenarioSeed {
  scenario: "prudente" | "base" | "aggressivo";
  crescita_ricavi_pct: number[];
  crescita_costi_fissi_pct: number[];
  investimenti: number[];
  delta_costo_personale: number[];
  nuovo_debito_mlt: number[];
  tasso_debito_pct: number;
  margine_target_pct: number;
}

const buildSeed = (orizzonte: number): ScenarioSeed[] => [
  {
    scenario: "prudente",
    crescita_ricavi_pct: Array(orizzonte).fill(3),
    crescita_costi_fissi_pct: Array(orizzonte).fill(2),
    investimenti: Array(orizzonte).fill(0),
    delta_costo_personale: Array(orizzonte).fill(0),
    nuovo_debito_mlt: Array(orizzonte).fill(0),
    tasso_debito_pct: 6.0,
    margine_target_pct: 12,
  },
  {
    scenario: "base",
    crescita_ricavi_pct: Array(orizzonte).fill(8),
    crescita_costi_fissi_pct: Array(orizzonte).fill(3),
    investimenti: Array(orizzonte).fill(50_000),
    delta_costo_personale: [35_000, 35_000, 40_000, 40_000, 45_000, 45_000, 50_000].slice(0, orizzonte),
    nuovo_debito_mlt: Array(orizzonte).fill(0),
    tasso_debito_pct: 6.0,
    margine_target_pct: 15,
  },
  {
    scenario: "aggressivo",
    crescita_ricavi_pct: [22, 18, 15, 12, 10, 9, 8].slice(0, orizzonte),
    crescita_costi_fissi_pct: Array(orizzonte).fill(5),
    investimenti: [500_000, 200_000, 100_000, 100_000, 50_000, 50_000, 50_000].slice(0, orizzonte),
    delta_costo_personale: [70_000, 80_000, 90_000, 100_000, 110_000, 110_000, 120_000].slice(0, orizzonte),
    nuovo_debito_mlt: [200_000, 0, 0, 0, 0, 0, 0].slice(0, orizzonte),
    tasso_debito_pct: 7.5,
    margine_target_pct: 18,
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json().catch(() => ({}));
    const orizzonte: number = [3, 5, 7].includes(body.orizzonte) ? body.orizzonte : 5;

    // Risolvi company come in cg-bootstrap-classificazione.
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("company_id")
      .eq("id", userId)
      .maybeSingle();
    const companyId = (prof?.company_id as string) ?? null;
    if (!companyId) {
      return errorResponse("Profilo utente senza company_id valido", 400, corsH);
    }

    // Già boostrappato?
    const { count } = await supabaseAdmin
      .from("piano_industriale_assumptions")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if ((count ?? 0) > 0) {
      return new Response(
        JSON.stringify({ already_bootstrapped: true, existing: count, scenari_creati: 0 }),
        { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    const annoCorr = new Date().getFullYear();
    const seed = buildSeed(orizzonte);
    const rows = seed.map((s) => ({
      company_id: companyId,
      anno_partenza: annoCorr - 1,
      orizzonte_anni: orizzonte,
      ...s,
      is_default: s.scenario === "base",
    }));

    const { error: insErr } = await supabaseAdmin
      .from("piano_industriale_assumptions")
      .insert(rows);
    if (insErr) return errorResponse(`Errore insert scenari: ${insErr.message}`, 500, corsH);

    return new Response(
      JSON.stringify({ already_bootstrapped: false, scenari_creati: rows.length, orizzonte }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
    );
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : "Errore sconosciuto";
    return errorResponse(msg, 500, corsH);
  }
});
