"""Offline, bounded UBL Request reader and draft Response compiler.
XSD validation is structural. No claim of Italian taxonomy, portal or declaration certification.
"""
import sys,json,base64,uuid,copy,re,datetime
from pathlib import Path
from lxml import etree as E
CBC='urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
CAC='urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'
ROOT='urn:oasis:names:specification:ubl:schema:xsd:QualificationApplication'
NS={'cbc':CBC,'cac':CAC}
from dgue_values import SUPPORTED,scalar,blank,active,checked,append_value,append_evidence
def text(n,p):return (n.findtext(p,namespaces=NS) or '').strip()
def instruction(prop):
 parts=[text(prop,'cbc:Description') or text(prop,'cbc:Name')]
 labels={'ExpectedAmount':'Importo richiesto','ExpectedValueNumeric':'Valore richiesto','ExpectedCode':'Codice richiesto','ExpectedID':'Riferimento richiesto','ValueUnitCode':'Unità','MinimumAmount':'Importo minimo','MaximumAmount':'Importo massimo'}
 for node in prop:
  local=E.QName(node).localname
  if local in labels and node.text and node.text.strip():parts.append(labels[local]+': '+node.text.strip()+(' '+node.get('currencyID') if node.get('currencyID') else ''))
 return ' · '.join(filter(None,parts))

def schema(version,kind):
 parser=E.XMLParser(resolve_entities=False,no_network=True,load_dtd=False)
 return E.XMLSchema(E.parse(str(Path(__file__).parent/'schemas'/version/'maindoc'/f'UBL-QualificationApplication{kind}-{version}.xsd'),parser))
def inspect(raw):
 if len(raw)>10_000_000:raise ValueError('Request troppo estesa: massimo 10 MB')
 if re.search(br'<!DOCTYPE|<!ENTITY',raw,re.I):raise ValueError('DTD ed entità esterne non ammessi')
 root=E.fromstring(raw,E.XMLParser(resolve_entities=False,no_network=True,load_dtd=False,huge_tree=False))
 if root.tag!='{'+ROOT+'Request-2}QualificationApplicationRequest':raise ValueError('Il file non è una QualificationApplicationRequest UBL')
 version=text(root,'cbc:UBLVersionID'); profile=' · '.join(filter(None,[text(root,'cbc:CustomizationID'),text(root,'cbc:ProfileID'),text(root,'cbc:ProfileExecutionID')])) or 'Profilo non dichiarato'
 warnings=[];valid=False
 if version in('2.2','2.3'):
  xsd=schema(version,'Request');valid=xsd.validate(root)
  if not valid:warnings.append('Request non valida rispetto allo XSD UBL '+version+': '+str(xsd.error_log.last_error.message)[:350])
 else:warnings.append('Versione UBL non supportata per la generazione: disponibile questionario di lavoro.')
 questions=[];groups=[];seen=set();ambiguous=False
 for ci,criterion in enumerate(root.findall('cac:TenderingCriterion',NS)):
  label=text(criterion,'cbc:Name') or text(criterion,'cbc:Description')
  criterion_id=text(criterion,'cbc:ID');criterion_type=text(criterion,'cbc:CriterionTypeCode')
  group_nodes=criterion.findall('.//cac:TenderingCriterionPropertyGroup',NS)+criterion.findall('.//cac:SubsidiaryTenderingCriterionPropertyGroup',NS)
  group_keys={node:f'g:{ci}:{gi}' for gi,node in enumerate(group_nodes)}
  for node,key in group_keys.items():
   direct=[text(x,'cbc:ID') for x in node.findall('.//cac:TenderingCriterionProperty',NS) if text(x,'cbc:TypeCode')=='QUESTION']
   own=[x for x in node.findall('cac:TenderingCriterionProperty',NS) if text(x,'cbc:TypeCode')=='QUESTION']
   repeat_domain=criterion_type.startswith('CRITERION.SELECTION.') or criterion_type in ('CRITERION.OTHER.EO_DATA.RELIES_ON_OTHER_CAPACITIES','CRITERION.OTHER.EO_DATA.SUBCONTRACTS_WITH_THIRD_PARTIES')
   groups.append({'key':key,'id':text(node,'cbc:ID'),'criterion_id':criterion_id,'criterion':label,'question_ids':direct,'repeatable':bool(repeat_domain and own and any(text(x,'cbc:ValueDataTypeCode') not in ('INDICATOR','NONE') for x in own)),'instructions':list(dict.fromkeys(instruction(x) for ancestor in [node,*node.iterancestors()] if ancestor is not criterion and criterion in ancestor.iterancestors() for x in ancestor.findall('cac:TenderingCriterionProperty',NS) if text(x,'cbc:TypeCode')!='QUESTION' and instruction(x)))})
  for prop in criterion.findall('.//cac:TenderingCriterionProperty',NS):
   if text(prop,'cbc:TypeCode')!='QUESTION':continue
   qid=text(prop,'cbc:ID');kind=text(prop,'cbc:ValueDataTypeCode');conditions=[]
   for group in prop.iterancestors():
    when=text(group,'cbc:PropertyGroupTypeCode')
    if when not in('ONTRUE','ONFALSE'):continue
    parent=group.getparent()
    parents=[x for x in parent.findall('cac:TenderingCriterionProperty',NS) if text(x,'cbc:TypeCode')=='QUESTION' and text(x,'cbc:ValueDataTypeCode')=='INDICATOR'] if parent is not None else []
    if len(parents)!=1:ambiguous=True
    else:conditions.append({'id':text(parents[0],'cbc:ID'),'value':'true' if when=='ONTRUE' else 'false'})
   if not qid or qid in seen:raise ValueError('Identificativi delle domande mancanti o duplicati')
   seen.add(qid)
   questions.append({'criterion_description':text(criterion,'cbc:Description'),'criterion_id':criterion_id,'group_key':group_keys.get(prop.getparent(),''),'id_attributes':dict(prop.find('cbc:ID',NS).attrib),'id':qid,'label':text(prop,'cbc:Description') or text(prop,'cbc:Name') or qid,'criterion':label,'type':kind,'supported':kind in SUPPORTED,'conditions':conditions,'condition':' e '.join(c['id']+' = '+c['value'] for c in conditions)})
 labels={q['id']:q['criterion']+' · '+q['label'] for q in questions}
 for q in questions:q['condition']=' e '.join(labels.get(c['id'],c['id'])+' = '+('Sì' if c['value']=='true' else 'No') for c in q['conditions'])
 if len(questions)>1000:raise ValueError('Massimo 1000 domande per Request')
 unsupported=sorted({q['type'] for q in questions if not q['supported']})
 if unsupported:warnings.append('Tipi da compilare sul servizio del portale: '+', '.join(unsupported)+'. Si può esportare un questionario di lavoro, non una Response completa.')
 if ambiguous:warnings.append('Condizioni o gruppi ripetibili non interpretabili automaticamente: percorso manuale richiesto.')
 if root.find('.//{urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2}UBLExtensions') is not None:
  warnings.append('Estensioni della Request: compatibilità da verificare nel servizio del portale.');ambiguous=True
 if not questions:warnings.append('La Request non contiene domande riconosciute. Non si genera una Response vuota.')
 warnings.append('Il controllo XSD verifica la struttura UBL. Tassonomia italiana, codici specifici e regole del portale non sono certificati: revisionare sul servizio DGUE della procedura.')
 meta={'request_id':text(root,'cbc:ID'),'profile':profile,'ubl_version':version,'questions':questions,'warnings':warnings,'request_xsd':valid,'can_generate':bool(valid and questions and not unsupported and not ambiguous),'groups':groups,'compiler_revision':3,'lots':[{'id':text(l,'cbc:ID'),'label':text(l,'cbc:ID')} for l in root.findall('cac:ProcurementProjectLot',NS)]}
 return root,meta

def compile_request(raw,input):
 root,meta=inspect(raw);answers=input.get('answers',{});identity=input.get('identity',{})
 if input.get('confirmed') is not True:raise ValueError('Confermare le dichiarazioni')
 if not input.get('working_only') and any(not identity.get(k,'').strip() for k in('name','tax_id','signer','country')):raise ValueError('Completare identità dell’operatore e dichiarante')
 if not input.get('working_only') and not re.fullmatch('[A-Z]{2,3}',identity.get('country','')):raise ValueError('Codice paese da verificare nelle istruzioni')
 allowed={q['id'] for q in meta['questions']}
 if set(answers)-allowed:raise ValueError('Risposta per una domanda non presente nella Request')
 chosen=input.get('lots',[]);lot_ids=[l['id'] for l in meta['lots']]
 if len(set(chosen))!=len(chosen) or set(chosen)-set(lot_ids) or lot_ids and not chosen and not input.get('working_only'):raise ValueError('Confermare i lotti effettivi della Request')
 if input.get('working_only') or not meta['can_generate']:
  return {'name':'QUESTIONARIO_DGUE_DA_COMPLETARE.json','content_base64':base64.b64encode(json.dumps({'kind':'questionario_di_lavoro_NON_Response_DGUE','request':meta,'identity':identity,'lots':chosen,'answers':answers,'repetitions':input.get('repetitions',{})},ensure_ascii=False,indent=2).encode()).decode(),'validation':{'xsd':False,'business_rules':'Questionario di lavoro: usare il servizio DGUE della procedura'},'unresolved':max(1,sum(active(q,answers) is not False and blank(answers.get(q['id'])) for q in meta['questions']))}
 result=E.Element('{'+ROOT+'Response-2}QualificationApplicationResponse',nsmap={None:ROOT+'Response-2','cbc':CBC,'cac':CAC})
 def add(parent,namespace,name,value,**attrs):
  e=E.SubElement(parent,'{'+namespace+'}'+name,**attrs);e.text=value;return e
 technical_attrs={'schemeAgencyID':'EIC-LOCAL'} if any(q.get('id_attributes',{}).get('schemeVersionID') in ('2.1.1','3.3.0') for q in meta['questions']) else {}
 # Copy compatible original headers and procurement scope, preserve all criteria.
 for key in('UBLVersionID','CustomizationID','ProfileID','ProfileExecutionID'):
  n=root.find('cbc:'+key,NS)
  if n is not None:
   copied=copy.deepcopy(n)
   if key=='CustomizationID':copied.text=(copied.text or '').replace(':biitrdm070:',':biitrdm092:')
   result.append(copied)
 add(result,CBC,'ID','EIC-RESPONSE-'+str(uuid.uuid4()),**technical_attrs);add(result,CBC,'CopyIndicator','false');add(result,CBC,'UUID',str(uuid.uuid4()),**technical_attrs)
 n=root.find('cbc:ContractFolderID',NS)
 if n is None:raise ValueError('Riferimento della procedura assente')
 result.append(copy.deepcopy(n));add(result,CBC,'IssueDate',datetime.date.today().isoformat())
 if input.get('group_name'):add(result,CBC,'EconomicOperatorGroupName',input['group_name'])
 for key in('VersionID','ProcedureCode','QualificationApplicationTypeCode'):
  n=root.find('cbc:'+key,NS)
  if n is not None:result.append(copy.deepcopy(n))
 add(result,CBC,'Note','BOZZA da revisionare sul servizio DGUE della procedura. Dichiarante: '+identity['signer'])
 for n in root.findall('cac:ContractingParty',NS):result.append(copy.deepcopy(n))
 operator=E.SubElement(result,'{'+CAC+'}EconomicOperatorParty')
 if input.get('operator_role_code'):
  role=E.SubElement(operator,'{'+CAC+'}EconomicOperatorRole');role_version=next((n.get('listVersionID') for n in root.findall('.//cbc:CriterionTypeCode',NS) if n.get('listVersionID') in ('2.1.1','3.3.0')),meta.get('ubl_version',''))
  add(role,CBC,'RoleCode',input['operator_role_code'],listID='EORoleType',listAgencyID='EU-COM-GROW',listVersionID=role_version)
 party=E.SubElement(operator,'{'+CAC+'}Party')
 ident=E.SubElement(party,'{'+CAC+'}PartyIdentification');add(ident,CBC,'ID',identity['tax_id'],**technical_attrs)
 name=E.SubElement(party,'{'+CAC+'}PartyName');add(name,CBC,'Name',identity['name'])
 address=E.SubElement(party,'{'+CAC+'}PostalAddress');country=E.SubElement(address,'{'+CAC+'}Country');add(country,CBC,'IdentificationCode',identity['country'])
 contact=E.SubElement(party,'{'+CAC+'}Contact');add(contact,CBC,'Name',identity['signer'])
 for n in root.findall('cac:ProcurementProject',NS):result.append(copy.deepcopy(n))
 for n in root.findall('cac:ProcurementProjectLot',NS):
  if text(n,'cbc:ID') in chosen:result.append(copy.deepcopy(n))
 for n in root.findall('cac:TenderingCriterion',NS):result.append(copy.deepcopy(n))
 # Repeated leaf groups are explicit user additions. Clone their properties and
 # regenerate links, preserving every original criterion and requirement.
 evidences=[];work=[(q,answers.get(q['id']),answers) for q in meta['questions']]
 repetitions=input.get('repetitions',{})
 if not isinstance(repetitions,dict) or len(repetitions)>100:raise ValueError('Gruppi ripetuti non validi')
 clone_bytes=0
 copied_criteria=result.findall('cac:TenderingCriterion',NS)
 original_groups={}
 for ci,criterion in enumerate(copied_criteria):
  nodes=criterion.findall('.//cac:TenderingCriterionPropertyGroup',NS)+criterion.findall('.//cac:SubsidiaryTenderingCriterionPropertyGroup',NS)
  original_groups.update({f'g:{ci}:{gi}':node for gi,node in enumerate(nodes)})
 for key,instances in repetitions.items():
  group=next((g for g in meta['groups'] if g['key']==key and g['repeatable']),None)
  if not group or not isinstance(instances,list) or len(instances)>20:raise ValueError('Gruppo non ripetibile o troppe ripetizioni')
  if len(work)+len(instances)*len(group['question_ids'])>3000:raise ValueError('Massimo 3000 risposte comprese le ripetizioni')
  original=original_groups[key]
  clone_bytes+=len(E.tostring(original))*len(instances)
  if clone_bytes>5_000_000:raise ValueError('Gruppi aggiuntivi troppo estesi: ridurre le ripetizioni')
  for instance in instances:
   if set(instance)-set(group['question_ids']):raise ValueError('Domanda estranea al gruppo ripetuto')
   cloned=copy.deepcopy(original);original.addnext(cloned)
   for node in cloned.findall('.//cbc:ID',NS):node.text=str(uuid.uuid4())
   # ID on the group itself is not a descendant property.
   cloned.find('cbc:ID',NS).text=str(uuid.uuid4())
   props=cloned.findall('.//cac:TenderingCriterionProperty',NS)
   source_props=original.findall('.//cac:TenderingCriterionProperty',NS)
   remap={text(a,'cbc:ID'):text(b,'cbc:ID') for a,b in zip(source_props,props)}
   context={**answers,**{remap[k]:v for k,v in instance.items()}}
   for source_prop,prop in zip(source_props,props):
    old_id=text(source_prop,'cbc:ID')
    q=next((q for q in meta['questions'] if q['id']==old_id),None)
    if q:work.append(({**q,'id':text(prop,'cbc:ID'),'conditions':[{**c,'id':remap.get(c['id'],c['id'])} for c in q['conditions']]},instance.get(old_id),context))
 for q,answer,context in work:
  applicable=active(q,context)
  if applicable is False:continue
  if applicable is None:raise ValueError('Condizione ancora da risolvere: '+q['label'])
  try:value=checked(q,answer,chosen)
  except Exception as e:raise ValueError(str(e)+': '+q['label'])
  response=E.SubElement(result,'{'+CAC+'}TenderingCriterionResponse');add(response,CBC,'ID',str(uuid.uuid4()),**technical_attrs);add(response,CBC,'ValidatedCriterionPropertyID',q['id'],**q.get('id_attributes',{}))
  append_value(response,q,value,evidences)
 for n in root.findall('cac:AdditionalDocumentReference',NS):result.append(copy.deepcopy(n))
 ref=E.SubElement(result,'{'+CAC+'}AdditionalDocumentReference');add(ref,CBC,'ID',meta['request_id'],**dict(root.find('cbc:ID',NS).attrib));add(ref,CBC,'DocumentDescription','Request originale della procedura')
 append_evidence(result,evidences)
 xsd=schema(meta['ubl_version'],'Response')
 if not xsd.validate(result):raise ValueError('Response non valida XSD: '+str(xsd.error_log.last_error.message)[:500])
 output=E.tostring(result,xml_declaration=True,encoding='UTF-8',pretty_print=True)
 if len(output)>5_000_000:raise ValueError('Response troppo estesa per il compilatore locale')
 return {'name':'BOZZA_DGUE_Response.xml','content_base64':base64.b64encode(output).decode(),'validation':{'xsd':True,'business_rules':'Controllati ID, collegamenti Request/Response, lotti, valori tipizzati, periodi, prove e gruppi ripetuti. Tassonomia italiana e regole del portale da verificare.'},'unresolved':1}

def validate_answers(meta,input):
 answers=input.get('answers',{});chosen=input.get('lots',[]);items=[]
 for q in meta['questions']:
  state=active(q,answers);error=None
  if state is True:
   try:checked(q,answers.get(q['id']),chosen)
   except Exception as e:error=str(e)
  items.append({'id':q['id'],'state':'inactive' if state is False else 'pending' if state is None else 'invalid' if error else 'complete','error':error})
 return {'items':items,'complete':sum(i['state']=='complete' for i in items),'inactive':sum(i['state']=='inactive' for i in items),'pending':sum(i['state'] in ('pending','invalid') for i in items),'can_compile':meta['can_generate'] and all(i['state'] in ('complete','inactive') for i in items)}

def main():
 body=json.load(sys.stdin);raw=Path(body['source']).read_bytes()
 if body['operation']=='inspect':_,meta=inspect(raw);print(json.dumps(meta,ensure_ascii=False))
 elif body['operation']=='check':_,meta=inspect(raw);print(json.dumps(validate_answers(meta,body),ensure_ascii=False))
 else:print(json.dumps(compile_request(raw,body),ensure_ascii=False))
if __name__=='__main__':
 try:main()
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
