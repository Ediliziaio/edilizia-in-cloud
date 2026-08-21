-- HR: le presenze raccontano ciò che le timbrature sanno già.
--
-- 1) hr_giornate si popola dal trigger su hr_timbrature — ma i dati inseriti
--    in blocco (seed, import) bypassano i trigger: su Demo 2 c'erano 1.786
--    timbrature e DUE giornate. Il calendario Presenze restava vuoto con le
--    timbrature piene. Backfill set-based con la STESSA semantica del
--    trigger (prima entrata, ultima uscita, pause accoppiate in sequenza),
--    idempotente: riallinea qualsiasi buco passato e futuro.
--
-- 2) Un dipendente disattivato in anagrafica (employees.is_active) restava
--    "attivo" come profilo HR (hr_profili.attivo) e viceversa: su Demo 2,
--    6 profili HR attivi puntavano a dipendenti spenti — "24 attivi" in HR
--    contro "17 attivi" in Costi, sulla stessa azienda. Da oggi i due stati
--    si tengono per mano (trigger bidirezionali, anti-rimbalzo con
--    IS DISTINCT FROM) + riallineamento una tantum (verità = employees,
--    che governa i costi).

-- ── 1a. Backfill giornate dalle timbrature ──────────────────────────────────
with pause as (
  select profilo_id, data_evento,
         sum(extract(epoch from (fine - ora_evento)) / 3600.0) as ore_pausa
  from (
    select profilo_id, data_evento, tipo, ora_evento,
           lead(ora_evento) over (partition by profilo_id, data_evento order by ora_evento) as fine,
           lead(tipo)       over (partition by profilo_id, data_evento order by ora_evento) as tipo_fine
    from hr_timbrature
    where tipo in ('pausa_inizio', 'pausa_fine')
  ) x
  where tipo = 'pausa_inizio' and tipo_fine = 'pausa_fine'
  group by profilo_id, data_evento
),
base as (
  select t.company_id, t.profilo_id, t.data_evento as data,
         min(t.ora_evento) filter (where t.tipo = 'entrata') as prima_entrata,
         max(t.ora_evento) filter (where t.tipo = 'uscita')  as ultima_uscita
  from hr_timbrature t
  group by t.company_id, t.profilo_id, t.data_evento
)
insert into hr_giornate (company_id, profilo_id, data, ore_previste, ore_lavorate, ore_pausa, prima_entrata, ultima_uscita)
select b.company_id, b.profilo_id, b.data,
       coalesce(hp.ore_giornaliere, 8),
       round(greatest(0,
         case when b.prima_entrata is not null and b.ultima_uscita is not null
              then extract(epoch from (b.ultima_uscita - b.prima_entrata)) / 3600.0
              else 0 end
         - coalesce(p.ore_pausa, 0))::numeric, 2),
       round(coalesce(p.ore_pausa, 0)::numeric, 2),
       b.prima_entrata, b.ultima_uscita
from base b
join hr_profili hp on hp.id = b.profilo_id
left join pause p on p.profilo_id = b.profilo_id and p.data_evento = b.data
on conflict (profilo_id, data) do update set
  ore_lavorate  = excluded.ore_lavorate,
  ore_pausa     = excluded.ore_pausa,
  prima_entrata = excluded.prima_entrata,
  ultima_uscita = excluded.ultima_uscita,
  updated_at    = now();

-- ── 2a. Riallineamento una tantum: employees comanda ────────────────────────
update hr_profili hp
   set attivo = e.is_active, updated_at = now()
  from employees e
 where e.id = hp.employee_id
   and hp.attivo is distinct from e.is_active;

-- ── 2b. Da oggi i due stati restano sincronizzati ───────────────────────────
create or replace function public.sync_attivo_hr_verso_employee()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.employee_id is not null then
    update employees
       set is_active = new.attivo
     where id = new.employee_id
       and is_active is distinct from new.attivo;   -- 0 righe = niente rimbalzo
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_attivo_hr on public.hr_profili;
create trigger trg_sync_attivo_hr
  after update of attivo on public.hr_profili
  for each row execute function public.sync_attivo_hr_verso_employee();

create or replace function public.sync_attivo_employee_verso_hr()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update hr_profili
     set attivo = new.is_active,
         -- la cessazione si data quando si spegne, se non già scritta a mano
         data_cessazione = case when new.is_active then data_cessazione
                                else coalesce(data_cessazione, current_date) end,
         updated_at = now()
   where employee_id = new.id
     and attivo is distinct from new.is_active;
  return new;
end $$;

drop trigger if exists trg_sync_attivo_employee on public.employees;
create trigger trg_sync_attivo_employee
  after update of is_active on public.employees
  for each row execute function public.sync_attivo_employee_verso_hr();
