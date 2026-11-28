-- L'avanzamento diventa una storia: il registro dei movimenti
-- ───────────────────────────────────────────────────────────
-- 28/11/2026, lotto 1 di `docs/modello-avanzamento-rendiconto-sal-20261128.md`.
--
-- Oggi «quanto è fatto» è un numero su `order_work_subphases` (quantita_fatta, percentuale) che
-- quattro strade riscrivono con regole diverse: l'editor delle fasi e quello delle sottofasi
-- scrivono un valore assoluto senza lasciare traccia, l'approvazione del rapportino somma il delta
-- del giorno, l'app di campo scrive un assoluto. Chi scrive un assoluto dopo un rapportino cancella
-- la somma dei giorni, e nessuno se ne accorge. Le due tabelle di storia che esistono
-- (`sottofasi_dal_rapportino`, `private.campo_avanzamenti_scheda`) sono VUOTE, con 4.263 rapportini
-- approvati: di fatto la storia non c'è.
--
-- Qui nasce il registro: una riga per ogni «questo giorno, su questa lavorazione, ho fatto questo»,
-- con chi l'ha dichiarato e con quale documento. Il numero sulla sottofase resta dov'è e diventa
-- DERIVATO dalla somma dei movimenti. Da lì vengono tre cose che oggi non ci sono: niente doppio
-- conteggio, la riapertura di un documento che si disfa da sola, e «quanto è stato fatto dal 1° al
-- 30 novembre» — il numero che serve al SAL del periodo.
--
-- QUESTA MIGRAZIONE NON CAMBIA NIENTE DI QUELLO CHE SI VEDE.
-- La derivazione si accende per una sottofase alla volta (`order_work_subphases.a_movimenti`), e
-- qui nessuna sottofase viene accesa: il travaso dei totali di oggi è una migrazione a parte, che
-- scrive righe su una tabella grande e va fatta col via del titolare.
--
-- Scelte, dalla revisione indipendente:
--  * quantità e percentuale non si sommano insieme: la MODALITÀ è della sottofase (`modo_avanzamento`),
--    le quantità si sommano, le percentuali valgono come dichiarazione e vince la più alta — come fa
--    oggi il rapportino — salvo una RETTIFICA dell'ufficio, che azzera quello che c'era prima;
--  * la quantità e l'unità di contratto si CONGELANO sulla sottofase al primo movimento: oggi la
--    base è `sottofase_quantita_totale()`, che somma le voci e dà NULL se le unità sono diverse —
--    una variante nel computo sposterebbe l'avanzamento senza nessun movimento che lo dica;
--  * anche le FASI SENZA SOTTOFASI (261 oggi) registrano: `fase_id` in alternativa a `sottofase_id`;
--  * il ricalcolo prende il LOCK della sottofase PRIMA di sommare: senza, due rapportini approvati
--    nello stesso minuto perdono un movimento (il registro resta giusto, il derivato no);
--  * arrotondamento a 3 decimali, lo stesso che usa il controllo di concorrenza dell'app di campo
--    (`private.campo_registra_avanzamento`), se no quell'app fallisce con «Il valore è cambiato»;
--  * il tetto al 99% e il minimo all'1% sono le regole di oggi e si riproducono identiche: un
--    ricalcolo «onesto» porterebbe a 100% (e quindi a «fatta», alle automazioni, alle rate) una
--    lavorazione che non è finita;
--  * la tabella non ha un'azienda sua da fidarsi: `order_work_subphases` non ha `company_id`.
--    Azienda e commessa le impone un trigger leggendole dalla fase, e NESSUNO scrive dal browser:
--    i movimenti si aggiungono solo da funzioni del database.
-- Idempotente.

-- 1. La sottofase dichiara la sua modalità e congela la base ─────────────────────────────────────
alter table public.order_work_subphases
  add column if not exists a_movimenti boolean not null default false,
  add column if not exists modo_avanzamento text,
  add column if not exists quantita_contratto numeric,
  add column if not exists unita_contratto text;

comment on column public.order_work_subphases.a_movimenti is
  'L''avanzamento di questa sottofase è derivato dai movimenti (avanzamento_movimenti). Finché è false vale il comportamento di prima.';
comment on column public.order_work_subphases.modo_avanzamento is
  'Come si dichiara l''avanzamento: «quantita» (si somma) o «percentuale» (vince la più alta). Nullo finché non si decide.';
comment on column public.order_work_subphases.quantita_contratto is
  'La quantità di contratto congelata al primo movimento: la base non deve muoversi se il computo cambia.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'owsub_modo_avanzamento_valido') then
    alter table public.order_work_subphases
      add constraint owsub_modo_avanzamento_valido
      check (modo_avanzamento is null or modo_avanzamento in ('quantita', 'percentuale'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'owsub_quantita_contratto_positiva') then
    alter table public.order_work_subphases
      add constraint owsub_quantita_contratto_positiva
      check (quantita_contratto is null or quantita_contratto > 0);
  end if;
end $$;

-- Le colonne nuove sono per l'ufficio e per il cantiere: senza GRANT un select esplicito fallisce.
grant select (a_movimenti, modo_avanzamento, quantita_contratto, unita_contratto)
  on public.order_work_subphases to authenticated;

-- 2. Il registro ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.avanzamento_movimenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  -- La fase c'è sempre; la sottofase solo se il movimento è suo. Se la lavorazione viene cancellata
  -- il riferimento si stacca (set null) ma la riga resta: è la storia di quello che è stato fatto.
  livello text not null check (livello in ('fase', 'sottofase')),
  fase_id uuid references public.order_work_phases(id) on delete set null,
  sottofase_id uuid references public.order_work_subphases(id) on delete set null,
  data date not null,
  modo text not null check (modo in ('quantita', 'percentuale')),
  quantita numeric,
  unita text,
  percentuale numeric,
  -- Rettifica dell'ufficio: vale come valore assoluto e azzera quello dichiarato prima.
  rettifica boolean not null default false,
  origine text not null check (origine in ('rapportino', 'rendiconto', 'ufficio', 'campo', 'apertura')),
  documento_id uuid,
  nota text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint avanzamento_movimento_coerente check (
    (modo = 'quantita' and quantita is not null and percentuale is null)
    or (modo = 'percentuale' and percentuale is not null and quantita is null)),
  constraint avanzamento_percentuale_valida check (percentuale is null or (percentuale >= 0 and percentuale <= 100)),
  constraint avanzamento_livello_coerente check (
    (livello = 'sottofase') or (livello = 'fase' and sottofase_id is null))
);

comment on table public.avanzamento_movimenti is
  'Un movimento = «questo giorno, su questa lavorazione, ho fatto questo». L''avanzamento delle sottofasi accese (a_movimenti) è la somma di qui. Si scrive solo da funzioni del database.';

create index if not exists avanzamento_movimenti_sottofase_idx
  on public.avanzamento_movimenti (sottofase_id, data) where sottofase_id is not null;
create index if not exists avanzamento_movimenti_fase_idx
  on public.avanzamento_movimenti (fase_id, data) where fase_id is not null;
create index if not exists avanzamento_movimenti_commessa_idx
  on public.avanzamento_movimenti (order_id, data);

-- Lo stesso documento non scrive due volte sulla stessa lavorazione: è questo che impedisce il
-- doppio conteggio fra rapportino e rendiconto. Senza documento (ufficio, campo) non vincola nulla.
create unique index if not exists avanzamento_movimenti_un_documento
  on public.avanzamento_movimenti (origine, documento_id, coalesce(sottofase_id, fase_id))
  where documento_id is not null;

-- 3. Azienda e commessa le decide il database, non chi scrive ───────────────────────────────────
create or replace function private.avanzamento_movimento_imposta()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_fase uuid; v_company uuid; v_order uuid;
begin
  v_fase := coalesce(new.fase_id,
                     (select s.phase_id from public.order_work_subphases s where s.id = new.sottofase_id));
  if v_fase is null then
    raise exception 'Il movimento non dice su quale lavorazione' using errcode = '23514';
  end if;
  select f.company_id, f.order_id into v_company, v_order
    from public.order_work_phases f where f.id = v_fase;
  if v_company is null then
    raise exception 'Lavorazione inesistente' using errcode = '23514';
  end if;
  new.fase_id := v_fase;
  new.company_id := v_company;
  new.order_id := v_order;
  if new.sottofase_id is not null then new.livello := 'sottofase'; else new.livello := 'fase'; end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$function$;

drop trigger if exists trg_avanzamento_movimento_imposta on public.avanzamento_movimenti;
create trigger trg_avanzamento_movimento_imposta
  before insert or update on public.avanzamento_movimenti
  for each row execute function private.avanzamento_movimento_imposta();

-- 4. Il ricalcolo: il derivato è la somma dei movimenti ──────────────────────────────────────────
-- Riproduce le regole di oggi (`sottofase_applica_avanzata`): tetto al 99 finché la quantità non
-- arriva al totale, minimo 1 quando qualcosa è stato fatto, 3 decimali sulla quantità.
create or replace function private.avanzamento_derivato_sottofase(p_sottofase uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_s record; v_tot numeric; v_q numeric; v_pct numeric; v_da timestamptz;
begin
  select s.id, s.modo_avanzamento, s.quantita_contratto, s.percentuale, s.quantita_fatta
    into v_s from public.order_work_subphases s where s.id = p_sottofase;
  if not found then return null; end if;
  v_tot := coalesce(v_s.quantita_contratto, public.sottofase_quantita_totale(p_sottofase));

  if coalesce(v_s.modo_avanzamento, 'quantita') = 'quantita' and v_tot is not null and v_tot > 0 then
    select round(coalesce(sum(m.quantita), 0), 3) into v_q
      from public.avanzamento_movimenti m
     where m.sottofase_id = p_sottofase and m.modo = 'quantita';
    v_q := least(greatest(v_q, 0), v_tot);
    v_pct := case when v_q <= 0 then 0
                  when v_q >= v_tot then 100
                  else greatest(1, least(99, round(100 * v_q / v_tot))) end;
    return jsonb_build_object('quantita', v_q, 'percentuale', v_pct, 'base', v_tot);
  end if;

  -- A percentuale: vince la più alta dichiarata, ma una rettifica azzera quello di prima.
  select max(m.created_at) into v_da
    from public.avanzamento_movimenti m
   where m.sottofase_id = p_sottofase and m.modo = 'percentuale' and m.rettifica;
  select coalesce(max(m.percentuale), 0) into v_pct
    from public.avanzamento_movimenti m
   where m.sottofase_id = p_sottofase and m.modo = 'percentuale'
     and (v_da is null or m.created_at >= v_da);
  return jsonb_build_object('quantita', null, 'percentuale', round(v_pct), 'base', v_tot);
end;
$function$;

create or replace function private.avanzamento_ricalcola(p_sottofase uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v_s record; v_d jsonb; v_pct integer; v_q numeric;
begin
  if p_sottofase is null then return; end if;
  -- Il lock PRIMA della somma: due movimenti nello stesso istante non si perdono.
  select s.id, s.a_movimenti, s.fatta, s.percentuale, s.quantita_fatta
    into v_s from public.order_work_subphases s where s.id = p_sottofase for update;
  if not found or not v_s.a_movimenti then return; end if;

  v_d := private.avanzamento_derivato_sottofase(p_sottofase);
  if v_d is null then return; end if;
  v_pct := (v_d->>'percentuale')::integer;
  v_q := nullif(v_d->>'quantita', '')::numeric;

  if v_s.percentuale is distinct from v_pct
     or v_s.quantita_fatta is distinct from v_q
     or v_s.fatta is distinct from (v_pct >= 100) then
    perform set_config('eic.avanzamento_derivato', '1', true);
    update public.order_work_subphases s
       set percentuale = v_pct,
           quantita_fatta = v_q,
           fatta = (v_pct >= 100),
           fatta_il = case when v_pct >= 100 then coalesce(s.fatta_il, now()) else null end,
           fatta_da = case when v_pct >= 100 then coalesce(s.fatta_da, auth.uid()) else null end,
           updated_at = now()
     where s.id = p_sottofase;
    perform set_config('eic.avanzamento_derivato', '', true);
  end if;
end;
$function$;

create or replace function private.avanzamento_movimento_applica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.avanzamento_ricalcola(coalesce(new.sottofase_id, old.sottofase_id));
  if tg_op = 'UPDATE' and new.sottofase_id is distinct from old.sottofase_id then
    perform private.avanzamento_ricalcola(old.sottofase_id);
  end if;
  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_avanzamento_movimento_applica on public.avanzamento_movimenti;
create trigger trg_avanzamento_movimento_applica
  after insert or update or delete on public.avanzamento_movimenti
  for each row execute function private.avanzamento_movimento_applica();

-- 5. Chi può leggere, e chi può scrivere ────────────────────────────────────────────────────────
alter table public.avanzamento_movimenti enable row level security;

-- Nessuna regola RESTRITTIVA: il 12/11 una restrittiva su `orders` ha svuotato 61 regole di altre
-- tabelle. Qui una permissiva sola, che passa dalla commessa come fanno le sottofasi.
drop policy if exists avanzamento_movimenti_lettura on public.avanzamento_movimenti;
create policy avanzamento_movimenti_lettura on public.avanzamento_movimenti
  for select to authenticated
  using (public.puo_vedere_commessa(order_id));

-- Dal browser non si scrive: i movimenti nascono dalle funzioni del database, che sanno da quale
-- documento vengono. Così azienda e commessa non arrivano mai da chi chiama.
revoke insert, update, delete on public.avanzamento_movimenti from authenticated;
revoke all on public.avanzamento_movimenti from anon;
grant select on public.avanzamento_movimenti to authenticated;

revoke all on function private.avanzamento_derivato_sottofase(uuid) from public, anon, authenticated;
revoke all on function private.avanzamento_ricalcola(uuid) from public, anon, authenticated;

-- 6. Come si aggiunge un movimento (dall'interno) ────────────────────────────────────────────────
-- Le quattro strade di oggi passeranno di qui nei lotti successivi. Congela la base alla prima
-- scrittura e accende la sottofase se la modalità è già decisa.
create or replace function private.avanzamento_registra(
  p_sottofase uuid,
  p_fase uuid,
  p_data date,
  p_modo text,
  p_quantita numeric,
  p_percentuale numeric,
  p_origine text,
  p_documento uuid default null,
  p_unita text default null,
  p_rettifica boolean default false,
  p_nota text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_id uuid; v_tot numeric; v_unita text;
begin
  if p_sottofase is not null then
    select public.sottofase_quantita_totale(p_sottofase) into v_tot;
    select max(v.unita) into v_unita from public.order_work_phase_voci v where v.subphase_id = p_sottofase;
    update public.order_work_subphases s
       set quantita_contratto = coalesce(s.quantita_contratto, v_tot),
           unita_contratto = coalesce(s.unita_contratto, p_unita, v_unita),
           modo_avanzamento = coalesce(s.modo_avanzamento, p_modo)
     where s.id = p_sottofase;
  end if;

  insert into public.avanzamento_movimenti
    (livello, fase_id, sottofase_id, data, modo, quantita, unita, percentuale, rettifica, origine, documento_id, nota,
     company_id, order_id)
  values
    (case when p_sottofase is null then 'fase' else 'sottofase' end,
     p_fase, p_sottofase, coalesce(p_data, current_date), p_modo,
     case when p_modo = 'quantita' then p_quantita end,
     coalesce(p_unita, v_unita),
     case when p_modo = 'percentuale' then p_percentuale end,
     coalesce(p_rettifica, false), p_origine, p_documento, p_nota,
     '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000')
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function private.avanzamento_registra(uuid, uuid, date, text, numeric, numeric, text, uuid, text, boolean, text)
  from public, anon, authenticated;
