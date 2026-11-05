-- «Mi avvisi quando un acquisto costa più del solito».
--
-- Il punto giusto è dove si ricalcola il costo medio (20281129100000): lì, al
-- carico, il prezzo appena pagato e il valore della giacenza sono già entrambi
-- in mano. Nessun giro di lavoro in più, nessuna scansione periodica.
--
-- ─── Cosa si confronta, e perché ──────────────────────────────────────────────
-- Il prezzo pagato ADESSO contro il COSTO MEDIO DELLA GIACENZA PRIMA del carico.
-- Non il medio nuovo contro il medio vecchio: su una giacenza grande un acquisto
-- a +40% muove il medio di mezzo punto, e un rincaro vero non si vedrebbe mai.
-- Non l'ultimo prezzo pagato: quello è esso stesso un numero singolo, quindi un
-- acquisto d'urgenza da un fornitore caro diventerebbe il nuovo riferimento e il
-- rincaro vero dopo di lui sembrerebbe un ribasso. Il medio è la media di quanto
-- è stato speso davvero: è il riferimento stabile, e il prezzo di oggi contro di
-- lui è esattamente «questo acquisto costa più del solito».
--
-- ─── Quando scatta ───────────────────────────────────────────────────────────
-- Due soglie per azienda, su `company_governance_settings` — la tabella dove
-- stanno già le altre soglie d'avviso (marginalità, scostamento SAL, doppia
-- firma), con la stessa forma `_enabled` + valore:
--   • `rincaro_soglia_perc` (15%): quanto sopra il medio conta come rincaro.
--   • `rincaro_minimo_euro` (50 €): la SPESA IN PIÙ di quel carico sotto la
--     quale si tace. Non il prezzo unitario: un articolo da 2 € che passa a
--     2,40 € è +20%, ma su 10 pezzi sono 4 € e non interessa a nessuno; su 5.000
--     pezzi sono 2.000 € e interessa molto. L'euro che conta è quello speso
--     davvero in più.
-- Serve anche un medio di partenza: un articolo nuovo (medio 0) non ha un «solito»
-- con cui confrontarsi e resta zitto.
--
-- ─── Come avvisa ─────────────────────────────────────────────────────────────
-- NON un avviso per ogni carico: diventerebbe rumore e verrebbe ignorato. I
-- rincari si annotano uno per uno in `warehouse_rincari` (il registro, che serve
-- anche a vedere l'andamento), e l'avviso è UN SOLO riepilogo al mese per
-- azienda: «Questo mese 7 articoli sono rincarati, 1.240 € di spesa in più».
-- Passa da `silvio_create_alert`, la strada che il progetto usa già per la
-- campanella e per il brief del mattino, con `dedup_key` del mese: l'avviso
-- esistente si aggiorna invece di moltiplicarsi, e il cron `silvio_detect_30min`
-- lo rinfresca già ogni mezz'ora senza bisogno di un job nuovo.

-- ───────────────────────────────────────────────────────────────────────────────
-- 1. Le soglie, dove stanno già le altre
-- ───────────────────────────────────────────────────────────────────────────────
alter table public.company_governance_settings
  add column if not exists rincaro_acquisti_enabled boolean not null default true,
  add column if not exists rincaro_soglia_perc numeric not null default 15,
  add column if not exists rincaro_minimo_euro numeric not null default 50;

comment on column public.company_governance_settings.rincaro_acquisti_enabled is
  'Avvisa quando un acquisto costa più del costo medio della giacenza.';
comment on column public.company_governance_settings.rincaro_soglia_perc is
  'Di quanto il prezzo pagato deve superare il costo medio della giacenza perché sia un rincaro (%).';
comment on column public.company_governance_settings.rincaro_minimo_euro is
  'Spesa in più di quel carico sotto la quale non si avvisa: quantità × (prezzo pagato − medio).';

-- ───────────────────────────────────────────────────────────────────────────────
-- 2. Il medio di allora, congelato sul movimento
-- ───────────────────────────────────────────────────────────────────────────────
-- Il confronto ha bisogno del medio PRIMA del carico, e dopo l'aggiornamento
-- della scheda quel numero non è più leggibile da nessuna parte. Si congela sul
-- movimento, come già si fa col prezzo: così è a disposizione di chi guarda
-- l'andamento del prezzo e non dipende dall'ordine in cui scattano i trigger.
--
-- (La prima stesura lo passava dal BEFORE all'AFTER con una variabile di
-- sessione. Sbagliato: in un INSERT a più righe i trigger AFTER ROW scattano
-- tutti a statement finito, quindi avrebbero letto tutti il medio dell'ULTIMA
-- riga. Oggi nessun percorso inserisce due carichi valorizzati in un solo
-- statement, ma è il genere di trappola che si paga mesi dopo, su dei prezzi.)
alter table public.warehouse_movements
  add column if not exists medio_prima numeric;

comment on column public.warehouse_movements.medio_prima is
  'Costo medio della scheda appena prima di questo carico, congelato qui: serve al confronto sui rincari e all''andamento del prezzo. Null sugli scarichi e sui carichi che non valorizzano.';

-- ───────────────────────────────────────────────────────────────────────────────
-- 3. Il registro dei rincari
-- ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.warehouse_rincari (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stock_item_id uuid not null references public.warehouse_stock(id) on delete cascade,
  -- Un movimento genera un rincaro solo: la chiave unica è la rete contro il doppione.
  movement_id uuid not null unique references public.warehouse_movements(id) on delete cascade,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  quantita numeric not null,
  prezzo_pagato numeric not null,
  medio_prima numeric not null,
  scostamento_perc numeric not null,
  spesa_in_piu numeric not null,
  rilevato_il date not null default current_date,
  created_at timestamptz not null default now()
);

comment on table public.warehouse_rincari is
  'Un acquisto che è costato più del costo medio della giacenza, oltre le soglie dell''azienda. Lo scrive il trigger del costo medio al carico; serve all''avviso mensile e all''andamento del prezzo sulla scheda articolo.';

create index if not exists warehouse_rincari_azienda_data_idx
  on public.warehouse_rincari (company_id, rilevato_il desc);
create index if not exists warehouse_rincari_articolo_idx
  on public.warehouse_rincari (stock_item_id, rilevato_il desc);

alter table public.warehouse_rincari enable row level security;

-- Sono prezzi d'acquisto: li vede chi può vedere i costi. Nessuno li scrive a
-- mano — li scrive il trigger, che è SECURITY DEFINER e non passa dalle policy.
drop policy if exists warehouse_rincari_lettura on public.warehouse_rincari;
create policy warehouse_rincari_lettura on public.warehouse_rincari
  for select to authenticated
  using (
    public.user_can_access_company(company_id)
    and not public.utente_e_cliente_esterno()
    and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_costs', company_id), false)
  );

drop policy if exists warehouse_rincari_blocco_utente_bloccato on public.warehouse_rincari;
create policy warehouse_rincari_blocco_utente_bloccato on public.warehouse_rincari
  for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

revoke all on table public.warehouse_rincari from public, anon;
grant select on table public.warehouse_rincari to authenticated;
grant all on table public.warehouse_rincari to service_role;

-- ───────────────────────────────────────────────────────────────────────────────
-- 4. La regola, da sola e verificabile
-- ───────────────────────────────────────────────────────────────────────────────
create or replace function public.magazzino_e_rincaro(
  p_medio_prima numeric,
  p_prezzo numeric,
  p_quantita numeric,
  p_soglia_perc numeric,
  p_minimo_euro numeric
) returns boolean
language sql immutable
set search_path = public
as $$
  select
    -- Serve un «solito» con cui confrontarsi: un articolo nuovo non ne ha.
    coalesce(p_medio_prima, 0) > 0
    and coalesce(p_prezzo, 0) > 0
    and coalesce(p_quantita, 0) > 0
    -- Oltre la soglia percentuale sopra il medio.
    and p_prezzo > p_medio_prima * (1 + greatest(coalesce(p_soglia_perc, 0), 0) / 100)
    -- E con una spesa in più che vale la pena nominare.
    and p_quantita * (p_prezzo - p_medio_prima) >= greatest(coalesce(p_minimo_euro, 0), 0)
$$;

comment on function public.magazzino_e_rincaro(numeric, numeric, numeric, numeric, numeric) is
  'Vero quando un carico è un rincaro: prezzo pagato oltre la soglia % sopra il costo medio della giacenza E spesa in più oltre il minimo in euro. Falso senza un medio di partenza.';

revoke all on function public.magazzino_e_rincaro(numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.magazzino_e_rincaro(numeric, numeric, numeric, numeric, numeric) to authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────────
-- 5. Il trigger del costo medio annota anche il rincaro
-- ───────────────────────────────────────────────────────────────────────────────
-- Stesso corpo di 20281129100000, più il congelamento del medio di prima sul
-- movimento. Il registro si scrive DOPO il movimento (ha una chiave esterna su
-- `movement_id`), quindi l'annotazione sta in un trigger AFTER a sé, che legge
-- `new.medio_prima` dalla riga appena inserita: niente stato condiviso fra i
-- due trigger, e quindi nessuna dipendenza dall'ordine in cui scattano.
create or replace function public.magazzino_valorizza_medio()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_giacenza numeric;
  v_medio numeric;
  v_nuovo numeric;
begin
  if new.movement_type <> 'carico'
     or not coalesce(new.valorizza_medio, true)
     or coalesce(new.quantity, 0) <= 0
     or coalesce(new.unit_cost, 0) <= 0
     or new.stock_item_id is null then
    return new;
  end if;

  select ws.unit_cost into v_medio
    from public.warehouse_stock ws
   where ws.id = new.stock_item_id
     for update;
  if not found then
    return new;
  end if;

  select coalesce(sum(case when m.movement_type = 'carico' then m.quantity else -m.quantity end), 0)
    into v_giacenza
    from public.warehouse_movements m
   where m.stock_item_id = new.stock_item_id;

  -- Congelato sulla riga: dopo l'aggiornamento della scheda il medio di prima
  -- non è più leggibile da nessuna parte, e l'AFTER ne ha bisogno.
  new.medio_prima := v_medio;

  v_nuovo := public.magazzino_medio_ponderato(v_giacenza, v_medio, new.quantity, new.unit_cost);

  if v_nuovo is not null and abs(v_nuovo - coalesce(v_medio, 0)) > 0.00005 then
    update public.warehouse_stock
       set unit_cost = v_nuovo, updated_at = now()
     where id = new.stock_item_id;
  end if;
  return new;
end;
$$;

create or replace function public.magazzino_annota_rincaro()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_medio_prima numeric;
  v_attivo boolean;
  v_soglia numeric;
  v_minimo numeric;
  ws record;
begin
  if new.movement_type <> 'carico'
     or not coalesce(new.valorizza_medio, true)
     or coalesce(new.quantity, 0) <= 0
     or coalesce(new.unit_cost, 0) <= 0
     or new.stock_item_id is null then
    return null;
  end if;

  v_medio_prima := new.medio_prima;
  if coalesce(v_medio_prima, 0) <= 0 then
    return null;
  end if;

  select coalesce(g.rincaro_acquisti_enabled, true),
         coalesce(g.rincaro_soglia_perc, 15),
         coalesce(g.rincaro_minimo_euro, 50)
    into v_attivo, v_soglia, v_minimo
    from public.company_governance_settings g
   where g.company_id = new.company_id;
  if not found then
    -- Nessuna riga di impostazioni: valgono i valori di partenza.
    v_attivo := true; v_soglia := 15; v_minimo := 50;
  end if;
  if not v_attivo then
    return null;
  end if;

  if not public.magazzino_e_rincaro(v_medio_prima, new.unit_cost, new.quantity, v_soglia, v_minimo) then
    return null;
  end if;

  select s.warehouse_id, s.supplier_id into ws
    from public.warehouse_stock s where s.id = new.stock_item_id;

  insert into public.warehouse_rincari (
    company_id, stock_item_id, movement_id, warehouse_id, supplier_id,
    quantita, prezzo_pagato, medio_prima, scostamento_perc, spesa_in_piu
  ) values (
    new.company_id, new.stock_item_id, new.id,
    coalesce(new.warehouse_id, ws.warehouse_id), ws.supplier_id,
    new.quantity, new.unit_cost, round(v_medio_prima, 4),
    round((new.unit_cost - v_medio_prima) / v_medio_prima * 100, 2),
    round(new.quantity * (new.unit_cost - v_medio_prima), 2)
  )
  on conflict (movement_id) do nothing;

  return null;
end;
$$;

comment on function public.magazzino_annota_rincaro() is
  'Annota in warehouse_rincari un carico pagato più del costo medio della giacenza, oltre le soglie dell''azienda. AFTER INSERT perché il registro ha una chiave esterna sul movimento; il medio di prima lo legge da warehouse_movements.medio_prima, congelato dal trigger BEFORE.';

drop trigger if exists trg_warehouse_movimento_annota_rincaro on public.warehouse_movements;
create trigger trg_warehouse_movimento_annota_rincaro
  after insert on public.warehouse_movements
  for each row execute function public.magazzino_annota_rincaro();

-- ───────────────────────────────────────────────────────────────────────────────
-- 6. L'avviso: un riepilogo al mese, non uno per carico
-- ───────────────────────────────────────────────────────────────────────────────
create or replace function public.magazzino_rincari_avvisa(p_company_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_mese date := date_trunc('month', current_date)::date;
  v_n int;
  v_articoli int;
  v_spesa numeric;
  v_elenco text;
  v_attivo boolean;
begin
  select coalesce(g.rincaro_acquisti_enabled, true) into v_attivo
    from public.company_governance_settings g where g.company_id = p_company_id;
  if not found then v_attivo := true; end if;

  -- Gli avvisi dei mesi passati si chiudono: il mese è finito, non c'è più
  -- niente da fare su quelli.
  update public.silvio_alerts set status = 'resolved', resolved_at = now()
   where company_id = p_company_id and status = 'open' and alert_type = 'rincaro_acquisti'
     and dedup_key <> format('rincari_acquisti:%s', to_char(v_mese, 'YYYY-MM'));

  if not v_attivo then
    update public.silvio_alerts set status = 'resolved', resolved_at = now()
     where company_id = p_company_id and status = 'open' and alert_type = 'rincaro_acquisti';
    return jsonb_build_object('attivo', false);
  end if;

  select count(*), count(distinct r.stock_item_id), coalesce(sum(r.spesa_in_piu), 0)
    into v_n, v_articoli, v_spesa
    from public.warehouse_rincari r
   where r.company_id = p_company_id and r.rilevato_il >= v_mese;

  if coalesce(v_n, 0) = 0 then
    return jsonb_build_object('attivo', true, 'rincari', 0);
  end if;

  -- I tre che pesano di più, per nome: il titolare vuole sapere su cosa.
  select string_agg(x.riga, ', ' order by x.spesa desc)
    into v_elenco
    from (
      select s.name || ' +' || round(max(r.scostamento_perc))::text || '%' as riga,
             sum(r.spesa_in_piu) as spesa
        from public.warehouse_rincari r
        join public.warehouse_stock s on s.id = r.stock_item_id
       where r.company_id = p_company_id and r.rilevato_il >= v_mese
       group by s.name
       order by sum(r.spesa_in_piu) desc
       limit 3
    ) x;

  perform public.silvio_create_alert(
    p_company_id, 'rincaro_acquisti',
    case when v_spesa >= 1000 then 'warning' else 'info' end,
    format('Prezzi d''acquisto in salita: %s %s questo mese',
           v_articoli, case when v_articoli = 1 then 'articolo' else 'articoli' end),
    format('%s %s %s costato più del solito: € %s di spesa in più questo mese. %s',
           v_n,
           case when v_n = 1 then 'acquisto' else 'acquisti' end,
           case when v_n = 1 then 'è' else 'sono' end,
           translate(to_char(v_spesa, 'FM999,999,999,990.00'), ',.', '.,'),
           coalesce(v_elenco, '')),
    format('rincari_acquisti:%s', to_char(v_mese, 'YYYY-MM')),
    null,
    'Guarda il magazzino',
    'open_warehouse',
    jsonb_build_object('mese', to_char(v_mese, 'YYYY-MM')),
    'warehouse_rincari', null,
    jsonb_build_object('rincari', v_n, 'articoli', v_articoli, 'spesa_in_piu', round(v_spesa, 2)),
    null
  );

  return jsonb_build_object('attivo', true, 'rincari', v_n, 'articoli', v_articoli,
                            'spesa_in_piu', round(v_spesa, 2));
end;
$$;

comment on function public.magazzino_rincari_avvisa(uuid) is
  'Un solo avviso al mese per azienda sui rincari d''acquisto, con dedup_key del mese: l''avviso si aggiorna invece di moltiplicarsi. Chiude quelli dei mesi passati.';

revoke all on function public.magazzino_rincari_avvisa(uuid) from public, anon;
grant execute on function public.magazzino_rincari_avvisa(uuid) to service_role;

-- Il giro dei rilevatori lo fa già `silvio_detect_alerts_all_companies`, che il
-- cron `silvio_detect_30min` chiama ogni mezz'ora: qui si aggiunge una riga,
-- accanto a `silvio_detect_cashflow_alerts` che è già un rilevatore a sé. Niente
-- job nuovo, e il corpo di `silvio_detect_alerts` — 7 kB che altre sessioni
-- toccano — non si riscrive.
create or replace function public.silvio_detect_alerts_all_companies()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_total int := 0;
  v_failed int := 0;
  v_cashflow_alerts int := 0;
  v_claims_prima text := current_setting('request.jwt.claims', true);
begin
  -- Dentro pg_cron non c'è nessun utente: senza questo, assert_company_access
  -- rifiutava ogni azienda e dal 9 agosto non è più nato un avviso. La
  -- funzione la esegue solo il cron (nessun EXECUTE a anon/authenticated).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  for v_company_id in
    select id from public.companies
    where status in ('active', 'trial')
  loop
    begin
      perform public.silvio_detect_alerts(v_company_id);
      v_cashflow_alerts := v_cashflow_alerts + coalesce(public.silvio_detect_cashflow_alerts(v_company_id), 0);
      -- Rincari d'acquisto: un riepilogo al mese per azienda.
      perform public.magazzino_rincari_avvisa(v_company_id);
      v_total := v_total + 1;
    exception when others then
      v_failed := v_failed + 1;
      raise warning '[silvio detect cron] company % failed: %', v_company_id, sqlerrm;
    end;
  end loop;
  perform public.silvio_expire_alerts();

  perform set_config('request.jwt.claims', coalesce(v_claims_prima, ''), true);

  return jsonb_build_object(
    'success', true, 'companies_processed', v_total,
    'failures', v_failed, 'cashflow_alerts_created', v_cashflow_alerts
  );
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────────
-- 7. L'andamento del prezzo, per la scheda dell'articolo
-- ───────────────────────────────────────────────────────────────────────────────
-- Non solo l'avviso: sulla scheda si deve vedere com'è andato il prezzo nel
-- tempo. Un carico per riga, col prezzo pagato e col medio che ne è risultato.
create or replace function public.magazzino_andamento_prezzo(
  p_stock_item_id uuid,
  p_limite integer default 60
) returns table (
  movement_id uuid,
  quando timestamptz,
  quantita numeric,
  prezzo_pagato numeric,
  medio_prima numeric,
  scostamento_perc numeric,
  spesa_in_piu numeric,
  e_rincaro boolean,
  note text
)
language sql stable security definer
set search_path = public
as $$
  select m.id, m.created_at, m.quantity::numeric, m.unit_cost,
         -- Il medio di allora c'è su ogni carico valorizzato, non solo su quelli
         -- segnalati: `warehouse_rincari` resta il ripiego per le righe scritte
         -- prima che la colonna esistesse.
         coalesce(m.medio_prima, r.medio_prima), r.scostamento_perc, r.spesa_in_piu,
         r.id is not null, m.notes
    from public.warehouse_movements m
    join public.warehouse_stock s on s.id = m.stock_item_id
    left join public.warehouse_rincari r on r.movement_id = m.id
   where m.stock_item_id = p_stock_item_id
     and m.movement_type = 'carico'
     and coalesce(m.unit_cost, 0) > 0
     and coalesce(m.valorizza_medio, true)
     and (
       auth.uid() is null
       or (public.user_can_access_company(s.company_id)
           and not public.utente_e_cliente_esterno()
           and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_costs', s.company_id), false))
     )
   order by m.created_at desc
   limit greatest(coalesce(p_limite, 60), 1)
$$;

comment on function public.magazzino_andamento_prezzo(uuid, integer) is
  'I carichi valorizzati di un articolo, dal più recente: prezzo pagato, medio di allora e se fu segnalato come rincaro. Chiusa a chi non può vedere i costi.';

revoke all on function public.magazzino_andamento_prezzo(uuid, integer) from public, anon;
grant execute on function public.magazzino_andamento_prezzo(uuid, integer) to authenticated, service_role;
