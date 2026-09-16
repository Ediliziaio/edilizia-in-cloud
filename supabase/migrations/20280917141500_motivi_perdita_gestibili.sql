-- Motivi di perdita: sette standard uguali per tutti, più quelli che ogni
-- azienda aggiunge. Da Impostazioni → Motivi di perdita si rinominano e si
-- tolgono quelli propri; le opportunità già chiuse non si rompono.

-- 1. Il controllo guarda solo un motivo NUOVO o CAMBIATO: un motivo tolto
--    dall'elenco resta valido sulle opportunità che lo portano già, altrimenti
--    ogni modifica successiva (nota, fase, venditore) andrebbe in errore.
create or replace function public.validate_lost_reason_category()
returns trigger
language plpgsql
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
begin
  if new.lost_reason_category is not null
     and (tg_op = 'INSERT' or new.lost_reason_category is distinct from old.lost_reason_category)
     and new.lost_reason_category not in (
       'prezzo', 'concorrente', 'budget_non_disponibile', 'timing',
       'prodotto_non_adatto', 'nessuna_risposta', 'altro'
     )
     and not exists (
       select 1 from public.opportunity_loss_reasons r
       where r.company_id = new.company_id
         and lower(r.label) = lower(new.lost_reason_category)
     )
  then
    raise exception 'Invalid lost_reason_category: %', new.lost_reason_category;
  end if;
  return new;
end;
$function$;

-- 2. Niente doppioni nella stessa azienda ("Misure sbagliate" / "misure sbagliate").
create unique index if not exists opportunity_loss_reasons_company_label_uniq
  on public.opportunity_loss_reasons (company_id, lower(label));

-- 3. Accesso: anche chi lavora su più aziende (azienda effettiva), non solo
--    quella del profilo.
drop policy if exists "Company users manage loss reasons" on public.opportunity_loss_reasons;
create policy "Company users manage loss reasons" on public.opportunity_loss_reasons
  for all to authenticated
  using (public.user_can_access_company(company_id))
  with check (public.user_can_access_company(company_id));

-- 4. Quante opportunità usano ciascun motivo (standard e dell'azienda).
create or replace function public.motivi_perdita_utilizzo()
returns table (motivo text, opportunita integer)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select o.lost_reason_category, count(*)::int
    from public.marketing_opportunities o
   where o.company_id = public.get_effective_company_id()
     and o.lost_reason_category is not null
     and o.deleted_at is null
   group by o.lost_reason_category;
$$;
revoke all on function public.motivi_perdita_utilizzo() from public, anon;
grant execute on function public.motivi_perdita_utilizzo() to authenticated;

-- 5. Rinominare un motivo porta con sé le opportunità che lo usano: i report
--    raggruppano per testo, un nome corretto non deve spezzare lo storico.
create or replace function public.rinomina_motivo_perdita(p_id uuid, p_label text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_company uuid;
  v_vecchio text;
  v_nuovo text := btrim(coalesce(p_label, ''));
  v_aggiornate integer;
begin
  if v_nuovo = '' then
    raise exception 'Scrivi il nuovo nome del motivo';
  end if;

  select company_id, label into v_company, v_vecchio
    from public.opportunity_loss_reasons where id = p_id;
  if v_company is null or not public.user_can_access_company(v_company) then
    raise exception 'Motivo non trovato';
  end if;

  if v_nuovo = v_vecchio then
    return 0;
  end if;

  if exists (
    select 1 from public.opportunity_loss_reasons
     where company_id = v_company and id <> p_id and lower(label) = lower(v_nuovo)
  ) then
    raise exception 'Esiste già un motivo chiamato «%»', v_nuovo;
  end if;

  update public.opportunity_loss_reasons set label = v_nuovo where id = p_id;

  set local lock_timeout = '3s';
  update public.marketing_opportunities
     set lost_reason_category = v_nuovo
   where company_id = v_company
     and lost_reason_category = v_vecchio;
  get diagnostics v_aggiornate = row_count;
  return v_aggiornate;
end;
$$;
revoke all on function public.rinomina_motivo_perdita(uuid, text) from public, anon;
grant execute on function public.rinomina_motivo_perdita(uuid, text) to authenticated;
