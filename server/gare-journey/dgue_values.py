"""Typed ESPD values. User declarations are never inferred here."""
import datetime,re,uuid
from decimal import Decimal
from lxml import etree as E
CBC='urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
CAC='urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2'
SUPPORTED={'INDICATOR','DESCRIPTION','DATE','IDENTIFIER','URL','QUANTITY_INTEGER','QUANTITY_YEAR','NUMERIC','AMOUNT','CODE','CODE_COUNTRY','ECONOMIC_OPERATOR_IDENTIFIER','EVIDENCE_IDENTIFIER','LOT_IDENTIFIER','PERCENTAGE','PERIOD','QUANTITY'}
def scalar(value):
 return str(value.get('value','') if isinstance(value,dict) else value or '').strip()
def blank(value):
 return not any(str(v).strip() for v in value.values()) if isinstance(value,dict) else not scalar(value) or scalar(value)=='NOT_APPLICABLE'
def active(q,answers):
 pending=False
 for condition in q.get('conditions',[]):
  value=scalar(answers.get(condition['id']))
  if value not in ('true','false'):pending=True
  elif value!=condition['value']:return False
 return None if pending else True

def number(value,integer=False):
 if not re.fullmatch(r'\d{1,15}' if integer else r'\d{1,15}(?:[.,]\d{1,8})?',value):raise ValueError('Numero non valido: usa cifre e un solo separatore decimale, senza separatori delle migliaia')
 return value.replace(',','.')
def date(value):
 datetime.date.fromisoformat(value);return value

def checked(q,answer,chosen):
 kind=q['type'];data=answer if isinstance(answer,dict) else {'value':scalar(answer)};value=scalar(data)
 if kind=='PERIOD':
  start=data.get('start','');end=data.get('end','')
  if not start or not end:raise ValueError('Indicare inizio e fine del periodo')
  if date(start)>date(end):raise ValueError('La fine del periodo precede l’inizio')
  return {'start':start,'end':end}
 if kind=='EVIDENCE_IDENTIFIER':
  # An evidence answer is a linked Evidence, not an arbitrary ResponseID.
  if not data.get('url') or not data.get('issuer') or not data.get('reference'):raise ValueError('Completare URL, organismo e riferimento della prova')
  if not re.fullmatch(r'https?://[^\s]+',data['url']):raise ValueError('URL della prova non valido')
  return {key:str(data[key]).strip() for key in ['url','issuer','reference']}
 if kind=='LOT_IDENTIFIER':
  values=data.get('values') or [value]
  if isinstance(values,str):values=[x.strip() for x in values.split(',') if x.strip()]
  if len(set(values))!=len(values) or not values or any(v not in chosen for v in values):raise ValueError('Lotto della risposta non compreso nei lotti selezionati')
  return {'values':values}
 if not value or value=='NOT_APPLICABLE':raise ValueError('Risposta obbligatoria da confermare')
 if kind=='INDICATOR' and value not in ('true','false'):raise ValueError('Risposta sì/no non valida')
 if kind=='DATE':date(value)
 if kind in ('NUMERIC','QUANTITY','QUANTITY_INTEGER','QUANTITY_YEAR','AMOUNT','PERCENTAGE'):
  value=number(value,kind in ('QUANTITY_INTEGER','QUANTITY_YEAR'))
  if kind=='PERCENTAGE' and not Decimal(0)<=Decimal(value)<=Decimal(100):raise ValueError('Percentuale da esprimere fra 0 e 100')
 if kind=='URL' and not re.fullmatch(r'https?://[^\s]+',value):raise ValueError('URL della risposta non valido')
 if kind=='AMOUNT' and not re.fullmatch('[A-Z]{3}',data.get('currency','')):raise ValueError('Specificare la valuta a tre lettere dell’importo')
 if kind=='CODE_COUNTRY' and not re.fullmatch('[A-Z]{2,3}',value):raise ValueError('Codice paese non valido')
 if kind=='CODE':
  for attr in ('list_id','list_agency','list_version'):
   if not data.get(attr):raise ValueError('Specificare elenco codici, ente e versione richiesti dalla procedura')
 if kind in ('IDENTIFIER','ECONOMIC_OPERATOR_IDENTIFIER') and isinstance(answer,dict) and not data.get('scheme_id'):raise ValueError('Specificare lo schema dell’identificativo')
 if kind in ('QUANTITY_INTEGER','QUANTITY_YEAR') and isinstance(answer,dict) and not data.get('unit'):raise ValueError('Specificare l’unità di misura')
 return {**data,'value':value}

def append_value(response,q,value,evidences):
 def add(parent,ns,key,text,**attrs):
  node=E.SubElement(parent,'{'+ns+'}'+key,**attrs);node.text=text;return node
 kind=q['type']
 if kind=='PERIOD':
  period=E.SubElement(response,'{'+CAC+'}ApplicablePeriod');add(period,CBC,'StartDate',value['start']);add(period,CBC,'EndDate',value['end']);return
 if kind=='EVIDENCE_IDENTIFIER':
  eid=str(uuid.uuid4());evidences.append({'id':eid,**value});supplied=E.SubElement(response,'{'+CAC+'}EvidenceSupplied');add(supplied,CBC,'ID',eid);return
 if kind=='LOT_IDENTIFIER':
  for val in value['values']:add(E.SubElement(response,'{'+CAC+'}ResponseValue'),CBC,'ResponseID',val)
  return
 rv=E.SubElement(response,'{'+CAC+'}ResponseValue');attrs={}
 tag={'INDICATOR':'ResponseIndicator','DESCRIPTION':'Description','DATE':'ResponseDate','IDENTIFIER':'ResponseID','ECONOMIC_OPERATOR_IDENTIFIER':'ResponseID','URL':'ResponseURI','NUMERIC':'ResponseNumeric','PERCENTAGE':'ResponseNumeric','QUANTITY':'ResponseQuantity','QUANTITY_INTEGER':'ResponseQuantity','QUANTITY_YEAR':'ResponseQuantity','AMOUNT':'ResponseAmount','CODE':'ResponseCode','CODE_COUNTRY':'ResponseCode'}[kind]
 if kind=='AMOUNT':attrs['currencyID']=value['currency']
 if kind=='PERCENTAGE':value={**value,'value':format(Decimal(value['value'])/100,'f')}
 if kind in ('QUANTITY_INTEGER','QUANTITY_YEAR') and value.get('unit'):attrs['unitCode']=value['unit']
 if kind in ('IDENTIFIER','ECONOMIC_OPERATOR_IDENTIFIER') and value.get('scheme_id'):attrs['schemeID']=value['scheme_id']
 if kind in ('CODE','CODE_COUNTRY'):
  for key,attr in [('list_id','listID'),('list_agency','listAgencyID'),('list_version','listVersionID')]:
   if value.get(key):attrs[attr]=value[key]
 add(rv,CBC,tag,value['value'],**attrs)

def append_evidence(result,evidences):
 for value in evidences:
  def add(p,ns,key,txt):e=E.SubElement(p,'{'+ns+'}'+key);e.text=txt;return e
  evidence=E.SubElement(result,'{'+CAC+'}Evidence');add(evidence,CBC,'ID',value['id']);add(evidence,CBC,'Name',value['reference']);add(evidence,CBC,'Description',value['issuer'])
  doc=E.SubElement(evidence,'{'+CAC+'}DocumentReference');add(doc,CBC,'ID',value['reference']);attachment=E.SubElement(doc,'{'+CAC+'}Attachment');external=E.SubElement(attachment,'{'+CAC+'}ExternalReference');add(external,CBC,'URI',value['url'])
