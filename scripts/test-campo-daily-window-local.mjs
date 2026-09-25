// Disposable SQL fixture, in the marked LOCAL container. Everything rolls back.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const sql=text=>execFileSync('docker',['--context','colima-eic-squadre','exec','-i','supabase_db_squadre-backend.Zi9DAN','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-Atq'],{input:text,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
assert.equal(sql('SELECT marker FROM public.eic_crew_local_test_marker'),'synthetic-shifts-v1');
assert.equal(sql("SELECT coalesce(to_regclass('public.campo_rapportini')::text,'')"),'','Do not touch an existing report table');
const proposal=await readFile(new URL('../supabase/proposals/campo_daily_report_window_local_proposal.sql',import.meta.url),'utf8');
const c=(condition,label)=>`SELECT pg_temp.check_daily((${condition}),'${label}');`;
const nowDay="(clock_timestamp() AT TIME ZONE 'Europe/Rome')::date";
const fail=(statement,label)=>`DO $$ BEGIN ${statement}; RAISE EXCEPTION 'unexpected acceptance'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END $$; ${c('true',label)}`;
const result=sql(`BEGIN;
CREATE FUNCTION pg_temp.check_daily(ok boolean,label text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN IF ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %',label; END IF; RETURN 'PASS '||label; END $$;
CREATE TABLE public.campo_rapportini(id int PRIMARY KEY,data_lavoro date NOT NULL,user_id uuid,company_id uuid,order_id uuid,stato text DEFAULT 'inviato',ore_lavorate numeric,descrizione_lavori text,pdf_url text,approvato boolean,approvato_da uuid,approvato_at timestamptz,motivo_rifiuto text,updated_at timestamptz);
-- Legacy rows predate the rule. Nothing backfills/deletes them.
INSERT INTO public.campo_rapportini(id,data_lavoro,ore_lavorate) VALUES(10,${nowDay}-10,8);
${proposal}
${c("public.campo_report_day_allowed_v1('2026-09-23','2026-09-24 23:59:59.999+02')",'last millisecond of following day accepted')}
${c("NOT public.campo_report_day_allowed_v1('2026-09-23','2026-09-25 00:00:00+02')",'midnight rejects expired day')}
${c("public.campo_report_day_allowed_v1('2026-03-28','2026-03-29 23:59:59+02')",'spring DST calendar window')}
${c("public.campo_report_day_allowed_v1('2026-10-24','2026-10-25 23:59:59+01')",'autumn DST calendar window')}
${c("public.campo_report_day_allowed_v1('2025-12-31','2026-01-01 23:59:59+01')",'year boundary')}
GRANT SELECT,INSERT,UPDATE ON public.campo_rapportini TO authenticated;
SET LOCAL ROLE authenticated;
INSERT INTO public.campo_rapportini(id,data_lavoro,ore_lavorate) VALUES(1,${nowDay},4),(2,${nowDay}-1,3);
${c('(SELECT count(*) FROM public.campo_rapportini WHERE id IN(1,2))=2','authenticated today and yesterday accepted')}
${fail(`INSERT INTO public.campo_rapportini(id,data_lavoro) VALUES(3,${nowDay}-2)`,'old workday rejected')}
${fail(`INSERT INTO public.campo_rapportini(id,data_lavoro) VALUES(4,${nowDay}+1)`,'future workday rejected')}
${fail(`UPDATE public.campo_rapportini SET data_lavoro=${nowDay} WHERE id=10`,'existing report cannot be redated')}
${fail('UPDATE public.campo_rapportini SET ore_lavorate=12 WHERE id=10','expired report hours cannot be replaced')}
UPDATE public.campo_rapportini SET stato='approvato',approvato=true,approvato_at=clock_timestamp() WHERE id=10;
${c("(SELECT stato='approvato' AND ore_lavorate=8 FROM public.campo_rapportini WHERE id=10)",'office approval remains possible after deadline')}
UPDATE public.campo_rapportini SET pdf_url='local-fixture.pdf' WHERE id=10;
${c("(SELECT pdf_url='local-fixture.pdf' FROM public.campo_rapportini WHERE id=10)",'derived PDF update remains possible')}
UPDATE public.campo_rapportini SET stato='rifiutato',motivo_rifiuto='Test' WHERE id=10;
${c("(SELECT stato='rifiutato' FROM public.campo_rapportini WHERE id=10)",'office rejection remains possible')}
${fail("UPDATE public.campo_rapportini SET stato='inviato' WHERE id=10",'expired resubmission rejected')}
RESET ROLE;
${c("NOT has_function_privilege('anon','public.campo_report_day_allowed_v1(date,timestamptz)','EXECUTE')",'anonymous helper execution revoked')}
ROLLBACK;`);
const lines=result.split('\n').filter(l=>l.startsWith('PASS '));assert.equal(lines.length,15);console.log(lines.join('\n'));console.log('15 SQL checks passed; transaction rolled back; existing remote data untouched.');
