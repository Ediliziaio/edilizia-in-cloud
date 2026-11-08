-- Tre rifiniture dopo la revisione degli acquisti (08/11/2026).
--
-- 1. La data scritta a mano. `data_serve` è coalesce(data_fabbisogno, inizio
--    fase): chi leggeva non distingueva una data impostata dall'inizio della
--    fase, e scegliendo proprio l'inizio della fase non si salvava niente (la
--    riga continuava a seguire la fase se questa si spostava). Le tre funzioni
--    della riconciliazione restituiscono anche `data_scritta`.
-- 2. L'avviso «ODA annullato» non parte per una bozza: non è mai arrivata al
--    fornitore, non c'è niente «da ordinare di nuovo».
-- 3. materiali_variazioni_decidi controlla anche che chi conferma veda la
--    commessa (can_see_order, come la riconciliazione).

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ─── 1. data_scritta ────────────────────────────────────────────────────────

do $migrazione$
declare
  def_righe text := pg_get_functiondef('public._materiali_riconciliazione_righe(uuid, uuid)'::regprocedure);
  def_commessa text := pg_get_functiondef('public.materiali_riconciliazione(uuid)'::regprocedure);
  def_azienda text := pg_get_functiondef('public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer)'::regprocedure);
  coda constant text := 'k.data_serve - k.giorni_consegna end' || E'\n' || '    from conti k';
begin
  if position('data_scritta' in def_righe) > 0 then
    return;
  end if;
  if (select count(*) from regexp_matches(def_righe, 'k\.data_serve - k\.giorni_consegna end\s+from conti k', 'g')) <> 1
     or position(coda in def_righe) = 0 then
    raise exception '_materiali_riconciliazione_righe: fine della select non riconosciuta';
  end if;

  drop function public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer);
  drop function public.materiali_riconciliazione(uuid);
  drop function public._materiali_riconciliazione_righe(uuid, uuid);

  execute replace(replace(def_righe, 'ordina_entro date)', 'ordina_entro date, data_scritta date)'),
                  coda, 'k.data_serve - k.giorni_consegna end,' || E'\n' || '         k.data_fabbisogno' || E'\n' || '    from conti k');
  -- can_see_order dà NULL per una commessa senza incaricato: «if not NULL» lasciava passare.
  if position('if not public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) then' in def_commessa) = 0 then
    raise exception 'materiali_riconciliazione: controllo della commessa non riconosciuto';
  end if;
  execute replace(replace(def_commessa, 'ordina_entro date)', 'ordina_entro date, data_scritta date)'),
                  'if not public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) then',
                  'if not coalesce(public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id), false) then');
  execute replace(def_azienda, 'ordina_entro date)', 'ordina_entro date, data_scritta date)');
end
$migrazione$;

revoke all on function public._materiali_riconciliazione_righe(uuid, uuid) from public, anon, authenticated;
grant execute on function public._materiali_riconciliazione_righe(uuid, uuid) to service_role;
revoke all on function public.materiali_riconciliazione(uuid) from public, anon;
grant execute on function public.materiali_riconciliazione(uuid) to authenticated, service_role;
revoke all on function public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer) from public, anon;
grant execute on function public.materiali_riconciliazione_azienda(uuid, boolean, integer, integer) to authenticated, service_role;

comment on function public._materiali_riconciliazione_righe(uuid, uuid) is
  'Previsto/ordinato/ricevuto/residuo/eccedenza e stato di ogni materiale (regole di planMaterial e statoMateriale), con fornitore, data in cui serve (data_scritta se impostata a mano), giorni di consegna ed entro quando ordinare. Senza controlli di accesso: solo service role.';

-- ─── 2. L'avviso non parte per una bozza ────────────────────────────────────

create or replace function public.purchase_order_annullato_avvisa()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n_righe integer;
  codice text;
begin
  if new.status <> 'annullato' or old.status = 'annullato' or old.status = 'bozza' or new.order_id is null then
    return new;
  end if;

  select count(*) into n_righe
    from public.purchase_order_items poi
   where poi.purchase_order_id = new.id and poi.order_item_id is not null;
  if n_righe = 0 then
    return new;
  end if;

  select o.order_code into codice from public.orders o where o.id = new.order_id;

  perform public.materiali_notifica_permesso(
    new.company_id,
    'can_manage_purchasing',
    'Ordine fornitore annullato',
    format('%s annullato: %s %s della commessa %s da ordinare di nuovo',
           coalesce(new.oda_number, 'L''ordine'),
           n_righe, case when n_righe = 1 then 'materiale' else 'materiali' end,
           coalesce(codice, '')),
    format('/azienda/ordini/%s?tab=articoli&vista_materiali=articoli', new.order_id),
    new.id);
  return new;
exception when others then
  -- L'avviso non deve mai impedire di annullare un ordine.
  raise warning 'purchase_order_annullato_avvisa: %', sqlerrm;
  return new;
end;
$function$;

revoke all on function public.purchase_order_annullato_avvisa() from public, anon, authenticated;

-- ─── 3. Chi conferma le variazioni deve vedere la commessa ──────────────────

create or replace function public.materiali_variazioni_decidi(p_order uuid, p_ids uuid[], p_applica boolean)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  azienda uuid;
  incaricato uuid;
  magazzino uuid;
  n integer := 0;
  r record;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  select o.company_id, o.assigned_to, o.destination_warehouse_id into azienda, incaricato, magazzino
    from public.orders o where o.id = p_order and o.deleted_at is null;
  if azienda is null or not public.materiali_utente_in_azienda(azienda)
     -- can_see_order dà NULL per una commessa senza incaricato: NULL non è un no.
     or not coalesce(public.can_see_order(p_order, incaricato, magazzino), false) then
    raise exception 'Commessa non trovata' using errcode = 'P0002';
  end if;
  if not public.materiali_puo('can_validate_bom', azienda) then
    raise exception 'Le quantità dopo una variante le conferma chi valida la distinta' using errcode = '42501';
  end if;
  perform set_config('app.materiali_sistema', 'on', true);
  for r in
    select x.* from public.materiali_variazioni x
     where x.order_id = p_order and x.stato = 'da_confermare'
       and (p_ids is null or x.id = any(p_ids))
     for update
  loop
    if p_applica and r.tipo = 'cambia' and r.order_item_id is not null then
      update public.order_items
         set quantity = r.quantita_dopo, quantita_calcolata = r.quantita_dopo
       where id = r.order_item_id;
    end if;
    update public.materiali_variazioni
       set stato = case when p_applica then 'applicata' else 'scartata' end, deciso_da = auth.uid(), deciso_il = now()
     where id = r.id;
    n := n + 1;
  end loop;
  perform set_config('app.materiali_sistema', '', true);
  return n;
end;
$function$;

revoke all on function public.materiali_variazioni_decidi(uuid, uuid[], boolean) from public, anon;
grant execute on function public.materiali_variazioni_decidi(uuid, uuid[], boolean) to authenticated, service_role;
