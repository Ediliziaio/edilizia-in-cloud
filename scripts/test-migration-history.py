#!/usr/bin/env python3
"""Replay every checked-in migration in an isolated, networkless PostgreSQL.
No hosted project, credentials, data copy, cron execution or paid branch is used.
Requires Docker; images can be preloaded. Errors report filenames, never SQL.
"""
from pathlib import Path
import json, os, re, subprocess, tempfile, time, uuid
ROOT = Path(__file__).resolve().parents[1]
PG = 'public.ecr.aws/supabase/postgres:17.11.0.018'
STORAGE = 'public.ecr.aws/supabase/storage-api:v1.84.19'
AUTH = 'public.ecr.aws/supabase/gotrue:v2.197.0'
name = 'eic-history-' + uuid.uuid4().hex[:10]
storage_name = name + '-storage'
auth_name = name + '-auth'
def run(args, **kwargs):
    return subprocess.run(args, text=True, capture_output=True, check=True, **kwargs)
def sql(content):
    return run(['docker','exec','-i',name,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-q'], input=content)
try:
    for image in [PG, STORAGE, AUTH]:
        if subprocess.run(['docker','image','inspect',image], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            run(['docker','pull',image])
    run(['docker','run','-d','--name',name,'--network','none','-e','POSTGRES_PASSWORD=offline-fixture-only',PG])
    for attempt in range(120):
        if 'init process complete' in run(['docker','logs',name]).stdout and subprocess.run(['docker','exec',name,'pg_isready','-U','supabase_admin'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0: break
        time.sleep(1)
    else: raise RuntimeError('PostgreSQL fixture did not start')
    sql("alter system set cron.launch_active_jobs='off';select pg_reload_conf();")
    sql("""create or replace function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    drop schema if exists storage cascade;create schema storage authorization supabase_storage_admin;
    grant create on schema public to supabase_storage_admin;
    alter default privileges for role supabase_storage_admin in schema storage grant all on tables to postgres,service_role;
    alter default privileges for role supabase_storage_admin in schema storage grant all on sequences to postgres,service_role;
    """)
    with tempfile.TemporaryDirectory(prefix='eic-history-') as temp:
        tmp=Path(temp)
        run(['docker','create','--name',auth_name,'--network','none',AUTH])
        run(['docker','cp',auth_name+':/usr/local/etc/auth/migrations',str(tmp/'auth')])
        for p in sorted((tmp/'auth').glob('*.up.sql')):
            body=re.sub(r'\{\{\s*index \.Options "Namespace"\s*\}\}', 'auth',p.read_text())
            sql('begin;set local search_path=auth,public,extensions;\n'+body+'\n;commit;')
        # The storage container is never started; extract official platform SQL.
        run(['docker','create','--name',storage_name,'--network','none',STORAGE])
        run(['docker','cp',storage_name+':/app/migrations',str(tmp/'platform')])
        platform=sorted((tmp/'platform'/'tenant').glob('*.sql'), key=lambda p:int(p.name.split('-')[0]))
        if len(platform) != 74: raise RuntimeError('Unexpected Storage foundation version')
        for p in platform:
            body=p.read_text()
            if 'postgres-migrations ignore' in body: continue
            transaction='disable-transaction' not in body
            sql(('begin;' if transaction else '')+"set storage.install_roles='false';set storage.multitenant='false';set search_path=storage,public;set role supabase_storage_admin;\n"+body+('\n;commit;' if transaction else ''))
        migrations=sorted((ROOT/'supabase/migrations').glob('*.sql'))
        versions=[p.name.split('_')[0] for p in migrations]
        if len(set(versions)) != len(versions): raise RuntimeError('Duplicate migration versions')
        # One psql session avoids thousands of Docker execs. Each file is atomic.
        run(['docker','cp',str(ROOT/'supabase/migrations'),name+':/tmp/app-migrations'])
        plan=tmp/'replay.sql'
        with plan.open('w') as out:
            out.write("create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text);\n")
            for p in migrations:
                version, label=p.stem.split('_',1)
                out.write(f"\\echo MIGRATION {p.name}\nbegin;set local search_path=public,extensions;\n\\ir /tmp/app-migrations/{p.name}\n;\ninsert into supabase_migrations.schema_migrations(version,name) values('{version}','{label}');\ncommit;\n")
            out.write("select count(*) as applied_migrations from supabase_migrations.schema_migrations;select count(*) as deferred_patches from private.recovered_dependency_patches;\n")
        run(['docker','cp',str(plan),name+':/tmp/replay.sql'])
        result=subprocess.run(['docker','exec',name,'psql','-X','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1','-q','-f','/tmp/replay.sql'],text=True,capture_output=True)
        # SQL may contain legacy credentials; never print stderr/context or bodies.
        applied=[x.removeprefix('MIGRATION ') for x in result.stdout.splitlines() if x.startswith('MIGRATION ')]
        if result.returncode:
            print(json.dumps({'ok':False,'file':applied[-1] if applied else 'foundation','completed':max(0,len(applied)-1)}),flush=True)
            if os.getenv('EIC_LOCAL_PRIVATE_ERROR'):
                Path(os.environ['EIC_LOCAL_PRIVATE_ERROR']).write_text(result.stderr)
            raise RuntimeError('Migration replay failed; SQL context withheld')
        pending=sql('select count(*) from private.recovered_dependency_patches;').stdout.strip()
        if not pending.endswith('(1 row)') or not __import__('re').search(r'\n\s*0\s*\n', '\n'+pending): raise RuntimeError('Deferred patches remain')
        print(json.dumps({'ok':True,'application_migrations':len(applied),'storage_foundations':len(platform),'deferred_patches':0,'network':'none','cron_execution':False}),flush=True)
except subprocess.CalledProcessError as exc:
    if os.getenv('EIC_LOCAL_PRIVATE_ERROR'): Path(os.environ['EIC_LOCAL_PRIVATE_ERROR']).write_text(exc.stderr or '')
    raise SystemExit('Offline database setup failed (SQL output withheld)')
finally:
    if os.getenv('EIC_LOCAL_KEEP_FIXTURE'):
        print(json.dumps({'local_fixture':name}),flush=True)
    for container in ([storage_name,auth_name] if os.getenv('EIC_LOCAL_KEEP_FIXTURE') else [name,storage_name,auth_name]):
        subprocess.run(['docker','rm','-f',container],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
