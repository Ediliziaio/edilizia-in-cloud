-- Assegnare le persone alle fasi: lo fa chi ha «Modifica commesse» (14/11/2026).
--
-- Fino a oggi order_employees accettava scritture solo da amministratori e super admin: un
-- impiegato d'ufficio con «Modifica commesse» vedeva «Assegna», sceglieva la persona e riceveva
-- un rifiuto generico. Decisione del titolare: chi modifica le commesse assegna le persone; note,
-- costo previsto, tariffe e pagamenti restano a chi ha «Costi» e «Personale».
--
-- 1. Tre regole (inserimento, modifica, cancellazione — non la lettura, che resta com'è) per chi
--    ha can_edit_orders sull'azienda della commessa, la vede e non è in sola lettura. I dati
--    economici della riga restano protetti come prima: dalla vista order_employees_visibili
--    (private.office_projection_write) e, per le scritture dirette, da
--    private.office_direct_write_guard. Tutte e due ora rifiutano col nome del permesso.
-- 2. commessa_assegna_persona (Piano di cantiere, allocazione AI, nomina in cantiere) diceva
--    «Assegnazione non consentita»: ora dice quale permesso serve.
-- 3. Nella vista i dati si chiamano come li legge chi lavora («descrizione della rata», non «label»).
-- 4. private.office_assert_financial_write diceva «Campo economico non modificabile»: ora, come
--    la vista, dice quale dato e quale permesso.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
-- CREATE POLICY qui blocca le tabelle di auth fino al COMMIT (supautils): la tabella si prende
-- subito, così la migrazione resta di pochi millisecondi e non si incastra con chi legge auth.
lock table public.order_employees in access exclusive mode;

-- 1. Regole di scrittura per «Modifica commesse»
drop policy if exists oe_scrittura_modifica_commesse_ins on public.order_employees;
drop policy if exists oe_scrittura_modifica_commesse_upd on public.order_employees;
drop policy if exists oe_scrittura_modifica_commesse_del on public.order_employees;

create policy oe_scrittura_modifica_commesse_ins on public.order_employees
  for insert to authenticated
  with check (exists (
    select 1 from public.orders o
     where o.id = order_employees.order_id and o.deleted_at is null
       and coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', o.company_id), false)
       and coalesce(public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id), false)
       and not coalesce(public.utente_sola_lettura(o.company_id), false)));

create policy oe_scrittura_modifica_commesse_upd on public.order_employees
  for update to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_employees.order_id and o.deleted_at is null
       and coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', o.company_id), false)
       and coalesce(public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id), false)
       and not coalesce(public.utente_sola_lettura(o.company_id), false)))
  with check (exists (
    select 1 from public.orders o
     where o.id = order_employees.order_id and o.deleted_at is null
       and coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', o.company_id), false)
       and coalesce(public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id), false)
       and not coalesce(public.utente_sola_lettura(o.company_id), false)));

create policy oe_scrittura_modifica_commesse_del on public.order_employees
  for delete to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_employees.order_id and o.deleted_at is null
       and coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', o.company_id), false)
       and coalesce(public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id), false)
       and not coalesce(public.utente_sola_lettura(o.company_id), false)));

-- 2. commessa_assegna_persona dice il permesso
do $patch$
declare
  v_def text := pg_get_functiondef('public.commessa_assegna_persona(uuid,uuid,uuid,numeric,uuid)'::regprocedure);
  v_vecchio constant text := 'RAISE EXCEPTION ''Assegnazione non consentita'' USING ERRCODE=''42501'';';
  v_nuovo constant text := 'RAISE EXCEPTION ''Assegnare le persone alla commessa lo fa chi ha il permesso «Modifica commesse». Chiedi al titolare dell''''azienda di darti l''''accesso.'' USING ERRCODE=''42501'';';
begin
  if position('lo fa chi ha il permesso «Modifica commesse»' in v_def) > 0 then return; end if;
  if position(v_vecchio in v_def) = 0 then raise exception 'commessa_assegna_persona: punto da sostituire non trovato'; end if;
  execute replace(v_def, v_vecchio, v_nuovo);
end
$patch$;

-- 3. Nella vista, i dati protetti si chiamano come li legge chi lavora («descrizione della rata», non «label»)
do $patch$
declare
  v_def text := pg_get_functiondef('private.office_projection_write()'::regprocedure);
  v_vecchio constant text := 'when ''notes'' then ''note'' else replace(protected.column_name,''_'','' '') end,';
  v_nuovo constant text := 'when ''notes'' then ''note'' when ''label'' then ''descrizione della rata'' when ''hourly_rate'' then ''tariffa oraria''
      when ''planned_hourly_rate'' then ''tariffa prevista'' when ''total_cost'' then ''costo'' when ''invoice_id'' then ''fattura collegata''
      when ''documento_fiscale_id'' then ''fattura collegata'' when ''costo_manodopera'' then ''costo della manodopera''
      when ''presenze_registrate'' then ''presenze'' else replace(protected.column_name,''_'','' '') end,';
begin
  if position('descrizione della rata' in v_def) > 0 then return; end if;
  if position(v_vecchio in v_def) = 0 then raise exception 'office_projection_write: punto da sostituire non trovato'; end if;
  execute replace(v_def, v_vecchio, v_nuovo);
end
$patch$;

-- 4. Le scritture dirette sui dati protetti dicono il permesso, come la vista
do $patch$
declare
  v_def text := pg_get_functiondef('private.office_assert_financial_write(text,jsonb,jsonb)'::regprocedure);
  v_vecchio constant text := 'raise exception ''Campo economico non modificabile'' using errcode=''42501'';';
  v_nuovo constant text := 'raise exception ''Il dato «%» lo cambia solo chi ha il permesso «%». Chiedi al titolare dell''''azienda di darti l''''accesso.'',
   case field.column_name when ''total_amount'' then ''importo totale'' when ''vat_rate'' then ''IVA'' when ''amount'' then ''importo della rata''
    when ''payment_type'' then ''tipo di pagamento'' when ''is_paid'' then ''pagata'' when ''paid_date'' then ''data di pagamento''
    when ''financing_cost'' then ''costo della finanziaria'' when ''costo_orario'' then ''costo orario'' when ''cost_preventivo'' then ''costo previsto''
    when ''notes'' then ''note'' when ''label'' then ''descrizione della rata'' when ''hourly_rate'' then ''tariffa oraria''
    when ''planned_hourly_rate'' then ''tariffa prevista'' when ''total_cost'' then ''costo'' when ''invoice_id'' then ''fattura collegata''
    when ''documento_fiscale_id'' then ''fattura collegata'' when ''costo_manodopera'' then ''costo della manodopera''
    when ''presenze_registrate'' then ''presenze'' else replace(field.column_name,''_'','' '') end,
   case field.right_name when ''amounts'' then ''Venduto e importi'' when ''payments'' then ''Venduto e importi''
    when ''costs'' then ''Costi'' when ''personal'' then ''Costi e Personale'' else field.right_name end
   using errcode=''42501'';';
begin
  if position('lo cambia solo chi ha il permesso' in v_def) > 0 then return; end if;
  if position(v_vecchio in v_def) = 0 then raise exception 'office_assert_financial_write: punto da sostituire non trovato'; end if;
  execute replace(v_def, v_vecchio, v_nuovo);
end
$patch$;
