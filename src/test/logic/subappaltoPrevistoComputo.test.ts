
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

function migrazione(nome: string) {
  return readFileSync(`supabase/migrations/${nome}.sql`, "utf8");
}

it("sostituisce la stima con i prezzi del computo, conta il corpo una sola volta e conserva il venduto", async () => {
  const db = new PGlite();
  const azienda = "00000000-0000-4000-a000-000000000001";
  const commessa = "00000000-0000-4000-a000-000000000002";
  const fase = "00000000-0000-4000-a000-000000000003";
  const ditta = "00000000-0000-4000-a000-000000000004";
  const squadra = "00000000-0000-4000-a000-000000000005";
  const scheda = "00000000-0000-4000-a000-000000000006";
  const voce = "00000000-0000-4000-a000-000000000007";
  const affidamento = "00000000-0000-4000-a000-000000000008";
  const contratto = "00000000-0000-4000-a000-000000000009";

  try {
    await db.exec(`
      create schema private;
      create role anon;
      create role authenticated;
      create table orders (id uuid primary key, company_id uuid);
      create table order_work_phases (id uuid primary key, order_id uuid);
      create table order_work_phase_voci (id uuid primary key, phase_id uuid, quantita numeric, descrizione text, importo numeric);
      create table subappaltatori (id uuid primary key, company_id uuid, ragione_sociale text);
      create table external_teams (
        id uuid primary key default gen_random_uuid(), company_id uuid, name text, kind text,
        is_active boolean, subappaltatore_id uuid, vat_rate numeric, created_at timestamptz default now()
      );
      create table order_external_teams (
        id uuid primary key default gen_random_uuid(), created_at timestamptz default now(), order_id uuid, phase_id uuid, external_team_id uuid, total_cost numeric, cost_preventivo numeric,
        cost_preventivo_manuale numeric, vat_rate numeric, costo_origine text, notes text, is_paid boolean
      );
      create table subappaltatori_sicurezza (id uuid primary key, company_id uuid, campo_subappaltatore_id uuid);
      create table contratti_subappalto (
        id uuid primary key, company_id uuid, order_id uuid, subappaltatore_id uuid, stato text,
        firmato_il timestamptz, elenco_lavori jsonb
      );
      create table subappalto_affidamenti (
        id uuid primary key, company_id uuid, order_id uuid, voce_id uuid, subappaltatore_id uuid, quantita numeric,
        prezzo_unitario numeric, origine_prezzo text, variante_id uuid, aggiornato_il timestamptz, stato text,
        contratto_id uuid references contratti_subappalto on delete set null
      );
      create table subappalto_quadri_lavori (contratto_id uuid);
      create table subappalto_misure (contratto_id uuid, stato text);
      create table sal_subappaltatori (contratto_id uuid, stato text, importo_lordo numeric);
      create function quantita_testo(numeric) returns text language sql as 'select $1::text';
    `);
    await db.exec(migrazione("20290419000000_subappalto_previsto_computo_a_corpo"));
    const allineamento = migrazione("20290213210000_subappalto_affidamenti");
    await db.exec(allineamento.slice(
      allineamento.indexOf("create or replace function public.affidamenti_dopo_inserimento"),
      allineamento.indexOf("create or replace function public.voce_cancellata"),
    ));
    const collegamenti = migrazione("20290216150000_subappalto_correzioni_revisione");
    await db.exec(collegamenti.slice(0, collegamenti.indexOf("-- 4. Contratto risolto:")));

    await db.exec(`
      insert into orders values ('${commessa}', '${azienda}');
      insert into order_work_phases values ('${fase}', '${commessa}');
      insert into order_work_phase_voci values ('${voce}', '${fase}', 10, 'Montaggio serramenti', 3000);
      insert into subappaltatori values ('${ditta}', '${azienda}', 'Ditta demo');
      insert into external_teams (id, company_id, is_active, subappaltatore_id, vat_rate)
      values ('${squadra}', '${azienda}', true, '${ditta}', 0);
      insert into subappaltatori_sicurezza values ('${scheda}', '${azienda}', '${ditta}');
      insert into order_external_teams (order_id, phase_id, external_team_id, cost_preventivo, costo_origine, vat_rate)
      values ('${commessa}', '${fase}', '${squadra}', 1000, 'listino', 0),
             ('${commessa}', '${fase}', '${squadra}', 700, 'listino', 0);
      insert into subappalto_affidamenti (id, company_id, order_id, voce_id, subappaltatore_id, quantita, prezzo_unitario, origine_prezzo, stato)
      values ('${affidamento}', '${azienda}', '${commessa}', '${voce}', '${ditta}', 10, 170, 'listino_ditta', 'bozza');
    `);
    async function previsto() {
      const { rows } = await db.query("select sum(cost_preventivo)::integer as prezzo from order_external_teams");
      return rows;
    }
    expect(await previsto()).toEqual([{ prezzo: 1700 }]);

    const rigaMisurata = { fase_id: fase, voce_id: voce, affidamento_id: affidamento, unita: "pz", quantita: 10, prezzo: 120, importo: 1200 };
    const rigaACorpo = { fase_id: fase, allinea_costo_previsto: true, unita: "a corpo", quantita: 1, prezzo: 340, importo: 340 };
    await db.query(
      "insert into contratti_subappalto (id, company_id, order_id, subappaltatore_id, stato, elenco_lavori) values ($1,$2,$3,$4,'bozza',$5)",
      [contratto, azienda, commessa, scheda, JSON.stringify([rigaMisurata, rigaACorpo])],
    );
    expect(await previsto()).toEqual([{ prezzo: 1540 }]);
    expect((await db.query("select cost_preventivo::integer as prezzo from order_external_teams order by cost_preventivo")).rows)
      .toEqual([{ prezzo: 0 }, { prezzo: 1540 }]);
    expect((await db.query("select importo::integer as venduto from order_work_phase_voci")).rows).toEqual([{ venduto: 3000 }]);
    expect((await db.query("select prezzo_unitario::integer as prezzo, stato from subappalto_affidamenti")).rows)
      .toEqual([{ prezzo: 120, stato: "a_contratto" }]);

    await db.query("update contratti_subappalto set elenco_lavori = elenco_lavori where id = $1", [contratto]);
    expect(await previsto()).toEqual([{ prezzo: 1540 }]);
    await db.query("update contratti_subappalto set elenco_lavori = $1 where id = $2", [JSON.stringify([rigaMisurata]), contratto]);
    expect(await previsto()).toEqual([{ prezzo: 1200 }]);
    await db.query("delete from contratti_subappalto where id = $1", [contratto]);
    await db.query("delete from subappalto_affidamenti where id = $1", [affidamento]);
    expect(await previsto()).toEqual([{ prezzo: 1700 }]);
    expect((await db.query("select cost_preventivo::integer as prezzo from order_external_teams order by cost_preventivo")).rows)
      .toEqual([{ prezzo: 700 }, { prezzo: 1000 }]);

    await db.query(
      "insert into contratti_subappalto (id, company_id, order_id, subappaltatore_id, stato, elenco_lavori) values ($1,$2,$3,$4,'bozza',$5)",
      [contratto, azienda, commessa, scheda, JSON.stringify([rigaACorpo])],
    );
    expect(await previsto()).toEqual([{ prezzo: 340 }]);
    await db.query("delete from contratti_subappalto where id = $1", [contratto]);
    expect(await previsto()).toEqual([{ prezzo: 1700 }]);
  } finally {
    await db.close();
  }
});
