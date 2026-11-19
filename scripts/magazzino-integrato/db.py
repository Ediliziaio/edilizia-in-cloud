"""PostgreSQL locale dedicato. Non legge .env e non accetta URL remoti."""
import json,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
CACHE=Path.home()/'Library/Caches/EdiliziaInCloud/magazzino-reconciliazione-20261118'
SOURCE=CACHE/'source'
REPORT=ROOT/'docs/ux/magazzino-riconciliazione'
PSQL='/opt/homebrew/opt/postgresql@17/bin/psql'
DATABASE='eic_magazzino_integrato'
ARGS=[PSQL,'-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-h','127.0.0.1','-p','55439','-U',os.environ.get('USER','andriciuc'),'-d',DATABASE]
class DbError(Exception):pass
def ident(x):return '"'+x.replace('"','""')+'"'
def lit(x):
 if x is None:return 'NULL'
 if isinstance(x,bool):return 'true' if x else 'false'
 if isinstance(x,(dict,list)):return "'"+json.dumps(x,ensure_ascii=False).replace("'","''")+"'::jsonb"
 return "'"+str(x).replace("'","''")+"'"
def sql(statement,actor=None,company=None,role='authenticated'):
 if actor:
  claims={'sub':actor,'role':role};headers={'x-azienda-scheda':company} if company else {}
  statement=f"BEGIN;SET LOCAL statement_timeout='10s';SET LOCAL ROLE {ident(role)};SET LOCAL request.jwt.claim.sub={lit(actor)};SET LOCAL request.jwt.claims={lit(json.dumps(claims))};SET LOCAL request.headers={lit(json.dumps(headers))};{statement};COMMIT;"
 p=subprocess.run(ARGS,input=statement,text=True,capture_output=True)
 if p.returncode:raise DbError(p.stderr.strip())
 rows=[s for s in p.stdout.splitlines() if s.strip()]
 if not rows:return None
 if rows[-1] in ('t','f'):return rows[-1]=='t'
 try:return json.loads(rows[-1])
 except json.JSONDecodeError:return rows[-1]
def run_file(path):return sql(Path(path).read_text())
def load(name):return json.loads((SOURCE/name).read_text())
