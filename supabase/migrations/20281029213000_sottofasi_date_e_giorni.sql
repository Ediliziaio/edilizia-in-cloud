-- Sottofasi con date e tempo necessario (29/10/2026, richiesta di Dimora Torino).
--
-- Una fase come «Impianto elettrico» dura settimane, ma i suoi passi (tracce,
-- cavi, frutti, quadro) hanno ciascuno il suo periodo. Finora le sottofasi
-- avevano solo nome, peso e spunta: il cronoprogramma mostrava la fase come un
-- blocco unico.
--
-- Cosa fa.
--   · order_work_subphases.data_inizio / data_fine: la finestra prevista della
--     sottofase (giorni di calendario, come start_date/end_date delle fasi).
--   · order_work_subphases.giorni: il tempo necessario, in giorni di lavoro. Può
--     essere meno della finestra (3 giorni di lavoro in una settimana).
--   · sottofase_date_coerenti (BEFORE): con inizio e giorni ma senza fine, la
--     fine è inizio + giorni − 1; con le due date e senza giorni, i giorni sono
--     quelli della finestra. Fine prima dell'inizio: rifiutata.
--   · fase_allarga_a_sottofasi (AFTER): se una sottofase esce dalle date della
--     sua fase, la fase si ALLARGA per contenerla (mai si stringe). Passa da
--     trg_fase_date_alle_squadre: le squadre che seguono la fase la seguono,
--     come quando l'ufficio cambia le date a mano. Le date le scrive solo chi
--     ha «Ordini e Commesse» (trg_sottofasi_guardia: dal cantiere si spunta e basta).
--
-- Nessun dato esistente cambia: le colonne nascono vuote e nessuna fase si muove
-- finché qualcuno non data una sottofase.

set local lock_timeout = '3s';

alter table public.order_work_subphases
  add column if not exists data_inizio date,
  add column if not exists data_fine date,
  add column if not exists giorni integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_work_subphases_giorni_validi') then
    alter table public.order_work_subphases
      add constraint order_work_subphases_giorni_validi check (giorni is null or giorni between 1 and 3650);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_work_subphases_date_ordinate') then
    alter table public.order_work_subphases
      add constraint order_work_subphases_date_ordinate check (data_inizio is null or data_fine is null or data_fine >= data_inizio);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Inizio + giorni → fine; due date → giorni
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
  return new;
end;
$$;

drop trigger if exists trg_sottofasi_date_coerenti on public.order_work_subphases;
create trigger trg_sottofasi_date_coerenti
  before insert or update of data_inizio, data_fine, giorni on public.order_work_subphases
  for each row execute function public.sottofase_date_coerenti();

-- ---------------------------------------------------------------------------
-- La fase contiene le sue sottofasi: si allarga, non si stringe
-- ---------------------------------------------------------------------------
create or replace function public.fase_allarga_a_sottofasi()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_da date := coalesce(new.data_inizio, new.data_fine);
  v_a date := coalesce(new.data_fine, new.data_inizio);
begin
  if v_da is null then
    return new;
  end if;
  update public.order_work_phases f
     set start_date = least(coalesce(f.start_date, v_da), v_da),
         end_date = greatest(coalesce(f.end_date, v_a), v_a),
         updated_at = now()
   where f.id = new.phase_id
     and (f.start_date is null or f.start_date > v_da or f.end_date is null or f.end_date < v_a);
  return new;
end;
$$;

drop trigger if exists trg_sottofasi_allarga_fase on public.order_work_subphases;
create trigger trg_sottofasi_allarga_fase
  after insert or update of data_inizio, data_fine on public.order_work_subphases
  for each row execute function public.fase_allarga_a_sottofasi();

revoke all on function public.sottofase_date_coerenti() from public, anon, authenticated;
revoke all on function public.fase_allarga_a_sottofasi() from public, anon, authenticated;
