// Fornitori dalle fatture ricevute (migrazione 20290404280000): anteprima senza scritture, creazione
// solo per le chiavi scelte, P.IVA valida, esteri e non validi saltati col motivo, isolamento fra aziende.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [AZ, ALTRA] = [1, 2].map(id);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create role anon; create role authenticated;
    create function acquisti_puo_collegare(c uuid) returns boolean language sql stable as $$select coalesce(current_setting('test.puo',true),'true')='true'$$;
    create function partner_tax_key(v text) returns text language sql immutable as $$
      select case when x ~ '^IT[0-9]{11}$' then substr(x,3) else x end from (select regexp_replace(upper(coalesce(v,'')), '[^A-Z0-9]', '', 'g') x) s $$;
    create function piva_valida(v text) returns boolean language plpgsql immutable as $$
      declare x text := partner_tax_key(v); s int := 0; n int; i int;
      begin if x !~ '^[0-9]{11}$' then return false; end if;
        for i in 0..9 loop n := substr(x, i+1, 1)::int; if i % 2 = 1 then n := n*2; if n > 9 then n := n-9; end if; end if; s := s+n; end loop;
        return (10 - s % 10) % 10 = substr(x, 11, 1)::int; end $$;
    create function codice_fiscale_valido(v text) returns boolean language sql immutable as $$select length(partner_tax_key(v)) = 16$$;
    create table companies(id uuid primary key);
    create table suppliers(id uuid primary key default gen_random_uuid(), company_id uuid, name text, vat_number text, fiscal_code text,
      address text, city text, postal_code text, province text, country text, is_active boolean);
    create function fornitore_unico_per_cedente(p_company_id uuid, p_piva text, p_cf text) returns uuid language sql stable as $$
      select case when count(*) = 1 then min(s.id::text)::uuid end from suppliers s
       where s.company_id = p_company_id and partner_tax_key(p_piva) <> '' and partner_tax_key(s.vat_number) = partner_tax_key(p_piva) $$;
    create table fatture_ricevute(id uuid primary key default gen_random_uuid(), company_id uuid, fornitore_id uuid, cedente_piva text, cedente_cf text,
      cedente_ragione_sociale text, cedente_paese text, cedente_indirizzo text, cedente_comune text, cedente_cap text, cedente_provincia text,
      data_fattura date, totale_documento numeric);
  `);
  await db.query(`insert into companies values ($1),($2)`, [AZ, ALTRA]);
  await db.exec(readFileSync("supabase/migrations/20290404280000_acquisti_fornitori_dalle_fatture.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404302000_acquisti_fornitori_crea_senza_doppioni.sql", "utf8"));
}, 60_000);
afterAll(async () => db?.close());

const fatt = (az: string, piva: string | null, nome: string, data: string, tot: number, paese = "IT") =>
  db.query(`insert into fatture_ricevute(company_id, cedente_piva, cedente_ragione_sociale, cedente_paese, cedente_comune, data_fattura, totale_documento) values ($1,$2,$3,$4,'Milano',$5,$6)`, [az, piva, nome, paese, data, tot]);

beforeEach(async () => {
  await db.exec(`truncate suppliers, fatture_ricevute; select set_config('test.puo','true',false);`);
  await fatt(AZ, "IT00743110157", "Edil Rossi S.r.l.", "2026-09-01", 100);
  await fatt(AZ, "00743110157", "EDIL ROSSI SRL", "2026-10-01", 200); // stesso fornitore, scritto diverso
  await fatt(AZ, "01234567890", "Numero sbagliato", "2026-10-01", 50); // cifra di controllo errata
  await fatt(AZ, "DE123456789", "Baustoffe GmbH", "2026-10-02", 70, "DE");
  await fatt(AZ, "01234567897", "Già in rubrica", "2026-10-03", 30);
  await db.query(`insert into suppliers(company_id, name, vat_number) values ($1,'Già in rubrica','01234567897'),($1,'Edil Rossi','03456789019')`, [AZ]);
  await fatt(ALTRA, "00743110157", "Edil Rossi S.r.l.", "2026-10-01", 999);
});

describe("fornitori dalle fatture", () => {
  it("anteprima: un cedente per riga, valido o no, già in rubrica, omonimi; non scrive", async () => {
    const { rows } = await db.query<Record<string, unknown>>(`select chiave, nome, fatture, totale::float tot, identificativo_valido v, gia_in_rubrica is not null rubrica, omonimi from acquisti_fornitori_dalle_fatture_anteprima($1)`, [AZ]);
    expect(rows).toEqual([
      { chiave: "00743110157", nome: "EDIL ROSSI SRL", fatture: 2, tot: 300, v: true, rubrica: false, omonimi: 1 },
      { chiave: "01234567890", nome: "Numero sbagliato", fatture: 1, tot: 50, v: false, rubrica: false, omonimi: 0 },
      { chiave: "01234567897", nome: "Già in rubrica", fatture: 1, tot: 30, v: true, rubrica: true, omonimi: 0 },
      { chiave: "DE123456789", nome: "Baustoffe GmbH", fatture: 1, tot: 70, v: false, rubrica: false, omonimi: 0 },
    ].sort((a, b) => b.fatture - a.fatture || b.tot - a.tot));
    expect((await db.query(`select count(*)::int n from suppliers`)).rows[0]).toEqual({ n: 2 });
  });

  it("crea solo i scelti, aggancia le fatture, salta non validi ed esteri col motivo; l'altra azienda non si tocca", async () => {
    const { rows } = await db.query<{ r: { creati: number; agganciati: number; fatture: number; saltati: Array<{ chiave: string; motivo: string }> } }>(
      `select acquisti_fornitori_dalle_fatture_crea($1, array['00743110157','01234567897','01234567890','DE123456789','99999999999']) r`,
      [AZ],
    );
    const r = rows[0].r;
    expect({ creati: r.creati, agganciati: r.agganciati, fatture: r.fatture }).toEqual({ creati: 1, agganciati: 1, fatture: 3 });
    expect(Object.fromEntries(r.saltati.map((s) => [s.chiave, s.motivo]))).toEqual({
      "01234567890": "P.IVA o codice fiscale non valido",
      DE123456789: "fornitore estero: va creato a mano",
      "99999999999": "nessuna fattura senza fornitore con questo identificativo",
    });
    const nuovo = (await db.query<{ name: string; city: string }>(`select name, city from suppliers where vat_number = '00743110157'`)).rows;
    expect(nuovo).toEqual([{ name: "EDIL ROSSI SRL", city: "Milano" }]);
    expect((await db.query(`select count(*)::int n from fatture_ricevute where company_id = $1 and fornitore_id is not null`, [ALTRA])).rows[0]).toEqual({ n: 0 });
    // Rifarlo non crea doppioni.
    const di_nuovo = (await db.query<{ r: { creati: number } }>(`select acquisti_fornitori_dalle_fatture_crea($1, array['00743110157']) r`, [AZ])).rows[0].r;
    expect(di_nuovo.creati).toBe(0);
    expect((await db.query(`select count(*)::int n from suppliers where vat_number = '00743110157'`)).rows[0]).toEqual({ n: 1 });
  });

  it("P.IVA già su due fornitori: niente terzo doppione, e si dice perché", async () => {
    await db.query(`insert into suppliers(company_id, name, vat_number) values ($1,'Edil Rossi A','00743110157'),($1,'Edil Rossi B','IT00743110157')`, [AZ]);
    const r = (await db.query<{ r: { creati: number; saltati: Array<{ motivo: string }> } }>(`select acquisti_fornitori_dalle_fatture_crea($1, array['00743110157']) r`, [AZ])).rows[0].r;
    expect(r.creati).toBe(0);
    expect(r.saltati[0].motivo).toMatch(/non uno solo/);
    expect((await db.query(`select count(*)::int n from suppliers where partner_tax_key(vat_number) = '00743110157'`)).rows[0]).toEqual({ n: 2 });
  });

  it("senza permesso: niente anteprima, niente creazione; più di 200 per volta no", async () => {
    await db.exec(`select set_config('test.puo','false',false)`);
    await expect(db.query(`select * from acquisti_fornitori_dalle_fatture_anteprima($1)`, [AZ])).rejects.toThrow(/permesso/);
    await expect(db.query(`select acquisti_fornitori_dalle_fatture_crea($1, array['00743110157'])`, [AZ])).rejects.toThrow(/permesso/);
    await db.exec(`select set_config('test.puo','true',false)`);
    const tante = Array.from({ length: 201 }, (_, i) => String(i));
    await expect(db.query(`select acquisti_fornitori_dalle_fatture_crea($1, $2)`, [AZ, tante])).rejects.toThrow(/200/);
  });
});
