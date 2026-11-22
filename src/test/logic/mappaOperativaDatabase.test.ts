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
    const mezziGiornate = readFileSync("supabase/migrations/20280927203000_mezzi_fine_giornata.sql", "utf8");
    await db.exec(mezziGiornate.slice(0, mezziGiornate.indexOf("-- ── Diario del giorno")));
    const migration = [
      "20290507115000_mappa_operativa_calendari.sql",
      "20290507115100_mappa_viaggi_da_completare.sql",
      "20290507115200_mappa_timbrature_gps.sql",
      "20290507115300_mappa_storico_cantieri_per_anno.sql",
      "20290507115400_mappa_mezzi_calendario.sql",
      "20290507115500_mezzi_storico_percorsi.sql",
      "20290507115600_carburante_viaggi_commessa.sql",
      "20290507120000_mappa_attrezzature.sql",
      "20290507120100_rapportino_rilevazioni_mezzi.sql",
    ].map(file => readFileSync(`supabase/migrations/${file}`, "utf8")).join("\n");
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
        'can_view_persone','can_view_all_team_calendar','can_view_mezzi','can_edit_mezzi','can_view_costs','amministratore']) from (values ('${ufficio}'::uuid,'${az}'::uuid),('${esterno}','${esterna}')) t(uid,az);
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
      insert into hr_sedi values('${id(21)}','${az}',45.7,9.2,true,'Magazzino centrale');
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

  it("posiziona le attrezzature alla data scelta e rispetta i permessi di persone e commesse", async () => {
    const oggiSql = "(now() at time zone 'Europe/Rome')::date";
    const ieri = `(${oggiSql}-1)`;
    const tap = id(750), trapano = id(751), laser = id(752), ponteggio = id(753), straniero = id(754);
    await db.exec(`reset role;
      insert into mezzi(id,company_id,nome,contatore_unita,tipo,gestione,quantita_totale,unita_misura) values
        ('${tap}','${az}','Tagliapiastrelle','nessuno','attrezzatura','singola',null,null),
        ('${trapano}','${az}','Trapano','nessuno','attrezzatura','singola',null,null),
        ('${laser}','${az}','Laser','nessuno','attrezzatura','singola',null,null),
        ('${ponteggio}','${az}','Ponteggio','nessuno','attrezzatura','quantita',30,'pezzi'),
        ('${straniero}','${esterna}','Laser esterno','nessuno','attrezzatura','singola',null,null);
      insert into mezzi_assegnazioni(company_id,mezzo_id,order_id,hr_profilo_id,su_mezzo_id,dal) values
        ('${az}','${tap}','${ordine}',null,null,${ieri}+time '09:00'),
        ('${az}','${trapano}',null,'${id(23)}','${id(25)}',${ieri}+time '09:00');
      insert into mezzi_scansioni(company_id,mezzo_id,azione,created_at) values
        ('${az}','${laser}','magazzino',${ieri}+time '08:30');
      insert into mezzi_allocazioni(company_id,mezzo_id,order_id,quantita,dal,created_at) values
        ('${az}','${ponteggio}','${ordine}',8,${ieri},${ieri}+time '09:00');
      insert into fixture_perms values ('${operaio}','${az}','can_view_mezzi'),('${operaio}','${az}','can_view_calendar'),('${operaio}','${az}','can_view_orders');`);
    const mappa = (azienda: string, personale: boolean) =>
      db.query("select * from mappa_attrezzature_giorno($1,(now() at time zone 'Europe/Rome')::date,$2)",[azienda,personale]).then(r => r.rows);
    await ruolo(ufficio);
    expect(await mappa(az,false)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: tap, posizione: expect.objectContaining({ order_id: ordine, lat: 45.5, quando: expect.any(String) }) }),
      expect.objectContaining({ id: trapano, custode: "Carla Operaio", a_bordo_id: id(25) }),
      expect.objectContaining({ id: laser, custode: null, posizione: expect.objectContaining({ nome: "Magazzino centrale", lat: 45.7, fonte: "Scansione QR" }) }),
      expect.objectContaining({ scheda_id: ponteggio, quantita: 8, posizione: expect.objectContaining({ order_id: ordine }) }),
      expect.objectContaining({ scheda_id: ponteggio, quantita: 22, posizione: null }),
    ]));
    expect(await mappa(esterna,false)).toEqual([]);
    await ruolo(operaio);
    const personale = await mappa(az,true);
    expect(personale).toEqual(expect.arrayContaining([expect.objectContaining({ id: tap }), expect.objectContaining({ scheda_id: ponteggio, quantita: 8 })]));
    expect(personale).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: trapano })]));
    await ruolo(esterno);
    expect(await mappa(az,false)).toEqual([]);
    await db.exec(`reset role;
      delete from fixture_perms where uid='${operaio}' and company='${az}' and permesso in ('can_view_mezzi','can_view_calendar','can_view_orders');
      insert into hr_sedi values ('${id(755)}','${az}',45.4,9.4,true,'Magazzino nord');`);
    await ruolo(ufficio);
    expect(await mappa(az,false)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: laser, posizione: expect.objectContaining({ nome: "Magazzino · sede da specificare", lat: null, lng: null }) }),
    ]));
  });

  it("salva le rilevazioni per cantiere, accetta zero e ripete l'invio senza duplicati", async () => {
    const mezzo = id(760), secondo = id(761), report = id(762), reportB = id(763);
    const oggiSql = "(now() at time zone 'Europe/Rome')::date";
    await db.exec(`reset role;
      insert into orders(id,company_id,description) values ('${secondo}','${az}','Secondo cantiere');
      insert into order_campo_assignments values ('${az}','${secondo}','${operaio}',${oggiSql},${oggiSql},null);
      insert into mezzi(id,company_id,nome,contatore_unita,tipo,assegnato_hr_profilo_id) values
        ('${mezzo}','${az}','Escavatore Beta','ore','macchina_movimento_terra','${id(22)}');
      insert into campo_rapportini values
        ('${report}','${az}','${ordine}','${operaio}',${oggiSql},null),
        ('${reportB}','${az}','${secondo}','${operaio}',${oggiSql},null);
      insert into fixture_moduli values ('${az}','{"rilevazioni_mezzi":{"ore":true,"litri":true,"consumo":true}}');`);
    await ruolo(operaio);
    const salva = (order: string, reportId: string, ore: number, litri: number) =>
      db.query("select campo_mezzi_fine_giornata($1,(now() at time zone 'Europe/Rome')::date,$2,$3)", [
        order, JSON.stringify([{ mezzo_id: mezzo, usato: true, dove: "invariato", ore_lavorate: ore, litri_riforniti: litri, litri_consumati: 2.75 }]), reportId,
      ]);
    await salva(ordine, report, 6.25, 18.5);
    await salva(ordine, report, 6.25, 18.5);
    await salva(secondo, reportB, 1.75, 0);
    await expect(salva(secondo, report, 2, 0)).rejects.toMatchObject({ code: "42501" });
    await expect(salva(secondo, reportB, 25, 0)).rejects.toMatchObject({ code: "23514" });
    await db.exec("reset role");
    const leggi = () => db.query("select rapportino_id,ore_lavorate,litri_riforniti,litri_consumati from mezzi_giornate where mezzo_id=$1 order by rapportino_id",[mezzo]).then(r => r.rows);
    expect(await leggi()).toEqual([
      { rapportino_id: report, ore_lavorate: "6.25", litri_riforniti: "18.5", litri_consumati: "2.75" },
      { rapportino_id: reportB, ore_lavorate: "1.75", litri_riforniti: "0", litri_consumati: "2.75" },
    ]);
    await db.exec(`update fixture_moduli set schema='{"rilevazioni_mezzi":{"ore":true,"litri":false}}' where company_id='${az}'`);
    await ruolo(operaio);
    await salva(ordine, report, 5.5, 9999);
    await db.exec("reset role");
    expect((await leggi())[0]).toEqual({ rapportino_id: report, ore_lavorate: "5.5", litri_riforniti: "18.5", litri_consumati: "2.75" });
  });

  it("la riconsegna dal rapportino aggiorna la mappa anche se l'attrezzatura non è più in carico", async () => {
    const attrezzo = id(768), rapporto = id(769);
    const oggiSql = "(now() at time zone 'Europe/Rome')::date";
    await db.exec(`reset role;
      insert into mezzi(id,company_id,nome,contatore_unita,tipo,assegnato_order_id) values
        ('${attrezzo}','${az}','Carotatrice','nessuno','attrezzatura','${ordine}');
      insert into campo_rapportini values ('${rapporto}','${az}','${ordine}','${operaio}',${oggiSql},null);`);
    await ruolo(operaio);
    const args = [ordine, JSON.stringify([{ mezzo_id: attrezzo, usato: false, dove: "magazzino" }]), rapporto];
    const salva = () => db.query(`select campo_mezzi_fine_giornata($1,${oggiSql},$2,$3)`, args);
    await salva();
    await salva();
    await ruolo(ufficio);
    const vista = await db.query(`select posizione,custode from mappa_attrezzature_giorno($1,${oggiSql},false) where id=$2`, [az, attrezzo]);
    expect(vista.rows).toEqual([{
      posizione: expect.objectContaining({ nome: "Magazzino · sede da specificare", fonte: "Rapportino", quando: expect.any(String) }),
      custode: null,
    }]);
    await db.exec("reset role");
    expect((await db.query("select dove from mezzi_giornate where mezzo_id=$1", [attrezzo])).rows).toEqual([{ dove: "magazzino" }]);
  });

  it("valorizza le singole tratte con i prezzi del giorno e applica una sola tariffa al viaggio", async () => {
    const mezzo = id(181), benzina = id(182), cantiereB = id(183);
    const dal = "2026-11-01", al = "2026-11-30";
    await db.exec(`reset role;
      insert into orders(id,company_id,description) values ('${cantiereB}','${az}','Cantiere B');
      insert into mezzi(id,company_id,nome,contatore_unita) values
        ('${mezzo}','${az}','Furgone Gasolio','km'),('${benzina}','${az}','Auto Benzina','km');
      insert into mezzi_viaggi(id,company_id,mezzo_id,created_by,partenza,arrivo,stato,tratte,tariffa_km) values
        (gen_random_uuid(),'${az}','${mezzo}','${ufficio}','2026-11-02 09:00+01','2026-11-02 14:00+01','verificato',
         '[{"order_id":"${ordine}","destinazione":"commessa","fonte":"dichiarati","km":20},{"order_id":"${cantiereB}","destinazione":"commessa","fonte":"dichiarati","km":12.4},{"destinazione":"generale","fonte":"dichiarati","km":8}]',null),
        (gen_random_uuid(),'${az}','${mezzo}','${ufficio}','2026-11-12 09:00+01','2026-11-12 14:00+01','inviato',
         '[{"order_id":"${ordine}","destinazione":"commessa","fonte":"stimati","km":10}]',null),
        (gen_random_uuid(),'${az}','${mezzo}','${ufficio}','2026-11-13 09:00+01','2026-11-13 14:00+01','inviato',
         '[{"order_id":"${ordine}","destinazione":"commessa","fonte":"dichiarati","km":5}]',0.55),
        (gen_random_uuid(),'${az}','${mezzo}','${ufficio}','2026-11-14 09:00+01','2026-11-14 14:00+01','annullato',
         '[{"order_id":"${ordine}","destinazione":"commessa","fonte":"dichiarati","km":100}]',null),
        (gen_random_uuid(),'${az}','${benzina}','${ufficio}','2026-11-14 09:00+01','2026-11-14 14:00+01','verificato',
         '[{"order_id":"${ordine}","destinazione":"commessa","fonte":"dichiarati","km":10}]',null);
    `);
    await ruolo(ufficio);
    const salva = (m: string, data: string, tipo: string, consumo: number, prezzo: number) =>
      db.query("select mezzo_carburante_salva($1,$2,$3,$4,$5,$6)", [az,m,data,tipo,consumo,prezzo]);
    const quadro = async (m: string | null, o: string | null) => (await db.query<{ q: { totali: Record<string, number | null> } }>(
      "select mezzi_quadro_percorrenze($1,$2,$3,$4,$5) q",[az,m,o,dal,al])).rows[0].q.totali;
    expect(await quadro(null, ordine)).toMatchObject({ costo_carburante: null, costo_tariffa: 2.75, km_senza_parametri: 40 });
    await salva(mezzo, dal, "gasolio", 8.5, 1.5);
    await salva(mezzo, "2026-11-10", "gasolio", 8.5, 2);
    await salva(benzina, dal, "benzina", 6, 1.8);
    expect(await quadro(null, ordine)).toMatchObject({ km_verificati: 30, km_dichiarati: 5, km_stimati: 10,
      litri: 3.15, costo_carburante: 5.33, costo_tariffa: 2.75, km_senza_parametri: 0 });
    expect(await quadro(null, cantiereB)).toMatchObject({ km_verificati: 12.4, costo_carburante: 1.58, costo_tariffa: null });
    expect(await quadro(mezzo, null)).toMatchObject({ km_verificati: 40.4, costo_carburante: 6.85, costo_tariffa: 2.75 });
    await expect(salva(mezzo, "2026-11-20", "gasolio", 8.5, 0)).rejects.toMatchObject({ code: "22023" });
    const lettore = id(184);
    await db.exec(`reset role;
      insert into profiles values ('${lettore}','${az}','Lettore','Mezzi',false,null);
      insert into fixture_perms values ('${lettore}','${az}','can_view_mezzi'),('${lettore}','${az}','can_view_orders');`);
    await ruolo(lettore);
    expect(await quadro(mezzo, null)).toMatchObject({ km_verificati: 40.4, costo_carburante: null, costo_tariffa: null, litri: null });
    await expect(salva(mezzo, dal, "gasolio", 8.5, 1.5)).rejects.toMatchObject({ code: "42501" });
    await ruolo(esterno);
    await expect(quadro(null, ordine)).rejects.toMatchObject({ code: "42501" });
  });

  it("isola lo storico di un mezzo e somma tutto il periodo prima di paginare", async () => {
    const mezzo = id(191);
    const giornoTest = "2026-10-25";
    await db.exec(`reset role;
      update companies set operational_lat=45.46,operational_lng=9.2 where id='${az}';
      insert into mezzi(id,company_id,nome,contatore_unita) values ('${mezzo}','${az}','Furgone storico','km');
      insert into mezzi_viaggi(id,company_id,mezzo_id,created_by,partenza,arrivo,contatore_inizio,contatore_fine,stato,tratte)
      values ('${id(192)}','${az}','${mezzo}','${ufficio}','2026-10-25 15:00+01','2026-10-25 16:00+01',100,132.4,'verificato',
        '[{"da":"Sede","a":"Via Demo 33","order_id":"${ordine}","fonte":"stimati","km":30}]'),
      ('${id(193)}','${az}','${mezzo}','${ufficio}','2026-10-25 14:00+01','2026-10-25 14:30+01',null,null,'inviato',
        '[{"da":"Sede","a":"Via da confermare","fonte":"stimati","km":8.1}]'),
      ('${id(194)}','${az}','${mezzo}','${ufficio}','2026-10-25 08:00+01','2026-10-25 09:00+01',null,null,'inviato',
        '[{"da":"Sede","a":"Via Estranea","fonte":"dichiarati","km":null}]'),
      ('${id(195)}','${az}','${mezzo}','${ufficio}','2026-10-25 12:00+01','2026-10-25 13:00+01',null,null,'annullato',
        '[{"da":"Sede","a":"Via Demo 33","fonte":"dichiarati","km":900}]'),
      ('${id(196)}','${az}','${mezzo}','${ufficio}','2026-10-24 23:30+02','2026-10-25 00:30+02',null,null,'inviato',
        '[{"da":"Sede","a":"Via Demo 33","fonte":"dichiarati","km":900}]');
      insert into mezzi_viaggi(id,company_id,mezzo_id,created_by,partenza,arrivo,stato,tratte)
      select gen_random_uuid(),'${az}','${mezzo}','${ufficio}',ts,ts+interval '3 min','inviato',
        '[{"da":"Sede","a":"Rimessa","fonte":"dichiarati","km":1}]'
      from generate_series('2026-10-25 09:00+01'::timestamptz,'2026-10-25 12:30+01'::timestamptz,interval '10 min') ts;`);
    await ruolo(ufficio);
    const leggi = async (offset: number) => (await db.query<{ dati: {
      totali: Record<string, number | null>; items: { id: string; tratte: Array<Record<string, unknown>> }[];
    } }>("select mezzi_storico_percorsi($1,$2,$3,$3,$4) dati", [az, mezzo, giornoTest, offset])).rows[0].dati;
    const prima = await leggi(0), seconda = await leggi(20);
    expect(prima.totali).toEqual({ registrati: 54.4, stimati: 8.1, viaggi: 25, senza_km: 1 });
    expect(seconda.totali).toEqual(prima.totali);
    expect(new Set([...prima.items, ...seconda.items].map(v => v.id)).size).toBe(25);
    expect(prima.items[0].tratte[0]).toMatchObject({ partenza: { lat: 45.46, lng: 9.2 }, arrivo: { lat: 45.5, lng: 9.1 } });
    expect(prima.items[1].tratte[0].arrivo).toBeNull();
    await expect(db.query("select mezzi_storico_percorsi($1,$2,$3,'2028-10-25',0)", [az, mezzo, giornoTest]))
      .rejects.toMatchObject({ code: "22023" });
    for (const user of [esterno, operaio]) {
      await ruolo(user);
      await expect(leggi(0)).rejects.toMatchObject({ code: "42501" });
    }
    const addettoMezzi = id(197);
    await db.exec(`reset role;
      insert into profiles values ('${addettoMezzi}','${az}','Addetto','Mezzi',false,null);
      insert into fixture_perms values ('${addettoMezzi}','${az}','can_view_mezzi');`);
    await ruolo(addettoMezzi);
    const limitato = await leggi(0);
    expect(limitato.totali).toEqual(prima.totali);
    expect(limitato.items[0].tratte[0].arrivo).toBeNull();
  });

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

  it("carica solo l’anno richiesto, usa l’ultima chiusura nel fuso italiano e isola le commesse", async () => {
    const finale = id(71), aperta = id(72), supporto = id(73), staff = id(74);
    const a = id(81), b = id(82), c = id(83), d = id(84), e = id(85), f = id(86), g = id(87), h = id(88);
    await db.exec(`reset role;
      insert into profiles values ('${staff}','${az}','Staff','Mappa',false,null);
      insert into fixture_perms values ('${staff}','${az}','can_view_calendar'), ('${staff}','${az}','can_view_orders');
      insert into order_statuses values ('${aperta}','${az}',1,false), ('${finale}','${az}',2,false), ('${supporto}','${az}',3,true);
      insert into orders(id,company_id,description,work_end_date,current_status_id,assigned_to,fulfillment_status)
      values
        ('${a}','${az}','Cliente A','2025-12-30','${finale}','${staff}',null),
        ('${b}','${az}','Cliente B','2026-03-04','${finale}',null,null),
        ('${c}','${az}','Cliente C','2025-06-05','${finale}',null,null),
        ('${d}','${az}','Cliente D',null,'${finale}',null,null),
        ('${e}','${az}','Cliente E','2026-11-15','${supporto}',null,'completed'),
        ('${f}','${az}','Cliente F','2026-11-15','${aperta}',null,'completed'),
        ('${g}','${esterna}','Fuori azienda','2026-11-15',null,null,'completed'),
        ('${h}','${az}','Cliente H','2026-04-01',null,null,'completed');
      insert into order_campo_assignments values ('${az}','${h}','${staff}',null,null,null);
      insert into order_status_history(order_id,status_id,changed_at) values
        ('${a}','${finale}','2025-10-05 10:00+02'),
        ('${a}','${finale}','2025-12-31 23:30+00'),
        ('${b}','${finale}','2027-02-01 12:00+01');
      insert into mappa_posizioni(company_id,tipo,record_id,lat,lng,fonte,aggiornato_da)
        values ('${az}','cantiere','${a}',45.5,9.25,'manuale','${ufficio}');
    `);
    const leggi = async (anno: number | null, personale: boolean, azienda = az, dopo: string | null = null) =>
      (await db.query("select id,data::text,lat,lng,chiusura_registrata from mappa_storico_cantieri($1,$2,$3,$4)", [azienda, anno, personale, dopo])).rows;
    await ruolo(ufficio);
    expect(await leggi(2026, false)).toEqual([
      { id: a, data: "2026-01-01", lat: 45.5, lng: 9.25, chiusura_registrata: true },
      { id: h, data: "2026-04-01", lat: null, lng: null, chiusura_registrata: false },
    ]);
    expect(await leggi(2025, false)).toMatchObject([{ id: c, data: "2025-06-05" }]);
    expect(await leggi(2027, false)).toMatchObject([{ id: b, data: "2027-02-01" }]);
    expect(await leggi(null, false)).toMatchObject([{ id: d, data: null }]);
    expect(await leggi(2026, true)).toEqual([]);
    expect(await leggi(2026, false, az, a)).toMatchObject([{ id: h }]);
    await ruolo(staff);
    expect(await leggi(2026, false)).toMatchObject([{ id: a }, { id: h }]);
    expect(await leggi(2025, false)).toEqual([]);
    await ruolo(esterno);
    expect(await leggi(2026, false)).toEqual([]);
    await db.exec("reset role; set role anon");
    await expect(leggi(2026, false)).rejects.toMatchObject({ code: "42501" });
  });

  it("pagina lo storico dell’anno scelto senza duplicati", async () => {
    await db.exec(`reset role;
      insert into orders(id,company_id,work_end_date,fulfillment_status)
      select gen_random_uuid(),'${az}', make_date(2018 + ((s-1)/251), 9, 1), 'completed'
      from generate_series(1, 2510) s;`);
    await ruolo(ufficio);
    const pagina = async (dopo: string | null) =>
      (await db.query<{ id: string; data: string }>(
        "select id,data::text from mappa_storico_cantieri($1,2023,false,$2)", [az, dopo],
      )).rows;
    const prima = await pagina(null);
    const seconda = await pagina(prima.at(-1)!.id);
    expect(prima).toHaveLength(250);
    expect(seconda).toHaveLength(1);
    expect(new Set([...prima, ...seconda].map(r => r.id)).size).toBe(251);
    expect(new Set([...prima, ...seconda].map(r => r.data))).toEqual(new Set(["2023-09-01"]));
  });

  it("mappa assegnazioni, destinazioni e chilometri per mezzo nel perimetro autorizzato", async () => {
    const data = "2026-10-21";
    const van = id(90), escavatore = id(91), auto = id(92), altraAzienda = id(93), secondaCommessa = id(94);
    await db.exec(`reset role;
      insert into orders(id,company_id,description,work_address,work_lat,work_lng)
        values ('${secondaCommessa}','${az}','Cantiere Lambrate','Via Lambrate 9',45.49,9.24);
      insert into mezzi(id,company_id,nome,targa,tipo,contatore_unita,contatore,contatore_aggiornato_il) values
        ('${van}','${az}','Furgone A','AB123CD','furgone','km',null,null),
        ('${escavatore}','${az}','Escavatore A',null,'macchina_movimento_terra','ore',812.4,'${data} 09:30+02'),
        ('${auto}','${az}','Auto A','BB123CC','autovettura','km',null,null),
        ('${altraAzienda}','${esterna}','Mezzo di altra azienda',null,'furgone','km',null,null);
      insert into mezzi_assegnazioni(company_id,mezzo_id,hr_profilo_id,order_id,dal,al) values
        ('${az}','${escavatore}','${id(22)}','${ordine}','${data} 07:15+02',null),
        ('${az}','${van}','${id(22)}','${ordine}','${data} 07:15+02',null);
      insert into mezzi_piani_cantiere(company_id,mezzo_id,order_id,dal,al) values
        ('${az}','${van}','${secondaCommessa}','${data}',null),
        ('${az}','${auto}','${secondaCommessa}','${data}',null),
        ('${az}','${auto}','${ordine}','${data}',null);
      insert into mezzi_viaggi(id,company_id,mezzo_id,created_by,partenza,arrivo,contatore_inizio,contatore_fine,stato,tratte) values
        ('${id(95)}','${az}','${van}','${ufficio}','${data} 08:00+02','${data} 08:30+02',100,112,'verificato',
          '[{"a":"Via Demo 33","order_id":"${ordine}","km":30,"fonte":"stimati"}]'),
        ('${id(96)}','${az}','${van}','${operaio}','${data} 09:00+02','${data} 09:30+02',null,null,'inviato',
          '[{"a":"Via Demo 33","order_id":"${ordine}","km":8,"fonte":"stimati"}]'),
        ('${id(97)}','${az}','${van}','${ufficio}','${data} 16:00+02','${data} 17:30+02',null,null,'bozza',
          '[{"a":"Via altra","km":99,"fonte":"stimati"}]'),
        ('${id(98)}','${az}','${auto}','${ufficio}','${data} 08:00+02','${data} 08:30+02',null,null,'inviato',
          '[{"a":"Via senza civico","km":4,"fonte":"dichiarati"}]');
    `);
    const leggi = async (azienda: string, personale: boolean, giorno = data) => (await db.query(
      "select id,posizione,destinazione,destinazioni,stradale,metri_registrati,metri_stimati,contaore from mappa_mezzi_giorno($1,$2,$3)", [azienda,giorno,personale],
    )).rows;
    await ruolo(ufficio);
    const righe = await leggi(az,false);
    expect(righe).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: van, stradale: true, metri_registrati: 12000, metri_stimati: 8000,
        posizione: expect.objectContaining({ fonte: "Ultimo arrivo registrato", order_id: ordine }),
        destinazione: expect.objectContaining({ fonte: "Piano mezzi", order_id: secondaCommessa }) }),
      expect.objectContaining({ id: escavatore, stradale: false, contaore: 812.4, metri_registrati: null,
        posizione: expect.objectContaining({ fonte: "Assegnazione al cantiere", order_id: ordine }) }),
      expect.objectContaining({ id: auto, destinazioni: 2, destinazione: null, metri_registrati: 4000,
        posizione: expect.objectContaining({ nome: "Via senza civico", lat: null }) }),
    ]));
    expect(righe.some(r => (r as { id: string }).id === altraAzienda)).toBe(false);
    expect(await leggi(az,true)).toEqual([
      expect.objectContaining({ id: van, metri_registrati: 12000, metri_stimati: null, destinazione: null }),
      expect.objectContaining({ id: auto, metri_registrati: 4000, destinazioni: 0 }),
    ]);
    const futura = await leggi(az,false,"2099-01-02");
    expect(futura).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: van, posizione: null, destinazione: expect.objectContaining({ order_id: secondaCommessa }) }),
      expect.objectContaining({ id: escavatore, posizione: null, contaore: null }),
    ]));
    await ruolo(commerciale);
    expect(await leggi(az,false)).toEqual([]);
    await ruolo(esterno);
    expect(await leggi(az,false)).toEqual([]);
    await db.exec("reset role; set role anon");
    await expect(leggi(az,false)).rejects.toMatchObject({ code: "42501" });
  });

  it("mostra le posizioni registrate senza duplicare Campo e Personale e rispetta il perimetro della vista", async () => {
    await db.exec(`reset role;
      insert into hr_timbrature values
        ('${id(41)}','${az}','${id(22)}','${ordine}',null,'entrata','app','${giorno} 08:00+01',45.56,9.12,'fuori'),
        ('${id(42)}','${az}','${id(22)}',null,'${id(21)}','uscita','kiosk','${giorno} 17:01+01',45.70,9.20,'dentro');
      update campo_timbrature set hr_timbratura_id='${id(41)}',gps_lat=45.56,gps_lng=9.12,gps_accuracy=12,posizione_esito='fuori'
        where user_id='${operaio}' and tipo='entrata';
      update campo_timbrature set gps_lat=45.55,gps_lng=9.11 where user_id='${altro}';
      insert into campo_timbrature(company_id,order_id,user_id,timestamp_evento,tipo,fonte,gps_lat,gps_lng) values
        ('${az}','${ordine}','${operaio}','${giorno} 18:00+01','uscita','app',91,9),
        ('${az}',null,'${operaio}','${giorno} 18:30+01','entrata','app',0,0),
        ('${az}',null,'${operaio}','${giorno} 23:30+00','uscita','app',45.72,9.23),
        ('${esterna}','${altroOrdine}','${esterno}','${giorno} 08:00+01','entrata','app',45.7,9.4);
    `);
    const leggiGps = async (azienda: string, personale: boolean) => (await db.query(
      "select id,order_id,nome,lat,lng,precisione,sede,esito from mappa_timbrature_gps($1,$2,$3)", [azienda, giorno, personale],
    )).rows;
    await ruolo(ufficio);
    const eventi = await leggiGps(az, false);
    expect(eventi).toEqual([
      { id: id(41), order_id: ordine, nome: "Bruno Operaio", lat: 45.56, lng: 9.12, precisione: 12, sede: null, esito: "fuori" },
      { id: expect.any(String), order_id: ordine, nome: "Carla Operaio", lat: 45.55, lng: 9.11, precisione: null, sede: null, esito: null },
      { id: id(42), order_id: null, nome: "Bruno Operaio", lat: 45.7, lng: 9.2, precisione: null, sede: "Magazzino centrale", esito: "dentro" },
    ]);
    expect(await leggiGps(az, true)).toEqual([]);
    await ruolo(operaio);
    expect(await leggiGps(az, false)).toEqual([eventi[0], eventi[2]]);
    await ruolo(commerciale);
    expect(await leggiGps(az, false)).toEqual([]);
    await ruolo(esterno);
    expect(await leggiGps(az, false)).toEqual([]);
    expect(await leggiGps(esterna, false)).toHaveLength(1);
    await db.exec("reset role; set role anon");
    await expect(leggiGps(az, false)).rejects.toMatchObject({ code: "42501" });
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
    await db.exec(`insert into mezzi_viaggi(id,company_id,mezzo_id,created_by,partenza,arrivo,stato) values
       ('${id(31)}','${az}','${id(25)}','${ufficio}','${giorno} 13:00+01','${giorno} 14:00+01','bozza'),
       ('${id(32)}','${az}','${id(25)}','${operaio}','${giorno} 14:00+01','${giorno} 15:00+01','annullato');`);
    const incompleti = async (personale: boolean) => (await db.query(
      "select id from mappa_km_da_registrare($1,$2,$3)", [az, giorno, personale],
    )).rows;
    await ruolo(ufficio);
    expect(await incompleti(false)).toEqual([{ id: id(29) }, { id: id(30) }, { id: id(31) }]);
    expect(await incompleti(true)).toEqual([{ id: id(31) }]);
    await ruolo(esterno);
    expect(await incompleti(false)).toEqual([]);
    await ruolo(operaio);
    expect(await incompleti(true)).toEqual([{ id: id(29) }, { id: id(30) }]);
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
