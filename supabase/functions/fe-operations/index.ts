// fe-operations — Dashboard super_admin "Fatturazione Elettronica / FE Operations".
//
// Risponde alle domande di Florin: CHI usa la FE, QUANTO ha inviato/ricevuto,
// QUANTO costa (stima openapi), e lo stato del wallet openapi (saldo + quanto
// ricaricare). Il modello è "intermediario": 1 account openapi piattaforma → N
// cedenti (aziende). I costi sono per-chiamata e si pagano dal wallet openapi.
//
// Azioni:
//   - "overview" (default): aggregati per-azienda + totali + costi stimati + wallet.
//   - "set_config": super_admin aggiorna prezzi unitari, saldo wallet (manuale),
//                   soglia di allerta, endpoint wallet live, mesi di buffer.
//
// Auth: super_admin (requireAuth → requireRole con allowlist email).
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";

const PS = {
  token: "openapi_it_token",
  env: "openapi_env",
  costSend: "openapi_cost_per_invoice",
  costRecv: "openapi_cost_per_receipt",
  walletBalance: "openapi_wallet_balance",
  walletThreshold: "openapi_wallet_threshold",
  walletEndpoint: "openapi_wallet_endpoint",
  walletMonthsBuffer: "openapi_wallet_months_buffer",
  walletUpdatedAt: "openapi_wallet_balance_updated_at",
} as const;

// Campi numerici comuni in cui i provider mettono il saldo wallet.
const BALANCE_FIELDS = ["credit", "credits", "balance", "wallet", "residuo", "amount", "saldo", "available"];

function num(v: unknown, d: number): number {
  if (typeof v === "number") return isFinite(v) ? v : d;
  let s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return d;
  // Formato italiano "1.234,56": rimuovi i separatori migliaia ('.' seguito da 3
  // cifre) e converti la virgola decimale in punto. Senza virgola, '.' resta
  // decimale (così "0.20" rimane 0.20).
  if (s.includes(",")) s = s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(s);
  return isFinite(n) ? n : d;
}

function deepFindBalance(obj: unknown, depth = 0): number | null {
  if (obj == null || depth > 4) return null;
  if (typeof obj === "number") return null; // serve la chiave, non il valore
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    for (const f of BALANCE_FIELDS) {
      if (f in o && (typeof o[f] === "number" || typeof o[f] === "string")) {
        const n = num(o[f], NaN);
        if (isFinite(n)) return n;
      }
    }
    for (const k of Object.keys(o)) {
      const r = deepFindBalance(o[k], depth + 1);
      if (r != null) return r;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, cors);
    await requireRole(supabaseAdmin, userId, ["super_admin"], cors);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = (body.action as string) || "overview";

    const readSettings = async (keys: string[]) => {
      const { data } = await supabaseAdmin.from("platform_settings").select("key,value").in("key", keys);
      const m: Record<string, string> = {};
      for (const row of (data || []) as Array<{ key: string; value: string }>) m[row.key] = row.value;
      return m;
    };

    // ── set_config ──────────────────────────────────────────────────────
    if (action === "set_config") {
      const allowed = [PS.costSend, PS.costRecv, PS.walletBalance, PS.walletThreshold, PS.walletEndpoint, PS.walletMonthsBuffer];
      const nowIso = new Date().toISOString();
      const updates: Array<{ key: string; value: string; updated_by: string; updated_at: string }> = [];
      for (const k of allowed) {
        if (body[k] !== undefined && body[k] !== null && body[k] !== "") {
          updates.push({ key: k, value: String(body[k]), updated_by: userId, updated_at: nowIso });
        }
      }
      // Se aggiorno il saldo manuale, traccio anche quando.
      if (updates.some((u) => u.key === PS.walletBalance)) {
        updates.push({ key: PS.walletUpdatedAt, value: nowIso, updated_by: userId, updated_at: nowIso });
      }
      if (updates.length) {
        const { error } = await supabaseAdmin.from("platform_settings").upsert(updates, { onConflict: "key" });
        if (error) return json({ error: error.message }, 500);
      }
      return json({ success: true, updated: updates.map((u) => u.key) });
    }

    // ── overview ────────────────────────────────────────────────────────
    const { data: stats, error: statErr } = await supabaseAdmin.rpc("fe_operations_stats");
    if (statErr) return json({ error: `Errore aggregazione: ${statErr.message}` }, 500);

    const s = await readSettings(Object.values(PS));
    const costSend = num(s[PS.costSend], 0.20);
    const costRecv = num(s[PS.costRecv], 0.20);
    const threshold = num(s[PS.walletThreshold], 20);
    const monthsBuffer = num(s[PS.walletMonthsBuffer], 2);
    const env = (s[PS.env] || "prod").toLowerCase();

    type Row = {
      company_id: string; name: string; fiscal_id: string | null; provider: string | null;
      stato: string; delega_stato: string; last_error: string | null; registered_at: string | null;
      sent_total: number; sent_month: number; oa_sent_total: number; oa_sent_month: number;
      rec_total: number; rec_month: number; last_activity: string | null;
    };

    const rawCompanies = (stats?.companies || []) as Row[];
    const companies = rawCompanies.map((c) => {
      const cost_total = +(num(c.oa_sent_total, 0) * costSend + num(c.rec_total, 0) * costRecv).toFixed(2);
      const cost_month = +(num(c.oa_sent_month, 0) * costSend + num(c.rec_month, 0) * costRecv).toFixed(2);
      return { ...c, cost_total, cost_month };
    });

    const totals = (stats?.totals || {}) as Record<string, number>;
    const cost_total = +(num(totals.oa_sent_total, 0) * costSend + num(totals.rec_total, 0) * costRecv).toFixed(2);
    const cost_month = +(num(totals.oa_sent_month, 0) * costSend + num(totals.rec_month, 0) * costRecv).toFixed(2);

    // ── Wallet: live (se endpoint configurato) → manuale → null ──────────
    let walletBalance: number | null = null;
    let walletSource: "live" | "manuale" | null = null;
    let walletError: string | null = null;
    const liveEndpoint = (s[PS.walletEndpoint] || "").trim();
    const token = (s[PS.token] || Deno.env.get("OPENAPI_IT_TOKEN") || "").trim();

    if (liveEndpoint && token) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const resp = await fetch(liveEndpoint, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const data = await resp.json().catch(() => null);
        if (resp.ok) {
          const b = deepFindBalance(data);
          if (b != null) { walletBalance = b; walletSource = "live"; }
          else walletError = "Saldo non trovato nella risposta del wallet endpoint.";
        } else {
          walletError = `Wallet endpoint HTTP ${resp.status}`;
        }
      } catch (e) {
        walletError = `Wallet endpoint non raggiungibile: ${(e as Error).message}`;
      }
    }
    if (walletBalance == null && s[PS.walletBalance] !== undefined && s[PS.walletBalance] !== "") {
      walletBalance = num(s[PS.walletBalance], 0);
      walletSource = "manuale";
    }

    // Burn-rate del mese corrente come proiezione; ricarica consigliata copre
    // `monthsBuffer` mesi al netto del saldo noto.
    const projectedMonthly = cost_month;
    const recommendedTopup = walletBalance != null
      ? Math.max(0, +(projectedMonthly * monthsBuffer - walletBalance).toFixed(2))
      : +(projectedMonthly * monthsBuffer).toFixed(2);
    const low = walletBalance != null && walletBalance < threshold;

    return json({
      success: true,
      env,
      generated_at: new Date().toISOString(),
      pricing: { cost_per_invoice: costSend, cost_per_receipt: costRecv },
      companies,
      totals: { ...totals, cost_total, cost_month },
      wallet: {
        balance: walletBalance,
        source: walletSource,
        threshold,
        months_buffer: monthsBuffer,
        projected_monthly: projectedMonthly,
        recommended_topup: recommendedTopup,
        low,
        endpoint_configured: !!liveEndpoint,
        updated_at: s[PS.walletUpdatedAt] || null,
        error: walletError,
      },
    });
  } catch (err) {
    // requireAuth/requireRole lanciano Response già pronte
    if (err instanceof Response) return err;
    return json({ error: `Errore interno: ${(err as Error).message}` }, 500);
  }
});
