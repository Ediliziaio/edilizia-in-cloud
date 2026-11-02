-- ════════════════════════════════════════════════════════════════════════════
-- Silvio e la commessa, fase 5 (lotto 5.3): il piano di volo. Vedi
-- docs/piano-silvio-commessa-ai.md, sezione 4 e fase 5.
-- ════════════════════════════════════════════════════════════════════════════
-- Ogni mattina la funzione `silvio-piano-volo` (cron, NON acceso da questa migrazione:
-- vedi supabase/migrations-pending/20281106142500_silvio_piano_volo_cron.sql) guarda le commesse delle aziende
-- con «Crea con Silvio» acceso e scrive qui:
--   · `controllo`: 3 giorni lavorativi prima di una fase, persone, mezzi, ordini, DURC e
--     meteo, con le azioni pronte (assegna, prenota, attività);
--   · `sal`: il giorno dopo la fine di una fase, la proposta del SAL (se la commessa ha
--     le rate a SAL).
-- Una riga per fase e per tipo: un secondo giro lo stesso giorno la aggiorna se è ancora
-- aperta, non ne fa un'altra.
--
-- Perché una tabella e non `ai_action_proposals` (sezione 5 del piano): quella la
-- leggono sette schermate e la esegue `silvio-execute-action`, che queste azioni non
-- le conosce: una proposta del piano di volo comparirebbe con un «Conferma» che finisce
-- in un rifiuto. Qui le vede solo la commessa, e le esegue solo `silvio_volo_conferma`.
--
-- Niente parte da solo: `silvio_volo_conferma` esegue le azioni scelte dalla persona, con i
-- suoi permessi, e ricontrolla l'autonomia (un'azione vietata dopo la proposta non si
-- esegue). Le scritture sono le stesse delle pagine: `order_employees`,
-- `salva_piano_mezzo`, `tasks`, `sal` in bozza (l'emissione resta alla persona).
--
-- Idempotente. Richiede 20281106140000 (`_silvio_livello`).
-- NON applicata: si applica col push della fase 5, poi si riallinea la versione.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.silvio_piano_volo (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  fase_id uuid not null references public.order_work_phases(id) on delete cascade,
  tipo text not null,
  -- Il giorno (a Roma) del controllo.
  giorno date not null,
  riassunto text not null,
  -- [{ area, testo }]
  problemi jsonb not null default '[]'::jsonb,
  -- [AzioneVolo] di shared/silvio-commessa/pianoVolo.ts
  azioni jsonb not null default '[]'::jsonb,
  stato text not null default 'aperta',
  esito jsonb,
  risolta_da uuid references public.profiles(id) on delete set null,
  risolta_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint silvio_piano_volo_tipo check (tipo in ('controllo', 'sal')),
  constraint silvio_piano_volo_stato check (stato in ('aperta', 'confermata', 'scartata', 'scaduta')),
  constraint silvio_piano_volo_una unique (fase_id, tipo)
);

create index if not exists silvio_piano_volo_commessa_idx on public.silvio_piano_volo (order_id, stato);
create index if not exists silvio_piano_volo_azienda_idx on public.silvio_piano_volo (company_id, giorno desc);

comment on table public.silvio_piano_volo is
  'Il piano di volo di Silvio sulle commesse: il controllo 3 giorni prima di ogni fase e la proposta del SAL a fine fase, con le azioni pronte da confermare. La scrive la funzione silvio-piano-volo; la conferma silvio_volo_conferma. Vedi docs/piano-silvio-commessa-ai.md, lotto 5.3.';

alter table public.silvio_piano_volo enable row level security;
-- Niente lettura diretta (revisione 1/11, S5): le azioni del SAL portano l'importo, e chi non
-- ha «Importi di vendita» non lo deve vedere. Si legge con `silvio_volo_della_commessa`.
revoke all on public.silvio_piano_volo from public, anon, authenticated;
grant all on public.silvio_piano_volo to service_role;

-- La policy resta come seconda serratura, se un giorno qualcuno ridesse il GRANT.
drop policy if exists silvio_piano_volo_lettura on public.silvio_piano_volo;
create policy silvio_piano_volo_lettura on public.silvio_piano_volo for select to authenticated
  using (
    public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
    and exists (select 1 from public.orders o
                 where o.id = silvio_piano_volo.order_id and o.company_id = silvio_piano_volo.company_id and o.deleted_at is null
                   and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id))
  );

-- Quale azione è, al di là di motivo e testo (D7): la riga la riscrive il cron ogni giorno, con
-- gli indici che cambiano, quindi quello che è già fatto si riconosce da qui e non dall'indice.
create or replace function public._silvio_volo_chiave(p_azione jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_azione->>'tipo'
    when 'assegna_persona' then concat_ws('|', 'assegna_persona', p_azione->>'employee_id', p_azione->>'fase_id')
    when 'prenota_mezzo' then concat_ws('|', 'prenota_mezzo', p_azione->>'mezzo_id', p_azione->>'fase_id')
    when 'attivita' then concat_ws('|', 'attivita', lower(btrim(p_azione->>'titolo')))
    when 'sal_bozza' then concat_ws('|', 'sal_bozza', p_azione->>'numero')
    else md5(p_azione::text)
  end
$$;
revoke all on function public._silvio_volo_chiave(jsonb) from public, anon, authenticated;

-- ── Le proposte aperte di una commessa ───────────────────────────────────────
-- Si vedono dove si vede la commessa: azienda, «Vedi commesse» e la commessa stessa (chi
-- vede solo le assegnate vede solo le loro). Senza «Importi di vendita» l'importo del SAL
-- torna null.
create or replace function public.silvio_volo_della_commessa(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  o public.orders;
  v_importi boolean;
begin
  if v_uid is null then
    raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501';
  end if;
  select * into o from public.orders where id = p_order_id and deleted_at is null;
  if o.id is null
     or o.company_id is distinct from public.get_effective_company_id()
     or public.has_permission_for_company(v_uid, 'can_view_orders', o.company_id) is not true
     or not public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) then
    return '[]'::jsonb;
  end if;
  v_importi := public.has_permission_for_company(v_uid, 'can_view_order_amounts', o.company_id) is true;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'tipo', v.tipo, 'giorno', v.giorno, 'riassunto', v.riassunto, 'problemi', v.problemi,
             'azioni', case when v_importi then v.azioni else coalesce((
               select jsonb_agg(case when a->>'tipo' = 'sal_bozza' then jsonb_set(a, '{importo}', 'null'::jsonb) else a end)
                 from jsonb_array_elements(v.azioni) a), '[]'::jsonb) end,
             'fase', f.name,
             -- D7: quello che una conferma di prima ha già fatto (indici di `azioni`) e quello
             -- che ha saltato, col motivo: la proposta resta aperta per queste.
             'gia_fatte', coalesce((
               select jsonb_agg(e.ord - 1 order by e.ord) from jsonb_array_elements(v.azioni) with ordinality e(a, ord)
                where public._silvio_volo_chiave(e.a) in (select d->>'chiave' from jsonb_array_elements(coalesce(v.esito->'fatte', '[]'::jsonb)) d)), '[]'::jsonb),
             'saltate', coalesce(v.esito->'saltate', '[]'::jsonb)) order by v.giorno, v.created_at)
      from (select * from public.silvio_piano_volo
             where order_id = o.id and company_id = o.company_id and stato = 'aperta'
             order by giorno limit 20) v
      left join public.order_work_phases f on f.id = v.fase_id), '[]'::jsonb);
end
$$;
revoke all on function public.silvio_volo_della_commessa(uuid) from public, anon;
grant execute on function public.silvio_volo_della_commessa(uuid) to authenticated;

-- ── La proposta, letta e bloccata dopo i controlli comuni ─────────────────────
create or replace function public._silvio_volo(p_id uuid)
returns public.silvio_piano_volo
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.silvio_piano_volo;
  o public.orders;
begin
  if auth.uid() is null then
    raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501';
  end if;
  select * into r from public.silvio_piano_volo where id = p_id for update;
  if found then
    select * into o from public.orders where id = r.order_id and company_id = r.company_id and deleted_at is null;
  end if;
  if r.id is null or o.id is null
     or r.company_id is distinct from public.get_effective_company_id()
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', r.company_id) is not true
     or not public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id) then
    raise exception 'Proposta non trovata, o non hai il permesso di modificare questa commessa.' using errcode = '42501';
  end if;
  if r.stato <> 'aperta' then
    raise exception 'Questa proposta è già stata %.', case r.stato when 'confermata' then 'confermata' when 'scartata' then 'scartata' else 'chiusa' end
      using errcode = '22023';
  end if;
  return r;
end
$$;
revoke all on function public._silvio_volo(uuid) from public, anon, authenticated;

-- ── Conferma: esegue le azioni scelte (tutte se p_indici è null) ──────────────
-- Chiude la proposta solo se non resta niente da fare (D7): un'azione saltata o non scelta la
-- lascia aperta, e quello che è già stato fatto non si esegue una seconda volta (un mezzo
-- prenotato due volte, un SAL che risponde «c'è già»).
create or replace function public.silvio_volo_conferma(p_id uuid, p_indici integer[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  r public.silvio_piano_volo := public._silvio_volo(p_id);
  x jsonb;
  i integer := -1;
  v_fatte jsonb := '[]'::jsonb;
  v_saltate jsonb := '[]'::jsonb;
  v_gia jsonb := '[]'::jsonb;
  v_non_scelte jsonb := '[]'::jsonb;
  v_prima jsonb := coalesce(r.esito->'fatte', '[]'::jsonb);
  v_stato text;
  v_chiave text;
  v_id uuid;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_fase public.order_work_phases;
begin
  -- L'autonomia si ricontrolla alla conferma (revisione 1/11, S4): se il titolare ha vietato
  -- questa parte del piano di volo dopo la proposta, non si esegue niente.
  if public._silvio_livello(r.company_id, case r.tipo when 'sal' then 'proposta_sal' else 'controllo_fase' end) = 'vietata' then
    update public.silvio_piano_volo set stato = 'scaduta', updated_at = now() where id = r.id;
    raise exception '%', case r.tipo when 'sal' then 'Nelle impostazioni Silvio non propone più i SAL: la proposta è chiusa.'
                         else 'Nelle impostazioni Silvio non controlla più le fasi: la proposta è chiusa.' end
      using errcode = '42501';
  end if;
  for x in select value from jsonb_array_elements(r.azioni) loop
    i := i + 1;
    v_chiave := public._silvio_volo_chiave(x);
    if exists (select 1 from jsonb_array_elements(v_prima) d where d->>'chiave' = v_chiave) then
      v_gia := v_gia || to_jsonb(i);
      continue;
    end if;
    if p_indici is not null and not (i = any (p_indici)) then
      v_non_scelte := v_non_scelte || to_jsonb(i);
      continue;
    end if;
    begin
      case x->>'tipo'
        when 'assegna_persona' then
          if public._silvio_livello(r.company_id, 'squadra') = 'vietata' then
            raise exception 'nelle impostazioni Silvio non assegna le persone';
          end if;
          select * into v_fase from public.order_work_phases where id = nullif(x->>'fase_id', '')::uuid and order_id = r.order_id;
          if v_fase.id is null then raise exception 'la fase non c''è più'; end if;
          if not exists (select 1 from public.employees e where e.id = nullif(x->>'employee_id', '')::uuid
                          and e.company_id = r.company_id and e.is_active is not false) then
            raise exception 'la persona non è più tra i dipendenti attivi';
          end if;
          -- Le policy di order_employees: solo amministratori (D4).
          if not (public.has_role(auth.uid(), 'super_admin'::public.app_role) or public.e_amministratore_di(r.company_id)) then
            raise exception 'la squadra la cambia solo un amministratore';
          end if;
          if not exists (select 1 from public.order_employees oe where oe.order_id = r.order_id
                          and oe.employee_id = (x->>'employee_id')::uuid and oe.phase_id = v_fase.id) then
            insert into public.order_employees (order_id, employee_id, phase_id, hours_worked, hourly_rate, total_cost, notes)
            values (r.order_id, (x->>'employee_id')::uuid, v_fase.id, 0, 0, 0, 'Assegnato dal piano di volo di Silvio');
          end if;

        when 'prenota_mezzo' then
          if public._silvio_livello(r.company_id, 'mezzi') = 'vietata' then
            raise exception 'nelle impostazioni Silvio non prenota i mezzi';
          end if;
          -- La strada delle pagine: controlla permessi sui mezzi e prenotazioni doppie.
          v_id := public.salva_piano_mezzo(jsonb_build_object(
            'order_id', r.order_id, 'mezzo_id', x->>'mezzo_id', 'fase_ids', jsonb_build_array(x->>'fase_id'),
            'dal', x->>'dal', 'al', nullif(x->>'al', ''), 'quantita', 1, 'note', 'Prenotato dal piano di volo di Silvio'));

        when 'attivita' then
          if public._silvio_livello(r.company_id, 'promemoria') = 'vietata' then
            raise exception 'nelle impostazioni Silvio non prepara promemoria';
          end if;
          if not exists (select 1 from public.tasks t where t.order_id = r.order_id and t.title = left(btrim(x->>'titolo'), 300)
                          and t.status <> 'completata') then
            insert into public.tasks (company_id, title, notes, status, priority, due_date, order_id, created_by)
            values (r.company_id, left(btrim(x->>'titolo'), 300), left(x->>'testo', 6000), 'da_fare', 'alta',
                    coalesce(nullif(x->>'scadenza', '')::date, v_oggi), r.order_id, auth.uid());
          end if;

        when 'sal_bozza' then
          if public._silvio_livello(r.company_id, 'proposta_sal') = 'vietata' then
            raise exception 'nelle impostazioni Silvio non propone i SAL';
          end if;
          -- Chi non vede gli importi non li conferma (revisione 1/11, S5).
          if public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', r.company_id) is not true then
            raise exception 'serve il permesso «Importi di vendita» per preparare il SAL';
          end if;
          if exists (select 1 from public.sal s where s.order_id = r.order_id and s.status <> 'annullato'
                      and s.numero_progressivo = nullif(x->>'numero', '')::integer) then
            raise exception 'il SAL n. % c''è già', x->>'numero';
          end if;
          insert into public.sal (company_id, order_id, data_sal, numero_progressivo, pct_avanzamento_totale, importo, importo_lordo,
                                  status, trigger_type, generation_method, ai_narrative)
          values (r.company_id, r.order_id, v_oggi, nullif(x->>'numero', '')::integer,
                  nullif(x->>'pct_avanzamento_totale', '')::numeric, round(nullif(x->>'importo', '')::numeric, 2),
                  round(nullif(x->>'importo', '')::numeric, 2), 'bozza', 'milestone_phase_end', 'auto_ai',
                  left(coalesce(x->>'motivo', '') || ' Bozza preparata da Silvio: da controllare, approvare ed emettere.', 2000));

        else
          raise exception 'azione sconosciuta';
      end case;
      v_fatte := v_fatte || jsonb_build_array(jsonb_build_object('indice', i, 'tipo', x->>'tipo', 'chiave', v_chiave));
    exception when others then
      -- Un'azione che non va (permesso, mezzo preso nel frattempo) non ferma le altre.
      v_saltate := v_saltate || jsonb_build_array(jsonb_build_object('indice', i, 'tipo', x->>'tipo', 'motivo', sqlerrm));
    end;
  end loop;

  v_stato := case when jsonb_array_length(v_saltate) + jsonb_array_length(v_non_scelte) = 0 then 'confermata' else 'aperta' end;
  update public.silvio_piano_volo
     set stato = v_stato, updated_at = now(),
         risolta_da = case when v_stato = 'confermata' then auth.uid() end,
         risolta_il = case when v_stato = 'confermata' then now() end,
         esito = jsonb_build_object('fatte', v_prima || v_fatte, 'saltate', v_saltate)
   where id = r.id;
  return jsonb_build_object('fatte', v_fatte, 'saltate', v_saltate, 'gia_fatte', v_gia, 'non_scelte', v_non_scelte,
                            'stato', v_stato);
end
$$;
revoke all on function public.silvio_volo_conferma(uuid, integer[]) from public, anon;
grant execute on function public.silvio_volo_conferma(uuid, integer[]) to authenticated;

create or replace function public.silvio_volo_scarta(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.silvio_piano_volo := public._silvio_volo(p_id);
begin
  update public.silvio_piano_volo
     set stato = 'scartata', risolta_da = auth.uid(), risolta_il = now(), updated_at = now()
   where id = r.id;
end
$$;
revoke all on function public.silvio_volo_scarta(uuid) from public, anon;
grant execute on function public.silvio_volo_scarta(uuid) to authenticated;

-- ── Scrittura dal cron: una riga per fase e tipo; si aggiorna solo se è ancora aperta ──
-- Restituisce { id, nuova, cambiata } (revisione 1/11, S6): la campanella suona solo per una
-- proposta nuova o con azioni diverse, non a ogni giro su una riga che non è cambiata.
drop function if exists public.silvio_volo_registra(uuid, uuid, uuid, text, date, text, jsonb, jsonb);
create or replace function public.silvio_volo_registra(
  p_company uuid, p_order uuid, p_fase uuid, p_tipo text, p_giorno date, p_riassunto text, p_problemi jsonb, p_azioni jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prima public.silvio_piano_volo;
  v_id uuid;
  v_azioni jsonb;
begin
  if not exists (select 1 from public.order_work_phases f join public.orders o on o.id = f.order_id
                  where f.id = p_fase and o.id = p_order and o.company_id = p_company) then
    raise exception 'fase % non della commessa %', p_fase, p_order;
  end if;
  select * into v_prima from public.silvio_piano_volo where fase_id = p_fase and tipo = p_tipo for update;
  -- Quello che una conferma ha già fatto non si ripropone il giorno dopo (D7).
  select coalesce(jsonb_agg(e.a order by e.ord), '[]'::jsonb) into v_azioni
    from jsonb_array_elements(coalesce(p_azioni, '[]'::jsonb)) with ordinality e(a, ord)
   where public._silvio_volo_chiave(e.a) not in (
           select d->>'chiave' from jsonb_array_elements(coalesce(v_prima.esito->'fatte', '[]'::jsonb)) d);
  insert into public.silvio_piano_volo (company_id, order_id, fase_id, tipo, giorno, riassunto, problemi, azioni)
  values (p_company, p_order, p_fase, p_tipo, p_giorno, left(p_riassunto, 500), coalesce(p_problemi, '[]'), v_azioni)
  on conflict (fase_id, tipo) do update
    set giorno = excluded.giorno, riassunto = excluded.riassunto, problemi = excluded.problemi,
        azioni = excluded.azioni, updated_at = now()
    where silvio_piano_volo.stato = 'aperta'
  returning id into v_id;
  return jsonb_build_object(
    'id', v_id,
    'nuova', v_id is not null and v_prima.id is null,
    'cambiata', v_id is not null and v_prima.id is not null
                and (v_prima.azioni is distinct from v_azioni
                     or v_prima.problemi is distinct from coalesce(p_problemi, '[]'::jsonb)));
end
$$;
revoke all on function public.silvio_volo_registra(uuid, uuid, uuid, text, date, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.silvio_volo_registra(uuid, uuid, uuid, text, date, text, jsonb, jsonb) to service_role;

-- Le proposte di fasi già partite si chiudono da sole: non servono più.
create or replace function public.silvio_volo_scadute(p_oggi date)
returns integer
language sql
security definer
set search_path = ''
as $$
  with chiuse as (
    update public.silvio_piano_volo v set stato = 'scaduta', updated_at = now()
      from public.order_work_phases f
     where v.fase_id = f.id and v.stato = 'aperta'
       and ((v.tipo = 'controllo' and f.start_date < p_oggi) or (v.tipo = 'sal' and v.giorno < p_oggi - 14))
    returning 1
  )
  select count(*)::integer from chiuse
$$;
revoke all on function public.silvio_volo_scadute(date) from public, anon, authenticated;
grant execute on function public.silvio_volo_scadute(date) to service_role;
