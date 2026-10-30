-- ════════════════════════════════════════════════════════════════════════════
-- Commesse generali, modulo «Unità e vendite» (sviluppo e compravendita)
-- ════════════════════════════════════════════════════════════════════════════
-- Piano: docs/superpowers/plans/2026-10-30-commesse-generali-appalti-sviluppi.md
-- (tappa 3). Viene dopo 20281030270000_commesse_generali.
--
-- Ogni unità in vendita (A1, A2, il box B3…) è una commessa figlia della
-- generale: lì restano lavori, costi, documenti. Qui si aggiunge quello che
-- serve per venderla:
--
--   · unita_immobiliari   1:1 con la commessa figlia (order_id). m² commerciali
--     e millesimi (li legge anche il piano economico per ripartire i costi
--     comuni), piano, edificio, tipologia, prezzo di listino → trattato →
--     rogito, stato di vendita con le date, acquirente (un cliente
--     dell'azienda), agenzia e provvigione. Un'unità divisa (A1 → A1a + A1b)
--     resta com'era, con `divisa_il`; le parti nuove puntano a lei con
--     `origine_id`, così la storia non si perde.
--   · unita_movimenti     caparra, acconti e saldo (incassi) e permuta: un
--     valore di vendita senza incasso, che vale come ricavo dell'unità e come
--     costo del terreno (costo comune della generale, calcolato in lettura).
--
-- Il prezzo corrente dell'unità (rogito, altrimenti trattato, altrimenti
-- listino) diventa l'importo della commessa figlia: così la scala della
-- generale («Prezzi delle unità») e la marginalità della figlia restano giuste
-- senza altri conti.
--
-- Si scrive solo con le RPC generale_unita_*; si legge con
-- generale_unita_elenco (prezzi a chi vede gli importi, costi a chi vede costi
-- o margini) oppure dalle tabelle, solo a chi vede commesse e importi.
-- Nessun dato esistente viene toccato. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Le tabelle ───────────────────────────────────────────────────────────
create table if not exists public.unita_immobiliari (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  sigla text not null,
  edificio text,
  piano text,
  tipologia text,
  mq_commerciali numeric(10,2),
  millesimi numeric(10,3),
  prezzo_listino numeric(14,2),
  prezzo_trattato numeric(14,2),
  prezzo_rogito numeric(14,2),
  stato_vendita text not null default 'libera',
  data_prenotazione date,
  data_compromesso date,
  rogito_previsto date,
  data_rogito date,
  acquirente_id uuid references public.profiles(id) on delete set null,
  agenzia text,
  provvigione_agenzia numeric(14,2),
  note text,
  origine_id uuid references public.unita_immobiliari(id) on delete set null,
  divisa_il timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unita_immobiliari_stato check (stato_vendita in ('libera', 'prenotata', 'compromesso', 'rogitata')),
  constraint unita_immobiliari_sigla check (btrim(sigla) <> '' and length(sigla) <= 40),
  constraint unita_immobiliari_numeri check (
    coalesce(mq_commerciali, 0) >= 0 and coalesce(millesimi, 0) >= 0
    and coalesce(prezzo_listino, 0) >= 0 and coalesce(prezzo_trattato, 0) >= 0
    and coalesce(prezzo_rogito, 0) >= 0 and coalesce(provvigione_agenzia, 0) >= 0),
  -- Si divide solo un'unità libera, e una volta divisa non si vende più: si vendono le parti.
  constraint unita_immobiliari_divisa_libera check (divisa_il is null or stato_vendita = 'libera')
);

comment on table public.unita_immobiliari is
  'Unità in vendita di una commessa generale (sviluppo, compravendita): una riga per commessa figlia. Si scrive con le RPC generale_unita_*.';
comment on column public.unita_immobiliari.mq_commerciali is
  'Superficie commerciale in m². Con i millesimi è il criterio per ripartire i costi comuni della generale.';
comment on column public.unita_immobiliari.millesimi is
  'Millesimi di proprietà dell''unità nel complesso. Primo criterio per ripartire i costi comuni.';
comment on column public.unita_immobiliari.origine_id is
  'L''unità da cui questa è nata dividendola (A1 → A1a, A1b).';
comment on column public.unita_immobiliari.divisa_il is
  'L''unità è stata divisa in altre (che hanno origine_id = id): non si vende più, i suoi costi passano alle parti.';

create index if not exists unita_immobiliari_company_idx on public.unita_immobiliari (company_id);
create index if not exists unita_immobiliari_origine_idx on public.unita_immobiliari (origine_id) where origine_id is not null;
create index if not exists unita_immobiliari_acquirente_idx on public.unita_immobiliari (acquirente_id) where acquirente_id is not null;

create table if not exists public.unita_movimenti (
  id uuid primary key default gen_random_uuid(),
  unita_id uuid not null references public.unita_immobiliari(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  tipo text not null,
  importo numeric(14,2) not null,
  data date not null default current_date,
  descrizione text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint unita_movimenti_tipo check (tipo in ('caparra', 'acconto', 'saldo', 'permuta')),
  constraint unita_movimenti_importo check (importo > 0)
);

comment on table public.unita_movimenti is
  'Pagamenti di un''unità in vendita: caparra, acconti, saldo al rogito (incassi) e permuta (valore senza incasso, è anche costo del terreno).';

create index if not exists unita_movimenti_unita_idx on public.unita_movimenti (unita_id);
create index if not exists unita_movimenti_company_idx on public.unita_movimenti (company_id);

-- ── 2. Lettura: chi vede commesse e importi; scrittura: solo RPC ────────────
alter table public.unita_immobiliari enable row level security;
alter table public.unita_movimenti enable row level security;

revoke all on public.unita_immobiliari, public.unita_movimenti from anon, authenticated;
grant select on public.unita_immobiliari, public.unita_movimenti to authenticated;

drop policy if exists unita_immobiliari_lettura on public.unita_immobiliari;
create policy unita_immobiliari_lettura on public.unita_immobiliari for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
     and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id));

drop policy if exists unita_movimenti_lettura on public.unita_movimenti;
create policy unita_movimenti_lettura on public.unita_movimenti for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
     and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id));

-- ── 3. Aiuti interni (nessuno li chiama da fuori) ───────────────────────────
-- Un numero da un campo jsonb: vuoto = null, negativo = errore leggibile.
create or replace function public.generale_unita_numero(p_dati jsonb, p_chiave text, p_etichetta text)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_testo text := nullif(btrim(coalesce(p_dati ->> p_chiave, '')), '');
  v_n numeric;
begin
  if v_testo is null then
    return null;
  end if;
  begin
    v_n := v_testo::numeric;
  exception when others then
    raise exception '% non è un numero.', p_etichetta using errcode = '22023';
  end;
  if v_n < 0 then
    raise exception '% non può essere negativo.', p_etichetta using errcode = '22023';
  end if;
  return v_n;
end;
$$;

revoke all on function public.generale_unita_numero(jsonb, text, text) from public, anon, authenticated;

-- Il nome della commessa figlia scritto dall'app: «A1 — Appartamento».
create or replace function public.generale_unita_descrizione(p_sigla text, p_tipologia text)
returns text
language sql
immutable
set search_path = public
as $$
  select btrim(p_sigla) || coalesce(' — ' || nullif(btrim(p_tipologia), ''), '');
$$;

revoke all on function public.generale_unita_descrizione(text, text) from public, anon, authenticated;

-- La riga dell'unità di una commessa figlia: c'è già, oppure nasce ora dai dati
-- della commessa (una figlia creata da «Nuova unità» o collegata dopo).
-- Controlla sempre che la commessa sia ancora un'unità di una generale di
-- sviluppo o compravendita.
create or replace function public.generale_unita_assicura(p_order_id uuid)
returns public.unita_immobiliari
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.unita_immobiliari;
  v_o record;
begin
  select o.id, o.company_id, o.order_code, o.description, o.total_amount, g.modello
    into v_o
    from public.orders o
    join public.commesse_generali g on g.order_id = o.commessa_generale_id
   where o.id = p_order_id and o.deleted_at is null;
  if not found or v_o.modello not in ('sviluppo', 'compravendita') then
    raise exception 'Questa commessa non è un''unità di una commessa generale di sviluppo o compravendita.' using errcode = '22023';
  end if;

  select * into v_u from public.unita_immobiliari where order_id = p_order_id;
  if found then
    return v_u;
  end if;

  insert into public.unita_immobiliari (order_id, company_id, sigla, prezzo_listino, created_by)
  values (
    p_order_id, v_o.company_id,
    -- Una descrizione corta («A3») è già la sigla; altrimenti il numero della commessa.
    left(coalesce(
      case when length(btrim(v_o.description)) between 1 and 12 then btrim(v_o.description) end,
      nullif(btrim(v_o.order_code), ''), nullif(btrim(v_o.description), ''), 'Unità'), 40),
    nullif(v_o.total_amount, 0), auth.uid())
  returning * into v_u;
  return v_u;
end;
$$;

revoke all on function public.generale_unita_assicura(uuid) from public, anon, authenticated;

-- Nessun'altra unità della stessa generale ha questa sigla (maiuscole e minuscole uguali).
create or replace function public.generale_unita_sigla_libera(p_generale_id uuid, p_sigla text, p_escludi uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from public.unita_immobiliari u
      join public.orders o on o.id = u.order_id
     where o.commessa_generale_id = p_generale_id and o.deleted_at is null
       and lower(btrim(u.sigla)) = lower(btrim(p_sigla))
       and u.id is distinct from p_escludi
  );
$$;

revoke all on function public.generale_unita_sigla_libera(uuid, text, uuid) from public, anon, authenticated;

-- Dopo ogni modifica: l'importo della commessa figlia è il prezzo corrente
-- dell'unità; il nome, se è ancora quello scritto dall'app, segue sigla e
-- tipologia. Un'unità divisa vale zero (si vendono le parti).
create or replace function public.generale_unita_allinea(p_unita_id uuid, p_descrizione_prima text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_u public.unita_immobiliari;
  v_prezzo numeric;
begin
  select * into v_u from public.unita_immobiliari where id = p_unita_id;
  if not found then
    return;
  end if;
  v_prezzo := case when v_u.divisa_il is not null then 0
                   else coalesce(v_u.prezzo_rogito, v_u.prezzo_trattato, v_u.prezzo_listino) end;

  update public.orders o
     set description = public.generale_unita_descrizione(v_u.sigla, v_u.tipologia), updated_at = now()
   where o.id = v_u.order_id
     and v_u.divisa_il is null
     and (o.description is null or btrim(o.description) = '' or o.description = p_descrizione_prima)
     and o.description is distinct from public.generale_unita_descrizione(v_u.sigla, v_u.tipologia);

  if v_prezzo is not null then
    begin
      update public.orders
         set total_amount = v_prezzo, updated_at = now()
       where id = v_u.order_id and total_amount is distinct from v_prezzo;
    exception when raise_exception then
      if sqlerrm like 'total_amount%' then
        raise exception 'La commessa di % ha delle rate che non tornano con il nuovo prezzo: aggiorna prima le rate dalla commessa.', v_u.sigla
          using errcode = '22023';
      end if;
      raise;
    end;
  end if;
end;
$$;

revoke all on function public.generale_unita_allinea(uuid, text) from public, anon, authenticated;

-- Una commessa figlia nuova per un'unità: stessa azienda, stato iniziale
-- dell'azienda, numero progressivo. Entra nella generale con
-- commessa_generale_collega (tappa 0); il cliente lo aggiunge chi chiama,
-- dopo, come fa commessa_generale_crea: creare trenta unità non deve
-- spedire trenta «commessa creata» alla società dell'operazione.
create or replace function public.generale_unita_nuova_commessa(p_azienda uuid, p_descrizione text, p_importo numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_stato uuid;
begin
  select s.id into v_stato
    from public.order_statuses s
   where s.company_id = p_azienda
   order by s.is_default desc, s.position, s.created_at
   limit 1;
  insert into public.orders (id, company_id, created_by, description, workflow_kind, total_amount, order_code, current_status_id)
  values (v_id, p_azienda, auth.uid(), p_descrizione, 'commessa', coalesce(p_importo, 0),
          public.prossimo_numero_commessa(p_azienda), v_stato);
  return v_id;
end;
$$;

revoke all on function public.generale_unita_nuova_commessa(uuid, text, numeric) from public, anon, authenticated;

-- ── 4. Leggere le unità di una generale ─────────────────────────────────────
-- Una riga per commessa figlia (anche quelle senza ancora la scheda unità),
-- con i movimenti. Prezzi e importi solo a chi vede gli importi; il costo di
-- ogni figlia e quello registrato sulla generale (i costi comuni) a chi vede i
-- costi, o i margini insieme agli importi (dal margine e dal prezzo il costo si
-- ricava comunque). Ripartizione e margine si calcolano nell'app.
create or replace function public.generale_unita_elenco(p_generale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_modello text;
  v_importi boolean;
  v_costi boolean;
  v_margini boolean;
  v_vede_costi boolean;
  v_costi_comuni numeric;
  v_figlie jsonb;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_view_orders', v_azienda) then
    raise exception 'Non hai il permesso di vedere questa commessa.' using errcode = '42501';
  end if;
  select g.modello into v_modello
    from public.commesse_generali g
    join public.orders o on o.id = g.order_id
   where g.order_id = p_generale_id and o.deleted_at is null;
  if not found then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda);
  v_margini := public.has_permission_for_company(auth.uid(), 'can_view_margins', v_azienda);
  v_vede_costi := v_costi or (v_margini and v_importi);

  if v_vede_costi then
    select coalesce(m.consuntivo, 0) into v_costi_comuni from public.v_ordine_marginalita m where m.id = p_generale_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_id', o.id, 'codice', o.order_code, 'nome', o.description,
           'importo', case when v_importi then coalesce(o.total_amount, 0) end,
           'costo', case when v_vede_costi then (select coalesce(m.consuntivo, 0) from public.v_ordine_marginalita m where m.id = o.id) end,
           'unita', case when u.id is null then null else jsonb_build_object(
             'id', u.id, 'sigla', u.sigla, 'edificio', u.edificio, 'piano', u.piano, 'tipologia', u.tipologia,
             'mq_commerciali', u.mq_commerciali, 'millesimi', u.millesimi,
             'prezzo_listino', case when v_importi then u.prezzo_listino end,
             'prezzo_trattato', case when v_importi then u.prezzo_trattato end,
             'prezzo_rogito', case when v_importi then u.prezzo_rogito end,
             'provvigione_agenzia', case when v_importi then u.provvigione_agenzia end,
             'stato', u.stato_vendita,
             'data_prenotazione', u.data_prenotazione, 'data_compromesso', u.data_compromesso,
             'rogito_previsto', u.rogito_previsto, 'data_rogito', u.data_rogito,
             'acquirente_id', u.acquirente_id,
             'acquirente', coalesce(nullif(btrim(p.business_name), ''), nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email),
             'agenzia', u.agenzia, 'note', u.note,
             'origine_id', u.origine_id, 'divisa_il', u.divisa_il,
             'movimenti', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', mv.id, 'tipo', mv.tipo,
                        'importo', case when v_importi then mv.importo end,
                        'data', mv.data, 'descrizione', mv.descrizione
                      ) order by mv.data, mv.created_at), '[]'::jsonb)
                 from public.unita_movimenti mv
                where mv.unita_id = u.id)
           ) end
         ) order by o.order_code nulls last, o.description), '[]'::jsonb)
    into v_figlie
    from public.orders o
    left join public.unita_immobiliari u on u.order_id = o.id
    left join public.profiles p on p.id = u.acquirente_id
   where o.commessa_generale_id = p_generale_id and o.deleted_at is null;

  return jsonb_build_object(
    'modello', v_modello,
    'costi_comuni', v_costi_comuni,
    'figlie', v_figlie,
    'permessi', jsonb_build_object(
      'importi', v_importi, 'costi', v_costi, 'margini', v_margini,
      'modifica', public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda))
  );
end;
$$;

revoke all on function public.generale_unita_elenco(uuid) from public, anon;
grant execute on function public.generale_unita_elenco(uuid) to authenticated;

-- ── 5. I dati dell'unità (sigla, piano, m², prezzi, agenzia…) ───────────────
-- Cambia solo le chiavi presenti in p_dati. Prezzi e provvigione solo per chi
-- vede gli importi: chi non li vede riceve null dall'elenco e, salvando il
-- resto, li cancellerebbe senza saperlo.
create or replace function public.generale_unita_salva(p_order_id uuid, p_dati jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_generale uuid;
  v_importi boolean;
  v_u public.unita_immobiliari;
  v_sigla text;
  v_descrizione_prima text;
  d jsonb := coalesce(p_dati, '{}'::jsonb);
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa unità.' using errcode = '42501';
  end if;
  v_u := public.generale_unita_assicura(p_order_id);
  if v_u.divisa_il is not null then
    raise exception 'Questa unità è stata divisa: si modificano le parti.' using errcode = '22023';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  select commessa_generale_id into v_generale from public.orders where id = p_order_id;
  v_descrizione_prima := public.generale_unita_descrizione(v_u.sigla, v_u.tipologia);

  if d ? 'sigla' then
    v_sigla := nullif(btrim(coalesce(d ->> 'sigla', '')), '');
    if v_sigla is null then
      raise exception 'Scrivi la sigla dell''unità (es. A1).' using errcode = '22023';
    end if;
    if length(v_sigla) > 40 then
      raise exception 'La sigla è troppo lunga: al massimo 40 caratteri.' using errcode = '22023';
    end if;
    if not public.generale_unita_sigla_libera(v_generale, v_sigla, v_u.id) then
      raise exception 'C''è già un''unità %.', v_sigla using errcode = '22023';
    end if;
  end if;

  update public.unita_immobiliari set
    sigla = case when d ? 'sigla' then v_sigla else sigla end,
    edificio = case when d ? 'edificio' then nullif(btrim(coalesce(d ->> 'edificio', '')), '') else edificio end,
    piano = case when d ? 'piano' then nullif(btrim(coalesce(d ->> 'piano', '')), '') else piano end,
    tipologia = case when d ? 'tipologia' then nullif(btrim(coalesce(d ->> 'tipologia', '')), '') else tipologia end,
    mq_commerciali = case when d ? 'mq_commerciali' then public.generale_unita_numero(d, 'mq_commerciali', 'I m² commerciali') else mq_commerciali end,
    millesimi = case when d ? 'millesimi' then public.generale_unita_numero(d, 'millesimi', 'I millesimi') else millesimi end,
    prezzo_listino = case when v_importi and d ? 'prezzo_listino' then public.generale_unita_numero(d, 'prezzo_listino', 'Il prezzo di listino') else prezzo_listino end,
    prezzo_trattato = case when v_importi and d ? 'prezzo_trattato' and stato_vendita <> 'libera' then public.generale_unita_numero(d, 'prezzo_trattato', 'Il prezzo trattato') else prezzo_trattato end,
    prezzo_rogito = case when v_importi and d ? 'prezzo_rogito' and stato_vendita = 'rogitata' then public.generale_unita_numero(d, 'prezzo_rogito', 'Il prezzo di rogito') else prezzo_rogito end,
    agenzia = case when d ? 'agenzia' then nullif(btrim(coalesce(d ->> 'agenzia', '')), '') else agenzia end,
    provvigione_agenzia = case when v_importi and d ? 'provvigione_agenzia' then public.generale_unita_numero(d, 'provvigione_agenzia', 'La provvigione') else provvigione_agenzia end,
    note = case when d ? 'note' then nullif(btrim(coalesce(d ->> 'note', '')), '') else note end,
    updated_at = now()
  where id = v_u.id;

  perform public.generale_unita_allinea(v_u.id, v_descrizione_prima);
  return v_u.id;
end;
$$;

revoke all on function public.generale_unita_salva(uuid, jsonb) from public, anon;
grant execute on function public.generale_unita_salva(uuid, jsonb) to authenticated;

-- ── 6. Cambiare lo stato di vendita ─────────────────────────────────────────
-- libera → prenotata → compromesso → rogitata, anche saltando passi o tornando
-- indietro. Ogni stato chiede solo il suo: l'acquirente da «prenotata» in poi,
-- il prezzo pattuito dal compromesso, quello dell'atto al rogito; caparra
-- (prenotata, compromesso) e saldo (rogitata) diventano movimenti. Tornare
-- indietro toglie le date e i prezzi degli stati dopo; rimettere in vendita
-- un'unità con dei pagamenti registrati no: prima si tolgono quelli.
-- Le stesse regole stanno in src/lib/orders/generali/unita.ts (requisitiStato).
create or replace function public.generale_unita_stato(p_order_id uuid, p_stato text, p_dati jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_importi boolean;
  v_u public.unita_immobiliari;
  d jsonb := coalesce(p_dati, '{}'::jsonb);
  v_acquirente uuid;
  v_data date;
  v_prezzo numeric;
  v_caparra numeric;
  v_saldo numeric;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa unità.' using errcode = '42501';
  end if;
  if p_stato is null or p_stato not in ('libera', 'prenotata', 'compromesso', 'rogitata') then
    raise exception 'Stato di vendita non valido.' using errcode = '22023';
  end if;
  v_u := public.generale_unita_assicura(p_order_id);
  if v_u.divisa_il is not null then
    raise exception 'Questa unità è stata divisa: si vendono le parti.' using errcode = '22023';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);
  v_caparra := public.generale_unita_numero(d, 'caparra', 'La caparra');
  v_saldo := public.generale_unita_numero(d, 'saldo', 'Il saldo');
  if (coalesce(v_caparra, 0) > 0 or coalesce(v_saldo, 0) > 0) and not v_importi then
    raise exception 'Non hai il permesso di registrare pagamenti.' using errcode = '42501';
  end if;

  v_acquirente := case when d ? 'acquirente_id' then nullif(d ->> 'acquirente_id', '')::uuid else v_u.acquirente_id end;
  if v_acquirente is not null and v_acquirente is distinct from v_u.acquirente_id and not exists (
    select 1 from public.profiles p where p.id = v_acquirente and p.company_id = v_azienda and p.deleted_at is null
  ) then
    raise exception 'Acquirente non trovato tra i clienti.' using errcode = 'P0002';
  end if;

  if p_stato = 'libera' then
    if exists (select 1 from public.unita_movimenti m where m.unita_id = v_u.id) then
      raise exception 'Su % ci sono pagamenti registrati: toglili prima di rimetterla in vendita.', v_u.sigla using errcode = '22023';
    end if;
    update public.unita_immobiliari
       set stato_vendita = 'libera', acquirente_id = null,
           data_prenotazione = null, data_compromesso = null, rogito_previsto = null, data_rogito = null,
           prezzo_trattato = null, prezzo_rogito = null, updated_at = now()
     where id = v_u.id;
  else
    if v_acquirente is null then
      raise exception 'Scegli l''acquirente.' using errcode = '22023';
    end if;
    if p_stato <> 'rogitata' and exists (
      select 1 from public.unita_movimenti m where m.unita_id = v_u.id and m.tipo = 'saldo'
    ) then
      raise exception 'Su % è registrato il saldo del rogito: toglilo prima di tornare indietro.', v_u.sigla using errcode = '22023';
    end if;
    v_data := nullif(d ->> 'data', '')::date;

    if p_stato = 'prenotata' then
      v_prezzo := case when v_importi and d ? 'prezzo' then public.generale_unita_numero(d, 'prezzo', 'Il prezzo') else v_u.prezzo_trattato end;
      update public.unita_immobiliari
         set stato_vendita = 'prenotata', acquirente_id = v_acquirente,
             data_prenotazione = coalesce(v_data, data_prenotazione, current_date),
             prezzo_trattato = v_prezzo,
             data_compromesso = null, rogito_previsto = null, data_rogito = null, prezzo_rogito = null,
             updated_at = now()
       where id = v_u.id
       returning data_prenotazione into v_data;
    elsif p_stato = 'compromesso' then
      v_prezzo := case when v_importi and d ? 'prezzo' then public.generale_unita_numero(d, 'prezzo', 'Il prezzo')
                       else coalesce(v_u.prezzo_trattato, v_u.prezzo_listino) end;
      if v_prezzo is null then
        raise exception 'Scrivi il prezzo pattuito nel compromesso.' using errcode = '22023';
      end if;
      update public.unita_immobiliari
         set stato_vendita = 'compromesso', acquirente_id = v_acquirente,
             data_compromesso = coalesce(v_data, data_compromesso, current_date),
             rogito_previsto = case when d ? 'rogito_previsto' then nullif(d ->> 'rogito_previsto', '')::date else rogito_previsto end,
             prezzo_trattato = v_prezzo,
             data_rogito = null, prezzo_rogito = null,
             updated_at = now()
       where id = v_u.id
       returning data_compromesso into v_data;
    else
      v_prezzo := case when v_importi and d ? 'prezzo' then public.generale_unita_numero(d, 'prezzo', 'Il prezzo')
                       else coalesce(v_u.prezzo_rogito, v_u.prezzo_trattato, v_u.prezzo_listino) end;
      if v_prezzo is null then
        raise exception 'Scrivi il prezzo dell''atto.' using errcode = '22023';
      end if;
      update public.unita_immobiliari
         set stato_vendita = 'rogitata', acquirente_id = v_acquirente,
             data_rogito = coalesce(v_data, data_rogito, current_date),
             prezzo_rogito = v_prezzo,
             prezzo_trattato = coalesce(prezzo_trattato, v_prezzo),
             updated_at = now()
       where id = v_u.id
       returning data_rogito into v_data;
    end if;

    if coalesce(v_caparra, 0) > 0 then
      if p_stato = 'rogitata' then
        raise exception 'Al rogito si registra il saldo, non la caparra.' using errcode = '22023';
      end if;
      insert into public.unita_movimenti (unita_id, company_id, tipo, importo, data, created_by)
      values (v_u.id, v_u.company_id, 'caparra', v_caparra, v_data, auth.uid());
    end if;
    if coalesce(v_saldo, 0) > 0 then
      if p_stato <> 'rogitata' then
        raise exception 'Il saldo si registra al rogito.' using errcode = '22023';
      end if;
      insert into public.unita_movimenti (unita_id, company_id, tipo, importo, data, created_by)
      values (v_u.id, v_u.company_id, 'saldo', v_saldo, v_data, auth.uid());
    end if;
  end if;

  perform public.generale_unita_allinea(v_u.id, null);
end;
$$;

revoke all on function public.generale_unita_stato(uuid, text, jsonb) from public, anon;
grant execute on function public.generale_unita_stato(uuid, text, jsonb) to authenticated;

-- ── 7. Pagamenti: caparra, acconti, saldo, permuta ──────────────────────────
-- Su un'unità libera niente pagamenti (prima si prenota); il saldo solo al
-- rogito. Stesse regole di tipiMovimentoAmmessi in unita.ts.
create or replace function public.generale_unita_movimento_aggiungi(
  p_order_id uuid,
  p_tipo text,
  p_importo numeric,
  p_data date default null,
  p_descrizione text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_u public.unita_immobiliari;
  v_id uuid;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then
    raise exception 'Non hai il permesso di registrare pagamenti.' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('caparra', 'acconto', 'saldo', 'permuta') then
    raise exception 'Tipo di pagamento non valido.' using errcode = '22023';
  end if;
  if p_importo is null or p_importo <= 0 then
    raise exception 'Scrivi un importo maggiore di zero.' using errcode = '22023';
  end if;
  v_u := public.generale_unita_assicura(p_order_id);
  if v_u.divisa_il is not null then
    raise exception 'Questa unità è stata divisa: si registra sulle parti.' using errcode = '22023';
  end if;
  if v_u.stato_vendita = 'libera' then
    raise exception '% è ancora libera: prima prenotala, poi registra i pagamenti.', v_u.sigla using errcode = '22023';
  end if;
  if p_tipo = 'saldo' and v_u.stato_vendita <> 'rogitata' then
    raise exception 'Il saldo si registra al rogito.' using errcode = '22023';
  end if;

  insert into public.unita_movimenti (unita_id, company_id, tipo, importo, data, descrizione, created_by)
  values (v_u.id, v_u.company_id, p_tipo, round(p_importo, 2), coalesce(p_data, current_date),
          nullif(btrim(coalesce(p_descrizione, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.generale_unita_movimento_aggiungi(uuid, text, numeric, date, text) from public, anon;
grant execute on function public.generale_unita_movimento_aggiungi(uuid, text, numeric, date, text) to authenticated;

create or replace function public.generale_unita_movimento_elimina(p_movimento_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid;
begin
  select m.company_id into v_azienda from public.unita_movimenti m where m.id = p_movimento_id;
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then
    raise exception 'Non hai il permesso di togliere pagamenti.' using errcode = '42501';
  end if;
  delete from public.unita_movimenti where id = p_movimento_id;
end;
$$;

revoke all on function public.generale_unita_movimento_elimina(uuid) from public, anon;
grant execute on function public.generale_unita_movimento_elimina(uuid) to authenticated;

-- ── 8. Nuove unità in serie (A1…A6) ─────────────────────────────────────────
-- Una commessa figlia e la sua unità per ogni riga, tutto o niente.
-- p_righe: [{sigla, edificio, piano, tipologia, mq_commerciali, millesimi, prezzo_listino}]
create or replace function public.generale_unita_serie(p_generale_id uuid, p_righe jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_modello text;
  v_importi boolean;
  v_riga jsonb;
  v_sigla text;
  v_listino numeric;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_doppia text;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa commessa.' using errcode = '42501';
  end if;
  select g.modello into v_modello from public.commesse_generali g where g.order_id = p_generale_id;
  if not found or v_modello not in ('sviluppo', 'compravendita') then
    raise exception 'Le unità si aggiungono alle commesse generali di sviluppo o compravendita.' using errcode = '22023';
  end if;
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' or jsonb_array_length(p_righe) = 0 then
    raise exception 'Aggiungi almeno un''unità.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_righe) > 100 then
    raise exception 'Al massimo 100 unità alla volta.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_righe) r where nullif(btrim(coalesce(r ->> 'sigla', '')), '') is null) then
    raise exception 'Ogni unità ha bisogno di una sigla (es. A1).' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_righe) r where length(btrim(r ->> 'sigla')) > 40) then
    raise exception 'Una sigla è troppo lunga: al massimo 40 caratteri.' using errcode = '22023';
  end if;
  select min(btrim(r ->> 'sigla')) into v_doppia
    from jsonb_array_elements(p_righe) r
   group by lower(btrim(r ->> 'sigla'))
  having count(*) > 1
   limit 1;
  if v_doppia is not null then
    raise exception 'Due unità hanno la stessa sigla: %.', v_doppia using errcode = '22023';
  end if;
  select btrim(r ->> 'sigla') into v_doppia
    from jsonb_array_elements(p_righe) r
   where not public.generale_unita_sigla_libera(p_generale_id, r ->> 'sigla', null)
   limit 1;
  if v_doppia is not null then
    raise exception 'C''è già un''unità %.', v_doppia using errcode = '22023';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);

  for v_riga in select value from jsonb_array_elements(p_righe) loop
    v_sigla := btrim(v_riga ->> 'sigla');
    v_listino := case when v_importi then public.generale_unita_numero(v_riga, 'prezzo_listino', 'Il prezzo di listino') end;
    v_id := public.generale_unita_nuova_commessa(
      v_azienda, public.generale_unita_descrizione(v_sigla, v_riga ->> 'tipologia'), v_listino);
    insert into public.unita_immobiliari (
      order_id, company_id, sigla, edificio, piano, tipologia, mq_commerciali, millesimi, prezzo_listino, created_by)
    values (
      v_id, v_azienda, v_sigla,
      nullif(btrim(coalesce(v_riga ->> 'edificio', '')), ''),
      nullif(btrim(coalesce(v_riga ->> 'piano', '')), ''),
      nullif(btrim(coalesce(v_riga ->> 'tipologia', '')), ''),
      public.generale_unita_numero(v_riga, 'mq_commerciali', 'I m² commerciali'),
      public.generale_unita_numero(v_riga, 'millesimi', 'I millesimi'),
      v_listino, auth.uid());
    v_ids := v_ids || v_id;
  end loop;

  perform public.commessa_generale_collega(p_generale_id, v_ids);
  update public.orders o
     set customer_id = g.customer_id, client_name = g.client_name
    from public.orders g
   where g.id = p_generale_id and g.customer_id is not null and o.id = any (v_ids);
  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke all on function public.generale_unita_serie(uuid, jsonb) from public, anon;
grant execute on function public.generale_unita_serie(uuid, jsonb) to authenticated;

-- ── 9. Dividere un'unità (A1 → A1a + A1b) ───────────────────────────────────
-- Solo un'unità libera, senza pagamenti, non già divisa. Le parti nascono come
-- unità nuove (con la loro commessa) e ricordano da dove vengono; l'unità di
-- partenza resta, con i suoi costi e documenti, e vale zero. I m² delle parti
-- devono tornare con quelli di partenza, e così i millesimi (li calcola l'app,
-- in proporzione ai m²: dividiUnita in unitaConti.ts).
-- p_parti: [{sigla, tipologia, mq_commerciali, millesimi, prezzo_listino}]
create or replace function public.generale_unita_dividi(p_order_id uuid, p_parti jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_generale uuid;
  v_importi boolean;
  v_u public.unita_immobiliari;
  v_parte jsonb;
  v_sigla text;
  v_listino numeric;
  v_tipologia text;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_sigle text[] := '{}';
  v_doppia text;
  v_somma numeric;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di modificare questa unità.' using errcode = '42501';
  end if;
  v_u := public.generale_unita_assicura(p_order_id);
  select commessa_generale_id into v_generale from public.orders where id = p_order_id;
  if v_u.divisa_il is not null then
    raise exception '% è già stata divisa.', v_u.sigla using errcode = '22023';
  end if;
  if v_u.stato_vendita <> 'libera' then
    raise exception 'Si divide solo un''unità libera.' using errcode = '22023';
  end if;
  if exists (select 1 from public.unita_movimenti m where m.unita_id = v_u.id) then
    raise exception 'Su % ci sono pagamenti registrati: non si può dividere.', v_u.sigla using errcode = '22023';
  end if;
  if p_parti is null or jsonb_typeof(p_parti) <> 'array' or jsonb_array_length(p_parti) < 2 then
    raise exception 'Dividi in almeno due parti.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_parti) > 10 then
    raise exception 'Al massimo 10 parti.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_parti) r where nullif(btrim(coalesce(r ->> 'sigla', '')), '') is null) then
    raise exception 'Ogni parte ha bisogno di una sigla (es. A1a).' using errcode = '22023';
  end if;
  select min(btrim(r ->> 'sigla')) into v_doppia
    from jsonb_array_elements(p_parti) r
   group by lower(btrim(r ->> 'sigla'))
  having count(*) > 1
   limit 1;
  if v_doppia is not null then
    raise exception 'Due parti hanno la stessa sigla: %.', v_doppia using errcode = '22023';
  end if;
  select btrim(r ->> 'sigla') into v_doppia
    from jsonb_array_elements(p_parti) r
   where not public.generale_unita_sigla_libera(v_generale, r ->> 'sigla', null)
   limit 1;
  if v_doppia is not null then
    raise exception 'C''è già un''unità %.', v_doppia using errcode = '22023';
  end if;
  if v_u.mq_commerciali is not null then
    select sum(coalesce(public.generale_unita_numero(r, 'mq_commerciali', 'I m² commerciali'), 0)) into v_somma
      from jsonb_array_elements(p_parti) r;
    if abs(v_somma - v_u.mq_commerciali) > 0.01 then
      raise exception 'I m² delle parti (%) non tornano con quelli di % (%).', v_somma, v_u.sigla, v_u.mq_commerciali using errcode = '22023';
    end if;
  end if;
  if v_u.millesimi is not null then
    select sum(coalesce(public.generale_unita_numero(r, 'millesimi', 'I millesimi'), 0)) into v_somma
      from jsonb_array_elements(p_parti) r;
    if abs(v_somma - v_u.millesimi) > 0.01 then
      raise exception 'I millesimi delle parti (%) non tornano con quelli di % (%).', v_somma, v_u.sigla, v_u.millesimi using errcode = '22023';
    end if;
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);

  for v_parte in select value from jsonb_array_elements(p_parti) loop
    v_sigla := btrim(v_parte ->> 'sigla');
    v_tipologia := coalesce(nullif(btrim(coalesce(v_parte ->> 'tipologia', '')), ''), v_u.tipologia);
    v_listino := case when v_importi then public.generale_unita_numero(v_parte, 'prezzo_listino', 'Il prezzo di listino') end;
    v_id := public.generale_unita_nuova_commessa(v_azienda, public.generale_unita_descrizione(v_sigla, v_tipologia), v_listino);
    insert into public.unita_immobiliari (
      order_id, company_id, sigla, edificio, piano, tipologia, mq_commerciali, millesimi, prezzo_listino,
      agenzia, origine_id, created_by)
    values (
      v_id, v_azienda, v_sigla, v_u.edificio, v_u.piano, v_tipologia,
      public.generale_unita_numero(v_parte, 'mq_commerciali', 'I m² commerciali'),
      public.generale_unita_numero(v_parte, 'millesimi', 'I millesimi'),
      v_listino, v_u.agenzia, v_u.id, auth.uid());
    v_ids := v_ids || v_id;
    v_sigle := v_sigle || v_sigla;
  end loop;

  perform public.commessa_generale_collega(v_generale, v_ids);
  update public.orders o
     set customer_id = p.customer_id, client_name = p.client_name
    from public.orders p
   where p.id = p_order_id and p.customer_id is not null and o.id = any (v_ids);

  update public.unita_immobiliari set divisa_il = now(), updated_at = now() where id = v_u.id;
  -- La commessa di partenza resta (costi, documenti, storia) e dice in cosa è stata divisa.
  update public.orders
     set description = left(coalesce(nullif(btrim(description), ''), v_u.sigla), 400)
                       || ' (divisa in ' || array_to_string(v_sigle, ', ') || ')',
         updated_at = now()
   where id = p_order_id;
  perform public.generale_unita_allinea(v_u.id, null);
  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke all on function public.generale_unita_dividi(uuid, jsonb) from public, anon;
grant execute on function public.generale_unita_dividi(uuid, jsonb) to authenticated;
