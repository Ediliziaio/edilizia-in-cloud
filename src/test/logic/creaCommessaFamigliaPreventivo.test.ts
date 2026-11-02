import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { quoteConversionSchema, conversionCompanyId as company, conversionQuoteId as quote } from '../fixtures/quoteConversionDatabase';

// La definizione in vigore della RPC, con la ricerca della famiglia e la variabile `c` del ciclo sul computo.
// quoteConversionAtomic.test.ts carica ancora quella del 15/10: per questo il guasto del 30/10 non l'ha visto nessuno.
const migration = readFileSync('supabase/migrations/20281107090000_crea_commessa_preventivo_alias_famiglia.sql', 'utf8');
const madre = '30000000-0000-0000-0000-000000000002';
let db: PGlite;

async function carica(sql: string) {
  await db.exec(quoteConversionSchema);
  await db.exec(`alter table quotes add column parent_quote_id uuid;
    alter table orders add column order_code text, add column deleted_at timestamptz;
    create role service_role;`);
  await db.exec(sql);
}
const converti = (id: string) => db.query('select crea_commessa_preventivo_atomic($1,$2) esito', [id, JSON.stringify({ company_id: company })]);
const statoDi = async (id: string) => (await db.query<{ status: string }>('select status from quotes where id=$1', [id])).rows[0].status;
async function preventivo(id: string, parent: string | null = null) {
  await db.query("insert into quotes(id,company_id,status,version,subtotal,total,quote_number,parent_quote_id) values($1,$2,'accettata',1,100,100,$3,$4)", [id, company, `OFF-${id.slice(-1)}`, parent]);
}

beforeEach(() => { db = new PGlite(); });
afterEach(async () => { await db.close(); });

describe('crea_commessa_preventivo_atomic: famiglia del preventivo', () => {
  it('preventivo singolo: nasce la commessa e il preventivo è convertito', async () => {
    await carica(migration);
    await preventivo(quote);
    await converti(quote);
    expect((await db.query('select quote_id from orders')).rows).toEqual([{ quote_id: quote }]);
    expect(await statoDi(quote)).toBe('convertita');
  });

  it('revisione: nasce la commessa, e la madre non può farne una seconda', async () => {
    await carica(migration);
    await preventivo(madre);
    await preventivo(quote, madre);
    await converti(quote);
    expect(await statoDi(quote)).toBe('convertita');
    await expect(converti(madre)).rejects.toThrow('variante');
    expect(await statoDi(madre)).toBe('accettata');
  });

  it('con l’alias «c» di prima la conversione si ferma: è il guasto che questo test sorveglia', async () => {
    await carica(migration.replaceAll('figlia', 'c'));
    await preventivo(quote);
    await expect(converti(quote)).rejects.toThrow('"c" is not assigned yet');
  });
});
