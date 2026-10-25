import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Il computo dei preventivatori edili si salva in una sola transazione.
 *
 * Prima il browser faceva tre richieste (inserisci le righe nuove, cancella le
 * vecchie, aggiorna i totali): un guasto in mezzo lasciava il computo doppio. Qui la
 * funzione vera `computo_salva_atomico` gira su un PostgreSQL locale (PGlite), con le
 * regole di accesso (RLS) attive come in produzione.
 */
const azienda = "d2000000-0000-4000-a000-000000000002";
const altraAzienda = "d2000000-0000-4000-a000-000000000003";
const utente = "00000000-0000-4000-a000-000000000099";
const progetto = "00000000-0000-4000-a000-000000000001";
const PREFISSI = ["bgn", "clm", "ele", "pav", "pis", "rst", "idr", "tet"];
const migrazione = readFileSync("supabase/migrations/20281025140000_computo_salva_atomico.sql", "utf8");

let db: PGlite;

const riga = (descrizione: string, extra: Record<string, unknown> = {}) => ({
  capitolo_nome: "Generale",
  descrizione,
  quantita: 2,
  prezzo_unitario: 10,
  importo: 20,
  ...extra,
});
const salva = (opts: { prefisso?: string; progetto?: string; righe?: unknown; totali?: unknown } = {}) =>
  db.query("select public.computo_salva_atomico($1,$2,$3,$4) as r", [
    opts.prefisso ?? "bgn",
    opts.progetto ?? progetto,
    JSON.stringify(opts.righe ?? [riga("Nuova A"), riga("Nuova B")]),
    JSON.stringify(opts.totali ?? { totale_imponibile: 40, totale: 48.8 }),
  ]);
const descrizioni = async (prefisso = "bgn") =>
  (await db.query(`select descrizione from public.${prefisso}_computo_voci order by descrizione`)).rows.map(
    (r) => (r as { descrizione: string }).descrizione,
  );
const totali = async (prefisso = "bgn") =>
  (await db.query(`select totale_imponibile, totale from public.${prefisso}_progetti`)).rows[0];

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.user',true),'')::uuid$$;
    create function public.get_effective_company_id() returns uuid language sql as $$select nullif(current_setting('app.company',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;`);
  for (const p of PREFISSI) {
    await db.exec(`create table public.${p}_progetti(id uuid primary key, company_id uuid not null,
        totale_imponibile numeric, totale numeric, updated_at timestamptz);
      create table public.${p}_computo_voci(id uuid primary key default gen_random_uuid(),
        progetto_id uuid not null references public.${p}_progetti(id) on delete cascade,
        company_id uuid not null,
        capitolo_nome text not null default 'Generale', descrizione text not null default '',
        quantita numeric not null default 0, prezzo_unitario numeric not null default 0,
        importo numeric not null default 0, ordine integer, created_at timestamptz not null default now(),
        constraint guasto check (descrizione <> 'GUASTO'));
      alter table public.${p}_progetti enable row level security;
      alter table public.${p}_computo_voci enable row level security;
      create policy scope on public.${p}_progetti to authenticated
        using (company_id = public.get_effective_company_id()) with check (company_id = public.get_effective_company_id());
      create policy scope on public.${p}_computo_voci to authenticated
        using (company_id = public.get_effective_company_id()) with check (company_id = public.get_effective_company_id());`);
  }
  await db.exec(migrazione);
  await db.exec(`grant select,insert,update,delete on all tables in schema public to authenticated;`);
}, 60000);

beforeEach(async () => {
  await db.exec(`reset role;
    drop policy if exists no_delete_protetta on public.bgn_computo_voci;
    truncate ${PREFISSI.map((p) => `public.${p}_progetti`).join(", ")} cascade;
    ${PREFISSI.map(
      (p) => `insert into public.${p}_progetti(id,company_id,totale_imponibile,totale) values ('${progetto}','${azienda}',1,1);
        insert into public.${p}_computo_voci(progetto_id,company_id,descrizione) values ('${progetto}','${azienda}','PRECEDENTE');`,
    ).join("\n")}
    set role authenticated;
    select set_config('app.user','${utente}',false), set_config('app.company','${azienda}',false);`);
});

afterAll(async () => {
  await db?.close();
});

describe("computo_salva_atomico su PostgreSQL vero", () => {
  it("sostituisce le righe e aggiorna i totali del progetto in un colpo solo", async () => {
    const r = await salva();
    expect(r.rows[0]).toMatchObject({ r: { righe: 2, totale_imponibile: 40, totale: 48.8 } });
    expect(await descrizioni()).toEqual(["Nuova A", "Nuova B"]);
    expect(await totali()).toMatchObject({ totale_imponibile: "40", totale: "48.8" });
  });

  it("se una riga viola un vincolo, niente cambia: righe di prima e totali restano", async () => {
    await expect(salva({ righe: [riga("Buona"), riga("GUASTO")] })).rejects.toThrow();
    expect(await descrizioni()).toEqual(["PRECEDENTE"]);
    expect(await totali()).toMatchObject({ totale_imponibile: "1", totale: "1" });
  });

  it("l'azienda e il progetto delle righe li impone il database, non il client", async () => {
    await salva({
      righe: [riga("Truccata", { company_id: altraAzienda, progetto_id: "00000000-0000-4000-a000-0000000000ff" })],
    });
    const rows = (await db.query("select company_id, progetto_id from public.bgn_computo_voci")).rows;
    expect(rows).toEqual([{ company_id: azienda, progetto_id: progetto }]);
  });

  it("id e created_at mandati dal client si ignorano: le righe nuove hanno id nuovi", async () => {
    const idFinto = "00000000-0000-4000-a000-0000000000aa";
    await salva({ righe: [riga("Con id", { id: idFinto, created_at: "2001-01-01T00:00:00Z" })] });
    const r = (await db.query("select id, created_at from public.bgn_computo_voci")).rows[0] as {
      id: string;
      created_at: string;
    };
    expect(r.id).not.toBe(idFinto);
    expect(new Date(r.created_at).getFullYear()).toBeGreaterThan(2001);
  });

  it("un computo svuotato cancella le righe e azzera i totali", async () => {
    await salva({ righe: [], totali: { totale_imponibile: 0, totale: 0 } });
    expect(await descrizioni()).toEqual([]);
    expect(await totali()).toMatchObject({ totale_imponibile: "0", totale: "0" });
  });

  it("funziona per tutti e otto i preventivatori", async () => {
    for (const p of PREFISSI) {
      await salva({ prefisso: p, righe: [riga(`Riga ${p}`)] });
      expect(await descrizioni(p)).toEqual([`Riga ${p}`]);
    }
  });

  it("non accetta una tabella arbitraria: solo gli otto prefissi scritti nella funzione", async () => {
    for (const cattivo of ["xxx", "bgn_progetti; drop table public.bgn_progetti", "", "BGN", "profiles"]) {
      await expect(salva({ prefisso: cattivo })).rejects.toThrow(/Computo sconosciuto/);
    }
    expect(await descrizioni()).toEqual(["PRECEDENTE"]);
  });

  it("un progetto di un'altra azienda non si vede e non si tocca", async () => {
    await db.exec(`select set_config('app.company','${altraAzienda}',false)`);
    await expect(salva()).rejects.toThrow(/non trovato o non accessibile/);
    await db.exec(`select set_config('app.company','${azienda}',false)`);
    expect(await descrizioni()).toEqual(["PRECEDENTE"]);
  });

  it("senza accesso (nessun utente) non salva niente", async () => {
    await db.exec(`select set_config('app.user','',false)`);
    await expect(salva()).rejects.toThrow(/Accesso richiesto/);
    await db.exec(`select set_config('app.user','${utente}',false)`);
    expect(await descrizioni()).toEqual(["PRECEDENTE"]);
  });

  it("una cancellazione che le regole di accesso filtrano non passa in silenzio: salvataggio annullato", async () => {
    await db.exec(`reset role;
      create policy no_delete_protetta on public.bgn_computo_voci as restrictive for delete to authenticated using (descrizione <> 'PRECEDENTE');
      set role authenticated;`);
    await expect(salva()).rejects.toThrow(/non cancellabili/);
    expect(await descrizioni()).toEqual(["PRECEDENTE"]);
    expect(await totali()).toMatchObject({ totale_imponibile: "1" });
  });

  it("righe e totali non validi si rifiutano prima di toccare qualcosa", async () => {
    await expect(salva({ righe: { non: "un elenco" } })).rejects.toThrow(/serve un elenco/);
    await expect(salva({ righe: ["testo"] })).rejects.toThrow(/deve essere un oggetto/);
    await expect(salva({ totali: { totale_imponibile: "abc", totale: 1 } })).rejects.toThrow(/Totali non numerici/);
    await expect(salva({ totali: { totale: 1 } })).rejects.toThrow(/Totali mancanti/);
    await expect(salva({ righe: [riga("X", { colonna_che_non_esiste: 1 })] })).rejects.toThrow();
    expect(await descrizioni()).toEqual(["PRECEDENTE"]);
    expect(await totali()).toMatchObject({ totale_imponibile: "1" });
  });

  it("la funzione non è aperta ad anon, e non ha privilegi propri (SECURITY INVOKER)", async () => {
    await db.exec("reset role");
    const r = (
      await db.query(`select p.prosecdef as definer,
          has_function_privilege('anon','public.computo_salva_atomico(text,uuid,jsonb,jsonb)','execute') as anon,
          has_function_privilege('authenticated','public.computo_salva_atomico(text,uuid,jsonb,jsonb)','execute') as authenticated
        from pg_proc p where p.proname='computo_salva_atomico'`)
    ).rows[0];
    expect(r).toEqual({ definer: false, anon: false, authenticated: true });
  });
});
