-- ============================================================================
-- Le ore di una persona si contano UNA volta sola
-- ============================================================================
-- Provando il flusso sulla Demo: Marco Verdi lavora 7,5 ore; il capocantiere le
-- mette nelle presenze del suo rapportino di squadra, Marco manda anche il suo.
-- Approvati tutti e due, la commessa prendeva 15 ore e 360 € per una giornata
-- da 7,5 ore e 180 €. L'app avvisava, il database no: l'avviso si confermava.
-- Il trigger che calcola il costo vale per OGNI strada di approvazione (ufficio,
-- Silvio, WhatsApp): è lì che il doppio conteggio va fermato.
--
-- Alla approvazione, per ogni persona con ore:
--   1. se per lo stesso cantiere e giorno ha già ore registrate da un altro
--      rapportino approvato, le ore totali non possono superare quelle TIMBRATE
--      su quel cantiere (tolleranza 30 minuti); se non ha timbrato, una persona
--      e un cantiere e un giorno hanno ore da UN solo rapportino;
--   2. su tutti i cantieri, in un giorno, non si superano le 24 ore.
-- Se non torna l'approvazione NON avviene, con una frase che dice perché e come
-- uscirne (rifiutare o correggere uno dei due). Nessun dato viene toccato.
--
-- Chi ha ore su fasi diverse nello stesso giorno resta possibile: basta che le
-- ore totali tornino con le timbrature. Chi non timbra (ditte, chi non ha
-- l'app) ha le ore dichiarate dal capo, una volta.
--
-- Idempotente. Cambia solo il trigger: nessuna riga esistente viene modificata.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 7,5 → «7,5»; 8 → «8» (per i messaggi)
create or replace function public.campo_fmt_ore(p numeric)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select regexp_replace(replace(to_char(coalesce(p, 0), 'FM990.00'), '.', ','), ',?0+$', '')
$$;

-- Ore già registrate per UNA persona su un cantiere in un giorno (altri rapportini approvati)
create or replace function public.campo_ore_gia_registrate_persona(p_order uuid, p_employee uuid, p_giorno date, p_escludi uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
           'ore', coalesce(sum(coalesce((pz->>'ore')::numeric, 0)), 0),
           'da', string_agg(distinct nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), ', '))
    from public.campo_rapportini cr
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(cr.presenze_registrate) = 'array' then cr.presenze_registrate else '[]'::jsonb end) pz
    left join public.profiles p on p.id = cr.user_id
   where cr.order_id = p_order
     and cr.data_lavoro = p_giorno
     and cr.id <> p_escludi
     and cr.stato = 'approvato'
     and cr.costo_registrato_at is not null
     and pz->>'employee_id' = p_employee::text
$$;
revoke all on function public.campo_ore_gia_registrate_persona(uuid, uuid, date, uuid) from public, anon, authenticated;

-- Ore registrate per una persona in un giorno, su TUTTI i cantieri
create or replace function public.campo_ore_registrate_giornata(p_employee uuid, p_giorno date, p_escludi uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(sum(coalesce((pz->>'ore')::numeric, 0)), 0)
    from public.campo_rapportini cr
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(cr.presenze_registrate) = 'array' then cr.presenze_registrate else '[]'::jsonb end) pz
   where cr.data_lavoro = p_giorno
     and cr.id <> p_escludi
     and cr.stato = 'approvato'
     and cr.costo_registrato_at is not null
     and pz->>'employee_id' = p_employee::text
$$;
revoke all on function public.campo_ore_registrate_giornata(uuid, date, uuid) from public, anon, authenticated;

-- Il controllo: ferma l'approvazione, con una frase chiara, se le ore si contano due volte
create or replace function public.campo_controlla_ore_persona(
  p_company uuid, p_order uuid, p_employee uuid, p_giorno date, p_ore numeric, p_rapportino uuid
)
returns void
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_nome text;
  v_user uuid;
  v_gia jsonb;
  v_gia_ore numeric;
  v_timbrate numeric;
  v_giornata numeric;
  v_profilo uuid;
begin
  select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), user_id
    into v_nome, v_user
    from public.employees where id = p_employee and company_id = p_company;
  v_nome := coalesce(nullif(v_nome, ''), 'La persona');

  v_gia := public.campo_ore_gia_registrate_persona(p_order, p_employee, p_giorno, p_rapportino);
  v_gia_ore := coalesce((v_gia->>'ore')::numeric, 0);

  if v_gia_ore > 0 then
    v_profilo := public.hr_profilo_da_user(v_user, p_company);
    v_timbrate := (public.campo_ore_timbrate_cantiere(v_profilo, p_order, p_giorno)->>'ore')::numeric;
    if v_timbrate is null then
      raise exception using errcode = 'P0001', message =
        v_nome || ' ha già ' || public.campo_fmt_ore(v_gia_ore)
        || ' ore su questo cantiere in questa giornata'
        || coalesce(' (rapportino di ' || (v_gia->>'da') || ')', '')
        || '. Le ore di una persona si contano una volta sola: rifiuta uno dei due rapportini, oppure correggilo prima di approvare.';
    elsif v_gia_ore + p_ore > v_timbrate + 0.5 then
      raise exception using errcode = 'P0001', message =
        v_nome || ' ha timbrato ' || public.campo_fmt_ore(v_timbrate)
        || ' ore su questo cantiere in questa giornata, e ne ha già ' || public.campo_fmt_ore(v_gia_ore)
        || ' registrate: con questo rapportino sarebbero '
        || public.campo_fmt_ore(v_gia_ore + p_ore)
        || '. Le ore non possono superare quelle timbrate: rifiuta o correggi uno dei due rapportini.';
    end if;
  end if;

  v_giornata := public.campo_ore_registrate_giornata(p_employee, p_giorno, p_rapportino);
  if v_giornata + p_ore > 24 then
    raise exception using errcode = 'P0001', message =
      v_nome || ' avrebbe più di 24 ore registrate in questa giornata, sommando tutti i cantieri. Controlla i rapportini della giornata.';
  end if;
end;
$$;
revoke all on function public.campo_controlla_ore_persona(uuid, uuid, uuid, date, numeric, uuid) from public, anon, authenticated;

-- Il trigger di costo: identico a prima, con il controllo prima di registrare ogni persona
create or replace function public.fn_rapportino_costo_manodopera()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_fase uuid;
  v_pres jsonb;
  v_item jsonb;
  v_emp record;
  v_tariffa numeric;
  v_ore numeric;
  v_costo numeric;
  v_totale numeric := 0;
  v_snapshot jsonb := '[]'::jsonb;
  v_row_id uuid;
begin
  -- ── APPROVAZIONE ─────────────────────────────────────────────────────────
  if new.stato = 'approvato' and old.stato is distinct from 'approvato'
     and new.costo_registrato_at is null then

    -- Fase: attribuzione solo se il rapportino ne dichiara UNA
    if jsonb_typeof(new.fasi_lavorate) = 'array'
       and jsonb_array_length(new.fasi_lavorate) = 1 then
      v_fase := (new.fasi_lavorate->0->>'phase_id')::uuid;
    end if;

    -- Le presenze del giorno; se assenti, fallback sull'autore (rapportino
    -- personale del singolo operaio: le sue ore, la sua scheda).
    if jsonb_typeof(new.presenze) = 'array' and jsonb_array_length(new.presenze) > 0 then
      v_pres := new.presenze;
    else
      select jsonb_build_array(jsonb_build_object(
               'employee_id', e.id,
               'ore', coalesce(new.ore_lavorate, 0) + coalesce(new.ore_straordinario, 0)))
        into v_pres
        from employees e
       where e.company_id = new.company_id and e.user_id = new.user_id
       limit 1;
      v_pres := coalesce(v_pres, '[]'::jsonb);
    end if;

    for v_item in select * from jsonb_array_elements(v_pres) loop
      -- Subappaltatore presente: registrato, ma niente costo orario
      if v_item->>'employee_id' is null then continue; end if;

      select id into v_emp
        from employees
       where id = (v_item->>'employee_id')::uuid and company_id = new.company_id;
      if v_emp.id is null then continue; end if;

      v_ore := coalesce((v_item->>'ore')::numeric, 0);
      if v_ore <= 0 then continue; end if;

      -- Le ore di una persona, su un cantiere, in un giorno, si contano una volta
      -- sola (e mai oltre le 24 ore al giorno): se non tornano, l'approvazione non
      -- avviene e il messaggio dice cosa fare. Vale per ogni strada di approvazione.
      perform public.campo_controlla_ore_persona(new.company_id, new.order_id, v_emp.id, new.data_lavoro, v_ore, new.id);

      -- Senza costo orario in scheda (dipendente appena creato) la riga di
      -- order_employees nasceva con hourly_rate NULL e l'approvazione saltava
      -- con «violates not-null constraint». Le ore si registrano comunque, a 0 €.
      v_tariffa := coalesce(public.costo_orario_dipendente(v_emp.id), 0);
      v_costo := round(v_ore * v_tariffa, 2);

      -- Niente `if v_costo > 0`: le ore lavorate vanno registrate comunque.
      select id into v_row_id
        from order_employees
       where order_id = new.order_id and employee_id = v_emp.id
         and phase_id is not distinct from v_fase
       limit 1;
      if v_row_id is not null then
        -- La tariffa si ricalcola come media ponderata: sulla riga esistente
        -- restava quella del primo rapportino, quindi hourly_rate × ore non
        -- tornava più col total_cost e chi leggeva la commessa non capiva.
        update order_employees
           set hours_worked = hours_worked + v_ore,
               total_cost   = total_cost + v_costo,
               hourly_rate  = case when (hours_worked + v_ore) > 0
                                   then round((total_cost + v_costo) / (hours_worked + v_ore), 2)
                                   else v_tariffa end
         where id = v_row_id;
      else
        insert into order_employees (order_id, employee_id, phase_id, hourly_rate, hours_worked, total_cost)
        values (new.order_id, v_emp.id, v_fase, v_tariffa, v_ore, v_costo);
      end if;

      v_totale := v_totale + v_costo;
      v_snapshot := v_snapshot || jsonb_build_object(
        'employee_id', v_emp.id, 'ore', v_ore, 'costo', v_costo,
        'phase_id', v_fase);
    end loop;

    new.costo_manodopera := v_totale;
    new.presenze_registrate := v_snapshot;
    new.costo_registrato_at := now();
    return new;
  end if;

  -- ── REVOCA: storno esatto dallo snapshot ─────────────────────────────────
  if old.stato = 'approvato' and new.stato is distinct from 'approvato'
     and old.costo_registrato_at is not null then

    if jsonb_typeof(old.presenze_registrate) = 'array' then
      for v_item in select * from jsonb_array_elements(old.presenze_registrate) loop
        update order_employees
           set hours_worked = greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)),
               total_cost   = greatest(0, total_cost - coalesce((v_item->>'costo')::numeric, 0)),
               hourly_rate = case
                 when greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)) > 0
                 then round(
                   greatest(0, total_cost - coalesce((v_item->>'costo')::numeric, 0)) /
                   greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)), 2)
                 else 0
               end
         where id = (
           select id from order_employees
            where order_id = new.order_id
              and employee_id = (v_item->>'employee_id')::uuid
              and phase_id is not distinct from nullif(v_item->>'phase_id','')::uuid
            limit 1
         );
      end loop;
    end if;

    new.costo_manodopera := null;
    new.presenze_registrate := null;
    new.costo_registrato_at := null;
    return new;
  end if;

  return new;
end $function$;
