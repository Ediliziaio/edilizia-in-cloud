"""Offline XML and pinned European Schematron validation; no portal submission."""
import sys,json,re,hashlib,time
from pathlib import Path
from lxml import etree as E
from dgue import schema,CBC,CAC,ROOT,NS
BASE=Path(__file__).parent/'validation-assets'
SVRL='http://purl.oclc.org/dsdl/svrl'
REVISION=1

def parse(raw):
 if len(raw)>10_000_000:raise ValueError('XML troppo esteso: massimo 10 MB')
 if re.search(br'<!DOCTYPE|<!ENTITY',raw,re.I):raise ValueError('DTD ed entità esterne non ammessi')
 return E.fromstring(raw,E.XMLParser(resolve_entities=False,no_network=True,load_dtd=False,huge_tree=False))
def shape(n):return (n.tag,tuple(sorted(n.attrib.items())),' '.join((n.text or '').split()),tuple(shape(c) for c in n))
def value(root,name):return (root.findtext('cbc:'+name,namespaces=NS) or '').strip()
def profile(root):
 versions=[]
 for name in ('ProfileExecutionID','CustomizationID'):
  n=root.find('cbc:'+name,NS)
  if n is not None:versions += [n.text or '',n.get('schemeVersionID','')]
 versions += root.xpath('//cbc:CriterionTypeCode/@listVersionID',namespaces=NS)
 version=next((v for v in ('3.3.0','2.1.1') if any(v in s for s in versions)),None)
 execution=value(root,'ProfileExecutionID')
 recognized={'3.3.0':{'espd-edmv3.3.0'},'2.1.1':{'espd-edmv2.1.1-basic','espd-edmv2.1.1-extended'}}
 strict=execution.casefold() in recognized.get(version,set())
 return {'bundle':version,'execution_id':execution,'profile_id':value(root,'ProfileID'),'strict_match':strict,'label':('ESPD-EDM '+version) if version else 'Profilo non riconosciuto','scope':'European rules; portal-specific rules not certified'}

def manifest(version):
 base=BASE/version;data=json.loads((base/'manifest.json').read_text())
 for entry in data['files']:
  p=(base/entry['file']).resolve()
  if not p.is_relative_to(base.resolve()) or hashlib.sha256(p.read_bytes()).hexdigest()!=entry['sha256']:raise ValueError('Pacchetto delle regole modificato o incompleto: '+entry['file'])
 return base,data

def validate(raw,request_raw=None):
 started=time.monotonic();root=parse(raw);kind='Request' if root.tag=='{'+ROOT+'Request-2}QualificationApplicationRequest' else 'Response' if root.tag=='{'+ROOT+'Response-2}QualificationApplicationResponse' else None
 if not kind:raise ValueError('XML non riconosciuto come DGUE Request o Response')
 version=value(root,'UBLVersionID');findings=[];checks=[];engine_errors=[]
 def add(rule,message,location='/',severity='error',layer='coerenza',**extra):findings.append({'rule_id':rule,'message':message,'location':location,'severity':severity,'layer':layer,**extra})
 xsd_ok=False
 if version in ('2.2','2.3'):
  xsd=schema(version,kind);xsd_ok=xsd.validate(root)
  if not xsd_ok:
   for e in list(xsd.error_log)[:100]:add('UBL-XSD',e.message,e.path or '/',line=e.line,layer='struttura')
 else:add('UBL-VERSION','Versione UBL non supportata: '+version,layer='struttura')
 checks.append({'name':'XSD UBL '+version,'status':'passed' if xsd_ok else 'failed'})
 p=profile(root);ids={};questions={}
 if p['bundle']=='2.1.1':
  for filename,query,attribute in [('CountryCodeIdentifier.gc','.//cac:Country/cbc:IdentificationCode',None),('CurrencyCode.gc','.//cbc:ResponseAmount','currencyID')]:
   catalog=E.parse(str(BASE/'2.1.1/cl/gc'/filename),E.XMLParser(resolve_entities=False,no_network=True));allowed=set(catalog.xpath('//Row/Value[@ColumnRef="code"]/SimpleValue/text()'))
   for node in root.findall(query,NS):
    code=node.get(attribute,'') if attribute else (node.text or '').strip()
    if code and code not in allowed:add('EIC-CODE-LIST','Codice non presente nell’elenco del profilo '+filename+': '+code,root.getroottree().getpath(node))
 for prop in root.findall('.//cac:TenderingCriterionProperty',NS):
  if prop.findtext('cbc:TypeCode',namespaces=NS)=='QUESTION':
   qid=prop.findtext('cbc:ID',namespaces=NS);questions[qid]=prop
 for node in root.findall('cac:TenderingCriterionResponse',NS):
  qid=node.findtext('cbc:ValidatedCriterionPropertyID',namespaces=NS)
  if qid not in questions:add('EIC-RESPONSE-LINK','Risposta senza domanda corrispondente',root.getroottree().getpath(node),question_id=qid)
  if qid in ids:add('EIC-RESPONSE-DUPLICATE','Più risposte collegate alla stessa proprietà',root.getroottree().getpath(node),question_id=qid)
  ids[qid]=node
  rv=node.findall('cac:ResponseValue',NS)
  for v in rv:
   typed={E.QName(n).localname for n in v if E.QName(n).localname!='ID'}
   if len(typed)>1:add('EIC-VALUE-TYPE','Valori di tipi diversi nella stessa risposta',root.getroottree().getpath(v),question_id=qid)
 evidence={n.findtext('cbc:ID',namespaces=NS) for n in root.findall('cac:Evidence',NS)}
 for n in root.findall('.//cac:EvidenceSupplied/cbc:ID',NS):
  if n.text not in evidence:add('EIC-EVIDENCE-LINK','Riferimento a prova non presente nella Response',root.getroottree().getpath(n))
 if request_raw is not None and kind=='Response':
  request=parse(request_raw)
  if request.tag!='{'+ROOT+'Request-2}QualificationApplicationRequest':raise ValueError('Il file collegato non è una Request DGUE')
  if value(root,'ContractFolderID')!=value(request,'ContractFolderID'):add('EIC-PROCEDURE','Il riferimento alla gara non corrisponde alla Request','/cbc:ContractFolderID')
  references=[n.findtext('cbc:ID',namespaces=NS) for n in root.findall('cac:AdditionalDocumentReference',NS)]
  if value(request,'ID') not in references:add('EIC-REQUEST-REFERENCE','Riferimento alla Request originale mancante','/cac:AdditionalDocumentReference')
  allowed={n.findtext('cbc:ID',namespaces=NS) for n in request.findall('cac:ProcurementProjectLot',NS)}
  for lot in root.findall('cac:ProcurementProjectLot',NS):
   if lot.findtext('cbc:ID',namespaces=NS) not in allowed:add('EIC-LOT','Lotto non presente nella Request',root.getroottree().getpath(lot))
  copied={n.findtext('cbc:ID',namespaces=NS):n for n in root.findall('cac:TenderingCriterion',NS)}
  for criterion in request.findall('cac:TenderingCriterion',NS):
   cid=criterion.findtext('cbc:ID',namespaces=NS);other=copied.get(cid)
   if other is None:add('EIC-CRITERION','Criterio della Request mancante nella Response','/cac:TenderingCriterion',criterion_id=cid);continue
   originals={n.findtext('cbc:ID',namespaces=NS) for n in criterion.findall('.//cac:TenderingCriterionProperty',NS) if n.findtext('cbc:ID',namespaces=NS)}
   current={n.findtext('cbc:ID',namespaces=NS) for n in other.findall('.//cac:TenderingCriterionProperty',NS)}
   from collections import Counter
   available=Counter(shape(n) for n in other.findall('.//cac:TenderingCriterionProperty',NS))
   for original in criterion.findall('.//cac:TenderingCriterionProperty',NS):
    oid=original.findtext('cbc:ID',namespaces=NS)
    if oid:
     key=shape(original)
     if available[key]>0:available[key]-=1
     else:add('EIC-PROPERTY-CHANGED','Istruzioni o valori della proprietà originale modificati','/cac:TenderingCriterion',criterion_id=cid,question_id=oid)
   if not originals<=current:add('EIC-PROPERTY','Proprietà originali del criterio mancanti nella Response','/cac:TenderingCriterion',criterion_id=cid)
 checks.append({'name':'Collegamenti, gara, criteri, lotti e prove','status':'failed' if any(f['layer']=='coerenza' for f in findings) else 'passed'})
 packages=None;svrl_total=0
 if p['bundle'] and xsd_ok:
  base,packages=manifest(p['bundle']);folder=base/('val/schematron/ESPD'+kind+'-2.1.1/xsl' if p['bundle']=='2.1.1' else 'validation/ESPD'+kind+'/xsl')
  from saxonche import PySaxonProcessor
  with PySaxonProcessor(license=False) as proc:
   proc.set_configuration_property('http://saxon.sf.net/feature/allowedProtocols','file')
   proc.set_configuration_property('http://saxon.sf.net/feature/allow-external-functions','false')
   xml=proc.parse_xml(xml_text=E.tostring(root,encoding='unicode'));xslt=proc.new_xslt30_processor()
   for path in sorted(folder.glob('*.xsl')):
    if path.name.endswith('.sch.xsl'):continue
    content=path.read_text();calls=re.findall(r'(?<![\w-])(?:document|doc)\s*\(([^)]*)\)',content)
    if any(not re.fullmatch(r"\s*'[^']*'\s*",s) for s in calls) or re.search(r'collection\s*\(|unparsed-text|xsl:result-document|xsl:include|xsl:import|xsl:evaluate',content):raise ValueError('Regola con accessi esterni non consentiti: '+path.name)
    try:
     executable=xslt.compile_stylesheet(stylesheet_file=str(path.resolve()));result=executable.transform_to_string(xdm_node=xml);svrl=E.fromstring(result.encode(),E.XMLParser(resolve_entities=False,no_network=True))
     if E.QName(svrl).namespace!=SVRL:raise ValueError('Risultato non SVRL')
     failures=svrl.findall('.//{'+SVRL+'}failed-assert');svrl_total+=len(failures)
     for f in failures:
      message=' '.join(''.join(f.itertext()).split());location=f.get('location','/')
      try:
       match=root.xpath(location,namespaces=NS)
       node=match[0] if match and isinstance(match[0],E._Element) else None
      except Exception:node=None
      qid=None;cid=None
      if node is not None:
       for ancestor in [node,*node.iterancestors()]:
        local=E.QName(ancestor).localname
        if local=='TenderingCriterionProperty':qid=ancestor.findtext('cbc:ID',namespaces=NS)
        if local=='TenderingCriterion':cid=ancestor.findtext('cbc:ID',namespaces=NS)
      add(f.get('id') or 'ESPD-BR',message,location,('warning' if f.get('flag','').lower() in ('warning','warn','info') else 'error'),'schematron',question_id=qid,criterion_id=cid,rule_file=path.name)
     checks.append({'name':path.stem,'status':'failed' if failures else 'passed','findings':len(failures)})
    except Exception as e:engine_errors.append({'file':path.name,'error':str(e)[:600]});checks.append({'name':path.stem,'status':'not_run'})
 else:checks.append({'name':'Schematron europeo','status':'not_run','reason':'Profilo non riconosciuto oppure XML non valido'})
 # Keep every distinct finding; never turn a truncated report into a passed result.
 findings=list({json.dumps(f,sort_keys=True):f for f in findings}.values());total=len(findings);truncated=total>5000
 strict_pass=xsd_ok and bool(p['strict_match']) and not engine_errors and not any(f['severity']=='error' for f in findings)
 local_pass=xsd_ok and not any(f['layer']=='coerenza' and f['severity']=='error' for f in findings)
 return {'validator_revision':REVISION,'kind':kind,'sha256':hashlib.sha256(raw).hexdigest(),'ubl_version':version,'profile':p,'xsd':xsd_ok,'local_consistency':local_pass,'request_compared':request_raw is not None and kind=='Response','european_rules_passed':strict_pass,'status':'passed' if strict_pass else 'needs_review' if local_pass and not engine_errors else 'failed','checks':checks,'findings':findings[:5000],'finding_count':total,'truncated':truncated,'engine_errors':engine_errors,'rules_commit':packages['commit'] if packages else None,'warnings':(['Il profilo della procedura differisce dal profilo europeo riconosciuto. I risultati Schematron sono un confronto di riferimento, non una certificazione del portale.'] if not p['strict_match'] else [])+['Le dichiarazioni dell’impresa e l’accettazione sul portale richiedono revisione. Nessun documento viene firmato o inviato.'],'duration_ms':round((time.monotonic()-started)*1000)}
if __name__=='__main__':
 try:
  data=json.load(sys.stdin);request=Path(data['request_source']).read_bytes() if data.get('request_source') else None;print(json.dumps(validate(Path(data['source']).read_bytes(),request),ensure_ascii=False))
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
