import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { proponiRitardoCronoprogramma, type DatiCronoprogramma } from "../../../shared/piano-cantiere/ritardo";
import { leggiRitardoCronoprogramma } from "../../../supabase/functions/whatsapp-ai-processor/ritardoCronoprogramma";

const dati: DatiCronoprogramma = {
  versione: "iniziale",
  commessa: { titolo: "SIM-S1", inizio: "2026-11-16", fine: "2026-11-25", indirizzo: null },
  fasi: [
    { id: "posa", nome: "Posa serramenti", inizio: "2026-11-16", fine: "2026-11-20", stato: "in_corso", percentuale: 40, completata_il: null },
    { id: "parallela", nome: "Verifica strutturale", inizio: "2026-11-19", fine: "2026-11-26", stato: "in_corso", percentuale: 5, completata_il: null },
    { id: "finiture", nome: "Finiture", inizio: "2026-11-23", fine: "2026-11-24", stato: "da_fare", percentuale: 0, completata_il: null },
    { id: "collaudo", nome: "Collaudo", inizio: "2026-11-25", fine: "2026-11-25", stato: "da_iniziare", percentuale: 0, completata_il: null },
    { id: "lontana", nome: "Ritocchi", inizio: "2026-12-02", fine: "2026-12-02", stato: "da_iniziare", percentuale: 0, completata_il: null },
  ],
  sottofasi: [{ id: "sigilli", fase: "finiture", inizio: "2026-11-23", fine: "2026-11-23", iniziata: false }],
};

describe("Ritardo da WhatsApp", () => {
  it("legge la fine della commessa o una fase detta a voce", () => {
    expect(leggiRitardoCronoprogramma("Finiamo in ritardo di 3 giorni al cantiere Rossi.")).toEqual({
      richiesta: { giorni: 3, fase: null, cantiere: "Rossi", solari: false },
    });
    expect(leggiRitardoCronoprogramma("Finiamo la fase Impianto elettrico con tre giorni di calendario di ritardo")).toEqual({
      richiesta: { giorni: 3, fase: "Impianto elettrico", cantiere: null, solari: true },
    });
    expect(leggiRitardoCronoprogramma("Finiamo tre giorni in ritardo")).toMatchObject({ richiesta: { giorni: 3, fase: null } });
    expect(leggiRitardoCronoprogramma("Finiamo in ritardo")).toHaveProperty("errore");
    expect(leggiRitardoCronoprogramma("Finiamo in ritardo di 3,5 giorni")).toHaveProperty("errore");
    expect(leggiRitardoCronoprogramma("Il fornitore è in ritardo di 3 giorni")).toBeNull();
    expect(leggiRitardoCronoprogramma("Finiamo in ritardo di 3 giorni?")).toBeNull();
  });

  it("spinge la sequenza in conflitto e le sue sottofasi", () => {
    expect(proponiRitardoCronoprogramma(dati, { giorni: 3, fase: "serramenti", solari: false })).toMatchObject({
      piano: { fine: "2026-12-02", fasi: [
        { id: "posa", inizio: "2026-11-16", fine: "2026-11-25" },
        { id: "finiture", inizio: "2026-11-26", fine: "2026-11-27" },
        { id: "collaudo", inizio: "2026-11-30", fine: "2026-11-30" },
      ], sottofasi: [{ id: "sigilli", inizio: "2026-11-26", fine: "2026-11-26" }] },
    });
  });

  it("usa le chiusure aziendali e tratta il ritardo globale come nuova fine lavori", () => {
    const chiuso = { ...dati, festivita: [{ data: "2026-12-03" }] };
    expect(proponiRitardoCronoprogramma(chiuso, { giorni: 2, fase: null, solari: false })).toMatchObject({
      finePrima: "2026-12-02", piano: { fine: "2026-12-07", fasi: [], sottofasi: [] },
    });
    const avviata = { ...dati, sottofasi: [{ ...dati.sottofasi[0], iniziata: true }] };
    expect(proponiRitardoCronoprogramma(avviata, { giorni: 3, fase: "serramenti", solari: false })).toMatchObject({
      daVerificare: ["Finiture"], piano: { sottofasi: [] },
    });
  });

  it("aggiorna le date in una transazione e rifiuta replay, permessi mancanti e righe estranee", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;
        create table orders(id uuid primary key, company_id uuid, deleted_at timestamptz,
          status text, order_code text, description text, client_name text, work_start_date date, work_end_date date,
          expected_date date, indirizzo_lavori text, work_address text, updated_at timestamptz);
        create table staff_permissions(user_id uuid, company_id uuid, sola_lettura boolean);
        create table order_work_phases(id uuid primary key, order_id uuid references orders, company_id uuid, name text,
          start_date date, end_date date, status text, percentuale numeric, completata_il timestamptz, position integer, updated_at timestamptz);
        create table order_work_subphases(id uuid primary key, phase_id uuid references order_work_phases,
          data_inizio date, data_fine date, fatta boolean, iniziata_il timestamptz, giorni_lavorati integer, percentuale numeric, updated_at timestamptz);
        create table silvio_calendario(company_id uuid, sabato_lavorativo boolean, updated_by uuid, updated_at timestamptz);
        create table hr_festivita(company_id uuid, data date, ricorrente boolean);
        create table order_events(company_id uuid, order_id uuid, event_type text, actor_id uuid, payload jsonb);
        create function has_permission_for_company(uuid, text, uuid) returns boolean language sql as
          $$ select right($1::text, 1) = '1' and $2 = 'can_edit_orders' $$;
        create function silvio_commesse_visibili(uuid, uuid) returns table(id uuid) language sql as
          $$ select id from public.orders where company_id=$1 $$;
        grant all on all tables in schema public to service_role;
      `);
      const primaVersione = readFileSync("supabase/migrations/20290504125000_cronoprogramma_ritardo_whatsapp.sql", "utf8");
      await db.exec(primaVersione.replace("errcode='PT409'", "errcode='40001'"));
      await db.exec(readFileSync("supabase/migrations/20290504131000_cronoprogramma_ritardo_conflitto.sql", "utf8"));
      const uuid = (n: number) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
      const [azienda, utente, commessa, posa, finiture, sigilli, estranea] = [11, 21, 31, 41, 42, 43, 44].map(uuid);
      await db.query("insert into orders(id,company_id,status,work_end_date,expected_date) values($1,$2,'in_corso','2026-11-24','2026-11-26')", [commessa, azienda]);
      await db.query(`insert into order_work_phases(id,order_id,company_id,name,start_date,end_date,status,percentuale,position) values
        ($1,$2,$3,'Posa serramenti','2026-11-16','2026-11-20','in_corso',40,1),
        ($4,$2,$3,'Finiture','2026-11-23','2026-11-24','da_fare',0,2)`, [posa, commessa, azienda, finiture]);
      await db.query(`insert into order_work_subphases(id,phase_id,data_inizio,data_fine,fatta,giorni_lavorati,percentuale)
        values($1,$2,'2026-11-23','2026-11-23',false,0,0)`, [sigilli, finiture]);
      const altraAzienda = uuid(12);
      const altraCommessa = uuid(32);
      await db.query("insert into orders(id,company_id,status) values($1,$2,'in_corso')", [altraCommessa, altraAzienda]);
      await db.query(`insert into order_work_phases(id,order_id,company_id,name,start_date,end_date,status,percentuale,position)
        values($1,$2,$3,'Fase estranea','2026-11-23','2026-11-24','da_iniziare',0,1)`, [estranea, altraCommessa, altraAzienda]);
      const leggi = "select cronoprogramma_ritardo_whatsapp($1,$2,$3) as dati";
      const aggiorna = "select cronoprogramma_ritardo_whatsapp($1,$2,$3,$4::jsonb)";
      await db.exec("set role authenticated");
      await expect(db.query(leggi, [azienda, utente, commessa])).rejects.toMatchObject({ code: "42501" });
      await db.exec("set role service_role");
      await expect(db.query(leggi, [azienda, uuid(22), commessa])).rejects.toMatchObject({ code: "42501" });
      const lettura = await db.query<{ dati: DatiCronoprogramma }>(leggi, [azienda, utente, commessa]);
      const proposta = proponiRitardoCronoprogramma(lettura.rows[0].dati, { giorni: 3, fase: "Posa", solari: false });
      if ("errore" in proposta) throw new Error(proposta.errore);
      const piano = proposta.piano;
      const modificaInApp = "update orders set work_end_date=$1::date where id=$2";
      await db.query(modificaInApp, ["2026-11-25", commessa]);
      await expect(db.query(aggiorna, [azienda, utente, commessa, JSON.stringify(piano)])).rejects.toMatchObject({ code: "PT409" });
      await db.query(modificaInApp, ["2026-11-24", commessa]);
      const misto = { ...piano, fasi: [...piano.fasi, { id: estranea, inizio: "2026-11-26", fine: "2026-11-27" }] };
      await expect(db.query(aggiorna, [azienda, utente, commessa, JSON.stringify(misto)])).rejects.toMatchObject({ code: "22023" });
      expect((await db.query("select end_date::text from order_work_phases where id=$1", [posa])).rows[0]).toEqual({ end_date: "2026-11-20" });
      await db.query(aggiorna, [azienda, utente, commessa, JSON.stringify(piano)]);
      await expect(db.query(aggiorna, [azienda, utente, commessa, JSON.stringify(piano)])).rejects.toMatchObject({ code: "PT409" });
      expect((await db.query("select work_end_date::text, expected_date::text from orders where id=$1", [commessa])).rows[0])
        .toEqual({ work_end_date: "2026-11-27", expected_date: "2026-11-26" });
      expect((await db.query("select data_inizio::text from order_work_subphases where id=$1", [sigilli])).rows[0]).toEqual({ data_inizio: "2026-11-26" });
      expect((await db.query("select actor_id from order_events")).rows).toEqual([{ actor_id: utente }]);
    } finally {
      await db.close();
    }
  }, 15_000);
});
