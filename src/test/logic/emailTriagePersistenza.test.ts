import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { salvaTriage, type TriageResult } from '../../../supabase/functions/email-triage-ai/persistenza';
const db = new PGlite();
const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', company = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const result: TriageResult = { category: 'newsletter', priority: 'bassa', summary: 'sintetico', extracted: {}, suggested_action: 'archivia' };
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE email_inbox(id uuid PRIMARY KEY,company_id uuid,status text DEFAULT 'new',ai_category text,
      ai_processed_at timestamptz,ai_priority text,ai_summary text,ai_extracted jsonb,ai_suggested_action text,ai_error text,
      CONSTRAINT email_inbox_ai_category_check CHECK(ai_category IN ('pending','altro','lead')));`);
  await db.exec('BEGIN;' + readFileSync('supabase/migrations/20261016112850_email_triage_salvataggio_sicuro.sql','utf8') + 'COMMIT;');
}, 60000);
afterAll(() => db.close());
beforeEach(async () => { await db.exec('RESET ROLE;TRUNCATE email_inbox'); await db.query('INSERT INTO email_inbox(id,company_id) VALUES($1,$2)',[id,company]); });
let failUpdates = false;
const client = () => ({
  rpc: async (_: string, args: {p_email_id:string;p_company_id:string}) => ({ data: (await db.query<{n:number|null}>('SELECT claim_email_triage($1,$2) AS n',[args.p_email_id,args.p_company_id])).rows[0].n, error: null as null }),
  from: () => ({ update: (values: Record<string,unknown>) => {
    const filters: Array<[string,unknown]> = [];
    const q = {
      eq: (k:string,v:unknown) => { filters.push([k,v]); return q; },
      is: () => q, select: () => q,
      maybeSingle: async (): Promise<{data:{id:string}|null;error:{code:string}|null}> => {
        if (failUpdates) return {data:null as null,error:{code:'23514'}};
        const keys = Object.keys(values);
        const params = [...Object.values(values), ...filters.map(([,v])=>v)];
        const sql = `UPDATE email_inbox SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE ${filters.map(([k],i)=>`${k}=$${keys.length+i+1}`).join(' AND ')} AND ai_processed_at IS NULL RETURNING id`;
        const rows = (await db.query<{id:string}>(sql,params)).rows;
        return {data:rows[0]??null,error:null};
      },
    }; return q;
  }}),
});
beforeEach(()=>{failUpdates=false;});
const row = async () => (await db.query<{ai_triage_attempts:number;ai_processed_at:unknown;ai_triage_retry_at:unknown;ai_error:string;status:string;ai_category:string}>('SELECT * FROM email_inbox')).rows[0];
describe('triage: claim, persistenza e tentativi limitati',()=>{
  it('newsletter viene salvata e conta come successo solo dopo persistenza',async()=>{
    expect((await salvaTriage(client(),id,company,async()=>result)).state).toBe('saved');
    expect(await row()).toMatchObject({ai_category:'newsletter',status:'triaged',ai_triage_attempts:1,ai_error:null});
  });
  it('due worker eseguono una sola classificazione',async()=>{
    const classify=vi.fn(async()=>result);
    const outcomes=await Promise.all([salvaTriage(client(),id,company,classify),salvaTriage(client(),id,company,classify)]);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(outcomes.map(o=>o.state).sort()).toEqual(['saved','skipped']);
  });
  it('non conta un UPDATE respinto come successo; il claim sopravvive',async()=>{
    failUpdates=true;
    expect((await salvaTriage(client(),id,company,async()=>result)).state).toBe('failed');
    expect(await row()).toMatchObject({status:'new',ai_triage_attempts:1,ai_processed_at:null});
    const classify=vi.fn(async()=>result);
    expect((await salvaTriage(client(),id,company,classify)).state).toBe('skipped');
    expect(classify).not.toHaveBeenCalled();
  });
  it('errore AI: backoff, massimo tre tentativi, poi parcheggiata senza perdere email',async()=>{
    const classify=vi.fn(async()=>{throw Error('sintetico');});
    for(let n=1;n<=3;n++) {
      expect((await salvaTriage(client(),id,company,classify)).state).toBe('failed');
      const r=await row(); expect(r.ai_triage_attempts).toBe(n);
      if(n<3) {
        expect(r.ai_triage_retry_at).not.toBeNull();
        expect((await salvaTriage(client(),id,company,classify)).state).toBe('skipped');
        await db.exec("UPDATE email_inbox SET ai_triage_retry_at=now()-interval '1 minute'");
      } else expect(r.ai_processed_at).not.toBeNull();
    }
    expect((await salvaTriage(client(),id,company,classify)).state).toBe('skipped');
    expect(classify).toHaveBeenCalledTimes(3);
  });
  it('recupera una lease scaduta ma non una fresca',async()=>{
    await client().rpc('',{p_email_id:id,p_company_id:company});
    expect((await salvaTriage(client(),id,company,async()=>result)).state).toBe('skipped');
    await db.exec("UPDATE email_inbox SET ai_triage_claimed_at=now()-interval '11 minutes'");
    expect((await salvaTriage(client(),id,company,async()=>result)).state).toBe('saved');
    expect((await row()).ai_triage_attempts).toBe(2);
  });
  it('un vecchio worker non completa la lease nuova',async()=>{
    const outcome=await salvaTriage(client(),id,company,async()=>{
      await db.exec("UPDATE email_inbox SET ai_triage_claimed_at=now()-interval '11 minutes'");
      await client().rpc('',{p_email_id:id,p_company_id:company});
      return result;
    });
    expect(outcome.state).toBe('skipped'); expect((await row()).ai_triage_attempts).toBe(2);
    expect((await row()).ai_processed_at).toBeNull();
  });
  it('non prende mail di un’altra azienda',async()=>{
    const classify=vi.fn(async()=>result);
    expect((await salvaTriage(client(),id,id,classify)).state).toBe('skipped'); expect(classify).not.toHaveBeenCalled();
  });
  it.each(['anon','authenticated'])('claim RPC vietata a %s',async role=>{
    await db.exec(`SET ROLE ${role}`);
    await expect(db.query('SELECT public.claim_email_triage($1,$2)',[id,company])).rejects.toThrow(/permission denied/);
  });
  it('service_role può prendere la lease',async()=>{
    await db.exec('SET ROLE service_role');
    expect((await client().rpc('',{p_email_id:id,p_company_id:company})).data).toBe(1);
  });
});
