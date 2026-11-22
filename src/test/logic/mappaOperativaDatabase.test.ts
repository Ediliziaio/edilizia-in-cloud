import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const id = (n: number) => `10000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const az = id(1), esterna = id(2), ufficio = id(3), commerciale = id(4), operaio = id(5), altro = id(6), esterno = id(7);
const ordine = id(10), altroOrdine = id(11), evento = id(12), eventoCollega = id(13), cal = id(14), cal2 = id(15);
const giorno = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const giorni = "array['Dom','Lun','Mar','Mer','Gio','Ven','Sab']";

async function ruolo(user: string) {
  await db.exec(`reset role; select set_config('mappa.uid','${user}',false); set role authenticated;`);
}

describe.sequential("migrazione Mappa operativa", () => {
  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    await db.exec(readFileSync("src/test/fixtures/mappaOperativaDatabase.sql", "utf8"));
    const migration = readFileSync("supabase/migrations/20290506163000_mappa_operativa_calendari.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(`
      insert into companies values('${az}'),('${esterna}');
      insert into profiles values
      ('${ufficio}','${az}','Ufficio','Demo',false,null),('${commerciale}','${az}','Ada','Vendite',false,null),
      ('${operaio}','${az}','Bruno','Operaio',false,null),('${altro}','${az}','Carla','Operaio',false,null),
      ('${esterno}','${esterna}','Esterna','Demo',false,null);
      insert into fixture_perms values
      ('${ufficio}','${az}','*'),('${commerciale}','${az}','can_view_marketing_appointments'),
      ('${commerciale}','${az}','only_assigned'),('${altro}','${az}','can_view_marketing_appointments'),
      ('${esterno}','${esterna}','*');
      delete from fixture_perms where permesso='*';
      insert into fixture_perms
      select t.uid,t.az,unnest(array['can_view_marketing_appointments','can_edit_marketing','can_view_calendar','can_edit_orders','can_view_orders',
        'can_view_persone','can_view_all_team_calendar','can_view_mezzi','amministratore']) from (values ('${ufficio}'::uuid,'${az}'::uuid),('${esterno}','${esterna}')) t(uid,az);
      insert into orders values
      ('${ordine}','${az}',null,'Via Demo 33',null,45.5,9.1,'${giorno}','${giorno}','07:00','09:00'),
      ('${altroOrdine}','${esterna}',null,'Via Esterna 9',null,45.6,9.3,'${giorno}','${giorno}','07:00','09:00');
      insert into order_campo_assignments values ('${az}','${ordine}','${operaio}','${giorno}','${giorno}',null);
      insert into marketing_calendars values
       ('${cal}','${az}','${commerciale}','personal',true,45.1,9,null,0,0),
       ('${cal2}','${az}','${altro}','personal',true,45.4,9.4,null,0,0);
      insert into marketing_calendar_availability
      select id,g,null,true,time '07:00',time '21:00' from marketing_calendars,generate_series(0,6) g;
      insert into appointments(id,company_id,calendar_id,assigned_to,appointment_date,appointment_time,appointment_end_time,formatted_address,lat,lng)
      values('${evento}','${az}','${cal}','${commerciale}','${giorno}','09:00','09:30','Via Uno 1',45.3,9.1),
      ('${eventoCollega}','${az}','${cal2}','${altro}','${giorno}','10:00','10:30','Via Due 2',45.8,9.1);
      insert into hr_sedi values('${id(21)}','${az}',45.7,9.2,true);
      insert into hr_profili values
      ('${id(22)}','${operaio}','${az}','Bruno','Operaio','${id(21)}','Elettricista','07:00','19:00',${giorni},null,null,true,true,null),
      ('${id(23)}','${altro}','${az}','Carla','Operaio','${id(21)}','Muratore','07:00','19:00',${giorni},null,null,true,true,null);
      insert into external_teams values ('${id(24)}','${az}',true,'interna','Squadra A');
      insert into squadre_componenti values ('${id(22)}','${az}','${id(24)}'),('${id(23)}','${az}','${id(24)}');
      insert into campo_timbrature(company_id,order_id,user_id,timestamp_evento,tipo,fonte) values
      ('${az}','${ordine}','${operaio}','${giorno} 08:00+01','entrata','app'),
      ('${az}','${ordine}','${operaio}','${giorno} 09:00+01','uscita','app'),
      ('${az}','${ordine}','${altro}','${giorno} 08:10+01','entrata','kiosk');
      insert into mezzi values ('${id(25)}','${az}','Furgone demo','km');
      insert into mezzi_viaggi(id,company_id,mezzo_id,created_by,partenza,arrivo,contatore_inizio,contatore_fine,stato)
      values ('${id(26)}','${az}','${id(25)}','${operaio}','${giorno} 08:00+01','${giorno} 09:00+01',100,132.4,'verificato'),
      ('${id(27)}','${az}','${id(25)}','${ufficio}','${giorno} 09:00+01','${giorno} 10:00+01',132.4,150,'bozza');
    `);
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  it("conserva una correzione manuale nei cambi orario e la invalida al cambio indirizzo, con autore", async () => {
    await ruolo(ufficio);
    await db.query("select mappa_salva_posizione($1,'appuntamento',$2,45.50,9.4,'manuale','Via Uno 1')", [az, evento]);
    await db.exec(`reset role; update appointments set appointment_time='09:15' where id='${evento}'; set role authenticated;`);
    expect((await db.query("select aggiornato_da, fonte from mappa_posizioni")).rows).toEqual([{ aggiornato_da: ufficio, fonte: "manuale" }]);
    await db.exec(`reset role; update appointments set formatted_address='Via Nuova 1' where id='${evento}'; set role authenticated;`);
    expect((await db.query("select * from mappa_posizioni")).rows).toEqual([]);
    await db.exec("reset role");
    expect((await db.query("select autore from private.mappa_posizioni_storico order by id")).rows).toEqual([{ autore: ufficio }, { autore: ufficio }]);
  });

  it("isola la lettura di pin, presenze, assegnati e chilometri per azienda e ruolo", async () => {
    await ruolo(ufficio);
    await db.query("select mappa_salva_posizione($1,'cantiere',$2,45.25,9.51,'manuale','Via Demo 33')", [az, ordine]);
    expect((await db.query("select tipo,fonte from mappa_presenze($1,$2,array[$3::uuid],false)", [az, giorno, ordine])).rows)
      .toEqual([{ tipo: "entrata", fonte: "App operaio" }, { tipo: "entrata", fonte: "Chiosco" }, { tipo: "uscita", fonte: "App operaio" }]);
    expect((await db.query("select nome from mappa_assegnati($1,$2,array[$3::uuid])", [az, giorno, ordine])).rows).toEqual([{ nome: "Bruno Operaio" }]);
    expect((await db.query("select mezzo,metri from mappa_km_effettivi($1,$2,false)", [az, giorno])).rows).toEqual([{ mezzo: "Furgone demo", metri: 32400 }]);
    await ruolo(operaio);
    expect((await db.query("select * from mappa_presenze($1,$2,array[$3::uuid],false)", [az, giorno, ordine])).rows).toHaveLength(2);
    expect((await db.query("select nome from mappa_assegnati($1,$2,array[$3::uuid])", [az, giorno, ordine])).rows).toHaveLength(0);
    await expect(db.query("select mappa_salva_posizione($1,'cantiere',$2,45,9,'manuale','Via Demo 33')", [az, ordine])).rejects.toMatchObject({ code: "42501" });
    await ruolo(esterno);
    expect((await db.query("select * from mappa_posizioni")).rows).toHaveLength(0);
    expect((await db.query("select * from mappa_km_effettivi($1,$2,false)", [az, giorno])).rows).toHaveLength(0);
    await expect(db.query("select mappa_candidati($1,'operai',$2,'13:00','14:00')", [az, giorno])).rejects.toMatchObject({ code: "42501" });
  });

  it("conta le tratte dichiarate una sola volta ed esclude quelle stimate", async () => {
    await db.exec(`reset role;
      insert into mezzi_viaggi(id,company_id,mezzo_id,created_by,partenza,arrivo,stato,tratte) values
      ('${id(28)}','${az}','${id(25)}','${operaio}','${giorno} 10:00+01','${giorno} 11:00+01','inviato',
        '[{"km":3.1,"fonte":"dichiarati"},{"km":4.3,"fonte":"dichiarati"}]'),
      ('${id(29)}','${az}','${id(25)}','${operaio}','${giorno} 11:00+01','${giorno} 12:00+01','inviato',
        '[{"km":20,"fonte":"stimati"}]'),
      ('${id(30)}','${az}','${id(25)}','${operaio}','${giorno} 12:00+01','${giorno} 13:00+01','inviato',
        '[{"km":10,"fonte":"dichiarati"},{"fonte":"dichiarati"}]');
    `);
    await ruolo(operaio);
    const dati = await db.query("select metri,fonte from mappa_km_effettivi($1,$2,true)", [az, giorno]);
    expect(dati.rows).toEqual([
      { metri: 32400, fonte: "Contachilometri · verificato" },
      { metri: 7400, fonte: "Dichiarazione registrata · inviato" },
    ]);
  });

  it("controlla disponibilità, competenza, origine pianificata e impegno successivo sul server", async () => {
    await ruolo(ufficio);
    const scegli = async (tipo: string, ore: string, fine: string, qualifica: string | null = null) =>
      (await db.query<{ candidati: Array<Record<string, unknown>> }>(
        "select mappa_candidati($1,$2,$3,$4,$5,$6) candidati", [az, tipo, giorno, ore, fine, qualifica],
      )).rows[0].candidati;
    const prima = await scegli("vendite", "09:30", "09:45");
    expect(prima.map(c => c.nome)).toEqual(["Ada Vendite", "Carla Operaio"]);
    expect(prima[0]).toMatchObject({ fonte: "Attività precedente", origine: { lat: 45.3, lng: 9.1 } });
    expect(prima[1]).toMatchObject({ prossimoInizio: 600, prossimo: { lat: 45.8, lng: 9.1 } });
    expect((await scegli("vendite", "10:00", "10:20")).map(c => c.nome)).toEqual(["Ada Vendite"]);
    expect((await scegli("operai", "13:00", "14:00", "Elettricista")).map(c => c.nome)).toEqual(["Bruno Operaio"]);
    expect((await scegli("squadre", "13:00", "14:00", "Elettricista")).map(c => c.nome)).toEqual(["Squadra A"]);
    expect(await scegli("squadre", "13:00", "14:00", "Qualifica inesistente")).toEqual([]);
    expect(await scegli("squadre", "08:00", "08:30")).toEqual([]);
    await ruolo(commerciale);
    expect((await scegli("vendite", "09:45", "09:50")).map(c => c.nome)).toEqual(["Ada Vendite"]);
    await expect(scegli("operai", "13:00", "14:00")).rejects.toMatchObject({ code: "42501" });
  });

  it("rifiuta contatori dal browser e consuma unità con un tetto; deduplica per azienda", async () => {
    await ruolo(ufficio);
    const conta = "select mappa_conta($1,'osrm_privato','elementi_matrice',$2,10,10) as ammesso";
    await expect(db.query(conta, [az, 5])).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role;set role service_role");
    expect((await db.query(conta, [az, 5])).rows).toEqual([{ ammesso: true }]);
    expect((await db.query(conta, [az, 6])).rows).toEqual([{ ammesso: false }]);
    expect((await db.query(conta, [esterna, 6])).rows).toEqual([{ ammesso: true }]);
    const inizia = "select mappa_richiesta_inizia($1,'dedup-test',$2) as risposta";
    expect((await db.query(inizia, [az, ufficio])).rows).toMatchObject([{ risposta: { stato: "nuova" } }]);
    expect((await db.query(inizia, [az, operaio])).rows).toMatchObject([{ risposta: { stato: "attesa" } }]);
    expect((await db.query(inizia, [esterna, esterno])).rows).toMatchObject([{ risposta: { stato: "nuova" } }]);
    await db.query("select mappa_richiesta_chiudi($1,'dedup-test',$2,'{\"valore\":1}',300)", [az, ufficio]);
    expect((await db.query(inizia, [az, operaio])).rows).toMatchObject([{ risposta: { stato: "pronta", risposta: { valore: 1 } } }]);
    await ruolo(ufficio);
    expect((await db.query("select unita::int from mappa_consumo_mese($1)", [az])).rows).toEqual([{ unita: 5 }]);
  });
});
