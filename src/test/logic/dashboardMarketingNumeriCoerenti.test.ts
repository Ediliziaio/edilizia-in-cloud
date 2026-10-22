/**
 * Dashboard marketing coi numeri di Sales OS (21/10/2026).
 *
 * Provato sul database in una transazione annullata, Demo 2, ottobre: fatturato
 * 428.911,67 € = preventivi firmati di vendite_preventivi (prima 0 €), pipeline
 * pesata 548.375,06 € = get_weighted_pipeline (prima 465.240 €), imbuto 65
 * opportunità = pipeline aperta (prima 6), ferme 57 = get_stalled_opportunities
 * (prima 58); un utente senza il permesso riceve 42501.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const codice = leggi("supabase/migrations/20281021213000_dashboard_marketing_numeri_coerenti.sql").replace(/^\s*--.*$/gm, "");
const corpo = (nome: string) => {
  const m = codice.match(new RegExp(`function public\\.${nome}\\([\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`, "i"));
  expect(m, nome).not.toBeNull();
  return m![1];
};
const vendite = corpo("marketing_vendite_periodo");
const stats = corpo("get_marketing_dashboard_stats");
const trend = corpo("marketing_trend_12m");

describe("le vendite: preventivi firmati, senza contare due volte", () => {
  it("un preventivo firmato conta per data di firma e imponibile", () => {
    expect(vendite).toContain("q.status in ('accettata', 'convertita')");
    expect(vendite).toContain("coalesce(q.signed_at, q.created_at) as quando");
    expect(vendite).toContain("coalesce(q.total - q.vat_amount, q.subtotal, q.total, 0)::numeric as valore");
  });

  it("l'opportunità vinta non conta se il contatto ha già un preventivo firmato", () => {
    expect(vendite).toMatch(/not exists \(select 1 from firmati f\s+where f\.contact_id is not null and f\.contact_id = mo\.contact_id\)/);
  });

  it("la chiama solo il database, non il browser", () => {
    expect(codice).toContain("revoke all on function public.marketing_vendite_periodo(uuid, timestamptz, timestamptz, uuid[], text[], uuid, uuid[]) from public, anon, authenticated;");
  });
});

describe.each([
  ["get_marketing_dashboard_stats", stats],
  ["marketing_trend_12m", trend],
])("%s: solo chi può vederla, e solo ciò che può vedere", (_nome, f) => {
  it("chiede il permesso della dashboard, come get_metric", () => {
    expect(f).toMatch(/NOT public\.puo_vedere_metrica\(p_company_id, 'marketing'\)/i);
  });
  it("chi vede solo i propri lead vede solo i propri numeri", () => {
    expect(f).toMatch(/IF public\.solo_assegnati_attivo\(\) THEN\s+p_assigned_user_ids := ARRAY\[auth\.uid\(\)\]/i);
  });
  it("le pipeline nascoste non entrano", () => {
    expect(f).toMatch(/v_nascoste := COALESCE\(public\.pipeline_nascoste\(\), '\{\}'::uuid\[\]\)/i);
    expect(f).toContain("v_nascoste)");
  });
});

describe("le regole di Sales OS", () => {
  it("pipeline pesata con la probabilità dell'opportunità (50 se manca)", () => {
    expect(stats).toContain("GREATEST(0, LEAST(100, COALESCE(mo.probability, 50))) / 100.0");
    expect(stats).not.toContain("0.1 + 0.8 *");
  });
  it("tasso di chiusura = opportunità vinte ÷ (vinte + perse)", () => {
    expect(stats).toContain("v_close_rate := CASE WHEN v_opps_won + v_contracts_lost > 0");
  });
  it("l'imbuto conta le aperte di oggi, come la pipeline", () => {
    const imbuto = stats.slice(stats.indexOf("INTO v_funnel"), stats.indexOf("INTO v_sales"));
    expect(imbuto).toContain("mo.status = 'open'");
    expect(imbuto).not.toContain("mo.created_at >= v_date_from");
  });
  it("ferme con la soglia della fase, appuntamenti da esitare del periodo", () => {
    expect(stats).toContain("COALESCE(s.stalled_threshold_days, 14)");
    expect(stats).not.toContain("interval '7 days'");
    expect(stats).toContain("'pending_appointments', v_appointments_pending");
  });
  it("i KPI senza un valore precedente arrivano null, non zero", () => {
    expect(stats).toContain("'weighted_pipeline', null");
    expect(stats).toContain("'forecast_30d', null");
  });
});

describe("nella pagina", () => {
  const pagina = leggi("src/pages/azienda/marketing/MarketingDashboard.tsx");
  const hook = leggi("src/hooks/useMarketingDashboard.ts");

  it("«Lead periodo» sono i lead nuovi, non il totale", () => {
    expect(pagina).toContain("const leadsNew = safeNumber(kpi?.leads_new);");
    expect(pagina).not.toContain("safeNumber(kpi?.leads_total)");
  });
  it("il grafico dei 12 mesi riceve i filtri della pagina", () => {
    expect(pagina).toMatch(/rpc\("marketing_trend_12m"[\s\S]{0,200}p_assigned_user_ids: effectiveAssignedIds/);
  });
  it("con «Vista come» i propri numeri sono quelli della persona simulata", () => {
    expect(hook).toContain("const proprioId = viewAsActive && viewAsUserId ? viewAsUserId : user?.id;");
  });
  it("il tasso dei commerciali è quello del database", () => {
    const tabella = leggi("src/components/marketing/dashboard/DashboardSalesTable.tsx");
    expect(tabella).not.toContain("r.contracts_won / r.appointments_done");
    expect(tabella).toContain("Math.round(r.close_rate ?? 0)");
  });
  it("il periodo personalizzato arriva a fine giornata", () => {
    expect(leggi("src/lib/dateRangeUtils.ts")).toContain("to: customTo ? endOfDay(customTo) : endOfDay(now)");
  });
});

describe("percorso dei lead, lavoro del team e cose da fare (20281021220000, 20281021223000)", () => {
  const percorso = leggi("supabase/migrations/20281021220000_dashboard_marketing_percorso_lead.sql").replace(/^\s*--.*$/gm, "");
  const altri = leggi("supabase/migrations/20281021223000_dashboard_marketing_attivita_e_da_fare.sql").replace(/^\s*--.*$/gm, "");

  it.each([
    ["marketing_percorso_lead", percorso],
    ["marketing_attivita_team", altri],
    ["marketing_da_fare", altri],
  ])("%s chiede il permesso, restringe «solo i propri» e non è aperta ad anon", (nome, sql) => {
    const corpoFn = sql.match(new RegExp(`function public\\.${nome}\\([\\s\\S]*?\\$function\\$([\\s\\S]*?)\\$function\\$`))![1];
    expect(corpoFn).toContain("puo_vedere_metrica(p_company_id, 'marketing')");
    expect(corpoFn).toMatch(/if public\.solo_assegnati_attivo\(\) then\s+p_assigned_user_ids := array\[auth\.uid\(\)\]/);
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${nome}\\([^)]*\\) from public, anon;`));
  });

  it("il percorso sono le fasi normali prima della vinta; perse e scartate sono uscite", () => {
    expect(percorso).toContain("where coalesce(f.auto_status, 'open') = 'open'");
    expect(percorso).toContain("min(w.position) from tutte_fasi w where w.auto_status = 'won'");
    expect(percorso).toContain("'uscite'");
  });

  it("un'assegnazione a un utente cancellato non conta come commerciale", () => {
    expect(percorso).toContain("(select pr.id from profiles pr where pr.id = l.assigned_to)");
    expect(percorso).toContain("when pv.venditore is null then 'Non assegnati'");
  });

  it("la spesa per fonte non si divide per persona", () => {
    expect(percorso).toContain("where cc.company_id = p_company_id and p_assigned_user_ids is null");
  });

  it("le persone sono solo quelle dell'azienda", () => {
    expect(altri).toContain("or exists (select 1 from staff_permissions sp where sp.user_id = p.chi and sp.company_id = p_company_id)");
  });

  it("nella pagina: una sola scelta della pipeline e «Aggiorna» ricarica tutto", () => {
    expect(leggi("src/components/marketing/dashboard/tabs/TabPipeline.tsx")).not.toContain("SelectTrigger");
    const pagina = leggi("src/pages/azienda/marketing/MarketingDashboard.tsx");
    for (const k of ["marketing-percorso-lead", "marketing-attivita-team", "marketing-da-fare", "marketing-dashboard-trend-12m"]) {
      expect(pagina).toContain(`queryKey: ["${k}"]`);
    }
  });
});
