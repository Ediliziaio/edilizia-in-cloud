import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";

const id = (n: number) => `76000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [company, other, generale, unitaA, unitaB, fuoriOperazione, upload, voce, aCorpo, utente] = Array.from({ length: 10 }, (_, i) => id(i + 1));
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select '${utente}'::uuid$$;
    create function public.utente_bloccato() returns boolean language sql as $$select false$$;
    create function public.materiali_puo(text,uuid) returns boolean language sql as $$select $2 = '${company}'::uuid$$;
    create function public.can_see_order(uuid,uuid,uuid) returns boolean language sql as $$select $1 <> '${fuoriOperazione}'::uuid$$;
    create table companies (id uuid primary key);
    create table orders (id uuid primary key, company_id uuid, commessa_generale_id uuid, workflow_kind text,
      assigned_to uuid, destination_warehouse_id uuid, deleted_at timestamptz);
    create table computo_uploads (id uuid primary key default gen_random_uuid(), order_id uuid, company_id uuid, uploaded_by uuid,
      titolo text, file_name text, file_type text, file_size bigint, storage_path text, extraction_status text, extraction_method text,
      stato text, totale_calcolato numeric, variante_di uuid);
    create table computo_voci_estratte (id uuid primary key default gen_random_uuid(), computo_upload_id uuid not null references computo_uploads(id) on delete cascade,
      ordine integer, numero_ordine text, codice_voce text, codice_tariffa text, codice_prezzario text,
      company_id uuid, descrizione_breve text, descrizione_estesa text, unita_misura text, quantita numeric(14,4),
      prezzo_unitario_computo numeric, importo_computo numeric, super_categoria text, categoria text, sotto_categoria text,
      capitolo_numero integer, capitolo_nome text, is_sicurezza boolean, a_corpo boolean not null default false,
      is_included boolean, is_detrazione boolean not null default false, warnings text[], matched_tariffa_id uuid,
      matched_template_id uuid, quadro_voce text, voce_origine_id uuid);
    create table order_work_phase_voci (id uuid default gen_random_uuid(), order_id uuid, company_id uuid, origine text, origine_id uuid);
    create table order_work_phases (id uuid primary key, order_id uuid, name text);
    create table order_items (id uuid, order_id uuid, chiave_materiale text, computo_voce_id uuid);
    grant select, insert, update on computo_uploads, computo_voci_estratte to authenticated;
  `);
  for (const patch of ["20290418200000_materiali_proposti_dal_computo", "20290507120000_operazione_materiali_ripartizione"]) {
    await db.exec(readFileSync(`supabase/migrations/${patch}.sql`, "utf8"));
  }
}, 60000);

beforeEach(async () => {
  await db.exec(`
    reset role;
    truncate companies, orders, computo_uploads, computo_voci_estratte, order_work_phase_voci, order_work_phases,
      order_items, materiali_proposti, computo_ripartizioni;
    insert into companies values ('${company}'), ('${other}');
    insert into orders(id,company_id,commessa_generale_id,workflow_kind) values
      ('${generale}','${company}',null,'generale'), ('${unitaA}','${company}','${generale}','commessa'),
      ('${unitaB}','${company}','${generale}','commessa'), ('${fuoriOperazione}','${other}',null,'commessa');
    insert into computo_uploads (id,order_id,company_id,uploaded_by,titolo,file_name,file_type,file_size,storage_path,extraction_status,stato)
     values ('${upload}','${generale}','${company}','${utente}','Computo delle opere','originale.xlsx','xlsx',300,'orig/originale.xlsx','completed','verificato');
    insert into computo_voci_estratte(id,computo_upload_id,company_id,descrizione_breve,unita_misura,quantita,prezzo_unitario_computo,importo_computo,a_corpo)
     values ('${voce}','${upload}','${company}','Pavimento','m²',100,7,700,false),
       ('${aCorpo}','${upload}','${company}','Collaudo','a corpo',1,250,250,true);
    set role authenticated;
  `);
});
afterAll(async () => { await db?.close(); });

const salva = async (dest: string, quote: Record<string, number>) => (await db.query<{ computo: string }>(
  "select computo_ripartizione_salva($1,$2,$3,$4::jsonb) as computo", [generale, upload, dest, JSON.stringify(quote)],
)).rows[0].computo;
const elenco = async () => (await db.query<{ quote: Record<string, { assegnato: number; destinazioni: Record<string, { quantita: number; computo_id: string }> }> }>(
  "select computo_ripartizione_elenco($1,$2) as quote", [generale, upload],
)).rows[0].quote;

it("ripartisce le quantità tra generale e unità, mantiene l’originale e ripete la stessa richiesta senza doppioni", async () => {
  const copiaA = await salva(unitaA, { [voce]: 42.5 });
  const copiaB = await salva(unitaB, { [voce]: 30 });
  await salva(generale, { [voce]: 12.5, [aCorpo]: 1 });
  expect(await salva(unitaA, { [voce]: 42.5 })).toBe(copiaA);
  const quote = await elenco();
  expect(quote[voce].assegnato).toBe(85);
  expect(quote[voce].destinazioni[unitaB]).toEqual({ quantita: 30, computo_id: copiaB });
  const { rows } = await db.query("select computo_upload_id, quantita, importo_computo, voce_origine_id from computo_voci_estratte where id=$1 or computo_upload_id=$2 order by quantita", [voce, copiaA]);
  expect(rows).toEqual([
    { computo_upload_id: copiaA, quantita: "42.5000", importo_computo: "297.50", voce_origine_id: voce },
    { computo_upload_id: upload, quantita: "100.0000", importo_computo: "700", voce_origine_id: null },
  ]);
  expect((await db.query("select storage_path,ripartito from computo_uploads where id=$1", [upload])).rows).toEqual([{ storage_path: "orig/originale.xlsx", ripartito: true }]);
});

it("rifiuta eccedenze, voci a corpo frazionate e destinazioni estranee senza lasciare quote parziali", async () => {
  await salva(unitaA, { [voce]: 70 });
  await expect(salva(unitaB, { [voce]: 31, [aCorpo]: 1 })).rejects.toThrow("Quota oltre il residuo");
  await expect(salva(unitaB, { [voce]: 10, [aCorpo]: 0.5 })).rejects.toThrow("a corpo");
  await expect(salva(fuoriOperazione, { [voce]: 15 })).rejects.toThrow();
  expect((await elenco())[voce].assegnato).toBe(70);
  expect((await elenco())[aCorpo]).toBeUndefined();
  expect((await db.query("select id from computo_uploads where order_id=$1", [unitaB])).rows).toHaveLength(0);
});

it("espone la coda per la destinazione e protegge la quota già usata nelle proposte", async () => {
  const copia = await salva(unitaA, { [voce]: 40 });
  await expect(db.query("update computo_uploads set ripartito=false where id=$1", [upload])).rejects.toThrow("ripartizione");
  await expect(db.query("update computo_voci_estratte set quantita=30 where id=$1", [voce])).rejects.toThrow("quote assegnate");
  const righe = JSON.stringify([{ chiave: "pavimento", descrizione: "Gres", quantita_calcolata: 40, unita_misura: "m²" }]);
  await expect(db.query("select materiali_proponi($1,$2::jsonb,$3)", [generale, righe, upload])).rejects.toThrow("computo è ripartito");
  await db.query("select materiali_proponi($1,$2::jsonb,$3)", [unitaA, righe, copia]);
  expect((await db.query("select * from materiali_proposti_operazione($1)", [generale])).rows)
    .toEqual([{ order_id: unitaA, phase_id: null, fase: null, n: 1 }]);
  await expect(salva(unitaA, { [voce]: 45 })).rejects.toThrow("già in uso");
});

it("libera le quote rimosse e restituisce l’originale dopo la rimozione dell’ultima quota", async () => {
  await salva(unitaA, { [voce]: 40 });
  await salva(unitaA, { [voce]: 0 });
  expect(await elenco()).toEqual({});
  expect((await db.query("select ripartito from computo_uploads where id=$1", [upload])).rows).toEqual([{ ripartito: false }]);
});
