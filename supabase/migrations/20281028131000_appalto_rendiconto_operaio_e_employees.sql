-- ════════════════════════════════════════════════════════════════════════════
-- Chi ha lavorato: `employees`, non `profiles`
-- ════════════════════════════════════════════════════════════════════════════
-- Correzione della migrazione precedente, applicata a tabella ancora vuota.
-- `appalto_rendiconto_righe.employee_id` puntava a `profiles`, cioe' all'utente
-- dell'app. Ma «quale operaio ha lavorato» in questo progetto e' `employees`:
-- e' li' che puntano `order_employees.employee_id` e tutta la macchina del costo
-- del lavoro (costo orario CCNL). Un operaio puo' esistere in `employees` senza
-- avere un account nell'app: puntando a `profiles` sarebbe stato impossibile
-- indicarlo, e la riga di manodopera piu' comune non si sarebbe potuta scrivere.
--
-- Aggiunto anche il controllo che l'operaio sia dell'azienda della commessa: un
-- operaio di un'altra azienda su una riga di rendiconto e' un costo preso in
-- prestito. Il controllo sta nel trigger, dove stanno gli altri.
--
-- Idempotente. Nessuna riga scritta (la tabella e' vuota).
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.appalto_rendiconto_righe
  drop constraint if exists appalto_rendiconto_righe_employee_id_fkey;

alter table public.appalto_rendiconto_righe
  add constraint appalto_rendiconto_righe_employee_id_fkey
  foreign key (employee_id) references public.employees(id) on delete set null;

comment on column public.appalto_rendiconto_righe.employee_id is
  'Chi ha fatto il lavoro, per le righe di manodopera: `employees`, non `profiles` — un operaio esiste in anagrafica anche senza un account nell''app.';

create or replace function public.appalto_rendiconto_prepara()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_ord record;
  v_t public.appalto_tariffe%rowtype;
  v_override numeric(14,4);
  v_costo numeric;
begin
  select o.company_id, o.order_type, o.appalto_contratto_id
    into v_ord
    from public.orders o
   where o.id = new.order_id and o.deleted_at is null;
  if not found then
    raise exception 'Commessa inesistente' using errcode = '23514';
  end if;
  if v_ord.order_type is distinct from 'appaltatore_lavoro' then
    raise exception 'Il rendiconto esiste solo sulle commesse in appalto' using errcode = '23514';
  end if;
  new.company_id := v_ord.company_id;

  if new.fase_id is not null and not exists (
    select 1 from public.order_work_phases f
     where f.id = new.fase_id and f.order_id = new.order_id
  ) then
    raise exception 'La fase deve appartenere a questa commessa' using errcode = '23514';
  end if;

  if new.employee_id is not null and not exists (
    select 1 from public.employees e
     where e.id = new.employee_id and e.company_id = v_ord.company_id
  ) then
    raise exception 'L''operaio non appartiene a questa azienda' using errcode = '23514';
  end if;

  if new.tariffa_id is null then
    new.extra_contratto := true;
    return new;
  end if;

  select * into v_t from public.appalto_tariffe where id = new.tariffa_id;
  if not found then
    raise exception 'Tariffa inesistente' using errcode = '23514';
  end if;
  if v_t.company_id is distinct from v_ord.company_id then
    raise exception 'La tariffa e'' di un''altra azienda' using errcode = '23514';
  end if;
  if v_ord.appalto_contratto_id is null then
    raise exception 'Questa commessa non ha un contratto: aggancialo prima di rendicontare a listino' using errcode = '23514';
  end if;
  if v_t.contratto_id is distinct from v_ord.appalto_contratto_id then
    raise exception 'La tariffa appartiene a un altro contratto' using errcode = '23514';
  end if;
  if (v_t.valido_dal is not null and new.data < v_t.valido_dal)
     or (v_t.valido_al is not null and new.data > v_t.valido_al) then
    raise exception 'La tariffa «%» non era in vigore il %', v_t.descrizione, to_char(new.data, 'DD/MM/YYYY')
      using errcode = '23514';
  end if;

  select tc.prezzo_unitario into v_override
    from public.appalto_tariffe_commessa tc
   where tc.order_id = new.order_id and tc.tariffa_id = new.tariffa_id;

  new.descrizione := v_t.descrizione;
  new.unita_misura := v_t.unita_misura;
  new.prezzo_unitario := coalesce(v_override, v_t.prezzo_unitario);
  new.extra_contratto := false;

  if v_t.tariffa_id is not null then
    select coalesce(ta.costo_interno, ta.prezzo_costo) into v_costo
      from public.tariffe_aziendali ta where ta.id = v_t.tariffa_id;
    if v_costo is not null and v_costo > 0 then
      new.costo_interno := round(new.quantita * v_costo, 2);
    end if;
  end if;

  return new;
end;
$fn$;
revoke all on function public.appalto_rendiconto_prepara() from public, anon, authenticated;

drop trigger if exists trg_appalto_rendiconto_prepara on public.appalto_rendiconto_righe;
create trigger trg_appalto_rendiconto_prepara
  before insert or update of order_id, tariffa_id, data, quantita, fase_id, employee_id, company_id
  on public.appalto_rendiconto_righe
  for each row execute function public.appalto_rendiconto_prepara();
