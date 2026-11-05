-- Ogni sottofase ha il suo avanzamento: una percentuale e, se misurabile, la quantità fatta. Prima era solo
-- fatta o da fare, e su un lavoro lungo una voce a metà non contava niente: una fase con 59 voci su 84 a metà
-- risultava molto più indietro del SAL. «Fatta» resta: vale 100, e i rapportini continuano a segnarla.
--
-- La fase si calcola pesando: col peso scritto a mano se qualcuno l'ha scritto; altrimenti, se ogni sottofase ha
-- una voce con un importo, con l'importo, così una voce da 30.000 € conta più di una da 50 €. Nessuna fase arriva
-- al 100% per un arrotondamento: finché una sottofase non è finita, resta al massimo al 99%.
--
-- Nessun dato toccato: chi è già fatta vale 100 dal calcolo, senza riscrivere le righe. Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.order_work_subphases
  add column if not exists percentuale integer not null default 0,
  add column if not exists quantita_fatta numeric(14,3);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'order_work_subphases_percentuale_valida') then
    alter table public.order_work_subphases add constraint order_work_subphases_percentuale_valida
      check (percentuale between 0 and 100 and (quantita_fatta is null or quantita_fatta >= 0));
  end if;
end $$;

-- Fatta e percentuale dicono la stessa cosa: chi cambia l'una allinea l'altra. Parte prima della guardia.
create or replace function public.sottofase_avanzamento_coerente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.fatta then new.percentuale := 100; elsif new.percentuale >= 100 then new.fatta := true; end if;
    return new;
  end if;
  if new.fatta is distinct from old.fatta then
    if new.fatta then new.percentuale := 100;
    elsif new.percentuale >= 100 then new.percentuale := 0;
    end if;
  elsif new.percentuale is distinct from old.percentuale then
    new.fatta := new.percentuale >= 100;
  end if;
  return new;
end;
$$;
revoke all on function public.sottofase_avanzamento_coerente() from public, anon, authenticated;

drop trigger if exists trg_sottofasi_a_avanzamento on public.order_work_subphases;
create trigger trg_sottofasi_a_avanzamento before insert or update of fatta, percentuale on public.order_work_subphases
  for each row execute function public.sottofase_avanzamento_coerente();

-- Dal cantiere si può dire anche a che punto è, con le stesse regole della spunta.
create or replace function public.sottofase_guardia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_cantiere constant text[] := array['fatta', 'fatta_il', 'fatta_da', 'updated_at', 'percentuale', 'quantita_fatta'];
  v_azienda uuid;
  v_commessa uuid;
  v_regola text;
  v_ruolo jsonb;
  v_puo boolean;
begin
  select f.company_id, f.order_id into v_azienda, v_commessa
    from public.order_work_phases f
   where f.id = new.phase_id;
  if v_azienda is null then
    raise exception 'La fase non esiste.' using errcode = '23503';
  end if;
  if tg_op = 'UPDATE' and new.phase_id is distinct from old.phase_id then
    raise exception 'Una sottofase non cambia fase.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.fatta is distinct from old.fatta then
    new.fatta_il := case when new.fatta then now() end;
    new.fatta_da := case when new.fatta then v_utente end;
  end if;
  new.updated_at := now();
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
  if (to_jsonb(new) - v_cantiere) = (to_jsonb(old) - v_cantiere) then
    if new.fatta is distinct from old.fatta or new.percentuale is distinct from old.percentuale or new.quantita_fatta is distinct from old.quantita_fatta then
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
  raise exception 'Dal cantiere si segna solo a che punto è una sottofase: il resto lo cambia chi ha il permesso «Ordini e Commesse».'
    using errcode = '42501';
end;
$$;

create or replace function public.fase_avanzamento_derivato(p_phase_id uuid, p_status_proposto text, p_status_precedente text)
returns table(derivata boolean, percentuale integer, stato text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with s as (
    select su.peso,
           case when su.fatta then 100 else su.percentuale end as pct,
           (select v.importo from public.order_work_phase_voci v where v.subphase_id = su.id limit 1) as importo
      from public.order_work_subphases su
     where su.phase_id = p_phase_id
  ), t as (
    select count(*)::integer as n,
           coalesce(sum(peso), 0)::numeric as tot,
           coalesce(sum(peso * pct), 0)::numeric as fatto,
           coalesce(bool_and(peso = 1 and coalesce(importo, 0) > 0), false) as per_importo,
           coalesce(sum(importo), 0)::numeric as tot_importo,
           coalesce(sum(importo * pct), 0)::numeric as fatto_importo,
           coalesce(bool_and(pct >= 100), false) as tutte_finite
      from s
  ), p as (
    select n,
           case when n = 0 then null
                when tutte_finite then 100
                else least(99, round(case when per_importo then fatto_importo / tot_importo else fatto / tot end)::integer)
           end as pct
      from t
  )
  select p.n > 0,
         p.pct,
         case when p.n = 0 then null
              when p.pct >= 100 then 'completata'
              when p.pct > 0 then 'in_corso'
              when p_status_proposto in ('da_iniziare', 'in_corso') then p_status_proposto
              when p_status_precedente = 'completata' then 'in_corso'
              else p_status_precedente end
    from p;
$function$;

drop trigger if exists trg_sottofasi_ricalcola on public.order_work_subphases;
create trigger trg_sottofasi_ricalcola after insert or delete or update of fatta, peso, percentuale on public.order_work_subphases
  for each row execute function public.trg_sottofasi_ricalcola();

-- Una voce diventa sottofase quando le si vuole dare date o avanzamento. Coi permessi di chi chiama.
create or replace function public.sottofase_da_voce(p_voce_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v public.order_work_phase_voci;
  v_nome text;
  v_id uuid;
begin
  select * into v from public.order_work_phase_voci where id = p_voce_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Voce non trovata, o senza permesso.';
  end if;
  if v.subphase_id is not null then
    return v.subphase_id;
  end if;
  v_nome := btrim(split_part(coalesce(v.descrizione, ''), E'\n', 1));
  if v_nome = '' then v_nome := 'Voce'; end if;
  if length(v_nome) > 160 then v_nome := left(v_nome, 159) || '…'; end if;
  insert into public.order_work_subphases (phase_id, name, position, peso)
  values (v.phase_id, v_nome, coalesce((select max(s.position) + 1 from public.order_work_subphases s where s.phase_id = v.phase_id), 0), 1)
  returning id into v_id;
  update public.order_work_phase_voci set subphase_id = v_id where id = p_voce_id;
  return v_id;
end;
$$;
revoke all on function public.sottofase_da_voce(uuid) from public, anon;
grant execute on function public.sottofase_da_voce(uuid) to authenticated, service_role;
