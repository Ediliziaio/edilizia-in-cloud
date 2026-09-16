-- Token OAuth delle caselle personali (Gmail/Outlook): la chiave dal Vault.
--
-- email_oauth_encrypt_token / email_oauth_decrypt_token avevano la chiave
-- pgp_sym scritta in chiaro nel corpo: chiunque legga pg_proc (un dump, un
-- pg_get_functiondef) poteva decifrare access e refresh token delle caselle.
-- Il 16/09/2026 la chiave è anche finita in un output di sessione: va ruotata,
-- non solo spostata.
--
-- Cosa fa, nell'ordine (tutto in una transazione):
--   1. crea nel Vault `email_oauth_token_key`, generata qui dentro: il valore
--      non passa da nessun file né log;
--   2. ricifra con la chiave nuova i token esistenti, leggendoli con la
--      funzione di decifratura ancora in vigore (la chiave vecchia non compare
--      in questo file). Una riga che si decifra già con la chiave nuova si salta:
--      rilanciare la migrazione non fa danni;
--   3. sostituisce cifratura e decifratura con la lettura dal Vault, come fa già
--      email_imap_chiave() per le password IMAP;
--   4. email_oauth_upsert_connection non è più eseguibile da authenticated: la
--      chiamano solo edge function col service role (callback OAuth, refresh
--      in email-send / email-poll-inbox / outreach). Da utente permetteva di
--      sovrascrivere i token della casella di un collega della stessa azienda;
--   5. email_oauth_chiave_configurata(): il controllo che la diagnostica
--      chiedeva a email_oauth_encrypt_token col JWT dell'utente, ricevendo 403.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1. Chiave nuova --------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_oauth_token_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'email_oauth_token_key',
      'Chiave pgp_sym dei token OAuth in email_oauth_connections (access/refresh_token_enc)'
    );
  end if;
end $$;

create or replace function public.email_oauth_chiave()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select s.decrypted_secret
    from vault.decrypted_secrets s
   where s.name = 'email_oauth_token_key'
   limit 1;
$$;

revoke all on function public.email_oauth_chiave() from public, anon, authenticated, service_role;

-- 2. Ricifratura dei token esistenti --------------------------------------------
-- Blocca le scritture sulla tabella fino al commit: un refresh concorrente non
-- può salvare un token con la chiave vecchia a metà dell'operazione.
lock table public.email_oauth_connections in exclusive mode;

do $$
declare
  v_nuova text := public.email_oauth_chiave();
  r record;
  v_access text;
  v_refresh text;
  v_gia_nuova boolean;
begin
  if v_nuova is null then
    raise exception 'email_oauth_token_key assente dal Vault';
  end if;

  for r in
    select id, access_token_enc, refresh_token_enc
      from public.email_oauth_connections
     where access_token_enc is not null or refresh_token_enc is not null
  loop
    begin
      perform extensions.pgp_sym_decrypt(coalesce(r.access_token_enc, r.refresh_token_enc), v_nuova);
      v_gia_nuova := true;
    exception when others then
      v_gia_nuova := false;
    end;
    continue when v_gia_nuova;

    v_access  := public.email_oauth_decrypt_token(r.access_token_enc);
    v_refresh := public.email_oauth_decrypt_token(r.refresh_token_enc);

    update public.email_oauth_connections
       set access_token_enc  = case when v_access  is null then null
                                    else extensions.pgp_sym_encrypt(v_access,  v_nuova, 'cipher-algo=aes256') end,
           refresh_token_enc = case when v_refresh is null then null
                                    else extensions.pgp_sym_encrypt(v_refresh, v_nuova, 'cipher-algo=aes256') end
     where id = r.id;
  end loop;
end $$;

-- 3. Cifratura e decifratura dal Vault ------------------------------------------
create or replace function public.email_oauth_encrypt_token(p_token text)
returns bytea
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_chiave text;
begin
  if p_token is null then
    return null;
  end if;
  v_chiave := public.email_oauth_chiave();
  if v_chiave is null then
    raise exception 'Chiave di cifratura dei token email non configurata' using errcode = '55000';
  end if;
  return extensions.pgp_sym_encrypt(p_token, v_chiave, 'cipher-algo=aes256');
end;
$$;

create or replace function public.email_oauth_decrypt_token(p_enc bytea)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_chiave text;
begin
  if p_enc is null then
    return null;
  end if;
  v_chiave := public.email_oauth_chiave();
  if v_chiave is null then
    raise exception 'Chiave di cifratura dei token email non configurata' using errcode = '55000';
  end if;
  return extensions.pgp_sym_decrypt(p_enc, v_chiave);
end;
$$;

revoke all on function public.email_oauth_encrypt_token(text) from public, anon, authenticated;
revoke all on function public.email_oauth_decrypt_token(bytea) from public, anon, authenticated;
grant execute on function public.email_oauth_encrypt_token(text) to service_role;
grant execute on function public.email_oauth_decrypt_token(bytea) to service_role;

-- 4. Il salvataggio dei token solo dal server -----------------------------------
revoke all on function public.email_oauth_upsert_connection(uuid, uuid, text, text, text, text, timestamptz, text[])
  from public, anon, authenticated;
grant execute on function public.email_oauth_upsert_connection(uuid, uuid, text, text, text, text, timestamptz, text[])
  to service_role;

-- 5. Controllo per la diagnostica ----------------------------------------------
create or replace function public.email_oauth_chiave_configurata()
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
begin
  return public.email_oauth_decrypt_token(public.email_oauth_encrypt_token('prova')) = 'prova';
exception when others then
  return false;
end;
$$;

revoke all on function public.email_oauth_chiave_configurata() from public, anon, authenticated;
grant execute on function public.email_oauth_chiave_configurata() to service_role;
