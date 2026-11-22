set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.push_tokens add column if not exists impronta_dispositivo text;
create unique index if not exists push_tokens_dispositivo_unico on public.push_tokens (impronta_dispositivo)
where impronta_dispositivo is not null;
create index if not exists push_tokens_token_piattaforma on public.push_tokens (platform, token);

-- La chiave casuale resta nell'app. La sua impronta lega il token a una sola
-- installazione e permette il cambio account sullo stesso telefono.
create or replace function public.registra_dispositivo_push(p_utente uuid, p_chiave text, p_token text, p_piattaforma text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  impronta text;
  azienda uuid;
begin
  if auth.uid() is null or p_utente is distinct from auth.uid() or public.utente_bloccato() then
    raise exception using errcode = '42501', message = 'Accedi per registrare questo dispositivo.';
  end if;
  if p_chiave is null or p_chiave !~ '^[0-9a-f]{64}$' or p_token is null or p_piattaforma is null
    or not ((p_piattaforma = 'android' and char_length(p_token) between 30 and 4096 and p_token ~ '^[A-Za-z0-9:_.-]+$')
      or (p_piattaforma = 'ios' and char_length(p_token) between 32 and 256 and p_token ~ '^[0-9a-fA-F]+$')) then
    raise exception using errcode = '22023', message = 'Registrazione del dispositivo non valida.';
  end if;
  impronta := encode(sha256(convert_to(p_chiave, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('push-installazione:' || impronta, 0));
  perform pg_advisory_xact_lock(hashtextextended('push-token:' || p_piattaforma || ':' || p_token, 0));
  if exists (
    select 1 from public.push_tokens t where t.token = p_token and t.platform = p_piattaforma
      and t.user_id <> p_utente and t.impronta_dispositivo is distinct from impronta
  ) then
    raise exception using errcode = '42501', message = 'Questo token appartiene a un’altra installazione.';
  end if;
  select p.company_id into azienda from public.profiles p where p.id = p_utente;
  delete from public.push_tokens t where t.user_id = p_utente and t.token = p_token and t.impronta_dispositivo is distinct from impronta;
  insert into public.push_tokens(user_id, company_id, token, platform, impronta_dispositivo)
  values (p_utente, azienda, p_token, p_piattaforma, impronta)
  on conflict (impronta_dispositivo) where impronta_dispositivo is not null do update
    set user_id = excluded.user_id, company_id = excluded.company_id, token = excluded.token,
      platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.disattiva_dispositivo_push(p_utente uuid, p_chiave text)
returns void language plpgsql security definer set search_path = ''
as $$
declare impronta text;
begin
  if auth.uid() is null or p_utente is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'Dispositivo non disponibile.';
  end if;
  if p_chiave is null or p_chiave !~ '^[0-9a-f]{64}$' then return; end if;
  impronta := encode(sha256(convert_to(p_chiave, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('push-installazione:' || impronta, 0));
  delete from public.push_tokens t where t.impronta_dispositivo = impronta and t.user_id = p_utente;
end;
$$;

revoke insert, update on table public.push_tokens from public, anon, authenticated;
revoke all on function public.registra_dispositivo_push(uuid, text, text, text), public.disattiva_dispositivo_push(uuid, text)
from public, anon, authenticated;
grant execute on function public.registra_dispositivo_push(uuid, text, text, text), public.disattiva_dispositivo_push(uuid, text)
to authenticated;
