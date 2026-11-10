-- ============================================================================
-- Lotto 6 del piano subappalto (docs/piano-subappalto-computo-listino.md).
--
-- 1. Il contratto in firma non cambia (R5). Finché c'è una richiesta di firma
--    aperta (pending / otp_verified), dal browser non si cambiano importo,
--    lavori, condizioni: la ditta firmerebbe un documento diverso da quello
--    salvato. Si annulla la richiesta («Annulla firma») e si rimanda.
--    `contratto_in_firma` è DEFINER perché la regola di lettura delle richieste
--    di firma potrebbe nasconderle a chi scrive il contratto; dice solo sì/no.
--
-- 2. Il quadro lavori ricorda da quale voce della commessa viene ogni voce
--    (`voce_commessa_id`) e da quale affidamento (`affidamento_id`): prima
--    subappalto_quadro_registra teneva solo le chiavi note e il collegamento
--    si perdeva, e misure e SAL non sapevano a quale voce del computo
--    appartenessero. Una voce di un'altra commessa viene rifiutata.
--    La funzione si corregge sul suo testo (come 20290213210100): le altre
--    regole restano quelle di oggi.
-- ============================================================================

set local lock_timeout = '3s';

create or replace function public.contratto_in_firma(p_contratto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.signature_requests r
     where r.contratto_subappalto_id = p_contratto and r.status in ('pending', 'otp_verified')
  );
$$;
revoke all on function public.contratto_in_firma(uuid) from public, anon;
grant execute on function public.contratto_in_firma(uuid) to authenticated, service_role;

create or replace function public.contratto_subappalto_protetto()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.firmato_il is not null then
      raise exception using errcode = '23514',
        message = 'Il contratto è firmato: non si elimina. Segnalo come «Risolto» dallo stato lavori.';
    end if;
    if exists (select 1 from public.sal_subappaltatori s where s.contratto_id = old.id)
       or exists (select 1 from public.ritenute_garanzia r where r.contratto_id = old.id)
       or exists (select 1 from public.fatture_ricevute f where f.contratto_subappalto_id = old.id) then
      raise exception using errcode = '23514',
        message = 'Ci sono SAL, ritenute o fatture collegati: il contratto non si elimina. Segnalo come «Risolto» dallo stato lavori.';
    end if;
    return old;
  end if;

  if old.firmato_il is not null and (
       new.firmato_il is distinct from old.firmato_il or new.firmato_da is distinct from old.firmato_da
    or new.company_id is distinct from old.company_id or new.order_id is distinct from old.order_id
    or new.subappaltatore_id is distinct from old.subappaltatore_id
    or new.importo_contrattuale is distinct from old.importo_contrattuale
    or new.oneri_sicurezza is distinct from old.oneri_sicurezza
    or new.ritenuta_garanzia_pct is distinct from old.ritenuta_garanzia_pct
    or new.numero_contratto is distinct from old.numero_contratto
    or new.data_stipula is distinct from old.data_stipula
    or new.descrizione_lavori is distinct from old.descrizione_lavori
    or new.obblighi is distinct from old.obblighi
    or new.modalita_pagamento is distinct from old.modalita_pagamento
    or new.penali is distinct from old.penali
    or new.garanzie is distinct from old.garanzie
    or new.durata_garanzia_mesi is distinct from old.durata_garanzia_mesi
    or new.elenco_lavori is distinct from old.elenco_lavori
    or new.articoli_personalizzati is distinct from old.articoli_personalizzati
    or new.pdf_path is distinct from old.pdf_path
    or new.firma_richiesta_id is distinct from old.firma_richiesta_id) then
    raise exception using errcode = '23514',
      message = 'Il contratto è firmato: importo, condizioni e firma si cambiano solo con una variante.';
  end if;

  -- Lotto 6: mandato in firma e non ancora firmato, il testo resta quello mandato.
  if old.firmato_il is null and (
       new.order_id is distinct from old.order_id
    or new.subappaltatore_id is distinct from old.subappaltatore_id
    or new.importo_contrattuale is distinct from old.importo_contrattuale
    or new.oneri_sicurezza is distinct from old.oneri_sicurezza
    or new.ritenuta_garanzia_pct is distinct from old.ritenuta_garanzia_pct
    or new.descrizione_lavori is distinct from old.descrizione_lavori
    or new.obblighi is distinct from old.obblighi
    or new.modalita_pagamento is distinct from old.modalita_pagamento
    or new.penali is distinct from old.penali
    or new.garanzie is distinct from old.garanzie
    or new.durata_garanzia_mesi is distinct from old.durata_garanzia_mesi
    or new.elenco_lavori is distinct from old.elenco_lavori
    or new.articoli_personalizzati is distinct from old.articoli_personalizzati)
    and public.contratto_in_firma(old.id) then
    raise exception using errcode = '23514',
      message = 'Il contratto è in firma: la ditta sta firmando il testo che le è stato mandato. Per cambiarlo annulla la richiesta di firma e rimandalo.';
  end if;

  if new.order_id is distinct from old.order_id
     and (exists (select 1 from public.sal_subappaltatori s where s.contratto_id = old.id)
          or exists (select 1 from public.ritenute_garanzia r where r.contratto_id = old.id)) then
    raise exception using errcode = '23514',
      message = 'Il contratto ha già SAL o ritenute su questa commessa: la commessa non si cambia.';
  end if;

  return new;
end;
$function$;
revoke all on function public.contratto_subappalto_protetto() from public, anon;

-- Il quadro lavori tiene il collegamento alla voce della commessa e all'affidamento.
do $do$
declare
  d text;
begin
  d := pg_get_functiondef('public.subappalto_quadro_registra(uuid,uuid,uuid,jsonb,text,integer,text,numeric)'::regprocedure);
  if d like '%voce_commessa_id%' then
    return; -- già corretta
  end if;
  d := replace(d, 'ids uuid[]:=''{}'';vid uuid;', 'ids uuid[]:=''{}'';vid uuid;vcomm uuid;vaff uuid;');
  d := replace(d,
    'if fase is not null and not exists(',
    'vcomm:=nullif(v->>''voce_commessa_id'','''')::uuid;vaff:=nullif(v->>''affidamento_id'','''')::uuid;
  if vcomm is not null and not exists(select 1 from public.order_work_phase_voci where id=vcomm and order_id=c.order_id) then raise exception ''Voce estranea alla commessa'' using errcode=''23514'';end if;
  if vaff is not null and not exists(select 1 from public.subappalto_affidamenti where id=vaff and order_id=c.order_id and company_id=p_company) then raise exception ''Affidamento estraneo alla commessa'' using errcode=''23514'';end if;
  if fase is not null and not exists(');
  d := replace(d,
    '''importo'',round(qt*prezzo,2)));',
    '''importo'',round(qt*prezzo,2))||jsonb_strip_nulls(jsonb_build_object(''voce_commessa_id'',vcomm,''affidamento_id'',vaff)));');
  if d not like '%vcomm uuid;vaff uuid;%' or d not like '%Voce estranea alla commessa%' or d not like '%jsonb_strip_nulls(jsonb_build_object(''voce_commessa_id''%' then
    raise exception 'subappalto_quadro_registra: il testo non è quello atteso, correzione non applicata';
  end if;
  execute d;
end
$do$;
