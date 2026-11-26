"""Bounded ZIP inventory/extraction. Never execute members or trust their paths."""
import json, os, pathlib, stat, sys, zipfile
MAX_INPUT=50*1024*1024
MAX_FILE=50*1024*1024
MAX_TOTAL=250*1024*1024
SUPPORTED={'.pdf','.doc','.docx','.txt','.md','.xml','.csv','.p7m','.png','.jpg','.jpeg','.webp'}
def inspect(source, selected=None, output=None):
    if os.path.getsize(source)>MAX_INPUT: raise ValueError('ZIP oltre 50 MB')
    with zipfile.ZipFile(source) as archive:
        infos=archive.infolist()
        if len(infos)>1000: raise ValueError('Archivio oltre 1000 voci')
        total=0; seen=set(); entries=[]
        for index, info in enumerate(infos):
            name=info.filename
            parts=pathlib.PurePosixPath(name).parts
            if len(name)>1000 or '\\' in name or any(ord(c)<32 for c in name) or name.startswith('/') or ':' in name or '..' in parts or not parts or info.orig_filename != name:
                raise ValueError('Percorso ZIP non sicuro')
            normalized='/'.join(parts).rstrip('/')
            if normalized.casefold() in seen: raise ValueError('Nomi ZIP duplicati o ambigui')
            seen.add(normalized.casefold())
            mode=info.external_attr >> 16
            if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                raise ValueError('Collegamenti o file speciali non ammessi')
            if info.flag_bits & 1: raise ValueError('ZIP cifrato: estrazione manuale richiesta')
            if info.compress_type not in (zipfile.ZIP_STORED,zipfile.ZIP_DEFLATED): raise ValueError('Compressione ZIP non supportata')
            total+=info.file_size
            if info.file_size>MAX_FILE or total>MAX_TOTAL or (info.file_size>1024*1024 and info.file_size/max(info.compress_size,1)>250):
                raise ValueError('Archivio oltre i limiti di espansione sicura')
            if info.is_dir(): continue
            ext=pathlib.PurePosixPath(name).suffix.lower()
            reason=None
            if info.file_size==0: reason='File vuoto'
            elif '__MACOSX' in parts or parts[-1]=='.DS_Store': reason='Metadati del sistema'
            elif ext not in SUPPORTED: reason='Archivio annidato: acquisire separatamente' if ext=='.zip' else 'Formato da gestire manualmente'
            row={'key':str(index),'path':name,'name':parts[-1],'size':info.file_size,'compressed_size':info.compress_size,'supported':reason is None,'reason':reason}
            entries.append(row)
        if selected is not None:
            if not selected or len(selected)>100: raise ValueError('Selezionare da 1 a 100 allegati')
            by_key={e['key']:e for e in entries}
            if len(set(selected))!=len(selected) or any(k not in by_key or not by_key[k]['supported'] for k in selected): raise ValueError('Selezione allegati non valida')
            for key in selected:
                row=by_key[key]; info=infos[int(key)]
                target=os.path.join(output,'member-'+key)
                # zipfile validates CRC and size while reading. No member pathname
                # ever reaches the filesystem; outputs use server-generated names.
                count=0
                with archive.open(info) as src, open(target,'xb') as dst:
                    while True:
                        chunk=src.read(65536)
                        if not chunk: break
                        count+=len(chunk)
                        if count>MAX_FILE or count>info.file_size: raise ValueError('Dimensioni ZIP non coerenti')
                        dst.write(chunk)
                if count!=info.file_size: raise ValueError('Allegato ZIP incompleto')
                row['file']=target
        return {'entries':entries,'expanded_bytes':total,'file_count':len(entries),'limits':{'entries':1000,'expanded_bytes':MAX_TOTAL,'member_bytes':MAX_FILE}}
try:
    payload=json.load(sys.stdin)
    print(json.dumps(inspect(payload['source'],payload.get('selected'),payload.get('output'))))
except Exception as error:
    print(str(error),file=sys.stderr);sys.exit(1)
