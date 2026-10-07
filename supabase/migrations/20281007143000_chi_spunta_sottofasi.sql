-- Chi può spuntare le sottofasi dal cantiere: una regola per azienda (07/10/2026).
--
-- Oggi in «Avanzamento lavori» ogni assegnato alla commessa può chiudere QUALUNQUE
-- fase (nessun filtro «la mia fase»; il commento nel codice dice «nessun gate
-- applicativo necessario»), mentre nel rapportino la percentuale la dichiara il
-- capocantiere o, se non c'è, chiunque. Per le sottofasi l'azienda sceglie:
--   · 'tutti'      — chiunque lavori sulla commessa (il comportamento di oggi, il default);
--   · 'chi_la_fa'  — chi è sulla fase (persona, ditta o squadra), il capocantiere,
--                    e chiunque se la commessa non ha capocantiere;
--   · 'capi'       — il capocantiere, e chiunque se la commessa non ha capocantiere.
-- L'ufficio («Ordini e Commesse») spunta sempre. La regola vale nel database, non
-- solo nella schermata: un'app vecchia non la aggira.
-- La regola riusa le funzioni che l'app di cantiere già chiama: campo_mio_ruolo
-- (capocantiere / esiste un capo) e campo_mie_fasi («tu» e «squadra» di ogni fase).

set local lock_timeout = '3s';

alter table public.company_fasi_settings
  add column if not exists chi_spunta text not null default 'tutti'
  check (chi_spunta in ('tutti', 'chi_la_fa', 'capi'));

-- Le regole dell'azienda si scrivono con questa RPC (la tabella è chiusa in scrittura).
--   p_valori: { chi_spunta?: 'tutti' | 'chi_la_fa' | 'capi' }. Le chiavi che non conosce le ignora.
create or replace function public.fasi_impostazioni_salva(p_company_id uuid, p_valori jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;

  if p_valori ? 'chi_spunta' then
    if (p_valori->>'chi_spunta') not in ('tutti', 'chi_la_fa', 'capi') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set chi_spunta = p_valori->>'chi_spunta', updated_at = now()
     where company_id = p_company_id;
  end if;
end;
$$;

revoke all on function public.fasi_impostazioni_salva(uuid, jsonb) from public, anon;
grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;

-- La regola dell'azienda, letta con i diritti del proprietario: la guardia scatta con i
-- diritti di chi spunta (un operaio, che la tabella delle impostazioni non la legge) e
-- deve poterla vedere comunque. Restituisce un solo valore dell'elenco, e solo a chi
-- è già dentro il database (non ad anon).
create or replace function public.fasi_regola_chi_spunta(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select s.chi_spunta from public.company_fasi_settings s where s.company_id = p_company_id), 'tutti');
$$;
revoke all on function public.fasi_regola_chi_spunta(uuid) from public, anon;
grant execute on function public.fasi_regola_chi_spunta(uuid) to authenticated;

-- La guardia delle sottofasi (20281007130000) con la regola in più.
create or replace function public.sottofase_guardia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  -- Le colonne che cambia il cantiere: spuntare una sottofase.
  v_cantiere constant text[] := array['fatta', 'fatta_il', 'fatta_da', 'updated_at'];
  v_azienda uuid;
  v_commessa uuid;
  v_regola text;
  v_ruolo jsonb;
  v_puo boolean;
begin
  -- L'azienda e la commessa sono quelle della fase.
  select f.company_id, f.order_id into v_azienda, v_commessa
    from public.order_work_phases f
   where f.id = new.phase_id;
  if v_azienda is null then
    raise exception 'La fase non esiste.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.phase_id is distinct from old.phase_id then
    raise exception 'Una sottofase non cambia fase.' using errcode = '42501';
  end if;

  -- Chi l'ha segnata e quando: lo scrive il database, non il client.
  if tg_op = 'INSERT' or new.fatta is distinct from old.fatta then
    new.fatta_il := case when new.fatta then now() end;
    new.fatta_da := case when new.fatta then v_utente end;
  end if;
  new.updated_at := now();

  -- Solo le richieste degli utenti. Le funzioni SECURITY DEFINER, il service
  -- role, i cron e le migrazioni passano.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.has_permission_for_company(v_utente, 'can_edit_orders', v_azienda) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Le sottofasi le crea chi ha il permesso «Ordini e Commesse».'
      using errcode = '42501';
  end if;

  -- Dal cantiere cambia solo se la sottofase è fatta…
  if (to_jsonb(new) - v_cantiere) = (to_jsonb(old) - v_cantiere) then
    -- …e solo se la regola dell'azienda lo permette a questa persona.
    if new.fatta is distinct from old.fatta then
      v_regola := public.fasi_regola_chi_spunta(v_azienda);
      if v_regola <> 'tutti' then
        v_ruolo := public.campo_mio_ruolo(v_commessa);
        v_puo := coalesce((v_ruolo->>'capocantiere')::boolean, false)
                 or not coalesce((v_ruolo->>'esiste_capo')::boolean, false);
        if not v_puo and v_regola = 'chi_la_fa' then
          v_puo := exists (select 1 from jsonb_array_elements(public.campo_mie_fasi(v_commessa)) e
                            where (e->>'id')::uuid = new.phase_id
                              and (coalesce((e->>'tu')::boolean, false) or nullif(e->>'squadra', '') is not null));
        end if;
        if not v_puo then
          raise exception '%', case v_regola
              when 'capi' then 'Le sottofasi le spunta il capocantiere.'
              else 'Le sottofasi le spunta chi fa quella fase, o il capocantiere.' end
            using errcode = '42501';
        end if;
      end if;
    end if;
    return new;
  end if;

  raise exception 'Dal cantiere si segna solo se una sottofase è fatta: il resto lo cambia chi ha il permesso «Ordini e Commesse».'
    using errcode = '42501';
end;
$$;

revoke all on function public.sottofase_guardia() from public, anon, authenticated;
