#!/usr/bin/env python3
"""Run the strict HTTP permission matrix against the networkless local fixture."""
from pathlib import Path
import argparse, os, subprocess
p=argparse.ArgumentParser()
p.add_argument('--container',default='eic-history-10fd4bba52')
p.add_argument('--report',required=True)
p.add_argument('--strict',action='store_true',help='All checks are always strict')
p.add_argument('--apply-local-fix',action='store_true',help='Apply local draft migrations to the synthetic fixture only')
a=p.parse_args();root=Path(__file__).resolve().parents[1]
env=dict(os.environ,EIC_PERMISSIONS_FIXTURE=a.container)
if a.apply_local_fix:
    script="import {assertLocalFixture,sql} from './scripts/permissions-lab/backend.mjs';import {readFileSync} from 'node:fs';assertLocalFixture();"
    for name in ['20290312190001_permessi_tariffe_personale_ufficio.sql','20290312190002_protezione_economia_collaboratori_ufficio.sql','20290312190003_uffici_commesse_crm_separati.sql','20290312190004_protezione_scrittura_file_commessa.sql']:
        script+=f"sql('begin;'+readFileSync('supabase/migrations/{name}','utf8')+'commit;');"
    subprocess.run(['node','--input-type=module','-e',script],cwd=root,env=env,check=True)
subprocess.run(['node','scripts/permissions-lab/verify.mjs','--report',str(Path(a.report).resolve())],cwd=root,env=env,check=True)
