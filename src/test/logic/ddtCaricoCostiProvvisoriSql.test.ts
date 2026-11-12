// 12/11/2026 — bolla → magazzino → commessa → fattura, sul database vero
// (PGlite) con le migrazioni del progetto e 20290313200000.
//   1. la conferma delle consegne segna la bolla «caricata in magazzino»;
//   4. una fattura parziale dà il prezzo unitario alla riga senza prezzo,
//      e un prezzo diverso già sulla bolla non si sovrascrive in silenzio;
//   5. lo scarico uscito a costo provvisorio prende il medio quando arriva il
//      prezzo, e il margine della commessa viene ricalcolato;
//   6. il medio che non si ricalcola lascia scritto il perché.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [c, u, o, s, d, r, f, wh] = [1, 2, 3, 4, 5, 6, 7, 8].map(id);
const r2 = id(9);
const migrazione = (n: string) => readFileSync(`supabase/migrations/${n}`, "utf8");
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(readFileSync("src/test/fixtures/ddt_documenti_base.sql", "utf8"));
  await db.exec(`create function utente_sola_lettura(c uuid) returns boolean language sql stable as $$select false$$;`);
  for (const n of [
    "20290214100000_ddt_documenti_persistenti.sql",
    "20290214110000_ddt_consegne_materiali.sql",
    "20290214120000_ddt_prezzi_da_fattura.sql",
    "20290214130000_ddt_acquisizione_rifiniture.sql",
    "20290214140000_ddt_compatibilita_righe.sql",
    "20290214150000_ddt_valorizzazione_tenant.sql",
    "20290214160000_ddt_prezzi_magazzino.sql",
  ])
    await db.exec(migrazione(n));
  // Quel che in produzione c'è già e la migrazione dà per scontato.
  await db.exec(`
    alter table fatture_ricevute add column tipo_documento text;
    alter table warehouse_movements add column rientro_commessa boolean default false;
    create function magazzino_prezzo_acquisto_riga(r uuid, q numeric) returns numeric language sql as $$select null::numeric$$;
    create table fattura_ddt_quantita(id uuid primary key default gen_random_uuid(),company_id uuid,fattura_id uuid,ddt_riga uuid,quantita_ddt numeric,rettifica_di uuid);
    -- Copia di produzione (12/11/2026).
    create function fattura_ddt_consumi(p_company uuid, p_ddt uuid[], p_escludi uuid default null)
     returns table(fattura_id uuid, riga_id uuid, ddt_id uuid, quantita numeric) language sql stable as $f$
     with base as (
      select q.fattura_id,q.ddt_riga riga_id,r.ddt_ricezione_id ddt_id,sum(q.quantita_ddt) quantita
      from fattura_ddt_quantita q join ddt_righe r on r.id=q.ddt_riga and r.company_id=q.company_id
      where q.company_id=p_company and r.ddt_ricezione_id=any(p_ddt) and q.rettifica_di is null and q.fattura_id is distinct from p_escludi group by 1,2,3
      union all
      select v.fattura_id,v.riga_id,v.ddt_id,v.quantita from ddt_valorizzazioni v
      where v.company_id=p_company and v.ddt_id=any(p_ddt) and v.fattura_id is distinct from p_escludi
     ), storni as (
      select a.fattura_id,a.ddt_riga,sum(s.quantita_ddt) quantita from fattura_ddt_quantita s
      join fattura_ddt_quantita a on a.id=s.rettifica_di and a.company_id=s.company_id
      where s.company_id=p_company and s.fattura_id is distinct from p_escludi group by 1,2
     ) select b.fattura_id,b.riga_id,b.ddt_id,greatest(0,max(b.quantita)-coalesce(s.quantita,0))
     from base b left join storni s on s.fattura_id=b.fattura_id and s.ddt_riga=b.riga_id group by 1,2,3,s.quantita $f$;`);
  await db.exec(migrazione("20290313200000_ddt_carico_e_costi_provvisori.sql"));
  // Trigger di produzione: snapshot del costo e margine della commessa
  // (ordine_margine_valuta qui annota soltanto chi l'ha chiamata).
  await db.exec(`
    create trigger trg_warehouse_movement_snapshot_unit_cost before insert on warehouse_movements
     for each row execute function warehouse_movement_snapshot_unit_cost();
    create table margini_ricalcolati(order_id uuid, causa text);
    create function ordine_margine_valuta(p uuid, causa text) returns void language sql as $$insert into margini_ricalcolati values(p,causa)$$;
    create function tg_ordine_margine_istruzione() returns trigger language plpgsql as $f$
    declare v_ord uuid;
    begin
      if tg_op='UPDATE' then
        for v_ord in select n.order_id from nuove n where n.order_id is not null union select v.order_id from vecchie v where v.order_id is not null loop
          perform ordine_margine_valuta(v_ord,'un movimento di magazzino');
        end loop;
      end if;
      return null;
    end $f$;
    create trigger trg_margine_commessa_upd after update on warehouse_movements
     referencing old table as vecchie new table as nuove for each statement execute function tg_ordine_margine_istruzione();
    -- Il costo materiali della commessa come lo legge v_ordine_marginalita.
    create view costo_commessa as select order_id, sum(quantity*coalesce(unit_cost,0)) costo
     from warehouse_movements where movement_type='scarico' and order_id is not null group by order_id;`);
}, 60000);

beforeEach(async () => {
  await db.exec(`truncate margini_ricalcolati,ddt_valorizzazioni,fattura_ddt,fatture_ricevute,ddt_consegne,ddt_operazioni_consegna,ddt_document_jobs,ddt_righe,ddt_ricezione,purchase_order_items,purchase_orders,order_items,warehouse_movements,warehouse_stock,warehouses,orders,suppliers,profiles,companies cascade;
select set_config('test.user','${u}',false),set_config('test.company','${c}',false),set_config('test.office','true',false),set_config('test.blocked','false',false);
insert into companies values('${c}');insert into profiles values('${u}');insert into orders values('${o}','${c}',null);insert into suppliers values('${s}','${c}','08236870963');
insert into warehouses values('${wh}','${c}');
insert into ddt_ricezione(id,company_id,supplier_id,numero_ddt,data_ricezione,destinazione,warehouse_id) values('${d}','${c}','${s}','B-1','2026-11-10','magazzino','${wh}');
insert into ddt_righe(id,ddt_ricezione_id,company_id,descrizione,quantita,unita_misura) values('${r}','${d}','${c}','Tubo',10,'pz'),('${r2}','${d}','${c}','Raccordo',4,'pz');
insert into fatture_ricevute(id,company_id,fornitore_id,numero_fattura) values('${f}','${c}','${s}','FT-1');`);
});
afterAll(async () => {
  await db?.close();
});

const conferma = (op: number, righe: Array<{ riga: string; q: number }>) =>
  db.query("select ddt_conferma_consegna($1,$2,$3::jsonb)", [
    id(op),
    d,
    JSON.stringify(
      righe.map((x) => ({ riga_id: x.riga, quantita: x.q, destinazione: "magazzino", warehouse_id: wh, crea_articolo: true })),
    ),
  ]);
const valorizza = (righe: Array<{ riga: string; q: number; p: number }>, fattura = f) =>
  db
    .query<{ v: { righe: number; prezzi_diversi: Array<Record<string, unknown>> } }>(
      "select ddt_valorizza_da_fattura($1,$2,$3::jsonb) v",
      [d, fattura, JSON.stringify(righe.map((x) => ({ riga_id: x.riga, quantita: x.q, prezzo_unitario: x.p })))],
    )
    .then((x) => x.rows[0].v);
const caricata = async () =>
  (await db.query<{ at: string | null }>("select caricata_a_magazzino_at at from ddt_ricezione")).rows[0].at;
const articolo = async (nome: string) =>
  (
    await db.query<{ id: string; costo: number; da_definire: boolean; sospeso: string | null }>(
      "select id,unit_cost::float8 costo,prezzo_da_definire da_definire,costo_ricalcolo_sospeso sospeso from warehouse_stock where name=$1",
      [nome],
    )
  ).rows[0];
/** Uno scarico verso la commessa come lo fanno register_warehouse_uscita & co.: senza costo. */
const scarica = async (stock: string, q: number) => {
  await db.exec(
    `insert into warehouse_movements(company_id,warehouse_id,stock_item_id,quantity,movement_type,order_id,created_at) values('${c}','${wh}','${stock}',${q},'scarico','${o}',now()+interval '1 minute');update warehouse_stock set quantity=quantity-${q} where id='${stock}'`,
  );
};

it("la conferma delle consegne segna la bolla caricata solo quando non resta niente da caricare", async () => {
  await conferma(81, [{ riga: r, q: 10 }]);
  expect(await caricata()).toBeNull();
  await conferma(82, [{ riga: r2, q: 3 }]);
  expect(await caricata()).toBeNull();
  await conferma(83, [{ riga: r2, q: 1 }]);
  expect(await caricata()).not.toBeNull();
});

it("in una bolla per il cantiere, la riga mandata in magazzino basta per la data del carico", async () => {
  await db.exec("update ddt_ricezione set destinazione='cantiere'");
  await conferma(81, [{ riga: r, q: 10 }]);
  expect(await caricata()).not.toBeNull();
});

it("carico senza prezzo → scarico provvisorio → fattura parziale → scarico rivalutato e margine rifatto", async () => {
  await conferma(81, [
    { riga: r, q: 10 },
    { riga: r2, q: 4 },
  ]);
  const tubo = await articolo("Tubo");
  expect(tubo).toMatchObject({ costo: 0, da_definire: true });

  await scarica(tubo.id, 4);
  const scarico = (
    await db.query<{ costo: number; provvisorio: boolean }>(
      "select unit_cost::float8 costo,costo_provvisorio provvisorio from warehouse_movements where movement_type='scarico'",
    )
  ).rows;
  expect(scarico).toEqual([{ costo: 0, provvisorio: true }]);
  expect((await db.query("select costo::float8 from costo_commessa")).rows).toEqual([{ costo: 0 }]);

  // La fattura copre 6 tubi su 10: il prezzo è unitario, vale per tutta la riga.
  const esito = await valorizza([{ riga: r, q: 6, p: 2.5 }]);
  expect(esito.prezzi_diversi).toEqual([]);
  expect(
    (await db.query("select prezzo_unitario::float8 p,importo::float8 i from ddt_righe where id=$1", [r])).rows,
  ).toEqual([{ p: 2.5, i: 25 }]);
  expect(await articolo("Tubo")).toMatchObject({ costo: 2.5, da_definire: false, sospeso: null });
  expect(
    (
      await db.query(
        "select unit_cost::float8 costo,costo_provvisorio provvisorio from warehouse_movements where movement_type='scarico'",
      )
    ).rows,
  ).toEqual([{ costo: 2.5, provvisorio: false }]);
  expect((await db.query("select costo::float8 from costo_commessa")).rows).toEqual([{ costo: 10 }]);
  expect((await db.query("select order_id from margini_ricalcolati")).rows).toContainEqual({ order_id: o });

  // Una seconda fattura parziale affina il prezzo con la media ponderata.
  const f2 = id(70);
  await db.exec(`insert into fatture_ricevute(id,company_id,fornitore_id,numero_fattura) values('${f2}','${c}','${s}','FT-2')`);
  await valorizza([{ riga: r, q: 2, p: 4.5 }], f2);
  expect((await db.query("select prezzo_unitario::float8 p from ddt_righe where id=$1", [r])).rows).toEqual([{ p: 3 }]);
  expect(await articolo("Tubo")).toMatchObject({ costo: 3, da_definire: false });
  // Lo scarico non è più provvisorio: il secondo prezzo non lo rimuove.
  expect((await db.query("select costo::float8 from costo_commessa")).rows).toEqual([{ costo: 10 }]);
});

it("un prezzo diverso già sulla bolla non si sovrascrive con una fattura parziale, e lo dice", async () => {
  await db.exec(`update ddt_righe set prezzo_unitario=2 where id='${r}'`);
  const esito = await valorizza([{ riga: r, q: 6, p: 2.5 }]);
  expect(esito.prezzi_diversi).toEqual([
    { riga_id: r, descrizione: "Tubo", prezzo_bolla: 2, prezzo_fattura: 2.5, sostituito: false },
  ]);
  expect((await db.query("select prezzo_unitario::float8 p from ddt_righe where id=$1", [r])).rows).toEqual([{ p: 2 }]);
  // A copertura piena vince la fattura, come prima, e la differenza torna indietro.
  const f2 = id(70);
  await db.exec(`insert into fatture_ricevute(id,company_id,fornitore_id,numero_fattura) values('${f2}','${c}','${s}','FT-2')`);
  const piena = await valorizza([{ riga: r, q: 4, p: 2.5 }], f2);
  expect(piena.prezzi_diversi).toEqual([
    { riga_id: r, descrizione: "Tubo", prezzo_bolla: 2, prezzo_fattura: 2.5, sostituito: true },
  ]);
  expect((await db.query("select prezzo_unitario::float8 p from ddt_righe where id=$1", [r])).rows).toEqual([{ p: 2.5 }]);
});

it("uno scarico con il costo già noto non è provvisorio, e nemmeno un rientro", async () => {
  await db.exec(
    `insert into warehouse_stock(id,company_id,warehouse_id,name,quantity,unit_cost,unita_misura) values('${id(60)}','${c}','${wh}','Noto',5,7,'pz');
     insert into warehouse_movements(company_id,stock_item_id,quantity,movement_type,order_id) values('${c}','${id(60)}',1,'scarico','${o}');
     insert into warehouse_stock(id,company_id,warehouse_id,name,quantity,unit_cost,prezzo_da_definire,unita_misura) values('${id(61)}','${c}','${wh}','Ignoto',5,0,true,'pz');
     insert into warehouse_movements(company_id,stock_item_id,quantity,movement_type,order_id,rientro_commessa) values('${c}','${id(61)}',1,'scarico','${o}',true);
     insert into warehouse_movements(company_id,stock_item_id,quantity,movement_type,order_id,unit_cost) values('${c}','${id(61)}',1,'scarico','${o}',0);`,
  );
  expect(
    (
      await db.query(
        "select s.name,m.unit_cost::float8 costo,m.costo_provvisorio p,m.rientro_commessa rientro from warehouse_movements m join warehouse_stock s on s.id=m.stock_item_id order by s.name,m.rientro_commessa",
      )
    ).rows,
  ).toEqual([
    { name: "Ignoto", costo: 0, p: true, rientro: false },
    { name: "Ignoto", costo: 0, p: false, rientro: true },
    { name: "Noto", costo: 7, p: false, rientro: false },
  ]);
});

it("quando lo storico non torna con la giacenza il medio resta fermo ma il motivo si vede", async () => {
  await conferma(81, [{ riga: r, q: 10 }]);
  const tubo = await articolo("Tubo");
  await scarica(tubo.id, 4);
  await db.exec(`update warehouse_stock set quantity=99 where id='${tubo.id}'`);
  await valorizza([{ riga: r, q: 10, p: 2.5 }]);
  expect(await articolo("Tubo")).toMatchObject({
    costo: 0,
    da_definire: true,
    sospeso: "la somma dei movimenti (6) non coincide con la giacenza (99)",
  });
  expect(
    (await db.query("select costo_provvisorio p from warehouse_movements where movement_type='scarico'")).rows,
  ).toEqual([{ p: true }]);
  // Rimessa a posto la giacenza, il prossimo prezzo sblocca tutto e cancella il motivo.
  await db.exec(`update warehouse_stock set quantity=6 where id='${tubo.id}';update ddt_righe set prezzo_unitario=3 where id='${r}'`);
  expect(await articolo("Tubo")).toMatchObject({ costo: 3, da_definire: false, sospeso: null });
  expect((await db.query("select costo::float8 from costo_commessa")).rows).toEqual([{ costo: 12 }]);
});
