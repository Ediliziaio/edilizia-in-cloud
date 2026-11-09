-- Revisione della fatturazione (09/11/2026), letta sul testo vivo delle funzioni.
--   • liquidazione: una TD16 emessa da qui non si somma più al reverse charge presunto;
--   • una nota di credito scartata dallo SDI non è uno storno;
--   • un incasso non cambia lo stato di una fattura scartata o in invio;
--   • fatture ricevute: dati fiscali, inserimento e cancellazione solo con «Fatturazione»;
--   • clienti automatici: esteri con identificativo non italiano, enti PA.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $migrazione$
declare
  l text := pg_get_functiondef('public.liquidazione_iva_periodo(uuid,text,integer,integer,integer)'::regprocedure);
  i text := pg_get_functiondef('public.registra_incasso_atomico(uuid,uuid,numeric,text,date,text,text)'::regprocedure);
  r text := pg_get_functiondef('public.riconcilia_cliente_documento_emesso(uuid,uuid,boolean)'::regprocedure);
  a1 text := $x$    WHERE NOT a.integrazione
      AND NOT EXISTS ($x$;
  a2 text := $x$UPDATE documenti_fiscali SET importo_pagato=v_nuovo_pagato, stato=v_nuovo_stato,$x$;
  a3 text := $x$  if (cf is null and iva is null) or (cf is not null and not public.codice_fiscale_valido(cf))
     or (iva is not null and not public.piva_valida(iva)) then$x$;
  a4 text := $x$case when nazione <> 'IT' then 'estero' when iva is null or length(cf) = 16 then 'fisico'$x$;
begin
  if position('fattura_ricevuta_id' in l) = 0 then
    if position(a1 in l) = 0 then raise exception 'liquidazione_iva_periodo è cambiata: rivedere la migrazione'; end if;
    l := replace(l, a1, $x$    WHERE NOT a.integrazione
      -- Integrata da qui: l'IVA è già nella TD16, contarla anche qui la raddoppia.
      AND NOT EXISTS (
        SELECT 1 FROM public.documenti_fiscali i
         WHERE i.fattura_ricevuta_id = a.id AND i.deleted_at IS NULL
           AND i.tipo = ANY(v_tipi_integrazione) AND i.stato NOT IN ('bozza', 'annullata'))
      AND NOT EXISTS ($x$);
    execute l;
  end if;

  if position($x$stato IN ('rifiutata', 'in_invio') THEN stato$x$ in i) = 0 then
    if position(a2 in i) = 0 then raise exception 'registra_incasso_atomico è cambiata: rivedere la migrazione'; end if;
    i := replace(i, a2, $x$UPDATE documenti_fiscali SET importo_pagato=v_nuovo_pagato,
    -- Scartata o in invio: lo stato lo decide lo SDI, l'incasso resta registrato.
    stato=CASE WHEN stato IN ('rifiutata', 'in_invio') THEN stato ELSE v_nuovo_stato END,$x$);
    execute i;
  end if;

  if position($x$nazione = 'IT' and ($x$ in r) = 0 then
    if position(a3 in r) = 0 or position(a4 in r) = 0 then raise exception 'riconcilia_cliente_documento_emesso è cambiata'; end if;
    r := replace(r, a3, $x$  -- All'estero la partita IVA italiana non vale come controllo: basta un identificativo.
  if (cf is null and iva is null) or (nazione = 'IT' and ((cf is not null and not public.codice_fiscale_valido(cf))
     or (iva is not null and not public.piva_valida(iva)))) then$x$);
    r := replace(r, a4, $x$case when nazione <> 'IT' then 'estero' when s->>'tipo_cliente' = 'PA' then 'pa' when iva is null or length(cf) = 16 then 'fisico'$x$);
    execute r;
  end if;
end
$migrazione$;

-- Una nota scartata dallo SDI per l'Agenzia non esiste: non riduce il dovuto.
create or replace function public.documento_stornato_totale(p_documento_id uuid)
returns numeric
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(sum(abs(coalesce(nc.totale_da_pagare, nc.totale_documento, 0))), 0)
    from public.documenti_fiscali nc
   where nc.documento_correlato_id = p_documento_id
     and nc.tipo = 'nota_credito'
     and nc.stato not in ('bozza', 'annullata', 'rifiutata')
     and upper(coalesce(nc.sdi_stato, '')) <> 'NS'
     and nc.deleted_at is null
$function$;

-- Chi vede i costi lavora sulla fattura (categoria, ordine, pagamento); i dati fiscali
-- e il registro no. Un trigger e non una policy: CREATE POLICY blocca auth.users.
create or replace function public.fatture_ricevute_solo_fatturazione()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
begin
  if auth.uid() is null or public.puo_gestire_documento_fiscale(v_company, 'fattura') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op <> 'UPDATE' then
    raise exception 'Per caricare o cancellare una fattura ricevuta serve il permesso «Fatturazione».' using errcode = '42501';
  end if;
  if (new.company_id, new.cedente_piva, new.cedente_cf, new.cedente_ragione_sociale, new.cedente_paese, new.tipo_documento,
      new.numero_fattura, new.data_fattura, new.imponibile_totale, new.iva_totale, new.totale_documento,
      new.righe, new.riepilogo_iva, new.xml_raw, new.xml_url, new.pdf_url, new.pdf_storage_bucket, new.pdf_storage_path,
      new.sdi_id_trasmissione)
     is distinct from
     (old.company_id, old.cedente_piva, old.cedente_cf, old.cedente_ragione_sociale, old.cedente_paese, old.tipo_documento,
      old.numero_fattura, old.data_fattura, old.imponibile_totale, old.iva_totale, old.totale_documento,
      old.righe, old.riepilogo_iva, old.xml_raw, old.xml_url, old.pdf_url, old.pdf_storage_bucket, old.pdf_storage_path,
      old.sdi_id_trasmissione) then
    raise exception 'I dati fiscali di una fattura ricevuta si modificano solo col permesso «Fatturazione».' using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.fatture_ricevute_solo_fatturazione() from public, anon, authenticated;

drop trigger if exists fatture_ricevute_solo_fatturazione on public.fatture_ricevute;
create trigger fatture_ricevute_solo_fatturazione
  before insert or update or delete on public.fatture_ricevute
  for each row execute function public.fatture_ricevute_solo_fatturazione();

drop trigger if exists blocco_scrittura_sola_lettura on public.fatture_ricevute;
create trigger blocco_scrittura_sola_lettura
  before insert or update or delete on public.fatture_ricevute
  for each row execute function public.blocca_scrittura_sola_lettura();
