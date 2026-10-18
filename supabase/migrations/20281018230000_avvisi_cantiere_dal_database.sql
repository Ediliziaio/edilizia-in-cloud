-- Avvisi del cantiere all'ufficio: una regola sola, dal database.
--   · Destinatari: il responsabile della commessa; se la commessa non ce l'ha, i titolari.
--     (Prima: il rapportino al responsabile o a chi aveva creato la commessa, le correzioni di
--     timbratura al responsabile E a tutti i titolari, la merce a tutto l'ufficio.)
--   · Rapportino inviato o rimandato: lo avvisa il database quando cambia stato, non più il telefono
--     (se la chiamata dal telefono falliva, l'ufficio non lo sapeva). Tipo campo_*, quindi anche push.
--   · Chat della commessa: la push agli operai parte per il canale della commessa qualunque nome
--     abbia (prima solo per i nomi «cantiere-…»: se l'aveva aperto l'ufficio, niente push).
-- Nessuna riga scritta: solo funzioni e un trigger.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.campo_destinatari_ufficio(p_company_id uuid, p_order_id uuid)
returns setof uuid language sql stable security definer set search_path = public
as $$
  with responsabile as (
    select o.assigned_to as id from public.orders o
     join public.profiles p on p.id = o.assigned_to
     where o.id = p_order_id and o.company_id = p_company_id and not coalesce(p.is_blocked, false)
  )
  select id from responsabile
  union
  select p.id from public.profiles p join public.user_roles ur on ur.user_id = p.id
   where not exists (select 1 from responsabile)
     and p.company_id = p_company_id and ur.role = 'company_admin' and not coalesce(p.is_blocked, false)
$$;
revoke all on function public.campo_destinatari_ufficio(uuid, uuid) from public, anon, authenticated;

create or replace function public.campo_rapportino_avvisa_ufficio()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_dest uuid; v_codice text; v_autore text; v_cliente boolean; v_ore numeric; v_titolo text; v_testo text;
begin
  if new.stato is distinct from 'inviato' or (tg_op = 'UPDATE' and old.stato is not distinct from 'inviato') then
    return new;
  end if;
  select o.order_code into v_codice from public.orders o where o.id = new.order_id;
  select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) into v_autore from public.profiles p where p.id = new.user_id;
  v_cliente := coalesce(new.lavoro_completato, false) or nullif(btrim(new.firma_cliente_url), '') is not null;
  v_ore := coalesce((select sum(coalesce((x->>'ore')::numeric, 0)) from jsonb_array_elements(
             case when jsonb_typeof(new.presenze) = 'array' then new.presenze else '[]'::jsonb end) x), 0);
  if v_ore = 0 then v_ore := coalesce(new.ore_lavorate, 0) + coalesce(new.ore_straordinario, 0); end if;
  v_titolo := case
    when v_cliente then 'Collaudo firmato dal cliente — ' || coalesce(v_codice, 'commessa')
    when tg_op = 'UPDATE' and old.stato = 'rifiutato' then 'Rapportino corretto, da approvare — ' || coalesce(v_codice, 'commessa')
    else 'Nuovo rapportino da approvare — ' || coalesce(v_codice, 'commessa') end;
  v_testo := case
    when v_cliente then coalesce(nullif(btrim(new.firma_cliente_nome), ''), 'Il cliente') || ' ha firmato il collaudo inviato da '
                        || coalesce(nullif(v_autore, ''), 'il cantiere') || '.'
    else coalesce(nullif(v_autore, ''), 'Un operaio') || ' · ' || to_char(new.data_lavoro, 'DD/MM')
         || case when v_ore > 0 then ' · ' || trim(to_char(v_ore, 'FM999990.##')) || ' h' else '' end || '.' end;
  for v_dest in select * from public.campo_destinatari_ufficio(new.company_id, new.order_id) loop
    if v_dest <> new.user_id then
      perform public.campo_notifica(new.company_id, v_dest, 'campo_rapportino_da_approvare', v_titolo, v_testo,
        'campo_rapportino', new.id, '/azienda/ordini/' || new.order_id || '#section-rapportini');
    end if;
  end loop;
  return new;
exception when others then
  -- Un avviso che non parte non deve bloccare l'invio del rapportino.
  raise warning 'campo_rapportino_avvisa_ufficio: %', sqlerrm;
  return new;
end $$;
revoke all on function public.campo_rapportino_avvisa_ufficio() from public, anon, authenticated;
drop trigger if exists trg_campo_rapportino_avvisa_ufficio on public.campo_rapportini;
create trigger trg_campo_rapportino_avvisa_ufficio after insert or update of stato on public.campo_rapportini
for each row execute function public.campo_rapportino_avvisa_ufficio();

create or replace function public.tg_campo_chat_push()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_nome text; v_commessa uuid; v_ids uuid[]; v_mittente text;
begin
  select c.name, c.order_id into v_nome, v_commessa from public.internal_chat_channels c where c.id = new.channel_id;
  if v_nome is null or (v_nome not like 'cantiere-%' and v_commessa is null) then return new; end if;
  select array_agg(distinct m.user_id) into v_ids
  from public.internal_chat_members m
  join public.user_roles ur on ur.user_id = m.user_id and ur.role in ('employee', 'subcontractor')
  where m.channel_id = new.channel_id and m.user_id <> new.sender_id and coalesce(m.is_muted, false) = false
    and public.utente_ha_dispositivi(m.user_id)
    and not public.utente_in_silenzio(m.user_id);
  if v_ids is null then return new; end if;
  select trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) into v_mittente from public.profiles p where p.id = new.sender_id;
  begin
    perform public.campo_push_invia(v_ids, coalesce(nullif(v_mittente, ''), 'Messaggio') || ' · ' || v_nome,
      left(coalesce(new.content, 'Nuovo messaggio'), 120), '/campo/chat/' || new.channel_id::text,
      'campo_chat:' || new.channel_id::text);
  exception when others then
    raise warning 'tg_campo_chat_push: %', sqlerrm;
  end;
  return new;
end $function$;
