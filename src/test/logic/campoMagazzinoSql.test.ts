import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import schema from "@/test/fixtures/campoMagazzino.sql?raw";
import base from "../../../supabase/migrations/20280929100000_prelievo_magazzino_campo.sql?raw";
import ddt from "../../../supabase/migrations/20280929110000_ddt_da_prelievo_campo.sql?raw";
import sorgenteAssegnazioni from "../../../supabase/migrations/20281019130000_terzo_controllo_cantiere_economia.sql?raw";
import migrazione from "../../../supabase/migrations/20290504125650_magazzino_campo_permessi_e_prelievi.sql?raw";

const db = new PGlite();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [azienda, esterna, operaio, collega, admin, deposito, secondario, depositoEsterno, inattivo, cantiere, chiuso,
  nonAssegnato, cantiereEsterno, squadra, tubo, cemento, esterno, dismesso, richiesta] =
  Array.from({ length: 19 }, (_, i) => uuid(i + 1));

async function come<T>(utente: string, query: string, args: unknown[] = [], companyId = azienda) {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('test.uid', $1, true), set_config('test.company', $2, true)", [utente, companyId]);
    await tx.exec("set local role authenticated");
    return (await tx.query<T>(query, args)).rows;
  });
}

async function registra({
  utente = operaio, companyId = azienda, orderId = cantiere, warehouseId = deposito, requestId = richiesta,
  righe = [{ stock_item_id: tubo, quantita: 1.25 }],
}: {
  utente?: string; companyId?: string; orderId?: string | null; warehouseId?: string | null;
  requestId?: string; righe?: Array<{ stock_item_id: string; quantita: number }>;
} = {}) {
  const [result] = await come<{ esito: { id: string; stato: string } }>(
    utente, "select campo_magazzino_preleva($1,$2,$3,$4::jsonb,'Per il piano terra',$5) esito",
    [companyId, orderId, warehouseId, JSON.stringify(righe), requestId],
  );
  return result.esito;
}

const giacenza = async (stock = tubo) =>
  Number((await db.query<{ q: string }>("select quantity as q from warehouse_stock where id = $1", [stock])).rows[0].q);

beforeAll(async () => {
  await db.exec(schema);
  await db.exec(base);
  await db.exec(ddt);
  const assegnazioni = sorgenteAssegnazioni.match(/create or replace function public\.campo_lavoro_su_commessa[\s\S]*?\$\$;/);
  if (!assegnazioni) throw new Error("Funzione assegnazioni non trovata nella migrazione");
  await db.exec(assegnazioni[0]);

  await db.transaction(async (tx) => {
    await tx.exec(migrazione);
    await tx.exec(migrazione);
  });
  await db.exec("grant select, insert, update, delete on prelievi_campo to authenticated");
}, 30_000);

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec(`
    truncate companies, profiles, staff_permissions, warehouses, warehouse_assignments, warehouse_stock,
      warehouse_movements, orders, prelievi_campo, order_campo_assignments, squadre_commesse, squadre_test;
    insert into companies values ('${azienda}', true), ('${esterna}', false);
    insert into profiles(id,company_id,role) values ('${operaio}','${azienda}','employee'),
      ('${collega}','${azienda}','employee'), ('${admin}','${azienda}','company_admin');
    insert into staff_permissions(user_id,company_id,magazzino_campo)
      values ('${operaio}','${azienda}','prelievi'), ('${collega}','${azienda}','inventario');
    insert into warehouses values ('${deposito}','${azienda}','Deposito nord',true), ('${secondario}','${azienda}','Deposito sud',true),
      ('${depositoEsterno}','${esterna}','Altra azienda',true), ('${inattivo}','${azienda}','Archiviato',false);
    insert into warehouse_stock(id,company_id,warehouse_id,name,internal_code,unita_misura,unit_cost,quantity,quantity_reserved)
      values ('${tubo}','${azienda}','${deposito}','Tubo', 'TB-12','m',80,10,2),
      ('${cemento}','${azienda}','${secondario}','Cemento','C-12','kg',55,5,0),
      ('${esterno}','${esterna}','${depositoEsterno}','Tubo di altro cliente','TB-12','m',50,10,0),
      ('${dismesso}','${azienda}','${inattivo}','Tubo dismesso','TB-99','m',50,20,0);
    insert into orders(id,company_id,order_code,description,status) values
      ('${cantiere}','${azienda}','C26-10','Via Roma','in_corso'),
      ('${chiuso}','${azienda}','C26-11','Via Milano','completato'),
      ('${nonAssegnato}','${azienda}','C26-12','Via Torino','in_corso'),
      ('${cantiereEsterno}','${esterna}','C-01','Cantiere esterno','in_corso');
    insert into order_campo_assignments values ('${chiuso}','${operaio}'), ('${cantiereEsterno}','${operaio}');
    insert into squadre_commesse values ('${cantiere}','${squadra}');
    insert into squadre_test values ('${squadra}','${operaio}');
  `);
});

describe("app operaio — autorizzazioni, inventario e prelievi", () => {
  it("espone i dati dell'inventario senza costi e applica assegnazioni e ricerca", async () => {
    await db.query("insert into warehouse_assignments values ($1, $2, true)", [deposito, operaio]);
    const rows = await come(operaio, "select * from campo_magazzino_inventario($1,'tb-12',0)", [azienda]);
    expect(rows).toEqual([{
      id: tubo, name: "Tubo", description: null, internal_code: "TB-12", unita_misura: "m",
      disponibile: "8", warehouse_id: deposito, magazzino: "Deposito nord",
    }]);
    expect(await come(operaio, "select unit_cost from warehouse_stock")).toEqual([]);
    await expect(come(operaio, "select * from campo_magazzino_inventario($1,'',0)", [esterna])).rejects.toThrow(/non autorizzato/i);
    await expect(registra({ warehouseId: secondario, righe: [{ stock_item_id: cemento, quantita: 1 }] })).rejects.toThrow(/magazzino/);
  });

  it("usa le assegnazioni di squadra ed esclude i cantieri chiusi, estranei o di altre aziende", async () => {
    expect(await come(operaio, "select id from campo_magazzino_cantieri($1)", [azienda])).toEqual([{ id: cantiere }]);
    for (const orderId of [null, chiuso, nonAssegnato, cantiereEsterno]) {
      await expect(registra({ orderId })).rejects.toThrow(/assegnato/);
    }
    await expect(registra({ warehouseId: depositoEsterno, righe: [{ stock_item_id: esterno, quantita: 1 }] }))
      .rejects.toThrow(/magazzino/);
  });

  it("rispetta nessun accesso, sola lettura e revoca anche per il vecchio client", async () => {
    expect(await come(collega, "select * from campo_magazzino_config($1)", [azienda]))
      .toEqual([{ livello: "inventario", conferma: true }]);
    await expect(registra({ utente: collega })).rejects.toThrow(/non autorizzati/i);
    await db.query("update staff_permissions set sola_lettura = true where user_id = $1", [operaio]);
    expect(await come(operaio, "select livello from campo_magazzino_config($1)", [azienda])).toEqual([{ livello: "inventario" }]);
    await expect(come(operaio, "select prelievo_campo_registra($1,$2,$3::jsonb)", [
      cantiere, deposito, JSON.stringify([{ stock_item_id: tubo, quantita: 1 }]),
    ])).rejects.toThrow(/non autorizzati/i);
    await db.query("update staff_permissions set magazzino_campo = 'nessuno', can_view_warehouse = true where user_id = $1", [operaio]);
    await expect(come(operaio, "select * from campo_magazzino_inventario($1,'',0)", [azienda])).rejects.toThrow(/non autorizzato/i);
  });

  it("conserva i prelievi in attesa e scala la giacenza solo all'approvazione dell'ufficio", async () => {
    expect(await registra()).toEqual({ id: richiesta, stato: "richiesto" });
    expect(await giacenza()).toBe(10);
    await expect(come(operaio, "select prelievo_campo_approva($1)", [richiesta])).rejects.toThrow(/non autorizzata/i);
    await expect(come(operaio, "select prelievo_campo_richiedi_ddt($1)", [richiesta])).rejects.toThrow(/consegnato non trovato/i);
    expect(await come(collega, "select id from prelievi_campo")).toEqual([]);
    expect(await come(admin, "select prelievo_campo_approva($1) esito", [richiesta]))
      .toEqual([{ esito: { id: richiesta, stato: "consegnato" } }]);
    expect(await giacenza()).toBe(8.75);
    await come(operaio, "select prelievo_campo_richiedi_ddt($1)", [richiesta]);
    expect(await come(operaio, "select ddt_richiesto from prelievi_campo")).toEqual([{ ddt_richiesto: true }]);
  });

  it("registra quantità decimali e attribuisce l'unico scarico al magazzino e al cantiere", async () => {
    await db.query("update companies set magazzino_prelievo_conferma = false where id = $1", [azienda]);
    expect(await registra({ righe: [{ stock_item_id: tubo, quantita: 8 }] })).toEqual({ id: richiesta, stato: "consegnato" });
    expect(await registra({ righe: [{ stock_item_id: tubo, quantita: 8 }] })).toEqual({ id: richiesta, stato: "consegnato" });
    expect(await giacenza()).toBe(2);
    const { rows } = await db.query("select warehouse_id, order_id, stock_item_id, quantity, movement_type from warehouse_movements");
    expect(rows).toEqual([{ warehouse_id: deposito, order_id: cantiere, stock_item_id: tubo, quantity: "8", movement_type: "scarico" }]);
    await expect(registra({ requestId: uuid(300) })).rejects.toThrow(/quantità disponibili/);
  });

  it("ricontrolla la giacenza in approvazione e la lascia integra se insufficiente", async () => {
    await registra({ righe: [{ stock_item_id: tubo, quantita: 8 }] });
    await db.query("update warehouse_stock set quantity_reserved = 3 where id = $1", [tubo]);
    await expect(come(admin, "select prelievo_campo_approva($1)", [richiesta])).rejects.toThrow(/giacenza insufficiente/i);
    expect(await come(operaio, "select stato from prelievi_campo")).toEqual([{ stato: "richiesto" }]);
    expect(await giacenza()).toBe(10);
    await come(admin, "select prelievo_campo_rifiuta($1, 'Materiale riservato')", [richiesta]);
    expect(await come(operaio, "select stato, motivo_rifiuto from prelievi_campo"))
      .toEqual([{ stato: "rifiutato", motivo_rifiuto: "Materiale riservato" }]);
  });

  it("non permette righe duplicate, stock misto o manipolazione diretta del registro", async () => {
    await expect(registra({ righe: [{ stock_item_id: tubo, quantita: 1 }, { stock_item_id: tubo, quantita: 1 }] }))
      .rejects.toThrow(/quantità disponibili/);
    await expect(registra({ righe: [{ stock_item_id: tubo, quantita: 1 }, { stock_item_id: cemento, quantita: 1 }] }))
      .rejects.toThrow(/quantità disponibili/);
    await expect(come(operaio, "insert into prelievi_campo(company_id,operaio_id) values($1,$2)", [azienda, operaio]))
      .rejects.toThrow(/row-level security/);
    await registra();
    expect(await come(operaio, "update prelievi_campo set stato = 'consegnato' returning id")).toEqual([]);
    expect(await come(operaio, "select stato from prelievi_campo")).toEqual([{ stato: "richiesto" }]);
  });

  it("mantiene il comportamento degli accessi storici e blocca gli account sospesi", async () => {
    await db.query("update staff_permissions set magazzino_campo = null, can_view_warehouse = true where user_id = $1", [operaio]);
    const righe = JSON.stringify([{ stock_item_id: tubo, quantita: 1 }]);
    expect(await come(operaio, "select (prelievo_campo_registra(null,null,$1::jsonb))->>'stato' stato", [righe]))
      .toEqual([{ stato: "richiesto" }]);
    await db.query("update profiles set bloccato = true where id = $1", [operaio]);
    await expect(registra()).rejects.toThrow(/non autorizzati/i);
  });
});
