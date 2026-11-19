import { describe, expect, it } from "vitest";
import { valoreContrattoSal, variantiAlVerbale } from "../../../supabase/functions/generate-sal-pdf/contract";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { buildSalHtml } from "../../../supabase/functions/generate-sal-pdf/render";
import { agreedContractValue } from "@/lib/orders/contractValue";

describe("Il contratto nel verbale coincide con quello della commessa", () => {
  it("distingue i SAL emessi prima e dopo una variante approvata nello stesso giorno", () => {
    const v = [{ status: "approvato", impatto_economico: 12000, approval_recorded_at: "2026-11-18T08:10:16Z" },
      { status: "approvato", impatto_economico: 30000, offline_signed_on: "2026-11-20" }];
    const storici = ["08:05:49", "08:09:20", "08:11:04", "08:12:05", "08:12:38"].map(orario => {
      const variante = variantiAlVerbale(v, { stato: "emesso", data_emissione: "2026-11-18", created_at: `2026-11-18T${orario}Z` });
      return valoreContrattoSal(200000, variante).totale;
    });
    expect(storici).toEqual([200000, 200000, 212000, 212000, 212000]);
    expect(variantiAlVerbale(v, { stato: "emesso", data_emissione: "2026-11-17", created_at: "2026-11-18T08:12:38Z" })).toEqual([]);
  });
  it("comprende gli extra approvati, esclude le bozze e conserva le diminuzioni", () => {
    const variations = [
      {status:'approvato',impatto_economico:200}, {status:'in_attesa',impatto_economico:9999},
      {status:'annullato',impatto_economico:300}, {status:'approvato',impatto_economico:'-50.50'},
    ];
    const result = valoreContrattoSal(909.09, variations);
    expect(result).toEqual({totale:1058.59,varianti:149.5});
    expect(result.totale).toBe(agreedContractValue(909.09, variations));
    expect(() => valoreContrattoSal(100, [{status:'approvato',impatto_economico:'incerto'}])).toThrow(/non verificabile/);
  });
  it("stampa totale e varianti senza confonderli con le sole voci del SAL", () => {
    const value = valoreContrattoSal(909.09, [{status:'approvato',impatto_economico:200}]);
    const html = buildSalHtml({id:'demo',numero_sal:1,stato:'bozza',data_emissione:'2026-11-18',company_id:'c',order_id:'o',importo_totale:0,note:null,
      sal_voci:[{id:'v',descrizione:'Lavoro extra',importo_contrattuale:200,percentuale_avanzamento:0,importo_sal:0,note:null}]},
      null, {ragione_sociale:'Azienda DEMO',partita_iva:null,colore_primario:'#1e3a5f',logo_url:null}, null, undefined, 0, null,
      {importoContratto:value.totale,importoVariantiApprovate:value.varianti});
    expect(html).toContain('1.109,09'); expect(html).toContain('incluse varianti approvate 200,00');
    expect(html).toContain('su 200,00'); expect(html).toContain('BOZZA');
  });
});

it("fissa contratto, IVA e varianti all'emissione anche se i dati della commessa cambiano dopo", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private;
      create role anon; create role authenticated; create role service_role bypassrls;
      create table orders (id uuid primary key, company_id uuid not null, total_amount numeric not null, vat_rate numeric);
      create table ordini_variazione (id uuid primary key default gen_random_uuid(), company_id uuid, order_id uuid, status text, impatto_economico numeric);
      create table sal_records (id uuid primary key, order_id uuid, company_id uuid, stato text not null, data_emissione date not null default (now() at time zone 'Europe/Rome')::date);
      insert into orders values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',200000,10);
      insert into sal_records (id,order_id,company_id,stato) select '00000000-0000-0000-0000-000000000003',id,company_id,'bozza' from orders;
    `);
    await db.exec(await readFile("supabase/migrations/20261118083953_sal_contratto_storico_emissione.sql", "utf8"));
    expect((await db.query("select * from sal_contratto_emesso")).rows).toEqual([]);
    await db.exec(`
      insert into ordini_variazione(company_id,order_id,status,impatto_economico)
      select company_id,id,'approvato',12000 from orders
      union all select company_id,id,'bozza',20000 from orders;
      update sal_records set stato='emesso';
      update orders set total_amount=230000,vat_rate=22;
      update ordini_variazione set status='approvato';
      update sal_records set stato='approvato';
      insert into sal_records (id,order_id,company_id,stato,data_emissione)
      select '00000000-0000-0000-0000-000000000004',id,company_id,'emesso',date '2000-01-01' from orders;
    `);
    const { rows } = await db.query<{ base: number; iva: number; varianti: number }>(
      "select importo_base::int as base,aliquota_iva::int as iva,jsonb_array_length(varianti) as varianti from sal_contratto_emesso");
    expect(rows).toEqual([{ base: 200000, iva: 10, varianti: 1 }]);
    await db.exec("set role authenticated");
    await expect(db.query("select * from sal_contratto_emesso")).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role service_role");
    expect((await db.query("select * from sal_contratto_emesso")).rows).toHaveLength(1);
    await expect(db.query("update sal_contratto_emesso set importo_base = 1")).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});
