/**
 * Cruscotto aziendale: numeri giusti, un solo periodo, il permesso della pagina (21/10/2026).
 *
 * Provato sul database (Demo Azienda): quota primo cliente su 53.572 € di
 * fatturato IVA esclusa invece di 67.999 € (le note di credito erano sommate),
 * consegne nei tempi 2 su 2 sulla chiusura vera invece di «0 su 1» fra due
 * date previste, pareggio sul margine dei cantieri con costi (52,3%, non 70%).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { quotaGiorniLavorativiTrascorsi } from "@/hooks/useIndicatoriGuida";
import { scadutoPerEta } from "@/hooks/useCruscottoData";
import { valutaPortafoglio } from "@/lib/indicatoriGuida";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const sql = leggi("supabase/migrations/20281021233000_cruscotto_indicatori_e_permessi.sql").replace(/^\s*--.*$/gm, "");

describe("cruscotto_indicatori", () => {
  it("chiede il permesso (il Cruscotto è compreso) e non è aperta ad anon", () => {
    expect(sql).toContain("if not public.puo_vedere_metrica(p_company_id, 'finanza') then");
    expect(sql).toContain("revoke all on function public.cruscotto_indicatori(uuid) from public, anon;");
  });

  it("il fatturato toglie le note di credito, salta bozze e cestino, non conta due volte le copie", () => {
    expect(sql).toContain("case when d.tipo = 'nota_credito' then -1 else 1 end");
    expect(sql).toContain("case when i.document_type = 'credit_note' then -1 else 1 end");
    expect(sql).toMatch(/from documenti_fiscali d\s+where d\.company_id = p_company_id and d\.deleted_at is null/);
    expect(sql).toMatch(/from invoices i\s+where i\.company_id = p_company_id and i\.deleted_at is null/);
    expect(sql).toContain("and not exists (select 1 from app a where a.giorno = i.issue_date and abs(a.totale - i.total) < 0.01)");
  });

  it("le consegne si misurano sulla prima entrata nell'ultima fase, contro la fine prevista", () => {
    expect(sql).toContain("(min(h.changed_at) at time zone 'Europe/Rome')::date as chiusa_il");
    expect(sql).toContain("coalesce(c.work_end_date, c.expected_date) as prevista");
    expect(sql).toContain("where chiusa_il <= prevista");
  });

  it("venduto senza cestino, ordini fornitore in bozza non contano", () => {
    expect(sql).toMatch(/from orders o\s+where o\.company_id = p_company_id and o\.deleted_at is null/);
    expect(sql).toContain("coalesce(po.status, '') <> 'bozza'");
  });

  it("chi ha il Cruscotto passa anche dalle tre funzioni che lo bloccavano, una volta sola", () => {
    for (const f of ["cruscotto_rate_da_incassare(uuid)", "cruscotto_trend_12m(uuid)", "incassato_rate_periodo(date,date)"]) {
      expect(sql).toContain(`'public.${f}'`);
    }
    expect(sql).toContain("if position('can_view_cruscotto' in v_def) > 0 then");
    expect(sql).toContain("non trovato una sola volta");
  });
});

describe("nella pagina", () => {
  it("«I numeri che comandano» leggono la funzione, senza limiti di righe né l'elenco di Prima Nota", () => {
    const hook = leggi("src/hooks/useIndicatoriGuida.ts");
    expect(hook).toContain('rpc("cruscotto_indicatori"');
    expect(hook).not.toMatch(/\.limit\(\d+\)/);
    expect(hook).not.toContain("usePrimaNota");
  });

  it("il pareggio usa il margine dei soli cantieri con costi", () => {
    expect(leggi("src/hooks/useMarginData.ts")).toContain("orders.filter(o => o.totalAmount > 0 && o.totalVariableCosts > 0)");
  });

  it("un periodo solo: il blocco in cima usa gli stessi dati della pagina", () => {
    const dati = leggi("src/hooks/useCruscottoData.ts");
    expect(dati).not.toContain("todayDateFrom");
    expect(dati).not.toContain("get_cruscotto_invoice_stats");
    expect(dati).not.toMatch(/T00:00:00`/);
    const pagina = leggi("src/pages/azienda/CruscottoAziendale.tsx");
    expect(pagina).toMatch(/<ComeStiamoAndandoVista\s+comeSezione\s+dati=\{cruscotto\}/);
    expect(pagina).toContain('label: "Incassato periodo (IVA incl.)"');
    expect(pagina).not.toContain('label: "Saldo scadenze mese"');
  });

});

describe("saturazione sui giorni passati", () => {
  it("a inizio mese pesa poco, a fine mese tutto, e salta i fine settimana", () => {
    // ottobre 2026: 22 giorni lavorativi; mercoledì 21 è il 15°
    expect(quotaGiorniLavorativiTrascorsi(new Date(2026, 9, 21))).toBeCloseTo(15 / 22, 6);
    expect(quotaGiorniLavorativiTrascorsi(new Date(2026, 9, 31))).toBe(1);
    // sabato 3 = venerdì 2: due giorni lavorativi
    expect(quotaGiorniLavorativiTrascorsi(new Date(2026, 9, 3))).toBeCloseTo(2 / 22, 6);
  });
});

describe("lavoro in portafoglio (20281022110000)", () => {
  const port = leggi("supabase/migrations/20281022110000_cruscotto_portafoglio.sql").replace(/^\s*--.*$/gm, "");

  it("conta le commesse aperte con la regola della pagina, per la parte non ancora avanzata", () => {
    expect(port).toContain("when st.id is not null and coalesce(st.is_support_phase, false) then false");
    expect(port).toContain("when st.id is not null then st.id is distinct from (select id from ultima_fase)");
    expect(port).toContain("* (1 - least(100, greatest(0, coalesce(v.percentuale_avanzamento, 0))) / 100.0)");
    expect(port).toContain("if not public.puo_vedere_metrica(p_company_id, 'finanza') then");
  });

  it("i mesi sono il portafoglio sul venduto medio mensile, con le soglie 2 e 4", () => {
    expect(valutaPortafoglio(1_200_000, 50, 1_200_000).valore).toBe(12);
    expect(valutaPortafoglio(150_000, 5, 1_200_000).stato).toBe("allarme");
    expect(valutaPortafoglio(300_000, 5, 1_200_000).stato).toBe("attenzione");
    expect(valutaPortafoglio(100, 1, 0).stato).toBe("nd");
  });
});

describe("scaduto per età", () => {
  it("divide le rate scadute in fasce, salta la finanziaria e quelle non ancora scadute", () => {
    const r = scadutoPerEta([
      { amount: 100, expected_date: "2026-10-12", finanziamento: false }, // 10 gg
      { amount: 300, expected_date: "2026-07-14", finanziamento: false }, // 100 gg
      { amount: 999, expected_date: "2026-07-14", finanziamento: true },  // finanziaria
      { amount: 50, expected_date: "2026-10-25", finanziamento: false },  // non ancora scaduta
    ], "2026-10-22");
    expect(r.totale).toBe(400);
    expect(r.rate).toBe(2);
    expect(r.fasce[0]).toEqual({ etichetta: "fino a 30 giorni", importo: 100, rate: 1 });
    expect(r.fasce[3]).toEqual({ etichetta: "oltre 90 giorni", importo: 300, rate: 1 });
    expect(r.ritardoMedio).toBe(Math.round((10 * 100 + 100 * 300) / 400));
  });
});

describe("schede del cruscotto (08/11/2026)", () => {
  const pagina = leggi("src/pages/azienda/CruscottoAziendale.tsx");
  const inCima = leggi("src/pages/azienda/ComeStiamoAndando.tsx");

  it("due schede, solo di soldi; una scheda salvata che non c'è più torna a «Incassi e cassa»", () => {
    expect(pagina).toContain('<TabsTrigger value="incassi"');
    expect(pagina).toContain('<TabsTrigger value="commesse"');
    for (const vecchia of ['value="sintesi"', 'value="finanza"', 'value="operations"', 'value="vendite"', 'value="team"']) {
      expect(pagina).not.toContain(vecchia);
    }
    expect(pagina).toContain('["incassi", "commesse"].includes(cruscottoTab) ? cruscottoTab : "incassi"');
  });

  it("niente doppioni della Dashboard Operativa e della Dashboard Marketing", () => {
    for (const copia of ["TodayFocus", "OperationsDelivery", "VenditeInBreve", "AlertPanel", "SilvioCustomerLTVPanel",
      "BillingKPIWidget", "PrimaNotaScadenzarioWidget", "ClienteSituazioneWidget", "SedeIncidenceChart",
      "SalesControl", "PipelineForecast", "MarketingControl", "HRPerformance", "CruscottoTrend"]) {
      expect(pagina).not.toContain(copia);
    }
    // in cima solo soldi: ritardi e ticket stanno nella Dashboard Operativa
    expect(inCima).not.toContain('etichetta="Cantieri in ritardo"');
    expect(inCima).not.toContain('id: "cantieri-ritardo"');
    expect(inCima).not.toContain('id: "ticket"');
    expect(inCima).toContain('etichetta="Saldo delle scadenze"');
    expect(inCima).toContain("non è il saldo di cassa");
  });

  it("si chiamano Cruscotto Economico e Dashboard Operativa, anche nel selettore", () => {
    const selettore = leggi("src/components/dashboard/DashboardSelectorBar.tsx");
    expect(selettore).toContain('label: "Cruscotto Economico"');
    expect(selettore).toContain('label: "Dashboard Operativa"');
    expect(pagina).toContain('title="Cruscotto Economico"');
  });
});

describe("numeri corretti dopo il confronto coi dati veri (20290108100000)", () => {
  const sqlNuovo = leggi("supabase/migrations/20290108100000_cruscotto_numeri_corretti.sql").replace(/^\s*--.*$/gm, "");
  const dati = leggi("src/hooks/useCruscottoData.ts");

  it("acconti e saldi a 90 giorni sono gli incassi veri, anche delle commesse senza righe di rata", () => {
    expect(sqlNuovo).toContain("from public.rate_incassi(p_company_id) i");
    expect(sqlNuovo).toContain("join public.rate_importi(p_company_id) ri on ri.installment_id = i.installment_id");
    expect(sqlNuovo).not.toMatch(/rate_90 as \(\s*select oi\.type/);
  });

  it("il venduto non conta le commesse con data futura", () => {
    expect(sqlNuovo).toContain("created_at > now() - interval '12 months' and created_at <= now()");
    expect(dati).toContain("o.created_at >= dal && o.created_at <= adesso");
  });

  it("l'incassato è dell'azienda sullo schermo, non di quella scelta per ultima", () => {
    expect(sqlNuovo).toContain("create or replace function public.incassato_rate_periodo(p_company_id uuid, p_da date, p_a date)");
    expect(sqlNuovo).toContain("revoke all on function public.incassato_rate_periodo(uuid, date, date) from public, anon;");
    expect(dati).not.toMatch(/rpc\("incassato_rate_periodo", \{ p_da/);
    expect((dati.match(/rpc\("incassato_rate_periodo", \{ p_company_id: companyId,/g) ?? []).length).toBe(2);
  });

  it("niente letture che si fermano a mille o cinquecento righe", () => {
    expect(dati).toContain('rpc("cruscotto_rate_da_incassare", { p_company_id: companyId }).order("id").range(from, to)');
    const margini = leggi("src/hooks/useMarginData.ts");
    expect(margini).not.toContain(".limit(500)");
    expect(margini).toContain("readAllOrderRows<MarginViewRow>");
  });
});
