import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { it,expect } from 'vitest';
const dedup=readFileSync('supabase/migrations/20260506090300_entity_attachments_dedup.sql','utf8');
const foundation=readFileSync('supabase/migrations/20270103000000_document_linker_foundation.sql','utf8');
it('la deduplica storica attende la fondazione e resta attiva dopo la creazione',async()=>{
 const db=new PGlite();try{await db.exec(dedup);await db.exec(`create table entity_attachments(id uuid,company_id uuid,entity_table text,entity_id uuid,storage_path text,attached_at timestamptz,deleted_at timestamptz,deleted_by uuid);insert into entity_attachments values(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','orders','10000000-0000-4000-8000-000000000002','file.pdf',now(),null,null),(gen_random_uuid(),'10000000-0000-4000-8000-000000000001','orders','10000000-0000-4000-8000-000000000002','file.pdf',now()-interval '1 day',null,null)`);
 const start=foundation.indexOf('-- Completa il FIX 13');const end=foundation.indexOf('-- ─── 2. document_link_suggestions');await db.exec(foundation.slice(start,end));expect((await db.query<{n:number}>('select count(*)::int n from entity_attachments where deleted_at is null')).rows[0].n).toBe(1);await db.exec(dedup);expect((await db.query('select * from pg_indexes where indexname=\'uniq_entity_attachments_dedup\'')).rows).toHaveLength(1);
 }finally{await db.close();}
},60000);
