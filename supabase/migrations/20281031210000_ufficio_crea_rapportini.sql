-- Rapportini e diario scritti dall'ufficio, anche più giorni insieme (31/10/2026).
--
-- Richiesta di Florin: dalla commessa l'ufficio deve poter scrivere il diario
-- di cantiere (cosa si è fatto, su quali fasi e sottofasi) quando il cantiere
-- non l'ha fatto dall'app, anche per più giorni in un colpo.
--
-- La policy cr_insert lascia scrivere un rapportino solo a chi è assegnato al
-- cantiere e a proprio nome: l'ufficio non ci passa. Questa funzione:
--   · controlla i permessi come ufficio_registra_ore (Ordini e Commesse,
--     giornale dei lavori, visibilità della commessa);
--   · scrive da 1 a 31 rapportini, a nome di chi li scrive o di una persona che
--     lavora sulla commessa con l'app (order_campo_assignments);
--   · li lascia «inviato»: l'avanzamento e le sottofasi si muovono
--     all'APPROVAZIONE, come per quelli del cantiere;
--   · non scrive ore: le ore dall'ufficio passano dal registro ore
--     (ufficio_registra_ore), che le attribuisce al dipendente giusto col suo
--     costo. ufficio_created_by dice che il rapportino l'ha scritto l'ufficio.
-- Tutto o niente: un giorno sbagliato annulla l'intero lotto.

set local lock_timeout = '3s';

create or replace function public.ufficio_crea_rapportini(p_order_id uuid, p_rapportini jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c uuid;
  assegnata uuid;
  r jsonb;
  v_autore uuid;
  v_giorno date;
  v_fasi jsonb;
  n integer := 0;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  select company_id, assigned_to into c, assegnata from public.orders where id = p_order_id and deleted_at is null;
  if c is null then
    raise exception 'Commessa non trovata.' using errcode = 'P0002';
  end if;
  perform public.assert_company_access(c);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', c) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_orders', c) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_giornale_lavori', c) is not true
     or public.check_staff_visibility(auth.uid(), assegnata) is not true then
    raise exception 'Non hai il permesso di scrivere rapportini su questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rapportini) is distinct from 'array' or jsonb_array_length(p_rapportini) = 0 or jsonb_array_length(p_rapportini) > 31 then
    raise exception 'Da 1 a 31 rapportini alla volta.' using errcode = '22023';
  end if;

  for r in select value from jsonb_array_elements(p_rapportini) loop
    v_giorno := nullif(r->>'data_lavoro', '')::date;
    if v_giorno is null or v_giorno > (now() at time zone 'Europe/Rome')::date then
      raise exception 'Ogni rapportino ha una data, non nel futuro.' using errcode = '22023';
    end if;
    if btrim(coalesce(r->>'descrizione', '')) = '' then
      raise exception 'Scrivi cosa si è fatto il %.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    v_autore := coalesce(nullif(r->>'autore', '')::uuid, auth.uid());
    if v_autore <> auth.uid() and not exists (
      select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_autore
    ) then
      raise exception 'La persona scelta non lavora su questa commessa con l''app.' using errcode = '42501';
    end if;
    v_fasi := coalesce(r->'fasi_lavorate', '[]'::jsonb);
    if jsonb_typeof(v_fasi) <> 'array' or exists (
      select 1 from jsonb_array_elements(v_fasi) e
       where not exists (select 1 from public.order_work_phases f where f.id::text = e->>'phase_id' and f.order_id = p_order_id)
    ) then
      raise exception 'Una fase del rapportino del % non è di questa commessa.', to_char(v_giorno, 'DD/MM/YYYY') using errcode = '22023';
    end if;
    begin
      insert into public.campo_rapportini (company_id, order_id, user_id, role_type, data_lavoro, descrizione_lavori,
                                           ore_lavorate, fasi_lavorate, note, stato, ufficio_created_by)
      values (c, p_order_id, v_autore, 'employee', v_giorno, left(btrim(r->>'descrizione'), 4000),
              0, v_fasi, nullif(left(btrim(coalesce(r->>'note', '')), 4000), ''), 'inviato', auth.uid());
    exception when unique_violation then
      raise exception 'Il % c''è già un rapportino di questa persona: correggi quello invece di crearne un altro.', to_char(v_giorno, 'DD/MM/YYYY')
        using errcode = '23505';
    end;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.ufficio_crea_rapportini(uuid, jsonb) from public, anon;
grant execute on function public.ufficio_crea_rapportini(uuid, jsonb) to authenticated;
