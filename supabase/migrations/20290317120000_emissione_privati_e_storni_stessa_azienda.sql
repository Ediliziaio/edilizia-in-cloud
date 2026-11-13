-- L'emissione deve accettare una persona fisica identificata da nome, cognome
-- e CF senza obbligarla ad avere una ragione sociale. Nessuna variazione ad ACL/RLS.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
DO $patch$
DECLARE
 d text := pg_get_functiondef('public.documento_emetti(uuid)'::regprocedure);
 vecchio text := $old$if coalesce(btrim(v_doc.cliente_snapshot->>'ragione_sociale'), '') = '' then$old$;
 nuovo text := $new$if coalesce(btrim(v_doc.cliente_snapshot->>'ragione_sociale'), '') = ''
    and not (coalesce(btrim(v_doc.cliente_snapshot->>'nome'), '') <> ''
      and coalesce(btrim(v_doc.cliente_snapshot->>'cognome'), '') <> ''
      and coalesce(btrim(v_doc.cliente_snapshot->>'codice_fiscale'), '') <> ''
      and public.codice_fiscale_valido(v_doc.cliente_snapshot->>'codice_fiscale')) then$new$;
BEGIN
 IF strpos(d, vecchio)>0 THEN d:=replace(d,vecchio,nuovo);
 ELSIF strpos(d,nuovo)=0 THEN RAISE EXCEPTION 'Guardia cliente di documento_emetti non riconosciuta'; END IF;
 IF strpos(d,'La fattura da stornare deve appartenere alla stessa azienda')=0 THEN
   IF strpos(d,'    if found then'||chr(10)||'      v_stornabile :=')=0 THEN RAISE EXCEPTION 'Guardia storno di documento_emetti non riconosciuta'; END IF;
   d:=replace(d,'    if found then'||chr(10)||'      v_stornabile :=',
     $guard$    if not found or v_fattura.company_id <> v_doc.company_id then
      raise exception 'La fattura da stornare deve appartenere alla stessa azienda ed essere disponibile.' using errcode = '22023';
    end if;
    if found then
      v_stornabile :=$guard$);
 END IF;
 EXECUTE d;
END $patch$;
