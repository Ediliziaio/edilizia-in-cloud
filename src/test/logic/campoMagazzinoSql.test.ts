import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import schema from "@/test/fixtures/campoMagazzino.sql?raw";
import base from "../../../supabase/migrations/20280929100000_prelievo_magazzino_campo.sql?raw";
import ddt from "../../../supabase/migrations/20280929110000_ddt_da_prelievo_campo.sql?raw";
import sorgenteAssegnazioni from "../../../supabase/migrations/20281019130000_terzo_controllo_cantiere_economia.sql?raw";
import migrazione from "../../../supabase/migrations/20290504125650_magazzino_campo_permessi_e_prelievi.sql?raw";
import definizioneUnita from "../../../supabase/migrations/20281030180000_rientro_e_contratti_correzioni.sql?raw";
import riepilogoMateriali from "../../../supabase/migrations/20290506134200_campo_materiali_cantiere_unita.sql?raw";
import inventarioDettaglio from "../../../supabase/migrations/20290506141000_campo_magazzino_ubicazioni_disponibilita.sql?raw";

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
  const confrontoUnita = definizioneUnita.match(/create or replace function public\.unita_confrontabile[\s\S]*?\$\$;/);
  if (!confrontoUnita) throw new Error("Confronto delle unità non trovato");
  await db.exec(confrontoUnita[0]);
  await db.exec(`
    alter table warehouse_movements add column order_item_id uuid, add column rientro_commessa boolean default false;
    create table order_items(id uuid primary key, order_id uuid, stock_item_id uuid);
    create table campo_rapportini(order_id uuid, company_id uuid, user_id uuid, stato text, materiali_usati jsonb);
  `);
  await db.transaction(async (tx) => {
    await tx.exec(riepilogoMateriali);
    await tx.exec(riepilogoMateriali);
    await tx.exec(inventarioDettaglio);
    await tx.exec(inventarioDettaglio);
  });
  await db.exec("grant select, insert, update, delete on prelievi_campo to authenticated");
}, 30_000);

afterAll(async () => { await db.close(); });

beforeEach(async () => {
  await db.exec(`
    truncate companies, profiles, staff_permissions, warehouses, warehouse_assignments, warehouse_stock, warehouse_sections,
      warehouse_movements, orders, prelievi_campo, order_campo_assignments, squadre_commesse, squadre_test,
      order_items, campo_rapportini;
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
  it("trova la zona visibile e filtra la giacenza disponibile prima di paginare", async () => {
    await db.query("insert into warehouse_assignments values ($1, $2, true)", [deposito, operaio]);
    const corsia = uuid(501), zonaEsterna = uuid(502);
    await db.query("insert into warehouse_sections values ($1,$2,$3,'Corsia A · Scaffale 4'), ($4,$5,$6,'Zona riservata')",
      [corsia, azienda, deposito, zonaEsterna, esterna, depositoEsterno]);
    await db.query("update warehouse_stock set section_id=$1 where id=$2", [corsia, tubo]);
    await db.query("update warehouse_stock set section_id=$1 where id=$2", [zonaEsterna, cemento]);
    await db.query(`insert into warehouse_stock(id,company_id,warehouse_id,name,quantity,quantity_reserved,section_id)
      select ('00000000-0000-4000-8000-' || lpad((600+i)::text,12,'0'))::uuid, $1, $2,
        'Articolo riservato ' || i, 2, 2, $3 from generate_series(1,62) i`, [azienda, deposito, corsia]);

    const rows = await come(operaio, "select * from campo_magazzino_inventario_dettaglio($1,'scaffale 4',0,true)", [azienda]);
    expect(rows).toEqual([{
      id: tubo, name: "Tubo", description: null, internal_code: "TB-12", unita_misura: "m", disponibile: "8",
      warehouse_id: deposito, magazzino: "Deposito nord", ubicazione: "Corsia A · Scaffale 4",
    }]);
    expect(await come(operaio, "select id from campo_magazzino_inventario_dettaglio($1,'deposito nord',0,false)", [azienda])).toHaveLength(60);
    expect(await come(operaio, "select id from campo_magazzino_inventario_dettaglio($1,'deposito sud',0,false)", [azienda])).toEqual([]);
    expect(await come(collega, "select ubicazione from campo_magazzino_inventario_dettaglio($1,'cemento',0,true)", [azienda]))
      .toEqual([{ ubicazione: null }]);
    await expect(come(operaio, "select * from campo_magazzino_inventario_dettaglio($1,'',0,true)", [esterna]))
      .rejects.toThrow(/non autorizzato/i);
    expect(await db.query("select has_function_privilege('anon','public.campo_magazzino_inventario_dettaglio(uuid,text,integer,boolean)','execute') as esposto"))
      .toMatchObject({ rows: [{ esposto: false }] });
  });

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

  it("conferma più materiali con un unico prelievo anche dopo il reinvio", async () => {
    const viti = uuid(530);
    await db.query("update companies set magazzino_prelievo_conferma=false where id=$1", [azienda]);
    await db.query("insert into warehouse_stock(id,company_id,warehouse_id,name,quantity,unita_misura) values($1,$2,$3,'Viti',12,'pz')",
      [viti, azienda, deposito]);
    const righe = [{ stock_item_id: tubo, quantita: 1.25 }, { stock_item_id: viti, quantita: 3 }];
    expect(await registra({ righe })).toEqual({ id: richiesta, stato: "consegnato" });
    expect(await registra({ righe })).toEqual({ id: richiesta, stato: "consegnato" });
    expect(await giacenza(tubo)).toBe(8.75);
    expect(await giacenza(viti)).toBe(9);
    expect(await db.query("select stock_item_id, quantity from warehouse_movements order by stock_item_id"))
      .toMatchObject({ rows: [{ stock_item_id: tubo, quantity: "1.25" }, { stock_item_id: viti, quantity: "3" }] });
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

  it("riepiloga in metri consegne e residuo del cantiere anche prima dei rapportini", async () => {
    const leggi = () => come(operaio, "select * from campo_materiali_cantiere($1,$2,0)", [azienda, cantiere]);
    const atteso = { stock_item_id: tubo, nome: "Tubo", unita_misura: "m", consegnato: "2.25", residuo: "2.25" };
    await registra({ righe: [{ stock_item_id: tubo, quantita: 2.25 }] });
    expect(await leggi()).toEqual([]);
    await come(admin, "select prelievo_campo_approva($1)", [richiesta]);
    expect(await leggi()).toEqual([atteso]);

    const rigaOrdine = uuid(401);
    await db.query("insert into order_items values ($1,$2,$3)", [rigaOrdine, cantiere, tubo]);
    await db.query(`insert into warehouse_movements
      (stock_item_id,movement_type,quantity,performed_by,company_id,warehouse_id,order_id,notes,order_item_id,rientro_commessa)
      values ($1,'carico',0.25,$2,$3,$4,$5,'Reso',$6,true),
             ($1,'carico',8,$2,$3,$4,$5,'Arrivo fornitore',$6,false),
             ($1,'scarico',9,$2,$3,$4,$5,'Divisione tra le fasi: ripartito',$6,false)`,
      [tubo, admin, azienda, deposito, cantiere, rigaOrdine]);
    await db.query("insert into campo_rapportini values ($1,$2,$3,'approvato',$4::jsonb), ($1,$2,$3,'inviato',$5::jsonb)",
      [cantiere, azienda, collega, JSON.stringify([
        { stock_item_id: tubo, order_item_id: rigaOrdine, quantita: 0.5, unita: "m" },
        { order_item_id: rigaOrdine, quantita: "0,25", unita: "m" },
      ]), JSON.stringify([{ stock_item_id: tubo, quantita: 2, unita: "m" }])]);
    expect(await leggi()).toEqual([{ ...atteso, residuo: "1.25" }]);
    await db.query("insert into campo_rapportini values ($1,$2,$3,'approvato',$4::jsonb)",
      [cantiere, azienda, collega, JSON.stringify([{ stock_item_id: tubo, quantita: 1, unita: "kg" }])]);
    expect(await leggi()).toEqual([{ ...atteso, residuo: null }]);
  });

  it("mostra il riepilogo ai soli operai autorizzati al cantiere e al magazzino", async () => {
    await db.query("insert into warehouse_assignments values ($1, $2, true)", [deposito, operaio]);
    await db.query(`insert into warehouse_movements
      (stock_item_id,movement_type,quantity,performed_by,company_id,warehouse_id,order_id)
      values ($1,'scarico',2.25,$3,$4,$5,$7), ($2,'scarico',1,$3,$4,$6,$7)`,
      [tubo, cemento, admin, azienda, deposito, secondario, cantiere]);
    const leggi = (utente: string, aziendaId: string, cantiereId: string) =>
      come(utente, "select stock_item_id from campo_materiali_cantiere($1,$2,0)", [aziendaId, cantiereId]);
    expect(await leggi(operaio, azienda, cantiere)).toEqual([{ stock_item_id: tubo }]);
    await expect(leggi(collega, azienda, cantiere)).rejects.toThrow(/non accessibili/);
    await expect(leggi(operaio, azienda, nonAssegnato)).rejects.toThrow(/non accessibili/);
    await expect(leggi(operaio, esterna, cantiereEsterno)).rejects.toThrow(/non accessibili/);
    await db.query("update staff_permissions set magazzino_campo = 'inventario' where user_id = $1", [operaio]);
    expect(await leggi(operaio, azienda, cantiere)).toEqual([{ stock_item_id: tubo }]);
    await db.query("update staff_permissions set magazzino_campo = 'nessuno' where user_id = $1", [operaio]);
    await expect(leggi(operaio, azienda, cantiere)).rejects.toThrow(/non accessibili/);
  });
});
