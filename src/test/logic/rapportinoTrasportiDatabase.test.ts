import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { campoArrivo } from "@/lib/campo/arrivoRapportino";

const id = (n: number) => `16000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const [az, altra, ufficio, operaio, ordine, alfa, beta, esterno, primo, secondo, notte, tratta] =
  Array.from({ length: 12 }, (_, n) => id(n + 1));

it("convalida i trasporti di campo e ufficio, raggruppa il mezzo condiviso e collega il giro oltre mezzanotte", async () => {
  const db = new PGlite();
  const ruolo = (user: string) => db.exec(`reset role; select set_config('mappa.uid','${user}',false); set role authenticated`);
  try {
    await db.exec(readFileSync("src/test/fixtures/mappaOperativaDatabase.sql", "utf8"));
    await db.exec(`drop table mezzi_viaggi;
      create function public.miei_hr_profili() returns setof uuid language sql as $$ select id from hr_profili where user_id=auth.uid() $$;
      create function public._order_visible_under_rls(uuid,boolean) returns boolean language sql as $$ select public.ufficio_vede_commessa($1) $$;
      create function public.campo_e_ufficio(uuid) returns boolean language sql as $$ select true $$;
      create function public.assert_company_access(uuid) returns void language plpgsql as $$ begin return; end $$;
      create function public.campo_mezzi_ammessi(uuid) returns table(mezzo_id uuid) language sql as $$ select '${alfa}'::uuid $$;
      create table campo_rapportini(
        id uuid primary key, company_id uuid, order_id uuid, user_id uuid, data_lavoro date, campi_extra jsonb default '[]', stato text default 'inviato',
        lavoro_completato boolean default false, firma_cliente_url text, annullato_at timestamptz,
        ufficio_employee_id uuid, updated_at timestamptz default now(), approvato boolean default false, approvato_da uuid, approvato_at timestamptz,
        descrizione_lavori text, note text, ore_lavorate numeric, ore_straordinario numeric, presenze jsonb, fasi_lavorate jsonb,
        materiali_usati jsonb, mezzi_usati jsonb, motivo_rifiuto text, pdf_url text
      );
      create table appalto_rendiconto_righe(stato text,rapportino_id uuid,voce_libera_id uuid);
      create table rapportino_voci_libere(id uuid,rapportino_id uuid);
      create table giornale_lavori(order_id uuid,stato text,source_rapportini_ids uuid[]);
      grant select,insert,update on campo_rapportini to authenticated;`);
    for (const file of [
      "20281027180500_mezzi_viaggi_multitratta.sql", "20281027180600_mezzi_viaggi_formato_tratte.sql",
      "20290423120000_arrivi_cantiere_da_rapportini.sql", "20290507115800_rapportino_trasporti_multipli.sql",
    ]) await db.exec(readFileSync(`supabase/migrations/${file}`,"utf8"));
    await db.exec(`
      insert into companies(id) values('${az}'),('${altra}');
      insert into profiles(id,company_id) values('${ufficio}','${az}'),('${operaio}','${az}');
      insert into orders(id,company_id) values('${ordine}','${az}');
      insert into order_campo_assignments(company_id,order_id,user_id) values('${az}','${ordine}','${operaio}');
      insert into fixture_perms select '${ufficio}','${az}',unnest(array['can_view_orders','can_edit_orders','can_view_mezzi','can_edit_mezzi']);
      insert into mezzi(id,company_id,nome,tipo,contatore_unita) values
        ('${alfa}','${az}','Furgone Alfa','furgone','km'),
        ('${beta}','${az}','Auto Beta','autovettura','km'),
        ('${esterno}','${altra}','Mezzo esterno','furgone','km');`);
    const { prima, dopo } = (await db.query<{ prima: string; dopo: string }>(`
      select ((now() at time zone 'Europe/Rome')::date-7)::text prima, ((now() at time zone 'Europe/Rome')::date-6)::text dopo
    `)).rows[0];
    const a = { mezzoId: alfa, partenza: "Deposito", km: "18.5" };
    const b = { mezzoId: beta, partenza: "", km: "" };
    const salva = (report: string, user: string, mezzi: typeof a[]) => db.query(
      "insert into campo_rapportini(id,company_id,order_id,user_id,data_lavoro,campi_extra) values ($1,$2,$3,$4,$5,$6)",
      [report, az, ordine, user, dopo, JSON.stringify(campoArrivo(mezzi))],
    );
    await ruolo(operaio);
    await salva(primo, operaio, [a]);
    await expect(salva(id(77), operaio, [a, b])).rejects.toThrow(/non è disponibile/);
    await ruolo(ufficio);
    await salva(secondo, ufficio, [a, b]);
    const duplicato = campoArrivo([a])[0];
    await expect(db.query("update campo_rapportini set campi_extra=$2 where id=$1",
      [secondo, JSON.stringify([duplicato, duplicato])])).rejects.toThrow(/una sola volta/);
    await expect(salva(id(78), ufficio, [{ ...b, mezzoId: esterno }])).rejects.toThrow(/non è disponibile/);
    const elenco = async () => (await db.query<{ r: { items: { id: string; mezzoId: string; rapportini: number; viaggioId: string | null;
      viaggioGiorno: string | null; viaggiCompatibili: { id: string }[] }[] } }>(
      "select mezzi_arrivi_da_rapportini($1,$2,$2,0) r", [ordine, dopo],
    )).rows[0].r.items;
    const insieme = await elenco();
    expect(insieme).toHaveLength(2);
    expect(insieme.find(x => x.mezzoId === alfa)?.rapportini).toBe(2);

    await db.query("select mezzi_viaggi_salva($1,$2,0,$3,'salva',$4)", [alfa, notte, id(81), JSON.stringify({
      partenza: `${prima} 23:30 Europe/Rome`, arrivo: `${dopo} 00:25 Europe/Rome`,
      tratte: [{ id: tratta, da: "Deposito", a: "Cantiere", km: 18.5, minuti: 30, order_id: ordine, destinazione: "commessa", fonte: "dichiarati" }],
    })]);
    const daCollegare = (await elenco()).find(x => x.mezzoId === alfa)!;
    expect(daCollegare.viaggiCompatibili.map(v => v.id)).toEqual([notte]);
    await db.query("select mezzi_collega_arrivo_rapportino($1,$2,$3,$4)", [ordine, dopo, daCollegare.id, notte]);
    expect((await elenco()).find(x => x.mezzoId === alfa)).toMatchObject({ viaggioId: notte, viaggioGiorno: prima, rapportini: 2 });

    const aggiornato = (await db.query<{ ts: string }>("select updated_at::text ts from campo_rapportini where id=$1", [secondo])).rows[0].ts;
    await db.query("select rapportino_correggi($1,$2,$3,'Correzione trasporti demo')", [secondo, aggiornato, JSON.stringify({
      arrivo_cantiere: campoArrivo([b]),
    })]);
    expect((await elenco()).find(x => x.mezzoId === alfa)).toMatchObject({ viaggioId: notte, rapportini: 1 });
    expect((await elenco()).find(x => x.mezzoId === beta)?.rapportini).toBe(1);
  } finally {
    await db.close();
  }
}, 45_000);
