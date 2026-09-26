-- Note della commessa: le legge e le scrive chi vede la commessa.
--
-- Trovato il 26/09/2026 nell'audit dei permessi. Le «Note della commessa»
-- (OrderNotesDialog) sono un canale della Chat Team con order_id. Le policy
-- «_order» lasciavano a ogni interno dell'azienda, venditori compresi:
--   - leggere tutti i canali delle commesse, i loro membri e i messaggi;
--   - scriverci senza esserne membro;
--   - aggiungere al canale se stesso o chiunque;
--   - creare il canale di una commessa che non vede (e restarne proprietario,
--     leggendo le note che gli altri avrebbero scritto dopo), o trasformare in
--     canale di una commessa un canale suo.
-- Il venditore, di serie, non deve vedere le commesse.
--
-- Ora le policy «_order» chiedono di vedere la commessa: una sottoquery su
-- orders, che applica la RLS di orders (permesso Commesse con il suo ambito,
-- squadra di campo, venditore della commessa, magazzino, commercialista), come
-- per le righe figlie delle commesse. Chi è membro del canale perché un
-- collega l'ha aggiunto o menzionato continua a leggerlo: è una condivisione
-- voluta da chi vede la commessa. La commessa di un canale non si cambia più
-- (solo lo staff di piattaforma e il server). I clienti del portale restano
-- fuori da tutto.

set local lock_timeout = '3s';

-- Canali
drop policy if exists icc_sel_order on public.internal_chat_channels;
create policy icc_sel_order on public.internal_chat_channels
  for select to authenticated
  using (order_id is not null
         and public.internal_chat_company_allowed(company_id)
         and not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.orders o where o.id = internal_chat_channels.order_id));

drop policy if exists icc_ins on public.internal_chat_channels;
create policy icc_ins on public.internal_chat_channels
  for insert to authenticated
  with check (public.internal_chat_company_allowed(company_id)
              and created_by = (select auth.uid())
              and (order_id is null
                   or (not (select public.utente_e_cliente_esterno())
                       and exists (select 1 from public.orders o where o.id = internal_chat_channels.order_id))));

create or replace function public.internal_chat_commessa_non_si_cambia()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.order_id is distinct from old.order_id and not public.is_platform_staff() then
    raise exception 'Un canale non passa da una commessa all''altra' using errcode = '42501';
  end if;
  return new;
end;
$function$;
revoke all on function public.internal_chat_commessa_non_si_cambia() from public, anon, authenticated;

drop trigger if exists trg_internal_chat_commessa_non_si_cambia on public.internal_chat_channels;
create trigger trg_internal_chat_commessa_non_si_cambia
  before update of order_id on public.internal_chat_channels
  for each row execute function public.internal_chat_commessa_non_si_cambia();

-- Membri
drop policy if exists icm_sel_order on public.internal_chat_members;
create policy icm_sel_order on public.internal_chat_members
  for select to authenticated
  using (public.internal_chat_company_allowed(company_id)
         and not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.internal_chat_channels ch join public.orders o on o.id = ch.order_id
                      where ch.id = internal_chat_members.channel_id));

drop policy if exists icm_ins_order on public.internal_chat_members;
create policy icm_ins_order on public.internal_chat_members
  for insert to authenticated
  with check (public.internal_chat_company_allowed(company_id)
              and not (select public.utente_e_cliente_esterno())
              and exists (select 1 from public.internal_chat_channels ch join public.orders o on o.id = ch.order_id
                           where ch.id = internal_chat_members.channel_id));

-- Messaggi
drop policy if exists icmsg_sel_order on public.internal_chat_messages;
create policy icmsg_sel_order on public.internal_chat_messages
  for select to authenticated
  using (public.internal_chat_company_allowed(company_id)
         and not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.internal_chat_channels ch join public.orders o on o.id = ch.order_id
                      where ch.id = internal_chat_messages.channel_id));

drop policy if exists icmsg_ins_order on public.internal_chat_messages;
create policy icmsg_ins_order on public.internal_chat_messages
  for insert to authenticated
  with check (sender_id = (select auth.uid())
              and public.internal_chat_company_allowed(company_id)
              and not (select public.utente_e_cliente_esterno())
              and exists (select 1 from public.internal_chat_channels ch join public.orders o on o.id = ch.order_id
                           where ch.id = internal_chat_messages.channel_id));
