-- Terza revisione della fatturazione (09/11/2026).
--   • liquidazione: una fattura scartata dallo SDI per l'Agenzia non esiste;
--   • storno totale: rata e SAL tornano liberi, come per una fattura annullata;
--   • scadenza senza data: vale la prima rata non pagata, non «emissione + 30»;
--   • caricare una fattura ricevuta: una regola, per chi lavora su fatture, costi, commesse.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $migrazione$
declare
  d text;
  n text;
  a1 text := $x$      AND d.stato NOT IN ('bozza', 'annullata')
      AND d.data_emissione BETWEEN v_dal AND v_al$x$;
begin
  d := pg_get_functiondef('public.liquidazione_iva_periodo(uuid,text,integer,integer,integer)'::regprocedure);
  if position($x$s.sdi_stato$x$ in d) = 0 then
    if position(a1 in d) = 0 then raise exception 'liquidazione_iva_periodo è cambiata: rivedere la migrazione'; end if;
    execute replace(d, a1, a1 || $x$
      AND NOT EXISTS (SELECT 1 FROM public.documenti_fiscali s WHERE s.id = d.id AND upper(coalesce(s.sdi_stato, '')) = 'NS')$x$);
  end if;

  d := pg_get_functiondef('public.allinea_rata_da_fattura()'::regprocedure);
  if position('stornata' in d) = 0 then
    n := replace(d, $x$IF NEW.stato = 'annullata' OR NEW.deleted_at IS NOT NULL THEN$x$, $x$IF NEW.stato IN ('annullata', 'stornata') OR NEW.deleted_at IS NOT NULL THEN$x$);
    if n = d then raise exception 'allinea_rata_da_fattura è cambiata: rivedere la migrazione'; end if;
    execute n;
  end if;

  d := pg_get_functiondef('public.appalto_sal_fattura_emessa()'::regprocedure);
  if position('stornata' in d) = 0 then
    n := replace(d, $x$if new.stato = 'annullata' then$x$, $x$if new.stato in ('annullata', 'stornata') then$x$);
    if n = d then raise exception 'appalto_sal_fattura_emessa è cambiata: rivedere la migrazione'; end if;
    execute n;
  end if;

  d := pg_get_functiondef('public.collega_rata_fattura(uuid,uuid)'::regprocedure);
  if position('stornata' in d) = 0 then
    n := replace(d, $x$AND deleted_at IS NULL AND stato <> 'annullata';$x$, $x$AND deleted_at IS NULL AND stato NOT IN ('annullata', 'stornata');$x$);
    n := replace(n, $x$x.deleted_at IS NULL AND x.stato <> 'annullata') THEN$x$, $x$x.deleted_at IS NULL AND x.stato NOT IN ('annullata', 'stornata')) THEN$x$);
    if n = d then raise exception 'collega_rata_fattura è cambiata: rivedere la migrazione'; end if;
    execute n;
  end if;

  d := pg_get_functiondef('public.sync_scadenza_da_documento_fiscale()'::regprocedure);
  if position('scadenze_pagamento' in d) = 0 then
    n := replace(d, $x$v_due := COALESCE(NEW.data_scadenza, NEW.data_emissione + 30, CURRENT_DATE + 30);$x$,
      $x$v_due := COALESCE(
    NEW.data_scadenza,
    (SELECT min((r ->> 'data_scadenza')::date)
       FROM jsonb_array_elements(COALESCE(NEW.scadenze_pagamento, '[]'::jsonb)) r
      WHERE r ->> 'data_scadenza' ~ '^\d{4}-\d{2}-\d{2}$'
        AND COALESCE((r ->> 'pagato')::boolean, false) = false),
    NEW.data_emissione + 30, CURRENT_DATE + 30);$x$);
    if n = d then raise exception 'sync_scadenza_da_documento_fiscale è cambiata: rivedere la migrazione'; end if;
    execute n;
  end if;
end
$migrazione$;

create or replace function public.puo_caricare_fattura_ricevuta(_company_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
    public.puo_gestire_documento_fiscale(_company_id, 'fattura')
    or (auth.uid() is not null and not public.utente_bloccato() and not public.utente_e_cliente_esterno()
        and (_company_id = any (public.aziende_con_permesso('can_view_costs'))
             or _company_id = any (public.aziende_con_permesso('can_edit_orders'))
             or _company_id = any (public.aziende_con_permesso('can_manage_suppliers')))),
    false);
$function$;

revoke all on function public.puo_caricare_fattura_ricevuta(uuid) from public, anon;
grant execute on function public.puo_caricare_fattura_ricevuta(uuid) to authenticated, service_role;
