-- ════════════════════════════════════════════════════════════════════════════
-- Silvio e la commessa, fase 5 (lotti 5.1 e 5.2): cosa fa Silvio da solo, e il
-- calendario dell'azienda. Vedi docs/piano-silvio-commessa-ai.md, sezione 4 e fase 5.
-- ════════════════════════════════════════════════════════════════════════════
-- `silvio_autonomia`: per azienda e per azione, «vietata», «chiede» o «da_sola» (e la
-- soglia in euro degli ordini). Una riga che manca vale «chiede»: nessuna azione è
-- promossa finché il titolare non la sceglie.
--
-- Il catalogo delle azioni è `_silvio_azioni_autonomia()`, copia di AZIONI_SILVIO
-- (shared/silvio-commessa/autonomia.ts): il test silvioCommessaAutonomia le confronta.
-- Le azioni che Silvio non fa mai (firma, fatture e SDI, pagamenti, importo del contratto,
-- cancellazioni, fornitori nuovi) non sono nel catalogo: nessuna riga le può promuovere.
--
-- Il controllo vero sta qui, non nel popup: `_silvio_bozza` (20281106100000) passa la
-- scrittura da `_silvio_scrittura_permessa`, che toglie quello che le azioni «vietate»
-- scriverebbero. Così una chiamata diretta alle RPC con una scrittura fatta a mano non
-- mette la squadra, i mezzi o gli ordini che il titolare ha vietato.
--
-- `silvio_calendario`: chiusura estiva (agosto, configurabile), patrono, sabato.
-- Le altre chiusure sono quelle che l'azienda ha già in Personale → festività
-- (`hr_festivita`); le feste nazionali, Pasqua e Pasquetta le calcola il codice.
--
-- Letture e scritture solo dalle RPC: le tabelle non hanno GRANT ai client.
-- Idempotente. Nessun dato esistente viene toccato. Richiede 20281106100000.
-- NON applicata: si applica col push della fase 5, poi si riallinea la versione.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── Il catalogo: azione → livello massimo ───────────────────────────────────
create or replace function public._silvio_azioni_autonomia()
returns table (azione text, massimo text)
language sql
immutable
set search_path = ''
as $$
  values
    ('squadra', 'da_sola'),
    ('mezzi', 'da_sola'),
    ('ordini', 'da_sola'),
    ('promemoria', 'da_sola'),
    ('ditte', 'chiede'),
    ('contratti_ditte', 'chiede'),
    ('avvio_cliente', 'chiede'),
    ('controllo_fase', 'chiede'),
    ('proposta_sal', 'chiede')
$$;
revoke all on function public._silvio_azioni_autonomia() from public, anon;
grant execute on function public._silvio_azioni_autonomia() to authenticated, service_role;

-- Il livello è ammesso per l'azione? (vietata e chiede sempre; da_sola solo se il massimo lo è)
create or replace function public._silvio_livello_ammesso(p_azione text, p_livello text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1 from public._silvio_azioni_autonomia() a
     where a.azione = p_azione
       and (p_livello in ('vietata', 'chiede') or (p_livello = 'da_sola' and a.massimo = 'da_sola')))
$$;
revoke all on function public._silvio_livello_ammesso(text, text) from public, anon, authenticated;
-- Il vincolo della tabella la chiama anche per chi scrive con la chiave di servizio.
grant execute on function public._silvio_livello_ammesso(text, text) to service_role;

create table if not exists public.silvio_autonomia (
  company_id uuid not null references public.companies(id) on delete cascade,
  azione text not null,
  livello text not null default 'chiede',
  soglia_eur numeric(12, 2),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (company_id, azione),
  constraint silvio_autonomia_livello check (livello in ('vietata', 'chiede', 'da_sola')),
  constraint silvio_autonomia_ammesso check (public._silvio_livello_ammesso(azione, livello)),
  constraint silvio_autonomia_soglia check (soglia_eur is null or soglia_eur >= 0)
);

comment on table public.silvio_autonomia is
  'Cosa fa Silvio da solo sulle commesse, per azienda e azione: vietata, chiede (predefinito, anche se la riga manca) o da_sola. Vedi docs/piano-silvio-commessa-ai.md, lotto 5.1.';

create table if not exists public.silvio_calendario (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- La chiusura estiva, MM-GG (es. 08-08 → 08-23). Null: nessuna.
  chiusura_dal text,
  chiusura_al text,
  -- Il patrono della città dell'azienda, MM-GG. Null: si deduce dal cantiere, se la città è nota.
  patrono text,
  patrono_nome text,
  sabato_lavorativo boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint silvio_calendario_date check (
    (chiusura_dal is null or chiusura_dal ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
    and (chiusura_al is null or chiusura_al ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
    and (patrono is null or patrono ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$')
    and ((chiusura_dal is null) = (chiusura_al is null)))
);

comment on table public.silvio_calendario is
  'Il calendario di cantiere dell''azienda per le date di Silvio: chiusura estiva, patrono, sabato. Le altre chiusure stanno in hr_festivita. Vedi docs/piano-silvio-commessa-ai.md, lotto 5.2.';

alter table public.silvio_autonomia enable row level security;
alter table public.silvio_calendario enable row level security;
revoke all on public.silvio_autonomia from public, anon, authenticated;
revoke all on public.silvio_calendario from public, anon, authenticated;
grant all on public.silvio_autonomia to service_role;
grant all on public.silvio_calendario to service_role;

-- ── Il livello di un'azione per un'azienda (per le altre funzioni SQL) ─────────
create or replace function public._silvio_livello(p_company uuid, p_azione text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when public._silvio_livello_ammesso(a.azione, a.livello) then a.livello else 'chiede' end
       from public.silvio_autonomia a where a.company_id = p_company and a.azione = p_azione),
    'chiede')
$$;
revoke all on function public._silvio_livello(uuid, text) from public, anon, authenticated;
grant execute on function public._silvio_livello(uuid, text) to service_role;

-- Un elenco senza certe chiavi, elemento per elemento (l'ordine resta: le fasi si ritrovano per posizione).
create or replace function public._silvio_togli_chiavi(p_elenco jsonb, p_chiavi text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_elenco) = 'array'
              then coalesce((select jsonb_agg(e.valore - p_chiavi order by e.ord)
                               from jsonb_array_elements(p_elenco) with ordinality e(valore, ord)), '[]'::jsonb)
              else p_elenco end
$$;
revoke all on function public._silvio_togli_chiavi(jsonb, text[]) from public, anon, authenticated;

-- Lo stesso, dentro le sottofasi di ogni fase.
create or replace function public._silvio_togli_dalle_sottofasi(p_fasi jsonb, p_chiavi text[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_fasi) = 'array'
              then coalesce((select jsonb_agg(
                                      case when jsonb_typeof(e.fase->'sottofasi') = 'array'
                                           then jsonb_set(e.fase, '{sottofasi}', public._silvio_togli_chiavi(e.fase->'sottofasi', p_chiavi))
                                           else e.fase end order by e.ord)
                               from jsonb_array_elements(p_fasi) with ordinality e(fase, ord)), '[]'::jsonb)
              else p_fasi end
$$;
revoke all on function public._silvio_togli_dalle_sottofasi(jsonb, text[]) from public, anon, authenticated;

-- ── La scrittura senza quello che il titolare ha vietato ──────────────────────
-- La chiama `_silvio_bozza`, quindi vale per «Crea», «Completa» e per chi chiama le RPC
-- a mano. Quello che toglie lo scrive in `tolte_autonomia`, per dirlo.
--
-- Le RPC sono SECURITY DEFINER e non passano dalla RLS: qui sotto le stesse regole delle
-- policy, per chi sta scrivendo (D4 e P2, revisione 2/11). Quello che toglie va in
-- `tolte_permessi`, e le RPC lo restituiscono: il popup lo dice.
--   contratti   → policy ufficio_scrivi di contratti_subappalto: costi e amministrazione subappaltatori
--   squadra     → le policy di order_employees: solo amministratori
--   condizioni  → contratti_insert_admin di contratti_documents: solo amministratori
--   adempimenti → adempimenti_company_access: sicurezza di cantiere
--   oda         → «Costi»: un ordine porta i prezzi d'acquisto (po_tenant_insert guarda solo l'azienda)
--   importi     → «Importi di vendita»: total_amount, vat_rate, rate, prezzi di riga, venduto
--   costi       → «Costi»: costo della ditta, costo delle voci, prezzi d'acquisto
-- Le ditte restano: commessa_assegna_subappaltatore le assegna con can_edit_orders, che
-- `_silvio_bozza` ha già controllato. I mezzi li controlla salva_piano_mezzo.
create or replace function public._silvio_scrittura_permessa(p_company uuid, p_scrittura jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb := coalesce(p_scrittura, '{}'::jsonb);
  v_tolte text[] := '{}';
  v_vietata boolean;
  v_ammessi text[] := array['pos', 'duvri', 'avvio_cliente'];
  v_senza text[] := '{}';
  v_uid uuid := auth.uid();
  v_admin boolean := public.has_role(auth.uid(), 'super_admin'::public.app_role) or public.e_amministratore_di(p_company);
  v_pieno boolean;
begin
  v_pieno := coalesce(jsonb_array_length(case when jsonb_typeof(s->'contratti') = 'array' then s->'contratti' end), 0) > 0;
  if v_pieno and not (public.has_permission_for_company(v_uid, 'can_view_costs', p_company) is true
                      and public.has_permission_for_company(v_uid, 'can_view_subappaltatori_amministrazione', p_company) is true) then
    v_senza := v_senza || 'contratti_ditte'::text;
    s := jsonb_set(s, '{contratti}', '[]'::jsonb);
  end if;
  if not v_admin then
    if coalesce(jsonb_array_length(case when jsonb_typeof(s->'squadra') = 'array' then s->'squadra' end), 0) > 0 then
      v_senza := v_senza || 'squadra'::text;
      s := jsonb_set(s, '{squadra}', '[]'::jsonb);
    end if;
    if jsonb_typeof(s->'condizioni') = 'object' and s->'condizioni' <> '{}'::jsonb then
      v_senza := v_senza || 'condizioni'::text;
      s := s - 'condizioni';
    end if;
  end if;
  if coalesce(jsonb_array_length(case when jsonb_typeof(s->'adempimenti') = 'array' then s->'adempimenti' end), 0) > 0
     and public.has_permission_for_company(v_uid, 'can_view_sicurezza_cantiere', p_company) is not true then
    v_senza := v_senza || 'adempimenti'::text;
    s := jsonb_set(s, '{adempimenti}', '[]'::jsonb);
  end if;
  if coalesce(jsonb_array_length(case when jsonb_typeof(s->'oda') = 'array' then s->'oda' end), 0) > 0
     and public.has_permission_for_company(v_uid, 'can_view_costs', p_company) is not true then
    v_senza := v_senza || 'ordini'::text;
    s := jsonb_set(s, '{oda}', '[]'::jsonb);
  end if;
  -- Chi non vede gli importi non li scrive (P2): con «Completa» sovrascriverebbe uno 0 che non
  -- vede, con «Crea» da preventivo quello che il preventivo ha copiato.
  if public.has_permission_for_company(v_uid, 'can_view_order_amounts', p_company) is not true then
    if s->'ordine' ?| array['total_amount', 'vat_rate']
       or coalesce(jsonb_array_length(case when jsonb_typeof(s->'rate') = 'array' then s->'rate' end), 0) > 0 then
      v_senza := v_senza || 'importi'::text;
    end if;
    s := s #- '{ordine,total_amount}' #- '{ordine,vat_rate}';
    if s ? 'rate' then s := jsonb_set(s, '{rate}', '[]'::jsonb); end if;
    if s ? 'righe' then s := jsonb_set(s, '{righe}', public._silvio_togli_chiavi(s->'righe', array['unit_price', 'discount_percent'])); end if;
    if s ? 'fasi' then s := jsonb_set(s, '{fasi}', public._silvio_togli_dalle_sottofasi(s->'fasi', array['importo'])); end if;
  end if;
  if public.has_permission_for_company(v_uid, 'can_view_costs', p_company) is not true then
    if s ? 'ditte' then s := jsonb_set(s, '{ditte}', public._silvio_togli_chiavi(s->'ditte', array['costo_previsto'])); end if;
    if s ? 'righe' then s := jsonb_set(s, '{righe}', public._silvio_togli_chiavi(s->'righe', array['purchase_price', 'standard_cost'])); end if;
    if s ? 'fasi' then s := jsonb_set(s, '{fasi}', public._silvio_togli_dalle_sottofasi(s->'fasi', array['costo'])); end if;
  end if;
  if cardinality(v_senza) > 0 then
    s := s || jsonb_build_object('tolte_permessi', to_jsonb(v_senza));
  end if;

  if public._silvio_livello(p_company, 'squadra') = 'vietata' then
    if jsonb_array_length(coalesce(nullif(s->'squadra', 'null'::jsonb), '[]')) > 0 or s->'ordine' ? 'capomastro_user_id' then
      v_tolte := v_tolte || 'squadra'::text;
    end if;
    s := jsonb_set(s, '{squadra}', '[]'::jsonb) #- '{ordine,capomastro_user_id}';
  end if;
  if public._silvio_livello(p_company, 'mezzi') = 'vietata' then
    if jsonb_array_length(coalesce(nullif(s->'mezzi', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'mezzi'::text; end if;
    s := jsonb_set(s, '{mezzi}', '[]'::jsonb);
  end if;
  if public._silvio_livello(p_company, 'ordini') = 'vietata' then
    if jsonb_array_length(coalesce(nullif(s->'oda', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'ordini'::text; end if;
    s := jsonb_set(s, '{oda}', '[]'::jsonb);
  end if;
  -- Il contratto segue la ditta: con le ditte vietate non c'è contratto.
  v_vietata := public._silvio_livello(p_company, 'ditte') = 'vietata';
  if v_vietata then
    if jsonb_array_length(coalesce(nullif(s->'ditte', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'ditte'::text; end if;
    s := jsonb_set(s, '{ditte}', '[]'::jsonb);
  end if;
  if v_vietata or public._silvio_livello(p_company, 'contratti_ditte') = 'vietata' then
    if jsonb_array_length(coalesce(nullif(s->'contratti', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'contratti_ditte'::text; end if;
    s := jsonb_set(s, '{contratti}', '[]'::jsonb);
  end if;
  if public._silvio_livello(p_company, 'promemoria') = 'vietata' then
    v_ammessi := array_remove(array_remove(v_ammessi, 'pos'), 'duvri');
    if jsonb_array_length(coalesce(nullif(s->'adempimenti', 'null'::jsonb), '[]')) > 0 then v_tolte := v_tolte || 'promemoria'::text; end if;
    s := jsonb_set(s, '{adempimenti}', '[]'::jsonb);
  end if;
  if public._silvio_livello(p_company, 'avvio_cliente') = 'vietata' then
    v_ammessi := array_remove(v_ammessi, 'avvio_cliente');
  end if;
  -- Un elenco di tipi ammessi, non di vietati (revisione 1/11, S3): prima si toglievano solo
  -- «pos» e «duvri», e un `{"tipo":"cartello"}` scritto a mano passava anche coi promemoria
  -- vietati. Un tipo che Silvio non conosce non entra mai.
  if jsonb_typeof(s->'promemoria') = 'array' then
    if exists (select 1 from jsonb_array_elements(s->'promemoria') p where not (coalesce(p->>'tipo', '') = any (v_ammessi))) then
      v_tolte := v_tolte || (select array_agg(distinct case when p->>'tipo' = 'avvio_cliente' then 'avvio_cliente' else 'promemoria' end)
                               from jsonb_array_elements(s->'promemoria') p where not (coalesce(p->>'tipo', '') = any (v_ammessi)));
    end if;
    s := jsonb_set(s, '{promemoria}', coalesce(
      (select jsonb_agg(p) from jsonb_array_elements(s->'promemoria') p where coalesce(p->>'tipo', '') = any (v_ammessi)), '[]'::jsonb));
  end if;
  if cardinality(v_tolte) > 0 then
    s := s || jsonb_build_object('tolte_autonomia', to_jsonb((select array_agg(distinct t) from unnest(v_tolte) t)));
  end if;
  return s;
end
$$;
revoke all on function public._silvio_scrittura_permessa(uuid, jsonb) from public, anon, authenticated;

-- ── Lettura: le scelte, il calendario e le chiusure dell'azienda ──────────────
-- Per il popup (chi modifica le commesse) e per la pagina (chi vede le impostazioni
-- delle commesse). Le righe che mancano tornano come «chiede».
create or replace function public.silvio_autonomia_leggi(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501';
  end if;
  if p_company_id is distinct from public.get_effective_company_id()
     or (public.has_permission_for_company(v_uid, 'can_edit_orders', p_company_id) is not true
         and public.has_permission_for_company(v_uid, 'can_view_settings_orders', p_company_id) is not true) then
    raise exception 'Non hai il permesso di vedere le impostazioni delle commesse di questa azienda.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'azioni', (select coalesce(jsonb_agg(jsonb_build_object(
                 'azione', c.azione, 'massimo', c.massimo,
                 'livello', public._silvio_livello(p_company_id, c.azione),
                 'soglia_eur', a.soglia_eur, 'aggiornata_il', a.updated_at) order by c.azione), '[]'::jsonb)
                 from public._silvio_azioni_autonomia() c
                 left join public.silvio_autonomia a on a.company_id = p_company_id and a.azione = c.azione),
    'calendario', (select to_jsonb(k) - 'company_id' - 'updated_by' from public.silvio_calendario k where k.company_id = p_company_id),
    'festivita', (select coalesce(jsonb_agg(jsonb_build_object('data', f.data, 'descrizione', f.descrizione, 'ricorrente', coalesce(f.ricorrente, false)) order by f.data), '[]'::jsonb)
                    from public.hr_festivita f where f.company_id = p_company_id)
  );
end
$$;
revoke all on function public.silvio_autonomia_leggi(uuid) from public, anon;
grant execute on function public.silvio_autonomia_leggi(uuid) to authenticated;

-- ── Scrittura: tutte le scelte in una volta, dalla pagina in Impostazioni ─────
-- p_azioni: [{ azione, livello, soglia_eur }] · p_calendario: { chiusura_dal, chiusura_al,
-- patrono, patrono_nome, sabato_lavorativo } o null per lasciarlo com'è.
create or replace function public.silvio_autonomia_salva(p_company_id uuid, p_azioni jsonb, p_calendario jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_uid uuid := auth.uid();
  x jsonb;
  v_azione text;
  v_livello text;
  v_soglia numeric;
  v_n integer := 0;
begin
  if v_uid is null then
    raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode = '42501';
  end if;
  if p_company_id is distinct from public.get_effective_company_id()
     or public.has_permission_for_company(v_uid, 'can_edit_settings_orders', p_company_id) is not true then
    raise exception 'Non hai il permesso di cambiare le impostazioni delle commesse di questa azienda.' using errcode = '42501';
  end if;
  if p_azioni is not null and jsonb_typeof(p_azioni) <> 'array' then
    raise exception 'Le scelte vanno mandate come elenco.' using errcode = '22023';
  end if;

  for x in select value from jsonb_array_elements(coalesce(p_azioni, '[]'::jsonb)) loop
    v_azione := x->>'azione';
    v_livello := x->>'livello';
    if not exists (select 1 from public._silvio_azioni_autonomia() c where c.azione = v_azione) then
      raise exception '«%»: Silvio non fa mai questa azione da solo, e non si può cambiare.', coalesce(v_azione, '?') using errcode = '42501';
    end if;
    if not public._silvio_livello_ammesso(v_azione, v_livello) then
      raise exception '«%»: questa azione non può andare oltre «Chiede».', v_azione using errcode = '42501';
    end if;
    v_soglia := nullif(x->>'soglia_eur', '')::numeric;
    if v_soglia is not null and v_soglia < 0 then
      raise exception 'La soglia non può essere negativa.' using errcode = '22023';
    end if;
    insert into public.silvio_autonomia (company_id, azione, livello, soglia_eur, updated_by, updated_at)
    values (p_company_id, v_azione, v_livello, case when v_azione = 'ordini' then round(v_soglia, 2) end, v_uid, now())
    on conflict (company_id, azione) do update
      set livello = excluded.livello, soglia_eur = excluded.soglia_eur, updated_by = v_uid, updated_at = now()
      where (silvio_autonomia.livello, silvio_autonomia.soglia_eur) is distinct from (excluded.livello, excluded.soglia_eur);
    v_n := v_n + 1;
  end loop;

  if p_calendario is not null and jsonb_typeof(p_calendario) = 'object' then
    insert into public.silvio_calendario (company_id, chiusura_dal, chiusura_al, patrono, patrono_nome, sabato_lavorativo, updated_by, updated_at)
    values (p_company_id, nullif(p_calendario->>'chiusura_dal', ''), nullif(p_calendario->>'chiusura_al', ''),
            nullif(p_calendario->>'patrono', ''), left(nullif(btrim(p_calendario->>'patrono_nome'), ''), 80),
            coalesce((p_calendario->>'sabato_lavorativo')::boolean, false), v_uid, now())
    on conflict (company_id) do update
      set chiusura_dal = excluded.chiusura_dal, chiusura_al = excluded.chiusura_al, patrono = excluded.patrono,
          patrono_nome = excluded.patrono_nome, sabato_lavorativo = excluded.sabato_lavorativo, updated_by = v_uid, updated_at = now();
  end if;

  -- Una parte del piano di volo appena vietata chiude le sue proposte aperte (revisione 1/11,
  -- S4): non devono restare sulla commessa con un «Conferma» che il titolare ha tolto. La
  -- tabella nasce con la migrazione successiva (20281106141000).
  if to_regclass('public.silvio_piano_volo') is not null then
    execute $q$
      update public.silvio_piano_volo set stato = 'scaduta', updated_at = now()
       where company_id = $1 and stato = 'aperta'
         and ((tipo = 'controllo' and public._silvio_livello($1, 'controllo_fase') = 'vietata')
           or (tipo = 'sal' and public._silvio_livello($1, 'proposta_sal') = 'vietata'))
    $q$ using p_company_id;
  end if;

  return jsonb_build_object('azioni', v_n);
end
$$;
revoke all on function public.silvio_autonomia_salva(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.silvio_autonomia_salva(uuid, jsonb, jsonb) to authenticated;
