/**
 * Migrazioni 20281022104100-104500 (indici avanzati, IRAP, rating, health-check,
 * piano industriale) provate su un Postgres in memoria con la base del modulo
 * (20281016184304) e tabelle ridotte.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

let db: PGlite;
const company = "00000000-0000-0000-0000-000000000001";
const anno = new Date().getFullYear() - 1; // anno chiuso: risultati che non dipendono da oggi
const giorniAnno = (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0 ? 366 : 365;

const MIGRAZIONI = [
  "20281022104100_cg_indici_avanzati_periodo_e_debiti_fornitori.sql",
  "20281022104200_cg_irap_personale_deducibile.sql",
  "20281022104300_cg_rating_casi_limite_e_anno_in_corso.sql",
  "20281022104400_cg_health_check_mesi_e_testi.sql",
  "20281022104500_cg_piano_industriale_base_coerente.sql",
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function rpc(name: string, args: string): Promise<Record<string, any>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = await db.query<{ data: Record<string, any> }>(`select public.${name}(${args}) as data`);
  return r.rows[0].data;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const voce = (ce: Record<string, any>, codice: string) => Number(ce.voci.find((v: { codice: string }) => v.codice === codice).valore);

async function sp(data: Record<string, unknown>) {
  await db.exec(`delete from test_sp; insert into test_sp values ('${JSON.stringify(data)}')`);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
  END $$;`);
  await db.exec(readFileSync("src/test/fixtures/cgReconciliation.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20281016184304_cg_scadenze_commesse_riconciliazione.sql", "utf8"));
  await db.exec(`
    ALTER TABLE public.scadenze ADD COLUMN tipo text, ADD COLUMN is_previsionale boolean;
    ALTER TABLE public.v_cg_costi_classificati ADD COLUMN tipo text;
    CREATE TABLE public.piano_industriale_assumptions(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, scenario text, is_default boolean,
      anno_partenza int, orizzonte_anni int, crescita_ricavi_pct numeric[], margine_target_pct numeric,
      crescita_costi_fissi_pct numeric[], investimenti numeric[], delta_costo_personale numeric[],
      nuovo_debito_mlt numeric[], tasso_debito_pct numeric, aliquota_imposte_pct numeric, note text);
    CREATE OR REPLACE FUNCTION public.cg_get_stato_patrimoniale_riclassificato(uuid,int,date) RETURNS jsonb
      LANGUAGE sql AS $$ SELECT data FROM public.test_sp $$;
  `);
  for (const m of MIGRAZIONI) await db.exec(readFileSync(`supabase/migrations/${m}`, "utf8"));
  // Rieseguite: devono essere idempotenti.
  for (const m of MIGRAZIONI) await db.exec(readFileSync(`supabase/migrations/${m}`, "utf8"));

  await db.exec(`
    insert into v_cg_ricavi_classificati values ('${company}',${anno},1,100000);
    insert into v_cg_costi_classificati values
      ('${company}',${anno},1,'acquisti_materie',30000,'V'),
      ('${company}',${anno},1,'costi_produttivi',10000,'V'),
      ('${company}',${anno},1,'costi_produttivi',10000,'F'),
      ('${company}',${anno},1,'costo_personale',99999,'F'),
      ('${company}',${anno},1,'oneri_finanziari',2000,'F');
    insert into cedolini values ('${company}',${anno},1,'pagato',15000,5000);
    insert into cg_loans values ('${company}',true,1000,50000,4);
  `);
  await sp({
    attivo: { attivo_circolante: 60000, totale: 100000, crediti_clienti: 20000, rimanenze: 5000, attivo_fisso: 40000 },
    passivo: { pas_corrente: 30000, pas_consolidato: 20000, mezzi_propri: 50000, totale: 100000, riserve: 10000,
               utile_esercizio: 0, debiti_fornitori: 0, mutui_mlt: 20000, fondo_tfr: 0, fondi_rischi: 0 },
    quadratura: { differenza: 0, quadrato: true },
  });
}, 60000);

afterAll(async () => {
  await db.close();
});

describe("IRAP: personale a tempo indeterminato deducibile", () => {
  it("la base IRAP è l'EBIT se la quota non deducibile è 0, e CE e dettaglio coincidono", async () => {
    const ce = await rpc("cg_get_conto_economico_riclassificato", `'${company}',${anno},1,12`);
    // Ricavi 100.000 − materie 30.000 − produttivi 20.000 − personale (cedolini) 20.000 = 30.000
    expect(voce(ce, "E")).toBe(30000);
    const uai = voce(ce, "I"); // 30.000 − 2.000 oneri finanziari
    expect(uai).toBe(28000);
    expect(voce(ce, "15")).toBeCloseTo(28000 * 0.24 + 30000 * 0.039, 2); // 6.720 + 1.170
    const imp = await rpc("cg_get_imposte_dettaglio", `'${company}',${anno}`);
    expect(imp.irap.base_imponibile).toBe(30000);
    expect(imp.totali.imposte_totali).toBe(voce(ce, "15"));
  });

  it("con l'opzione accesa (personale non deducibile) il personale entra nella base IRAP", async () => {
    await db.exec(`insert into cg_aliquote_imposte(company_id,ires_pct,irap_pct,addizionale_ires_pct,base_irap_include_personale)
                   values ('${company}',24,3.9,0,true)`);
    const ce = await rpc("cg_get_conto_economico_riclassificato", `'${company}',${anno},1,12`);
    const imp = await rpc("cg_get_imposte_dettaglio", `'${company}',${anno}`);
    expect(imp.irap.base_imponibile).toBe(50000);
    expect(imp.totali.imposte_totali).toBeCloseTo(voce(ce, "15"), 2);
    await db.exec(`delete from cg_aliquote_imposte`);
  });
});

describe("Indici avanzati", () => {
  it("DPO dai debiti verso fornitori in scadenzario, non 0 giorni", async () => {
    let ind = await rpc("cg_get_indici_avanzati", `'${company}',${anno}`);
    expect(ind.rotazione.dpo_giorni).toBeNull();
    expect(ind.rotazione.ccc_giorni).toBeNull();
    await db.exec(`insert into scadenze(company_id,direction,status,amount,paid_amount,due_date,tipo,is_previsionale) values
      ('${company}','uscita','da_pagare',6000,1000,current_date,'pagamento_fornitore',false),
      ('${company}','uscita','da_pagare',9999,0,current_date,'pagamento_fornitore',true),
      ('${company}','uscita','pagata',7777,7777,current_date,'pagamento_fornitore',false),
      ('${company}','uscita','da_pagare',4444,0,current_date,'scadenza_fiscale',false)`);
    ind = await rpc("cg_get_indici_avanzati", `'${company}',${anno}`);
    expect(Number(ind.rotazione.debiti_fornitori)).toBe(5000);
    expect(ind.rotazione.debiti_fornitori_fonte).toBe("scadenzario");
    // acquisti + servizi = 30.000 + 20.000
    expect(Number(ind.rotazione.dpo_giorni)).toBeCloseTo((5000 / 50000) * giorniAnno, 6);
    expect(Number(ind.rotazione.dso_giorni)).toBeCloseTo((20000 / 100000) * giorniAnno, 6);
    expect(ind.rotazione.giorni_periodo).toBe(giorniAnno);
  });

  it("DSCR con le rate del periodo; Z-score provvisorio se lo SP non quadra", async () => {
    let ind = await rpc("cg_get_indici_avanzati", `'${company}',${anno}`);
    expect(Number(ind.dscr.rate_periodo)).toBeCloseTo((12000 * giorniAnno) / 365, 2);
    expect(ind.attendibile).toBe(true);
    expect(ind.altman.provvisorio).toBe(false);
    await db.exec(`update test_sp set data = jsonb_set(data,'{quadratura}','{"differenza":1346331.55,"quadrato":false}')`);
    ind = await rpc("cg_get_indici_avanzati", `'${company}',${anno}`);
    expect(ind.attendibile).toBe(false);
    expect(ind.altman.provvisorio).toBe(true);
    expect(ind.motivi[0]).toContain("1.346.331,55 €");
    await db.exec(`update test_sp set data = jsonb_set(data,'{quadratura}','{"differenza":0,"quadrato":true}')`);
  });
});

describe("Rating bancario", () => {
  it("senza debiti a breve la liquidità è piena, non zero", async () => {
    await db.exec(`update test_sp set data = jsonb_set(data,'{passivo,pas_corrente}','0')`);
    const r = await rpc("cg_get_rating", `'${company}',${anno}`);
    const liq = r.indicatori.find((i: { codice: string }) => i.codice === "liquidita");
    expect(liq.calcolabile).toBe(true);
    expect(liq.valore).toBeNull();
    expect(liq.punteggio).toBe(25);
    await db.exec(`update test_sp set data = jsonb_set(data,'{passivo,pas_corrente}','30000')`);
  });

  it("senza ricavi gli oneri finanziari non sono calcolabili; motivo con l'importo formattato", async () => {
    await db.exec(`update test_sp set data = jsonb_set(data,'{quadratura}','{"differenza":1346331.55,"quadrato":false}')`);
    const r = await rpc("cg_get_rating", `'${company}',${anno + 0}`);
    expect(r.motivi[0]).toContain("1.346.331,55 €");
    const r2 = await rpc("cg_get_rating", `'${company}',${anno - 5}`);
    const of = r2.indicatori.find((i: { codice: string }) => i.codice === "oneri_finanziari");
    expect(of.calcolabile).toBe(false);
    expect(of.punteggio).toBe(0);
    await db.exec(`update test_sp set data = jsonb_set(data,'{quadratura}','{"differenza":0,"quadrato":true}')`);
  });
});

describe("Health-check", () => {
  it("valori in euro marcati, link ai costi giusto", async () => {
    const h = await rpc("cg_get_health_check", `'${company}',${anno}`);
    const byCode = Object.fromEntries(h.checks.map((c: { codice: string }) => [c.codice, c]));
    expect(byCode.quadratura_sp.unita).toBe("euro");
    expect(byCode.patrimonio_netto.unita).toBe("euro");
    expect(byCode.costi_no_categoria.azione_url).toBe("/azienda/costi");
    expect(JSON.stringify(h)).not.toContain("costi-aziendali");
    expect(JSON.stringify(h)).not.toContain("macro_voce");
  });

  it("anno in corso: i costi con scadenza nei mesi futuri non contano", async () => {
    const corrente = new Date().getFullYear();
    const mese = new Date().getMonth() + 1;
    await db.exec(`insert into company_costs values
      ('${company}',null,make_date(${corrente},${mese},1),'x')
      ${mese < 12 ? `,('${company}',null,make_date(${corrente},12,1),'x')` : ""}`);
    const h = await rpc("cg_get_health_check", `'${company}',${corrente}`);
    const mesi = h.checks.find((c: { codice: string }) => c.codice === "mesi_movimenti");
    expect(mesi.valore).toBe(1);
  });
});

describe("Piano industriale", () => {
  it("l'anno base ha lo stesso EBITDA del conto economico e il rating vero", async () => {
    await db.exec(`insert into piano_industriale_assumptions(company_id,scenario,is_default,anno_partenza,orizzonte_anni,
        crescita_ricavi_pct,margine_target_pct,crescita_costi_fissi_pct,investimenti,delta_costo_personale,nuovo_debito_mlt,tasso_debito_pct,aliquota_imposte_pct)
      values ('${company}','base',true,${anno},3,'{5,5,5}',15,'{2,2,2}','{0,0,0}','{0,0,0}','{0,0,0}',4,27.5)`);
    const ce = await rpc("cg_get_conto_economico_riclassificato", `'${company}',${anno},1,12`);
    const rt = await rpc("cg_get_rating", `'${company}',${anno}`);
    const p = await rpc("cg_simula_piano_industriale", `'${company}',null,null`);
    const base = p.periodi[0];
    expect(base.ebitda).toBe(Math.round(voce(ce, "E")));
    expect(base.costi_var + base.costi_fissi).toBe(Math.round(voce(ce, "01") - voce(ce, "E")));
    expect(base.rating_classe).toBe(rt.classe);
    expect(p.periodi).toHaveLength(4);
    // Le rate (12.000 € l'anno) riducono il debito.
    expect(p.periodi[1].debito_mlt).toBeLessThan(base.debito_mlt);
  });

  it("il what-if usa davvero il margine obiettivo", async () => {
    const p = await rpc("cg_simulazione_what_if", `'${company}',null,null,20,null,null,null`);
    const ultimo = p.periodi[p.periodi.length - 1];
    expect(ultimo.ebitda / ultimo.ricavi).toBeCloseTo(0.2, 2);
  });
});
