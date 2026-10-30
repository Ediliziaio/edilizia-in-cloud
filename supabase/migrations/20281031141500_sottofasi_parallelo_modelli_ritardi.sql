-- Sottofasi: in parallelo, giorni nei modelli, avviso dei ritardi (31/10/2026).
--
-- Seguito di 20281029213000_sottofasi_date_e_giorni, richiesto da Florin.
--
--   · order_work_subphases.in_parallelo: la sottofase parte insieme alla
--     precedente invece che dopo (due squadre insieme). Il piano in fila lo legge.
--   · I modelli di fasi tengono giorni e parallelo delle sottofasi: salvando una
--     commessa come modello e applicandolo (anche all'avvio della commessa e negli
--     interventi del contratto) i giorni non si perdono più. Le date no: valgono
--     per una commessa sola.
--   · sottofasi_ritardo_avvisa(): una volta al giorno avvisa il responsabile della
--     commessa (assigned_to) e il capomastro delle sottofasi finite oltre la loro
--     fine senza essere spuntate. Una sola volta per sottofase
--     (ritardo_avvisato_il); se le date cambiano l'avviso si può ripetere.
--
-- Nessuna riga esistente cambia: le colonne nascono vuote o false.

set local lock_timeout = '3s';

alter table public.order_work_subphases
  add column if not exists in_parallelo boolean not null default false,
  add column if not exists ritardo_avvisato_il date;

alter table public.work_phase_template_subphases
  add column if not exists giorni integer,
  add column if not exists in_parallelo boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'work_phase_template_subphases_giorni_validi') then
    alter table public.work_phase_template_subphases
      add constraint work_phase_template_subphases_giorni_validi check (giorni is null or giorni between 1 and 3650);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Date nuove → l'avviso di ritardo vale di nuovo
-- ---------------------------------------------------------------------------
create or replace function public.sottofase_date_coerenti()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.data_inizio is not null and new.data_fine is null and new.giorni is not null then
    new.data_fine := new.data_inizio + (new.giorni - 1);
  end if;
  if new.data_inizio is not null and new.data_fine is not null and new.giorni is null then
    new.giorni := (new.data_fine - new.data_inizio) + 1;
  end if;
  if new.data_inizio is not null and new.data_fine is not null and new.data_fine < new.data_inizio then
    raise exception 'La fine della sottofase «%» è prima dell''inizio.', new.name using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.data_fine is distinct from old.data_fine then
    new.ritardo_avvisato_il := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- I modelli portano giorni e parallelo
-- ---------------------------------------------------------------------------
create or replace function public.aggiungi_fasi_commessa(p_order_id uuid, p_fasi jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_base integer;
  v_aggiunte integer := 0;
  v_pos_sotto integer;
  v_venduto numeric;
  v_giorni integer;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di aggiungere fasi a questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fasi) is distinct from 'array' or jsonb_array_length(p_fasi) = 0 then
    raise exception 'Nessuna fase da aggiungere.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_fasi) > 60 then
    raise exception 'Troppe fasi in una volta: al massimo 60.' using errcode = '22023';
  end if;
  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order_id;
  for v_fase in select value from jsonb_array_elements(p_fasi) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    v_venduto := null;
    if nullif(v_fase->>'venduto', '') is not null then
      if not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then
        raise exception 'Il venduto della fase lo scrive solo chi ha i permessi «Ordini e Commesse» e «Importi di vendita».'
          using errcode = '42501';
      end if;
      v_venduto := greatest(0, round((v_fase->>'venduto')::numeric, 2));
    end if;
    insert into public.order_work_phases (company_id, order_id, name, position, importo_venduto)
    values (v_azienda, p_order_id, left(btrim(v_fase->>'nome'), 160), v_base + v_aggiunte, v_venduto)
    returning id into v_fase_id;
    v_aggiunte := v_aggiunte + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        v_giorni := case when coalesce(v_sotto->>'giorni', '') ~ '^\d{1,4}$'
                          and (v_sotto->>'giorni')::integer between 1 and 3650
                         then (v_sotto->>'giorni')::integer end;
        insert into public.order_work_subphases (phase_id, name, position, peso, giorni, in_parallelo)
        values (v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)),
                v_giorni, coalesce((v_sotto->>'in_parallelo')::boolean, false) and v_pos_sotto > 0);
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;
  if v_aggiunte = 0 then
    raise exception 'Nessuna fase con un nome da aggiungere.' using errcode = '22023';
  end if;
  return v_aggiunte;
end;
$function$;

create or replace function public.salva_modello_fasi(p_company_id uuid, p_modello jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid := nullif(p_modello->>'id', '')::uuid;
  v_nome text := btrim(coalesce(p_modello->>'nome', ''));
  v_desc text := nullif(btrim(coalesce(p_modello->>'descrizione', '')), '');
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_pos integer := 0;
  v_pos_sotto integer;
  v_giorni integer;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di fasi.' using errcode = '42501';
  end if;
  if v_nome = '' or length(v_nome) > 80 then
    raise exception 'Dai un nome al modello (massimo 80 caratteri).' using errcode = '22023';
  end if;
  if jsonb_typeof(p_modello->'fasi') is distinct from 'array' or jsonb_array_length(p_modello->'fasi') = 0 then
    raise exception 'Un modello ha almeno una fase.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_modello->'fasi') > 60 then
    raise exception 'Troppe fasi: al massimo 60.' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.work_phase_templates (company_id, name, hint, position)
    values (p_company_id, v_nome, v_desc,
            coalesce((select max(position) + 1 from public.work_phase_templates where company_id = p_company_id), 0))
    returning id into v_id;
  else
    update public.work_phase_templates
       set name = v_nome, hint = v_desc, updated_at = now()
     where id = v_id and company_id = p_company_id;
    if not found then
      raise exception 'Modello non trovato.' using errcode = 'P0002';
    end if;
    delete from public.work_phase_template_phases where template_id = v_id;
  end if;
  for v_fase in select value from jsonb_array_elements(p_modello->'fasi') loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    insert into public.work_phase_template_phases (company_id, template_id, name, position)
    values (p_company_id, v_id, left(btrim(v_fase->>'nome'), 160), v_pos)
    returning id into v_fase_id;
    v_pos := v_pos + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        v_giorni := case when coalesce(v_sotto->>'giorni', '') ~ '^\d{1,4}$'
                          and (v_sotto->>'giorni')::integer between 1 and 3650
                         then (v_sotto->>'giorni')::integer end;
        insert into public.work_phase_template_subphases (company_id, template_phase_id, name, position, peso, giorni, in_parallelo)
        values (p_company_id, v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)),
                v_giorni, coalesce((v_sotto->>'in_parallelo')::boolean, false) and v_pos_sotto > 0);
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;
  if v_pos = 0 then
    raise exception 'Un modello ha almeno una fase con un nome.' using errcode = '22023';
  end if;
  return v_id;
end;
$function$;

-- Le tre funzioni che leggono le sottofasi (di una commessa o di un modello) per
-- passarle avanti costruiscono ognuna lo stesso oggetto {nome, peso}: ci si
-- aggiungono giorni e parallelo sul posto, senza ricopiare funzioni lunghe.
-- Idempotente: se la sostituzione è già stata fatta, non trova più il testo.
do $$
declare
  v_def text;
  v_nuova text;
  v_nome text;
begin
  foreach v_nome in array array['salva_commessa_come_modello', 'commessa_avvia', 'create_contract_intervention'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_nome;
    if v_def is null then
      raise exception 'Funzione % non trovata.', v_nome;
    end if;
    v_nuova := replace(v_def,
      'jsonb_build_object(''nome'', s.name, ''peso'', s.peso)',
      'jsonb_build_object(''nome'', s.name, ''peso'', s.peso, ''giorni'', s.giorni, ''in_parallelo'', s.in_parallelo)');
    v_nuova := replace(v_nuova,
      'jsonb_build_object(''nome'',s.name,''peso'',s.peso)',
      'jsonb_build_object(''nome'',s.name,''peso'',s.peso,''giorni'',s.giorni,''in_parallelo'',s.in_parallelo)');
    if v_nuova <> v_def then
      execute v_nuova;
    elsif position('''giorni''' in v_def) = 0 then
      raise exception 'In % non trovo dove passano le sottofasi: la funzione è cambiata, va rivista a mano.', v_nome;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Avviso dei ritardi
-- ---------------------------------------------------------------------------
create or replace function public.sottofasi_ritardo_avvisa()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_avvisi integer := 0;
begin
  with in_ritardo as (
    select s.id, s.name, s.data_fine, f.name as fase, o.id as commessa, o.company_id,
           coalesce(nullif(o.order_code, ''), 'commessa') as codice,
           array_remove(array[o.assigned_to, o.capomastro_user_id], null) as chi
      from public.order_work_subphases s
      join public.order_work_phases f on f.id = s.phase_id
      join public.orders o on o.id = f.order_id
     where not s.fatta
       and s.data_fine is not null
       and s.data_fine < v_oggi
       and s.data_fine >= v_oggi - 30
       and s.ritardo_avvisato_il is null
       and o.deleted_at is null
       and f.status is distinct from 'completata'
     order by s.data_fine
     limit 500
  ),
  segnate as (
    update public.order_work_subphases s
       set ritardo_avvisato_il = v_oggi
      from in_ritardo r
     where s.id = r.id
    returning r.*
  ),
  inviate as (
    insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
    select distinct on (r.id, u.chi)
           r.company_id, u.chi, 'sottofase_in_ritardo',
           'Sottofase in ritardo · ' || r.codice,
           left(r.name || ' (' || r.fase || ') doveva finire il ' || to_char(r.data_fine, 'DD/MM')
                || ': ' || (v_oggi - r.data_fine) || case when v_oggi - r.data_fine = 1 then ' giorno' else ' giorni' end
                || ' di ritardo.', 300),
           'order', r.commessa, '/azienda/ordini/' || r.commessa
      from segnate r
      cross join lateral unnest(r.chi) as u(chi)
      join public.profiles p on p.id = u.chi
    returning 1
  )
  select count(*) into v_avvisi from inviate;
  return v_avvisi;
end;
$$;

revoke all on function public.sottofasi_ritardo_avvisa() from public, anon, authenticated;
revoke all on function public.sottofase_date_coerenti() from public, anon, authenticated;

-- Ogni mattina alle 7 (ora italiana d'inverno; alle 8 d'estate): solo SQL, niente pg_net.
select cron.unschedule('sottofasi-ritardo-avviso') where exists (select 1 from cron.job where jobname = 'sottofasi-ritardo-avviso');
select cron.schedule('sottofasi-ritardo-avviso', '0 6 * * *', $$select public.sottofasi_ritardo_avvisa()$$);
