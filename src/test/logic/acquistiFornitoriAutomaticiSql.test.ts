// Fornitori creati da soli dalle fatture (migrazioni 20290404303000-305000): all'arrivo della fattura, senza
// doppioni, col tipo solo se certo; mai l'azienda stessa, mai un estero o un identificativo non valido.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { tipoDaNome } from "@/lib/fornitori/tipiFornitore";

const id = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const [AZ, ALTRA] = [1, 2].map(id);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create role anon; create role authenticated; create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('role', coalesce(nullif(current_setting('test.role',true),''),'service_role'))$$;
    create function e_super_admin_dentro(c uuid) returns boolean language sql stable as $$select false$$;
    create function acquisti_puo_collegare(c uuid) returns boolean language sql stable as $$select true$$;
    create function partner_tax_key(v text) returns text language sql immutable as $$
      select case when x ~ '^IT[0-9]{11}$' then substr(x,3) else x end from (select regexp_replace(upper(coalesce(v,'')), '[^A-Z0-9]', '', 'g') x) s $$;
    create function piva_valida(v text) returns boolean language plpgsql immutable as $$
      declare x text := partner_tax_key(v); s int := 0; n int; i int;
      begin if x !~ '^[0-9]{11}$' then return false; end if;
        for i in 0..9 loop n := substr(x, i+1, 1)::int; if i % 2 = 1 then n := n*2; if n > 9 then n := n-9; end if; end if; s := s+n; end loop;
        return (10 - s % 10) % 10 = substr(x, 11, 1)::int; end $$;
    create function codice_fiscale_valido(v text) returns boolean language sql immutable as $$select length(partner_tax_key(v)) = 16$$;
    create table companies(id uuid primary key, vat_number text, fiscal_code text);
    create table subappaltatori(id uuid primary key default gen_random_uuid(), company_id uuid, ragione_sociale text, piva text);
    create table suppliers(id uuid primary key default gen_random_uuid(), company_id uuid, name text, vat_number text, fiscal_code text,
      address text, city text, postal_code text, province text, country text, is_active boolean, tipo text, subappaltatore_id uuid,
      unique (company_id, name));
    -- Come in produzione: un fornitore «subappalto» entra da sé nell'elenco dei subappaltatori.
    create function collega_fornitore_subappaltatore() returns trigger language plpgsql as $$
      declare v uuid; begin
        if new.tipo is distinct from 'subappalto' or new.subappaltatore_id is not null then return new; end if;
        select id into v from subappaltatori where company_id = new.company_id and partner_tax_key(piva) = partner_tax_key(new.vat_number) limit 1;
        if v is null then insert into subappaltatori(company_id, ragione_sociale, piva) values (new.company_id, new.name, new.vat_number) returning id into v; end if;
        new.subappaltatore_id := v; return new; end $$;
    create trigger collega_fornitore_subappaltatore before insert or update of tipo on suppliers for each row execute function collega_fornitore_subappaltatore();
    create function fornitore_unico_per_cedente(p_company_id uuid, p_piva text, p_cf text) returns uuid language sql stable as $$
      select case when count(*) = 1 then min(s.id::text)::uuid end from suppliers s
       where s.company_id = p_company_id and partner_tax_key(p_piva) <> '' and partner_tax_key(s.vat_number) = partner_tax_key(p_piva) $$;
    create table fatture_ricevute(id uuid primary key default gen_random_uuid(), company_id uuid, fornitore_id uuid, cedente_piva text, cedente_cf text,
      cedente_ragione_sociale text, cedente_paese text, cedente_indirizzo text, cedente_comune text, cedente_cap text, cedente_provincia text,
      data_fattura date, totale_documento numeric, righe jsonb);
  `);
  await db.query(`insert into companies values ($1,'02345678904',null),($2,null,null)`, [AZ, ALTRA]);
  await db.exec(readFileSync("supabase/migrations/20290404280000_acquisti_fornitori_dalle_fatture.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404302000_acquisti_fornitori_crea_senza_doppioni.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404303000_acquisti_fornitori_automatici.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404304000_acquisti_fornitori_automatici_veloci.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20290404305000_fornitori_indice_chiave_fiscale.sql", "utf8"));
}, 60_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.exec(`truncate suppliers, fatture_ricevute, subappaltatori; select set_config('test.role','service_role',false);`);
});

const fattura = (az: string, piva: string | null, nome: string, over: { paese?: string; righe?: unknown[]; data?: string } = {}) =>
  db.query(`insert into fatture_ricevute(company_id, cedente_piva, cedente_ragione_sociale, cedente_paese, cedente_comune, data_fattura, totale_documento, righe)
            values ($1,$2,$3,$4,'Milano',$5,100,$6)`, [az, piva, nome, over.paese ?? "IT", over.data ?? "2026-10-01", JSON.stringify(over.righe ?? [])]);
const fornitori = async (az = AZ) =>
  (await db.query<{ name: string; vat_number: string; tipo: string | null; sub: boolean }>(
    `select name, vat_number, tipo, subappaltatore_id is not null sub from suppliers where company_id = $1 order by name`, [az])).rows;
const senzaFornitore = async () => (await db.query<{ n: number }>(`select count(*)::int n from fatture_ricevute where fornitore_id is null`)).rows[0].n;

describe("fornitori creati da soli dalle fatture", () => {
  it("all'arrivo: creato una volta sola anche se il nome è scritto in due modi, e le fatture agganciate", async () => {
    await fattura(AZ, "IT00743110157", "Edil Rossi S.r.l.", { data: "2026-09-01" });
    await fattura(AZ, "00743110157", "EDIL ROSSI SRL");
    expect(await fornitori()).toEqual([{ name: "Edil Rossi S.r.l.", vat_number: "IT00743110157", tipo: null, sub: false }]);
    expect(await senzaFornitore()).toBe(0);
  });

  it("tipo certo: gestore noto → generali; reverse charge edile → subappalto, e finisce tra i subappaltatori", async () => {
    await fattura(AZ, "03456789019", "Enel Energia S.p.A.");
    await fattura(AZ, "01234567897", "Costruzioni Bianchi", { righe: [{ descrizione: "posa", natura_iva: "N6.7" }] });
    expect(await fornitori()).toEqual([
      { name: "Costruzioni Bianchi", vat_number: "01234567897", tipo: "subappalto", sub: true },
      { name: "Enel Energia S.p.A.", vat_number: "03456789019", tipo: "generali", sub: false },
    ]);
    expect((await db.query(`select count(*)::int n from subappaltatori`)).rows[0]).toEqual({ n: 1 });
  });

  it("già nell'elenco dei subappaltatori → subappalto, collegato alla sua scheda (non una seconda)", async () => {
    await db.query(`insert into subappaltatori(company_id, ragione_sociale, piva) values ($1,'Ditta Verdi','IT00743110157')`, [AZ]);
    await fattura(AZ, "00743110157", "Ditta Verdi");
    expect(await fornitori()).toEqual([{ name: "Ditta Verdi", vat_number: "00743110157", tipo: "subappalto", sub: true }]);
    expect((await db.query(`select count(*)::int n from subappaltatori`)).rows[0]).toEqual({ n: 1 });
  });

  it("niente tipo se l'indizio non è certo: lo propone la pagina «Tipi dei fornitori»", async () => {
    await fattura(AZ, "00743110157", "Studio Tecnico Geom. Neri");
    expect((await fornitori())[0].tipo).toBeNull();
  });

  it("mai creato: azienda stessa, estero, identificativo non valido; e mai un doppione di chi c'è già", async () => {
    await fattura(AZ, "02345678904", "La mia azienda");
    await fattura(AZ, "DE123456789", "Baustoffe GmbH", { paese: "DE" });
    await fattura(AZ, "01234567890", "Numero sbagliato");
    expect(await fornitori()).toEqual([]);
    await db.query(`insert into suppliers(company_id, name, vat_number) values ($1,'A','00743110157'),($1,'B','IT00743110157')`, [AZ]);
    await fattura(AZ, "00743110157", "Edil Rossi");
    expect((await fornitori()).length).toBe(2);
  });

  it("isolamento: il fornitore nasce nell'azienda della fattura", async () => {
    await fattura(ALTRA, "00743110157", "Edil Rossi");
    expect(await fornitori(AZ)).toEqual([]);
    expect((await fornitori(ALTRA)).length).toBe(1);
  });

  it("storico: il lotto crea e conta per tipo; rifarlo non crea doppioni; solo dal servizio", async () => {
    await db.exec(`alter table fatture_ricevute disable trigger acquisti_fornitore_automatico_da_fattura`);
    await fattura(AZ, "03456789019", "Enel Energia S.p.A.");
    await fattura(AZ, "00743110157", "Edil Rossi");
    await fattura(AZ, "00743110157", "Edil Rossi");
    await fattura(AZ, "01234567890", "Numero sbagliato");
    await db.exec(`alter table fatture_ricevute enable trigger acquisti_fornitore_automatico_da_fattura`);
    const r = (await db.query<{ r: Record<string, unknown> }>(`select acquisti_fornitori_automatici_lotto($1) r`, [AZ])).rows[0].r;
    expect(r).toEqual({ creati: 2, agganciati: 0, saltati: 1, fatture: 3, tipi: { generali: 1, senza_tipo: 1 } });
    expect((await db.query<{ r: { creati: number } }>(`select acquisti_fornitori_automatici_lotto($1) r`, [AZ])).rows[0].r.creati).toBe(0);
    await db.exec(`select set_config('test.role','authenticated',false)`);
    await expect(db.query(`select acquisti_fornitori_automatici_lotto($1)`, [AZ])).rejects.toThrow(/servizio/);
  });
});

describe("nomi riconosciuti: SQL uguale al TypeScript", () => {
  const nomi = [
    "TIM S.p.A.", "Enel Energia", "A2A Energia SpA", "Intesa Sanpaolo", "Cassa Edile di Milano", "Arval Service Lease",
    "Q8 Kuwait Petroleum", "Leroy Merlin Italia", "Würth srl", "Wurth srl", "Unipol Assicurazioni", "Comune di Bergamo",
    "Edil Rossi", "Studio Neri", "Serramenti Bianchi", "Telepass S.p.A.", "Esselunga", "Hera Comm",
  ];
  it.each(nomi)("%s", async (nome) => {
    const ts = tipoDaNome(nome);
    const sql = (await db.query<{ t: string | null }>(`select acquisti_tipo_fornitore_da_nome($1) t`, [nome])).rows[0].t;
    expect(sql).toBe(ts === "professionisti" ? null : ts);
  });
});
