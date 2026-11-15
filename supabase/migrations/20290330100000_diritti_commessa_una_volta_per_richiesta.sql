-- I diritti economici dell'utente su un'azienda, calcolati una volta per richiesta (15/11/2026).
--
-- private.office_company_rights(azienda) dice cosa vede l'utente (importi, costi, margini,
-- persone, pagamenti): sette controlli di permesso, ognuno con profilo, ruoli e accessi
-- multi-azienda, circa un millisecondo. La regola restrittiva su orders la chiama tre volte per
-- commessa, e le viste *_visibili una volta per riga (rata, persona, fase): l'elenco Commesse di
-- un'azienda con 200 commesse e 500 rate la chiamava più di mille volte, sempre con gli stessi
-- argomenti, e andava oltre gli 8 secondi del tetto quando il database era occupato.
--
-- Ora il calcolo vero sta in office_company_rights_calcolo e office_company_rights lo ricorda per
-- la durata della transazione (una richiesta di PostgREST è una transazione): una variabile per
-- azienda, col valore legato all'utente, così un cambio di utente nella stessa transazione
-- ricalcola. Il service role e le chiamate senza utente non passano dalla memoria.
-- Le variabili sono una per azienda, non per commessa: il loro numero per connessione resta
-- piccolo.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $copia$
begin
  if not exists (select 1 from pg_proc where oid = to_regprocedure('private.office_company_rights_calcolo(uuid)')) then
    execute format($f$create function private.office_company_rights_calcolo(p_company uuid)
      returns jsonb language sql stable security definer set search_path to '' as %L$f$,
      (select prosrc from pg_proc where oid = 'private.office_company_rights(uuid)'::regprocedure));
  end if;
end $copia$;
revoke all on function private.office_company_rights_calcolo(uuid) from public, anon, authenticated;
grant execute on function private.office_company_rights_calcolo(uuid) to service_role;

create or replace function private.office_company_rights(p_company uuid)
 returns jsonb language plpgsql stable security definer set search_path to ''
as $function$
declare
  utente uuid := auth.uid();
  chiave text;
  ricordato text;
  risultato jsonb;
begin
  if p_company is null or utente is null or coalesce(auth.role(), '') = 'service_role' then
    return private.office_company_rights_calcolo(p_company);
  end if;
  chiave := 'eic_diritti.c' || replace(p_company::text, '-', '');
  ricordato := current_setting(chiave, true);
  if ricordato is not null and left(ricordato, 37) = utente::text || '|' then
    return nullif(substr(ricordato, 38), 'null')::jsonb;
  end if;
  risultato := private.office_company_rights_calcolo(p_company);
  perform set_config(chiave, utente::text || '|' || coalesce(risultato::text, 'null'), true);
  return risultato;
end
$function$;
revoke all on function private.office_company_rights(uuid) from public, anon;
grant execute on function private.office_company_rights(uuid) to authenticated, service_role;

-- 2. Le viste *_visibili calcolano i diritti dall'azienda, non rifacendo il controllo di visibilità
--
-- orders_visibili, order_installments_visibili, order_employees_visibili e campo_rapportini_visibili
-- prendevano i diritti da office_order_rights(commessa), che rifà office_visible_order (il
-- controllo lungo su chi vede la commessa) e poi legge i diritti dell'azienda. Ma ognuna di queste
-- viste ha già office_visible_order nel suo WHERE: il controllo si faceva due volte per riga. E le
-- regole di fasi, voci, articoli, ditte… che dal 14/11 leggono orders_visibili lo pagavano a ogni
-- riga. Ora i diritti vengono da office_diritti_commessa_visibile(azienda), che dà lo stesso
-- risultato per una commessa che si vede: lo stesso caso del cliente esterno, poi i diritti
-- dell'azienda (ricordati per la richiesta). Il WHERE delle viste non cambia.
create or replace function private.office_diritti_commessa_visibile(p_company uuid)
 returns jsonb language sql stable security definer set search_path to ''
as $function$
  select case when public.utente_e_cliente_esterno()
    then jsonb_build_object('amounts',true,'payments',true,'costs',false,'margins',false,'personal',false)
    else coalesce(private.office_company_rights(p_company),'{}'::jsonb) end
$function$;
revoke all on function private.office_diritti_commessa_visibile(uuid) from public, anon;
-- Come office_order_rights: le viste la chiamano anche col ruolo di chi legge. Dà solo i diritti
-- di chi chiama, come office_company_rights, che è già concessa.
grant execute on function private.office_diritti_commessa_visibile(uuid) to authenticated, service_role;

do $viste$
declare
  v record; definizione text; nuova text; opzioni text;
begin
  for v in select * from (values
      ('orders_visibili', 'private.office_order_rights(orders.id)',
         'private.office_diritti_commessa_visibile(orders.company_id)'),
      ('order_installments_visibili', 'private.office_order_rights(order_installments.order_id)',
         'private.office_diritti_commessa_visibile((select oo.company_id from public.orders oo where oo.id = order_installments.order_id))'),
      ('order_employees_visibili', 'private.office_order_rights(order_employees.order_id)',
         'private.office_diritti_commessa_visibile((select oo.company_id from public.orders oo where oo.id = order_employees.order_id))'),
      ('campo_rapportini_visibili', 'private.office_order_rights(cr.order_id)',
         'private.office_diritti_commessa_visibile((select oo.company_id from public.orders oo where oo.id = cr.order_id))')
    ) as t(vista, vecchio, nuovo)
  loop
    definizione := pg_get_viewdef(format('public.%I', v.vista)::regclass, false);
    if position(v.vecchio in definizione) = 0 then
      -- già convertita (o cambiata da un'altra migrazione): non si tocca
      continue;
    end if;
    nuova := replace(definizione, v.vecchio, v.nuovo);
    select coalesce(array_to_string(reloptions, ', '), '') into opzioni from pg_class where oid = format('public.%I', v.vista)::regclass;
    execute format('create or replace view public.%I %s as %s', v.vista,
      case when opzioni <> '' then 'with (' || opzioni || ')' else '' end, nuova);
  end loop;
end $viste$;
