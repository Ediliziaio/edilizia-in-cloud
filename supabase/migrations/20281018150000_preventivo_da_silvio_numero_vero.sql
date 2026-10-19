-- La bozza di preventivo preparata da Silvio (anche su WhatsApp) nasce con il
-- numero vero dell'azienda (18/10/2026).
--
-- silvio_create_quote_draft dava un identificativo «BOZZA-2026-<uuid>» che non
-- veniva mai rinumerato e finiva nel PDF, la lasciava con la sorgente «manuale»
-- e senza il cliente collegato. Ora:
--   - numero dalla stessa numerazione dell'app (generate_quote_number: OFF-2026-…);
--   - sorgente «silvio»;
--   - cliente in anagrafica collegato quando email o telefono lo trovano in modo
--     univoco (se sono più d'uno o nessuno, resta il nome scritto).
-- Provata in produzione su una copia temporanea annullata (Demo Azienda 2):
-- OFF-2026-011, sorgente silvio, contatto collegato, totale ricalcolato.
--
-- Rilanciabile: la funzione si tocca solo se ha il corpo censito il 18/10/2026
-- oppure è già aggiornata (impronte md5).

set local lock_timeout = '3s';

do $$
declare
  v_impronta text;
  v_def text;
  a1 constant text := $a$  v_number := 'BOZZA-' || to_char(now(), 'YYYY') || '-' || v_id::text;$a$;
  b1 constant text := $b$  -- Il numero vero dell'azienda (stessa numerazione dell'app), non un identificativo di bozza.
  v_number := public.generate_quote_number(p_company_id);
  -- Il cliente in anagrafica, se email o telefono lo trovano in modo univoco.
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(m.id))[1] END INTO v_contact
    FROM public.marketing_contacts m
   WHERE m.company_id = p_company_id
     AND ((nullif(trim(p_client_email), '') IS NOT NULL AND lower(trim(m.email)) = lower(trim(p_client_email)))
       OR (length(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g')) >= 9
           AND right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(p_client_phone, '\D', '', 'g'), 9)));$b$;
  a2 constant text := $a$  v_quote public.quotes%ROWTYPE;$a$;
  b2 constant text := $b$  v_quote public.quotes%ROWTYPE;
  v_contact uuid;$b$;
  a3 constant text := $a$    subtotal, vat_amount, total, validity_days, expires_at, internal_notes, created_by)$a$;
  b3 constant text := $b$    subtotal, vat_amount, total, validity_days, expires_at, internal_notes, created_by, source, contact_id)$b$;
  a4 constant text := $a$    p_validity_days, now() + make_interval(days => p_validity_days), p_internal_notes, p_user_id);$a$;
  b4 constant text := $b$    p_validity_days, now() + make_interval(days => p_validity_days), p_internal_notes, p_user_id, 'silvio', v_contact);$b$;
begin
  select md5(p.prosrc), pg_get_functiondef(p.oid) into v_impronta, v_def
    from pg_proc p
   where p.oid = 'public.silvio_create_quote_draft(uuid,uuid,text,text,text,text,text,text,text,text,jsonb,integer,numeric,text)'::regprocedure;
  if v_impronta = 'a74772e0a033de8f1fc981311653256f' then
    return; -- già aggiornata
  end if;
  if v_impronta is distinct from '1b804b4b8f0d8a78eac5f824174ee925' then
    raise exception 'silvio_create_quote_draft cambiata dopo il censimento del 18/10/2026 (impronta %): rivedere la migrazione', v_impronta;
  end if;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1
     or (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1
     or (length(v_def) - length(replace(v_def, a3, ''))) / length(a3) <> 1
     or (length(v_def) - length(replace(v_def, a4, ''))) / length(a4) <> 1 then
    raise exception 'silvio_create_quote_draft: un punto da aggiornare non è unico';
  end if;
  execute replace(replace(replace(replace(v_def, a1, b1), a2, b2), a3, b3), a4, b4);
end $$;
