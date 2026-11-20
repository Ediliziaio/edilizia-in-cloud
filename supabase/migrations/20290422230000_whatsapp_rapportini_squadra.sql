set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.campo_rapportini add column if not exists whatsapp_message_id uuid
  references public.whatsapp_messages(id) on delete set null;
create unique index if not exists campo_rapportini_messaggio_whatsapp
  on public.campo_rapportini(whatsapp_message_id, order_id, data_lavoro)
  where whatsapp_message_id is not null;

-- I messaggi in ingresso e i cambi di stato vengono dai servizi. L'interfaccia
-- invia tramite edge e revisiona gli esiti tramite la RPC autorizzata.
revoke insert, update, delete on public.whatsapp_messages from public, anon, authenticated;

drop policy if exists whatsapp_messages_solo_servizio_insert on public.whatsapp_messages;
create policy whatsapp_messages_solo_servizio_insert on public.whatsapp_messages as restrictive
  for insert to anon, authenticated with check (false);
drop policy if exists whatsapp_messages_solo_servizio_update on public.whatsapp_messages;
create policy whatsapp_messages_solo_servizio_update on public.whatsapp_messages as restrictive
  for update to anon, authenticated using (false);
drop policy if exists whatsapp_messages_solo_servizio_delete on public.whatsapp_messages;
create policy whatsapp_messages_solo_servizio_delete on public.whatsapp_messages as restrictive
  for delete to anon, authenticated using (false);

create or replace function private.whatsapp_rapporto_provenienza()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.whatsapp_message_id is null then
    if tg_op = 'INSERT' or pg_trigger_depth() > 1 then return new; end if;
    if old.whatsapp_message_id is null then return new; end if;
  end if;
  if tg_op = 'UPDATE' and new.whatsapp_message_id is not distinct from old.whatsapp_message_id
    and new.company_id is not distinct from old.company_id then return new; end if;
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Provenienza WhatsApp riservata al servizio' using errcode = '42501';
  end if;
  if new.whatsapp_message_id is not null and not exists (
    select 1 from public.whatsapp_messages m where m.id = new.whatsapp_message_id
      and m.company_id = new.company_id and m.direction = 'inbound'
  ) then raise exception 'Provenienza WhatsApp non valida' using errcode = '42501'; end if;
  return new;
end;
$$;
revoke all on function private.whatsapp_rapporto_provenienza() from public, anon, authenticated;
drop trigger if exists verifica_provenienza_rapporto_whatsapp on public.campo_rapportini;
create trigger verifica_provenienza_rapporto_whatsapp before insert or update of whatsapp_message_id, company_id
  on public.campo_rapportini for each row execute function private.whatsapp_rapporto_provenienza();

-- Le verifiche di Campo sono le stesse anche per l'account riconosciuto dal webhook.
-- La funzione è riservata al worker. Le impostazioni JWT sono ripristinate in uscita.
create or replace function public.whatsapp_contesto_rapportino(
  p_company uuid, p_user uuid, p_order uuid, p_day date
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  claims_prima text := current_setting('request.jwt.claims', true);
  sub_prima text := current_setting('request.jwt.claim.sub', true);
  ruolo_prima text := current_setting('request.jwt.claim.role', true);
  ruolo jsonb;
  regole jsonb;
  squadra jsonb := '[]'::jsonb;
  responsabile boolean;
  ufficio boolean;
  con_capo boolean;
  chi text;
begin
  if p_user is null or p_day is null or not exists (
    select 1 from public.orders where id = p_order and company_id = p_company and deleted_at is null
  ) then raise exception 'Commessa non disponibile' using errcode = '42501'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  ufficio := coalesce(public.campo_e_ufficio(p_company), false)
    and coalesce(public.has_permission_for_company(p_user, 'can_edit_orders', p_company), false);
  if not coalesce(public.user_can_access_company(p_company), false)
    or public.utente_bloccato() or public.utente_e_cliente_esterno() or public.utente_sola_lettura(p_company)
    or not (ufficio or coalesce(public.campo_lavoro_su_commessa(p_order), false))
    or not coalesce(private.office_visible_order(p_order), false) then
    raise exception 'Permessi per il rapportino non disponibili' using errcode = '42501';
  end if;

  ruolo := public.campo_mio_ruolo(p_order);
  regole := public.campo_regole_per_ordine(p_order);
  responsabile := ufficio or coalesce((ruolo->>'capocantiere')::boolean, false)
    or coalesce((ruolo->>'caposquadra')::boolean, false);
  con_capo := coalesce((ruolo->>'esiste_capo')::boolean, false);
  chi := coalesce(regole->>'chi_compila', 'ognuno');
  if responsabile and (not con_capo or chi <> 'ore_proprie') then
    squadra := public.campo_squadra_rapportino(p_order, p_day);
  end if;

  -- In caso di errore Postgres annulla anche le impostazioni locali.
  perform set_config('request.jwt.claims', coalesce(claims_prima, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(sub_prima, ''), true);
  perform set_config('request.jwt.claim.role', coalesce(ruolo_prima, ''), true);
  return jsonb_build_object('persone', coalesce(squadra, '[]'::jsonb),
    'solo_timbratura', con_capo and not responsabile and chi = 'capo',
    'solo_ore', con_capo and not responsabile and chi = 'ore_proprie',
    'giorni_indietro', coalesce((regole->>'giorni_indietro_rapportino')::integer, 1));
end;
$$;

revoke all on function public.whatsapp_contesto_rapportino(uuid, uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.whatsapp_contesto_rapportino(uuid, uuid, uuid, date) to service_role;

notify pgrst, 'reload schema';
