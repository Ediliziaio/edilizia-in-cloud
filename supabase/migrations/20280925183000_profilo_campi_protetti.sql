-- Il proprio profilo: azienda, blocco, email e verifica in due passaggi li
-- cambia solo chi ne ha il diritto.
--
-- La policy «Users can update their own profile» (UPDATE USING id = auth.uid(),
-- senza WITH CHECK) lascia a ogni utente modificare QUALSIASI colonna della
-- propria riga di profiles. Provato il 25/09/2026 in una transazione annullata:
--   - un utente bloccato si sbloccava da solo (is_blocked = false);
--   - un utente dello staff metteva nel proprio company_id quello di un'altra
--     azienda e ne vedeva subito i dati (subappaltatori, render, SMS…), perché
--     get_user_company_id() legge proprio profiles.company_id.
-- Le altre colonne che contano per l'accesso:
--   - portal_disabled: il cliente si riaccenderebbe il portale spento;
--   - deleted_at, deleted_by: l'utente cancellato si ripristinerebbe;
--   - email: company-access-manage cerca per profiles.email chi invitare, e
--     cambiandola ci si prenderebbe l'invito mandato a un altro;
--   - marketing_contact_id: il collegamento all'anagrafica lo decide
--     collega_anagrafica_cliente, non l'utente;
--   - require_2fa: la verifica imposta dall'amministratore (accenderla sul
--     proprio profilo sì, spegnerla no: la spegne manage-totp).
--
-- Chi le cambia davvero non passa da qui:
--   - le funzioni SECURITY DEFINER (admin_set_user_blocked, soft_delete_company,
--     restore_company, collega_anagrafica_cliente, i trigger del portale)
--     girano come il loro proprietario, non come authenticated;
--   - le edge function usano il service role (manage-totp,
--     company-access-manage, admin-manage-login…);
--   - l'amministratore che modifica un ALTRO utente (UsersConfig,
--     BloccoAccessoCard, UserSecurityTab): qui conta solo la propria riga.
-- Sul proprio profilo le pagine dell'app (MioProfilo, CustomerProfile,
-- ChangePasswordForm) toccano solo nome, telefono, indirizzi, codice fiscale,
-- note, avatar e la data della password.
--
-- Un trigger e non una WITH CHECK, perché la policy non vede il valore di
-- prima. Scatta prima di trg_profilo_cliente_resta_bloccato (i trigger BEFORE
-- vanno in ordine alfabetico): vede la richiesta dell'utente, non il blocco
-- che quello aggiunge.

set local lock_timeout = '3s';

create or replace function public.profilo_campi_protetti()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon')
     or new.id is distinct from (select auth.uid())
     or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role)) then
    return new;
  end if;

  if new.company_id is distinct from old.company_id
     or coalesce(new.is_blocked, false) <> coalesce(old.is_blocked, false)
     or new.blocked_at is distinct from old.blocked_at
     or new.blocked_by is distinct from old.blocked_by
     or new.block_reason is distinct from old.block_reason
     or coalesce(new.portal_disabled, false) <> coalesce(old.portal_disabled, false)
     or new.deleted_at is distinct from old.deleted_at
     or new.deleted_by is distinct from old.deleted_by
     or lower(btrim(new.email)) is distinct from lower(btrim(old.email))
     or new.marketing_contact_id is distinct from old.marketing_contact_id
     or (coalesce(old.require_2fa, false) and not coalesce(new.require_2fa, false)) then
    raise exception 'Azienda, blocco, email e verifica in due passaggi del tuo profilo li può cambiare solo un amministratore.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Funzione di trigger: non serve a nessuno poterla chiamare (allo scatto il
-- privilegio non viene controllato).
revoke all on function public.profilo_campi_protetti() from public, anon, authenticated;

create or replace trigger trg_profilo_campi_protetti
  before update of company_id, is_blocked, blocked_at, blocked_by, block_reason,
                   portal_disabled, deleted_at, deleted_by, email,
                   marketing_contact_id, require_2fa
  on public.profiles
  for each row execute function public.profilo_campi_protetti();
