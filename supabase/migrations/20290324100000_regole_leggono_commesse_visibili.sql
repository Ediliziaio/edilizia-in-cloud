-- Le regole che guardano la commessa la leggono dalla vista protetta (14/11/2026).
--
-- Dal 12/11 (20290314000002) la tabella orders ha una regola restrittiva: le righe grezze le
-- legge solo chi ha insieme «Venduto e importi», «Costi» e «Margini»; tutti gli altri leggono
-- orders_visibili, che dà le stesse commesse con gli importi nascosti. Ma 61 regole di altre
-- tabelle (fasi, voci, sottofasi, persone assegnate, ditte, articoli, allegati, giornale,
-- storico, chat…) controllano la commessa con un EXISTS su orders, e per chi non ha i tre
-- permessi quell'EXISTS non trova niente: un impiegato d'ufficio con «Modifica commesse»
-- vedeva le commesse ma zero fasi, e non poteva assegnare nessuno. Censito su un'impresa
-- cliente il 14/11: 74 fasi, l'impiegata ne vedeva 0.
--
-- 1. _order_visible_under_rls (usata dalle regole di fasi, voci e chi delle sottofasi) legge
--    orders_visibili, che applica le regole originali delle commesse.
-- 2. Ogni regola che legge orders la legge da orders_visibili: stesse righe di prima del 12/11,
--    stesse colonne usate nei controlli (azienda, assegnato, cliente…), importi nascosti.
--    Rieseguire non cambia niente: orders_visibili non corrisponde più al motivo cercato.
-- 3. Gli importi delle fasi e delle loro voci si scrivono solo con il permesso giusto, come
--    quelli della commessa: «Venduto e importi» per l'importo venduto e l'importo della voce,
--    «Costi» per i costi della voce. Il rifiuto dice il permesso.
--
-- Provato prima in una transazione annullata: l'impiegata passa da 0 a 74 fasi, 0→10 persone
-- assegnate, 0→96 sottofasi; quello che vede l'amministratore non cambia.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. La visibilità della commessa per le regole di fasi e voci
create or replace function public._order_visible_under_rls(p_order_id uuid, p_check_assignment boolean default false)
 returns boolean language sql stable set search_path to ''
as $f$
  select exists (
    select 1 from public.orders_visibili o where o.id = p_order_id
      and (not p_check_assignment or public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)));
$f$;

-- 2. Le regole delle altre tabelle leggono orders_visibili
do $regole$
declare
  pol record; nq text; nc text;
  con_alias text := '(FROM|JOIN)\s+(public\.)?orders\s+(?!(?:WHERE|JOIN|ON|LEFT|RIGHT|INNER|CROSS|GROUP|ORDER|LIMIT|AND|OR)\M)(\w+)';
  senza_alias text := '(FROM|JOIN)\s+(public\.)?orders\M';
begin
  for pol in
    select c.relname tab, p.polname, pg_get_expr(p.polqual, p.polrelid) q, pg_get_expr(p.polwithcheck, p.polrelid) c
      from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname <> 'orders'
       and (coalesce(pg_get_expr(p.polqual, p.polrelid), '') || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')) ~* '(from|join)\s+(public\.)?orders\M'
  loop
    nq := regexp_replace(regexp_replace(pol.q, con_alias, '\1 public.orders_visibili \3', 'gi'), senza_alias, '\1 public.orders_visibili orders', 'gi');
    nc := regexp_replace(regexp_replace(pol.c, con_alias, '\1 public.orders_visibili \3', 'gi'), senza_alias, '\1 public.orders_visibili orders', 'gi');
    execute format('alter policy %I on public.%I', pol.polname, pol.tab)
      || case when nq is not null then format(' using (%s)', nq) else '' end
      || case when nc is not null then format(' with check (%s)', nc) else '' end;
  end loop;
end $regole$;

-- 3. Gli importi delle fasi e delle voci si scrivono col permesso
insert into private.office_projection_fields(table_name, column_name, right_name) values
  ('order_work_phases', 'importo_venduto', 'amounts'),
  ('order_work_phase_voci', 'importo', 'amounts'),
  ('order_work_phase_voci', 'costo_manodopera', 'costs'),
  ('order_work_phase_voci', 'costo_materiali', 'costs')
on conflict (table_name, column_name) do update set right_name = excluded.right_name;

create or replace function private.office_assert_financial_write(p_table text, p_old jsonb, p_new jsonb)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare rights jsonb; field record; oid_row uuid; default_expr text; default_value jsonb;
begin
 if p_table not in ('orders','order_installments','order_employees','campo_rapportini','employees','order_work_phases','order_work_phase_voci') or auth.uid() is null then raise exception 'Scrittura non consentita' using errcode='42501'; end if;
 oid_row:=case when p_table='orders' then (p_new->>'id')::uuid else (p_new->>'order_id')::uuid end;
 rights:=case when p_table='employees' or (p_table='orders' and p_old is null) then private.office_company_rights((p_new->>'company_id')::uuid) else private.office_order_rights(oid_row) end;
 for field in select * from private.office_projection_fields where table_name=p_table loop
  if coalesce((rights->>field.right_name)::boolean,false) and (field.right_name<>'payments' or coalesce((rights->>'amounts')::boolean,false)) then continue; end if;
  if p_old is not null and (p_new->field.column_name) is not distinct from (p_old->field.column_name) then continue; end if;
  if p_old is null then
   if p_new->field.column_name='null'::jsonb then continue; end if;
   select pg_get_expr(d.adbin,d.adrelid) into default_expr from pg_attribute a join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=format('public.%I',p_table)::regclass and a.attname=field.column_name;
   if default_expr is not null then execute 'select to_jsonb('||default_expr||')' into default_value; if (p_new->field.column_name) is not distinct from default_value then continue; end if; end if;
  end if;
  raise exception 'Il dato «%» lo cambia solo chi ha il permesso «%». Chiedi al titolare dell''azienda di darti l''accesso.',
   case field.column_name when 'total_amount' then 'importo totale' when 'vat_rate' then 'IVA' when 'amount' then 'importo della rata'
    when 'payment_type' then 'tipo di pagamento' when 'is_paid' then 'pagata' when 'paid_date' then 'data di pagamento'
    when 'financing_cost' then 'costo della finanziaria' when 'costo_orario' then 'costo orario' when 'cost_preventivo' then 'costo previsto'
    when 'notes' then 'note' when 'label' then 'descrizione della rata' when 'hourly_rate' then 'tariffa oraria'
    when 'planned_hourly_rate' then 'tariffa prevista' when 'total_cost' then 'costo' when 'invoice_id' then 'fattura collegata'
    when 'documento_fiscale_id' then 'fattura collegata' when 'costo_manodopera' then 'costo della manodopera'
    when 'costo_materiali' then 'costo dei materiali' when 'importo_venduto' then 'importo venduto della fase'
    when 'importo' then 'importo della voce'
    when 'presenze_registrate' then 'presenze' else replace(field.column_name,'_',' ') end,
   case field.right_name when 'amounts' then 'Venduto e importi' when 'payments' then 'Venduto e importi'
    when 'costs' then 'Costi' when 'personal' then 'Costi e Personale' else field.right_name end
   using errcode='42501';
 end loop;
end $function$;
revoke all on function private.office_assert_financial_write(text, jsonb, jsonb) from public, anon;

drop trigger if exists aaa_office_direct_write on public.order_work_phases;
create trigger aaa_office_direct_write before insert or update on public.order_work_phases
  for each row execute function private.office_direct_write_guard();
drop trigger if exists aaa_office_direct_write on public.order_work_phase_voci;
create trigger aaa_office_direct_write before insert or update on public.order_work_phase_voci
  for each row execute function private.office_direct_write_guard();
