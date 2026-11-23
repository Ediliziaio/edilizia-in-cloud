import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { riferimentiStoriciSchema } from "@/lib/preventivi/stimaCostiStorici";

const azienda = "10000000-0000-4000-8000-000000000001";
const corrente = "10000000-0000-4000-8000-000000000002";
let db: PGlite;
const leggi = (per = azienda) => db.query<{ dati: unknown }>(
  "select public.preventivo_riferimenti_storici($1, 'SERR-01', 'Fornitura e posa di serramenti', null, $2) as dati",
  [per, corrente],
);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("src/test/fixtures/stimaCostiSchema.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290507120300_preventivo_stima_storico.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290507120300_preventivo_stima_storico.sql", "utf8"));
  await db.exec(`set test.azienda = '${azienda}'; set test.uid = '10000000-0000-4000-8000-000000000004'; set role authenticated;`);
}, 20000);
afterAll(async () => db?.close());

describe("lettura autorizzata dello storico preventivi", () => {
  it("legge lavorazioni misurate e separa operai, ditte, SAL, trasporti, mezzi e costi ripartiti", async () => {
    const result = riferimentiStoriciSchema.parse((await leggi()).rows[0].dati);
    expect(result.map(r => r.numero)).toEqual(["DEMO-CHIUSA-06", "DEMO-CHIUSA-05", "DEMO-CHIUSA-04",
      "DEMO-CHIUSA-03", "DEMO-CHIUSA-02", "DEMO-CHIUSA-01"]);
    const riga = result.at(-1)!;
    expect(riga).toMatchObject({
      quantita: 9, ore: 9, kmAndata: 15, kmRimborsati: 60, tariffaKm: 0.58, vendutoUnitario: 325, giorniDitta: 1, giorniConsegna: 3,
      costi: { acquisti: 1386, operai: 270, ditte: 254, mezzi: 70, altri: 40, trasporti: 184.8 },
    });
    expect(result[0].costi.ditte).toBe(410);
  });

  it("usa date effettive, conta una volta ogni giorno della ditta ed esclude rapportini revocati", async () => {
    await db.exec("reset role; begin");
    try {
      await db.exec(`
        insert into public.campo_rapportini
        select * from public.campo_rapportini where order_id = id_storico_demo(21000000, 2);
        update public.campo_rapportini set annullato_at = now()
        where order_id = id_storico_demo(21000000, 2) and data_lavoro = date '2026-06-03';
        update public.purchase_orders set actual_delivery_date = null where order_id = id_storico_demo(21000000, 2);
        set local role authenticated;
      `);
      const righe = riferimentiStoriciSchema.parse((await leggi()).rows[0].dati);
      expect(righe.find(r => r.numero === "DEMO-CHIUSA-02")).toMatchObject({ giorniDitta: 1, giorniConsegna: null });
      expect(righe.find(r => r.numero === "DEMO-CHIUSA-04")).toMatchObject({ giorniDitta: null, giorniConsegna: 6 });
    } finally {
      await db.exec("rollback; set role authenticated");
    }
  });

  it("applica permessi di portale, azienda, funzione, costi e importi", async () => {
    await expect(leggi("20000000-0000-4000-8000-000000000001")).rejects.toMatchObject({ code: "42501" });
    try {
      for (const negato of ["bloccato", "campo", "cliente", "feature", "can_view_preventivi", "can_view_costs", "can_view_margins"]) {
        await db.query("select set_config('test.negato', $1, false)", [negato]);
        await expect(leggi()).rejects.toMatchObject({ code: "42501" });
      }
      await db.exec("set test.negato = 'can_view_order_amounts'");
      expect(riferimentiStoriciSchema.parse((await leggi()).rows[0].dati).every(r => r.vendutoUnitario === null)).toBe(true);
      await db.exec("set role anon");
      await expect(leggi()).rejects.toMatchObject({ code: "42501" });
    } finally {
      await db.exec("reset role; reset test.negato; set role authenticated");
    }
  });

  it("esclude le quantità revocate, gli ODA in sospeso, la manodopera senza tariffa e i perimetri ambigui", async () => {
    await db.exec("reset role; begin");
    try {
      await db.exec(`
        update public.order_work_subphases set fatta = false where id = id_storico_demo(21200000, 1);
        insert into public.purchase_orders values (id_storico_demo(21500000, 2), '${azienda}', id_storico_demo(21000000, 2), 'parziale');
        update public.order_employees set total_cost = 0 where order_id = id_storico_demo(21000000, 3);
        insert into public.order_work_phase_voci
        select id_storico_demo(21300000, 40),order_id,company_id,phase_id,subphase_id,'Seconda opera',origine_codice,tariffa_id,unita,quantita
        from public.order_work_phase_voci where id=id_storico_demo(21300000, 4);
        insert into public.purchase_orders values (id_storico_demo(21500000, 5), '${azienda}', id_storico_demo(21000000, 5), 'ricevuto');
        insert into public.purchase_order_items values (id_storico_demo(21500000, 5), '${azienda}', false, 'Trasporto al cantiere');
        set local role authenticated;
      `);
      expect(riferimentiStoriciSchema.parse((await leggi()).rows[0].dati).map(r => r.numero)).toEqual(["DEMO-CHIUSA-06"]);
    } finally {
      await db.exec("rollback; set role authenticated");
    }
  });
});
