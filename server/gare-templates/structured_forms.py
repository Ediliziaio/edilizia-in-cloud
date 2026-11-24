"""Bounded, offline structured DOCX and assisted flat-PDF compilation."""
import json,sys,re,io,zipfile,base64
from pathlib import Path
from lxml import etree as E
import math, subprocess, pdfplumber
from collections import defaultdict
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';W14='http://schemas.microsoft.com/office/word/2010/wordml'
NS={'w':W,'w14':W14}
def text(n):return ''.join(n.itertext()).strip() if n is not None else ''
def word_text(n):return ''.join(n.xpath('.//w:t/text()',namespaces=NS)).strip()
def tagval(n,path):
 e=n.find(path,NS);return e.get('{'+W+'}val','') if e is not None else ''
def load_docx(raw):
 if len(raw)>20_000_000:raise ValueError('DOCX troppo esteso')
 z=zipfile.ZipFile(io.BytesIO(raw));entries=z.infolist()
 if len(entries)>2000 or sum(e.file_size for e in entries)>60_000_000:raise ValueError('Archivio DOCX troppo esteso dopo estrazione')
 if any(e.filename.startswith('/') or '..' in e.filename.split('/') for e in entries):raise ValueError('Percorso ZIP non consentito')
 if any(re.search(r'_xmlsignatures|vbaProject|activeX|embeddings',n,re.I) for n in z.namelist()):raise ValueError('Firma o contenuto attivo non supportato')
 rawxml=z.read('word/document.xml')
 if re.search(br'<!DOCTYPE|<!ENTITY|DDEAUTO|INCLUDETEXT|<w:altChunk',rawxml,re.I):raise ValueError('Contenuti attivi o esterni non supportati')
 root=E.fromstring(rawxml,E.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))
 if root.find('.//w:documentProtection',NS) is not None:raise ValueError('Documento protetto: percorso manuale')
 if 'word/settings.xml' in z.namelist() and b'documentProtection' in z.read('word/settings.xml'):raise ValueError('Documento protetto: percorso manuale')
 return z,root

def word_parts(z,root):
 parts={'word/document.xml':root}
 for name in z.namelist():
  if re.fullmatch(r'word/(header|footer)\d*\.xml',name):
   raw=z.read(name)
   if re.search(br'<!DOCTYPE|<!ENTITY|DDEAUTO|INCLUDETEXT',raw,re.I):raise ValueError('Parte Word attiva non supportata')
   parts[name]=E.fromstring(raw,E.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))
 return parts

def token_paragraphs(root,values=None):
 found=set()
 for p in root.findall('.//w:p',NS):
  nodes=p.findall('.//w:t',NS);strings=[];unsafe=[]
  for n in nodes:
   locked=any(parent.tag in('{'+W+'}sdt','{'+W+'}txbxContent') for parent in n.iterancestors())
   strings.append(n.text or '');unsafe.append(locked)
  joined=''.join(' ' * len(v) if unsafe[i] else v for i,v in enumerate(strings));matches=list(re.finditer(r'\{\{\s*([\w.\-]+)\s*\}\}',joined))
  for m in matches:found.add(m.group(1))
  if values is not None:
   for m in reversed(matches):
    value=values.get(m.group(1),'')
    if not value:continue
    offset=0
    for i,n in enumerate(nodes):
     v=strings[i];left=max(m.start(),offset);right=min(m.end(),offset+len(v))
     if left<right:n.text=(n.text or '')[:left-offset]+(value if left==m.start() else '')+(n.text or '')[right-offset:]
     offset+=len(v)
 return found

def inspect_docx(raw):
 z,root=load_docx(raw);fields=[]
 for i,sdt in enumerate(root.findall('.//w:sdt',NS)):
  props=sdt.find('w:sdtPr',NS);content=sdt.find('w:sdtContent',NS)
  if props is None or content is None:continue
  label=tagval(props,'w:alias') or tagval(props,'w:tag') or f'Campo Word {i+1}'
  reason=''
  if props.find('w:lock',NS) is not None:reason='Campo Word protetto'
  if props.find('w:dataBinding',NS) is not None:reason='Campo collegato a dati esterni: percorso manuale'
  if props.find('w:picture',NS) is not None or content.find('.//w:sdt',NS) is not None:reason='Controllo complesso: percorso manuale'
  checkbox=props.find('w14:checkbox',NS) is not None
  if props.find('w:date',NS) is not None or props.find('w:comboBox',NS) is not None or props.find('w:dropDownList',NS) is not None:reason='Controllo Word data o scelta: verificare manualmente'
  fields.append({'key':f'cc_{i}','label':label[:250],'supported':not reason,'reason':reason,'required':True,'type':'checkbox' if checkbox else 'text','options':['true','false'] if checkbox else [],'value':'','max_length':300,'location':f'Controllo Word {i+1}','target':{'type':'control','index':i}})
 for i,cell in enumerate(root.findall('.//w:tc',NS)):
  if cell.find('.//w:sdt',NS) is not None or cell.find('.//w:tbl',NS) is not None:continue
  value=word_text(cell)
  if value and not re.fullmatch(r'[\s_.\u00a0\u2002\u2003]+',value):continue
  prev=cell.getprevious()
  if prev is None or prev.tag!='{'+W+'}tc':continue
  label=word_text(prev)
  if len(label)<3 or len(label)>250 or re.fullmatch(r'[\s_.]+',label):continue
  fields.append({'key':f'cell_{i}','label':label,'supported':True,'required':True,'type':'text','options':[],'value':'','max_length':300,'location':f'Cella vuota di tabella {i+1}','target':{'type':'cell','index':i}})
 for key in sorted(set().union(*(token_paragraphs(part) for part in word_parts(z,root).values()))):fields.append({'key':key,'label':key,'supported':True,'required':True,'type':'text','options':[],'max_length':300,'target':{'type':'token'}})
 if len({f['key'] for f in fields})!=len(fields):raise ValueError('Identificativi dei campi Word ambigui: compilazione manuale')
 if len(fields)>200:raise ValueError('Più di 200 campi: dividere il modello o compilare manualmente')
 return {'format':'docx_structured','fields':fields,'pages':None,'warning':'Mappatura dedotta dai controlli e dalle celle vuote. Verificare ogni etichetta e l’anteprima prima di approvare.'},z,root

def set_word_text(container,value):
 texts=container.findall('.//w:t',NS)
 if texts:
  texts[0].text=value
  for t in texts[1:]:t.text=''
 else:
  r=container.find('w:r',NS)
  if r is None:
   p=container.find('w:p',NS)
   if p is None:p=E.SubElement(container,'{'+W+'}p')
   r=E.SubElement(p,'{'+W+'}r')
  E.SubElement(r,'{'+W+'}t').text=value

def fill_docx(raw,values):
 meta,z,root=inspect_docx(raw);allowed={f['key']:f for f in meta['fields'] if f['supported']}
 if set(values)-set(allowed):raise ValueError('Campo strutturato non riconosciuto o protetto')
 for key,value in values.items():
  if not isinstance(value,str) or len(value)>300 or '\n' in value or '\r' in value:raise ValueError('Campo Word: massimo 300 caratteri, una riga')
  target=allowed[key]['target']
  if target['type']=='token':continue
  nodes=root.findall('.//w:sdt',NS) if target['type']=='control' else root.findall('.//w:tc',NS);node=nodes[target['index']]
  if target['type']=='control':
   if allowed[key]['type']=='checkbox':
    if value not in('','true','false'):raise ValueError('Scelta Word non valida')
    if not value:continue
    props=node.find('w:sdtPr',NS);box=props.find('w14:checkbox',NS);checked=box.find('w14:checked',NS)
    if checked is None:checked=E.SubElement(box,'{'+W14+'}checked')
    checked.set('{'+W14+'}val','1' if value=='true' else '0')
    glyph=box.find('w14:checkedState' if value=='true' else 'w14:uncheckedState',NS)
    code=glyph.get('{'+W14+'}val') if glyph is not None else None
    set_word_text(node.find('w:sdtContent',NS),chr(int(code,16)) if code and re.fullmatch('[0-9a-fA-F]{4,6}',code) else ('☒' if value=='true' else '☐'))
   elif value:set_word_text(node.find('w:sdtContent',NS),value)
  elif value:set_word_text(node,value)
 parts=word_parts(z,root);tokenvalues={k:v for k,v in values.items() if allowed[k]['target']['type']=='token'}
 for part in parts.values():token_paragraphs(part,tokenvalues)
 output=io.BytesIO()
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as out:
  for item in z.infolist():out.writestr(item,E.tostring(parts[item.filename],xml_declaration=True,encoding='UTF-8',standalone=True) if item.filename in parts else z.read(item.filename))
 return output.getvalue()

def open_pdf(raw):
 if len(raw)>20_000_000 or any(mark in raw for mark in (b'/ByteRange', b'/JavaScript', b'/OpenAction')):
  raise ValueError('PDF firmato, attivo o troppo esteso: percorso manuale')
 reader=PdfReader(io.BytesIO(raw))
 if reader.is_encrypted:raise ValueError('PDF protetto: percorso manuale')
 if len(reader.pages)>30:raise ValueError('Massimo 30 pagine per mappatura assistita')
 if any(key in reader.root_object for key in ('/AA','/OpenAction','/Names','/AcroForm')):
  raise ValueError('PDF interattivo: usare il percorso per i campi del modulo')
 if any('/AA' in page or '/Annots' in page for page in reader.pages):
  raise ValueError('PDF con annotazioni o azioni: percorso manuale')
 return reader

def validate_regions(pdf,fields):
 if len(fields)>100:raise ValueError('Massimo 100 regioni di compilazione')
 seen=set();regions=[]
 for field in fields:
  key=field.get('key','')
  if key in seen or not re.fullmatch('[a-zA-Z0-9_-]{1,100}', key):raise ValueError('Identificativo campo non valido')
  seen.add(key)
  index=int(field.get('page',0))-1
  rect=field.get('rect',[])
  if not 0<=index<len(pdf.pages) or len(rect)!=4 or not all(type(n) in (int,float) and math.isfinite(n) for n in rect):
   raise ValueError('Pagina o regione non valida')
  page=pdf.pages[index]
  left,top,right,bottom=rect
  if page.rotation or page.bbox[:2]!=(0,0) or not (0<=left<right<=page.width and 0<=top<bottom<=page.height and right-left>=15 and bottom-top>=10):
   raise ValueError('Regione fuori pagina, ruotata o troppo piccola')
  for previous,(x0,y0,x1,y1) in regions:
   if previous==index and left<x1 and right>x0 and top<y1 and bottom>y0:
    raise ValueError('Le regioni di compilazione si sovrappongono')
  for char in page.chars:
   if left<char['x1'] and right>char['x0'] and top<char['bottom'] and bottom>char['top'] and not re.fullmatch(r'[\s_.]+',char['text']):
    raise ValueError('La regione contiene testo originale: non è consentito coprire etichette o clausole')
  if not field.get('confirmed_blank',False):
   raise ValueError('Confermare visivamente che ogni regione è un campo vuoto compilabile')
  regions.append((index,rect))
 return regions

def inspect_pdf(raw):
 open_pdf(raw)
 fields=[]
 with pdfplumber.open(io.BytesIO(raw)) as pdf:
  for index,page in enumerate(pdf.pages[:10]):
   if page.rotation or page.bbox[:2]!=(0,0):continue
   words=page.extract_words()
   for word in words:
    if not re.fullmatch(r'[_.]{5,}',word['text']):continue
    rect=[word['x0'],max(0,word['top']-2),word['x1'],min(page.height,word['bottom']+2)]
    labels=[w['text'] for w in words if w['x1']<=rect[0]+1 and abs(w['top']-word['top'])<5]
    fields.append({'key':f'pdf_{len(fields)+1}','label':(' '.join(labels) or 'Campo da nominare')[:180],
     'page':index+1,'rect':rect,'supported':True,'required':True,'type':'text','value':'','max_length':300,
     'confirmed_blank':False,'location':f'Pagina {index+1} · regione proposta'})
  count=len(pdf.pages)
 return {'format':'pdf_mapped','fields':fields,'pages':count,
  'warning':'Regioni proposte: verificare visivamente coordinate, etichette e campi vuoti. Nessuna modifica all’originale.'}

def fill_pdf(raw,fields,values):
 reader=open_pdf(raw)
 with pdfplumber.open(io.BytesIO(raw)) as pdf:
  regions=validate_regions(pdf,fields)
 if set(values)-{field['key'] for field in fields}:raise ValueError('Campo PDF non mappato')
 overlays=defaultdict(list)
 for field,(index,(left,top,right,bottom)) in zip(fields,regions):
  value=values.get(field['key'],'')
  if not value:continue
  if len(value)>300 or '\n' in value or '\r' in value:raise ValueError('Massimo 300 caratteri su una riga')
  try:value.encode('cp1252')
  except UnicodeEncodeError:raise ValueError('Caratteri non supportati nel PDF: compilazione manuale')
  font=min(11,max(6,(bottom-top)/1.8))
  if stringWidth(value,'Helvetica',font)>right-left-2:
   raise ValueError('Il testo non entra nella regione: correggere il campo senza coprire il testo originale')
  overlays[index].append((left+1,top+font,value,font))
 writer=PdfWriter(clone_from=reader)
 for index,fields_on_page in overlays.items():
  page=writer.pages[index]
  width,height=float(page.mediabox.width),float(page.mediabox.height)
  if tuple(page.mediabox)!=tuple(page.cropbox) or tuple(page.mediabox)[:2]!=(0,0):
   raise ValueError('Ritaglio PDF non standard: percorso manuale')
  overlay=io.BytesIO()
  layer=canvas.Canvas(overlay,pagesize=(width,height))
  for x,y,value,font in fields_on_page:
   layer.setFont('Helvetica',font)
   layer.drawString(x,height-y,value)
  layer.save()
  overlay.seek(0)
  page.merge_page(PdfReader(overlay).pages[0])
 result=io.BytesIO()
 writer.write(result)
 return result.getvalue()

def preview_pdf(raw,source,page):
 reader=open_pdf(raw)
 if not 1<=page<=len(reader.pages):raise ValueError('Pagina non presente')
 box=reader.pages[page-1].mediabox
 png=subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-singlefile','-scale-to','1500','-png',source],
  capture_output=True,check=True,timeout=20).stdout
 return {'png_base64':base64.b64encode(png).decode(),'width':float(box.width),'height':float(box.height),'pages':len(reader.pages)}

def main():
 req=json.load(sys.stdin);raw=Path(req['source']).read_bytes();op=req['operation']
 if op=='inspect-docx':print(json.dumps(inspect_docx(raw)[0],ensure_ascii=False))
 elif op=='fill-docx':Path(req['output']).write_bytes(fill_docx(raw,req['values']));print('{"ok":true}')
 elif op=='inspect-pdf':print(json.dumps(inspect_pdf(raw),ensure_ascii=False))
 elif op=='validate-regions':
  open_pdf(raw)
  with pdfplumber.open(io.BytesIO(raw)) as pdf:
   validate_regions(pdf,req['fields'])
  print('{"ok":true}')
 elif op=='fill-pdf':
  Path(req['output']).write_bytes(fill_pdf(raw,req['fields'],req['values']))
  print('{"ok":true}')
 elif op=='preview-pdf':
  print(json.dumps(preview_pdf(raw,req['source'],int(req.get('page',1)))))
 else:raise ValueError('Operazione non supportata')
if __name__=='__main__':
 try:main()
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
