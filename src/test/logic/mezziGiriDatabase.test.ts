import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

const id = (n: number) => `10000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [azienda, altraAzienda, ufficio, esterno, readonly, commessaA, commessaB, furgone, autista, fornitore, odaA, odaB, giro, futuro] =
  Array.from({ length: 14 }, (_, i) => id(i + 1));

it("salva e apre una sola volta il giro multi-cantiere e allinea registro e totali alla partenza italiana", async () => {
  const db = new PGlite();
  const ruolo = (user: string) => db.exec(`reset role; select set_config('mappa.uid','${user}',false); set role authenticated`);
  async function rpc<T>(query: string, args: unknown[]) {
    return (await db.query<{ r: T }>(query, args)).rows[0].r;
  }
  try {
    await db.exec(readFileSync("src/test/fixtures/mappaOperativaDatabase.sql", "utf8"));
    await db.exec(`drop table mezzi_viaggi;
      alter table mezzi add column stato text default 'in_servizio';
      alter table orders add column created_at timestamptz default now();
      alter table companies add column operational_province text, add column legal_province text, add column region text;
      create table it_province(sigla text primary key,regione text);
      insert into it_province values ('MI','Lombardia'),('BZ','Trentino-Alto Adige');
      create schema cron;
      create table cron.prove(nome text,frequenza text,comando text);
      create function cron.schedule(text,text,text) returns bigint language sql as $$
        insert into cron.prove values($1,$2,$3) returning 1::bigint $$;
      create function public.silvio_invoke_edge(text,jsonb) returns bigint language sql as $$ select 42::bigint $$;
      create table suppliers(id uuid primary key,company_id uuid,name text,ritiro_indirizzo text,ritiro_citta text);
      create table purchase_orders(id uuid primary key,company_id uuid,order_id uuid,supplier_id uuid,status text,oda_number text);
      create function public.miei_hr_profili() returns setof uuid language sql stable as $$
        select id from public.hr_profili where user_id=auth.uid()
      $$;`);
    const migrazioni = [
      "20281027180500_mezzi_viaggi_multitratta.sql", "20281027180600_mezzi_viaggi_formato_tratte.sql",
      "20290507115000_mappa_operativa_calendari.sql", "20290507115500_mezzi_storico_percorsi.sql",
      "20290507115600_carburante_viaggi_commessa.sql", "20290507115700_mezzi_giri_salvati.sql",
      "20290507115900_carburante_mimit_storico.sql",
    ];
    for (const migrazione of migrazioni) await db.exec(readFileSync(`supabase/migrations/${migrazione}`, "utf8"));
    await db.exec(`insert into companies(id,operational_province) values ('${azienda}','MI'),('${altraAzienda}','BZ');
      insert into profiles(id,company_id) values ('${ufficio}','${azienda}'),('${readonly}','${azienda}'),('${esterno}','${altraAzienda}');
      insert into fixture_perms select p.uid,p.az,unnest(array['can_edit_mezzi','can_view_mezzi','can_view_costs','can_view_orders','can_manage_purchasing'])
        from (values ('${ufficio}'::uuid,'${azienda}'::uuid),('${readonly}','${azienda}'),('${esterno}','${altraAzienda}')) p(uid,az);
      insert into fixture_perms values ('${readonly}','${azienda}','sola_lettura'),
        ('${ufficio}','${azienda}','amministratore'),('${ufficio}','${azienda}','can_edit_settings_profile');
      insert into orders(id,company_id,order_code,work_address) values
        ('${commessaA}','${azienda}','DEMO-A','Via Marsala, Milano'),('${commessaB}','${azienda}','DEMO-B','Via Tarabella, Milano');
      insert into hr_profili(id,company_id,user_id,nome,cognome,attivo) values ('${autista}','${azienda}','${ufficio}','Mario','Demo',true);
      insert into mezzi(id,company_id,nome,contatore_unita,assegnato_hr_profilo_id) values ('${furgone}','${azienda}','Furgone Demo','km','${autista}');
      insert into suppliers values ('${fornitore}','${azienda}','Materiali Milano','Via dei Tigli 10','Milano');
      insert into purchase_orders values
        ('${odaA}','${azienda}','${commessaA}','${fornitore}','parziale','ODA-01'),
        ('${odaB}','${azienda}','${commessaB}','${fornitore}','confermato','ODA-02');`);
    const schedulati = (await db.query<{ nome: string; comando: string }>("select nome,comando from cron.prove")).rows;
    expect(schedulati).toMatchObject([{ nome: "carburante-mimit-giornaliero" }]);
    expect(schedulati[0].comando).toMatch(/Europe\/Rome/);
    const { prima, dopo, pianificato } = (await db.query<{ prima: string; dopo: string; pianificato: string }>(`
      select ((now() at time zone 'Europe/Rome')::date-7)::text prima,
        ((now() at time zone 'Europe/Rome')::date-6)::text dopo, ((now() at time zone 'Europe/Rome')::date+1)::text pianificato
    `)).rows[0];
    const salva = (key = giro, inizio = `${prima}T22:15`, fine = `${dopo}T00:40`) => rpc<string>(
      "select mezzi_giro_salva($1,$2,$3,$4,$5,$6,$7,$8,'Deposito',true) r",
      [azienda, key, furgone, autista, inizio, fine, [commessaA, commessaB], [odaA, odaB]],
    );
    const elenco = (order: string) => rpc<{ id: string; viaggio_id: string; stato_viaggio: string; annullato_il: string }[]>(
      "select mezzi_giri_elenco($1,$2) r", [azienda, order],
    );
    const apri = (key = giro) => rpc<{
      id: string; stato: string; note: string; versione: number; partenza: string; arrivo: string; conducente_hr_id: string;
      tratte: { id: string; a: string; order_id: string | null; km: number | null }[];
    }>("select mezzi_giro_registra($1,$2) r", [azienda, key]);
    const registro = (day: string) => rpc<{ items: { id: string }[] }>(
      "select mezzi_viaggi_elenco($1,$2,$3,$4,$4,0) r", [azienda, furgone, commessaB, day],
    );
    const totali = (day: string, order: string | null) => rpc<{ totali: { viaggi: number; km_verificati: number; costo_carburante: number } }>(
      "select mezzi_quadro_percorrenze($1,$2,$3,$4,$4) r", [azienda, order ? null : furgone, order, day],
    );
    const opzioni = () => rpc<{ autisti: { id: string }[]; cantieri: { id: string }[] }>(
      "select mezzi_giro_contesto($1,$2,'Marsala','Mario') r", [azienda, furgone],
    );
    await ruolo(ufficio);
    expect(await opzioni()).toMatchObject({ autisti: [{ id: autista }], cantieri: [{ id: commessaA }] });
    await rpc("select mezzo_carburante_salva($1,$2,$3,'gasolio',10,2) r", [azienda, furgone, prima]);
    expect(await salva()).toBe(giro);
    expect(await salva()).toBe(giro);
    await expect(salva(id(50))).rejects.toThrow(/già un viaggio/);
    expect((await elenco(commessaA))[0].id).toBe(giro);
    expect((await elenco(commessaB))[0].id).toBe(giro);
    await salva(futuro, `${pianificato}T08:00`, `${pianificato}T09:00`);
    await expect(apri(futuro)).rejects.toThrow(/dopo la partenza/);
    await rpc("select mezzi_giro_annulla($1,$2) r", [azienda, futuro]);
    await expect(apri(futuro)).rejects.toThrow(/annullato/);
    await expect(salva(id(51), `${pianificato}T08:00`, `${pianificato}T09:00`)).resolves.toBe(id(51));

    const viaggio = await apri();
    expect(viaggio.stato).toBe("bozza");
    expect(viaggio.conducente_hr_id).toBe(autista);
    expect(viaggio.note).toContain("ODA-01, ODA-02");
    expect(viaggio.tratte.map(t => t.order_id)).toEqual([null, commessaA, commessaB, null]);
    expect(viaggio.tratte.at(-1)?.a).toBe("Deposito");
    expect(await apri()).toEqual(viaggio);
    expect((await totali(prima, commessaB)).totali.viaggi).toBe(0);
    const tratte = viaggio.tratte.map((t, i) => ({ ...t, km: [4, 15.5, 10, 6.5][i] }));
    await rpc("select mezzi_viaggi_salva($1,$2,$3,$4,'verifica',$5) r", [furgone, viaggio.id, viaggio.versione, id(52), JSON.stringify({ ...viaggio, tratte })]);
    expect((await apri()).stato).toBe("verificato");
    expect((await elenco(commessaB)).find(g => g.id === giro)?.viaggio_id).toBe(viaggio.id);
    expect((await registro(prima)).items.map(v => v.id)).toEqual([viaggio.id]);
    expect((await registro(dopo)).items).toEqual([]);
    expect((await totali(prima, commessaB)).totali).toMatchObject({ viaggi: 1, km_verificati: 10, costo_carburante: 2 });
    expect((await totali(prima, null)).totali).toMatchObject({ viaggi: 1, km_verificati: 36, costo_carburante: 7.2 });
    expect((await totali(dopo, commessaB)).totali.viaggi).toBe(0);
    const importa = (day: string, gasolio: number) => rpc<number>(
      "select carburante_mimit_importa($1,$2) r", [day, JSON.stringify([
        { chiave: "lombardia", prezzi: { gasolio, benzina: 1.89 } }, { chiave: "bolzano", prezzi: { gasolio: 3.66 } },
      ])],
    );
    await expect(importa(dopo, 2.44)).rejects.toThrow(/permission denied/);
    await db.exec("reset role; set role service_role");
    expect(await importa(prima, 1.83)).toBe(3);
    expect(await importa(dopo, 2.44)).toBe(3);
    expect(await importa(dopo, 2.44)).toBe(0);
    await ruolo(ufficio);
    const archivio = (day: string) => rpc<{
      giorno: string; territori: { chiave: string; prezzi: Record<string, number> }[];
    }>("select carburante_mimit_giorno($1) r", [day]);
    expect((await archivio(prima)).territori.find(x => x.chiave === "lombardia")?.prezzi.gasolio).toBe(1.83);
    expect((await archivio(dopo)).territori.find(x => x.chiave === "lombardia")?.prezzi.gasolio).toBe(2.44);
    expect(await archivio(pianificato)).toBeNull();

    const prezziMezzo = (day: string) => rpc<{ riferimento: { zona: string }; stima: { euro_litro: number; fonte: string } }>(
      "select mezzo_carburante_config($1,$2,$3) r", [azienda, furgone, day],
    );
    const impostaMimit = (zona: string | null) => rpc(
      "select mezzo_carburante_riferimento_salva($1,$2,$3,$4,true) r", [azienda, furgone, dopo, zona],
    );
    expect((await prezziMezzo(dopo)).stima.fonte).toBe("aziendale");
    await impostaMimit("bolzano");
    expect((await prezziMezzo(dopo)).stima).toMatchObject({ euro_litro: 3, fonte: "mimit" });
    await impostaMimit(null);
    expect((await prezziMezzo(dopo)).riferimento.zona).toBe("lombardia");
    expect((await prezziMezzo(dopo)).stima).toMatchObject({ euro_litro: 2, fonte: "mimit" });
    expect((await prezziMezzo(prima)).stima.fonte).toBe("aziendale");

    const singolo = id(60);
    const viaggioAndataRitorno = (kmRientro: number, stimato: boolean) => ({
      partenza: `${dopo} 08:00 Europe/Rome`, arrivo: `${dopo} 10:00 Europe/Rome`, conducente_hr_id: autista,
      tratte: [
        { id: "a", da: "Deposito", a: "Cantiere", order_id: commessaB, destinazione: "commessa", km: 18,
          fonte: stimato ? "stimati" : "dichiarati" },
        { id: "r", da: "Cantiere", a: "Deposito", order_id: null, destinazione: "generale", km: kmRientro,
          fonte: stimato ? "stimati" : "dichiarati" },
      ],
    });
    await rpc("select mezzi_viaggi_salva($1,$2,0,$3,'invia',$4) r",
      [furgone, singolo, id(61), JSON.stringify(viaggioAndataRitorno(22, true))]);
    expect((await totali(dopo, commessaB)).totali).toMatchObject({ km_stimati: 40, costo_carburante: 8, mimit: true });
    const dettaglio = await rpc<{ items: { tratte: { rientro_attribuito?: boolean }[] }[] }>(
      "select mezzi_viaggi_elenco($1,$2,$3,$4,$4,0) r", [azienda, furgone, commessaB, dopo],
    );
    expect(dettaglio.items[0].tratte[1].rientro_attribuito).toBe(true);
    await rpc("select mezzi_viaggi_salva($1,$2,1,$3,'verifica',$4) r",
      [furgone, singolo, id(62), JSON.stringify(viaggioAndataRitorno(29, false))]);
    expect((await totali(dopo, commessaB)).totali).toMatchObject({ viaggi: 1, km_verificati: 47, costo_carburante: 9.4 });
    expect((await totali(dopo, null)).totali).toMatchObject({ viaggi: 1, km_verificati: 47, costo_carburante: 9.4 });
    expect((await totali(prima, commessaB)).totali.costo_carburante).toBe(2);

    await ruolo(readonly);
    expect((await elenco(commessaA)).find(g => g.id === giro)?.stato_viaggio).toBe("verificato");
    await expect(apri()).rejects.toThrow(/Registro non modificabile/);
    await ruolo(esterno);
    await expect(elenco(commessaB)).rejects.toThrow(/Giri non accessibili/);
    await expect(apri()).rejects.toThrow(/Registro non modificabile/);
    await expect(opzioni()).rejects.toThrow(/Mezzo non disponibile/);
  } finally {
    await db.close();
  }
}, 45_000);
