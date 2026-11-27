-- Rendiconto giornaliero: il foglio di economia per il committente, separato dal rapportino
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Piano: docs/piano-rendiconto-giornaliero-20261127.md
--
-- Il rapportino è il diario interno del cantiere (ore, mezzi, avanzamento, materiali): i
-- valori che porta non contano più per il committente. Il rendiconto giornaliero è un
-- documento suo, si scrive direttamente (senza passare dal rapportino) oppure nasce in bozza
-- da un rapportino già scritto. Il rendiconto del periodo (appalto_sal) resta com'è: somma
-- le righe `confermata` senza sal_id, che ora arrivano dai rendiconti giornalieri confermati.
--
-- Le righe restano in appalto_rendiconto_righe (stesso SAL, stesso PDF, stessa fattura);
-- la testata del giorno è rendiconti_giornalieri.
--
-- Idempotente. Nessuna scrittura di dati esistenti.

-- 1. Testata del giorno ─────────────────────────────────────────────────────────────────────
create table if not exists public.rendiconti_giornalieri (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  data date not null default current_date,
  numero integer not null,
  stato text not null default 'bozza' check (stato in ('bozza', 'confermato', 'annullato')),
  descrizione_lavori text,
  note text,
  rapportino_id uuid references public.campo_rapportini(id) on delete set null,
  accettato_da_nome text,
  accettato_il date,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confermato_da uuid,
  confermato_at timestamptz,
  annullato_da uuid,
  annullato_at timestamptz
);

create unique index if not exists rendiconti_giornalieri_numero
  on public.rendiconti_giornalieri (order_id, numero);
-- Un rapportino diventa al massimo un rendiconto vivo.
create unique index if not exists rendiconti_giornalieri_un_rapportino
  on public.rendiconti_giornalieri (rapportino_id)
  where rapportino_id is not null and stato <> 'annullato';
create index if not exists rendiconti_giornalieri_commessa
  on public.rendiconti_giornalieri (company_id, order_id, data desc);

alter table public.rendiconti_giornalieri enable row level security;

drop policy if exists rg_lettura on public.rendiconti_giornalieri;
create policy rg_lettura on public.rendiconti_giornalieri for select to authenticated
  using (
    not (select public.utente_e_cliente_esterno())
    and not (select public.utente_bloccato())
    and public.puo_vedere_commessa(order_id)
    and public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', company_id)
  );
-- Si scrive solo dalle funzioni qui sotto.
revoke all on public.rendiconti_giornalieri from anon;
revoke insert, update, delete on public.rendiconti_giornalieri from authenticated;
grant select on public.rendiconti_giornalieri to authenticated;

-- 2. Righe: legame alla testata e provenienza del prezzo ──────────────────────────────────────
alter table public.appalto_rendiconto_righe
  add column if not exists rendiconto_giornaliero_id uuid references public.rendiconti_giornalieri(id) on delete cascade,
  add column if not exists categoria text,
  add column if not exists listino_voce_id uuid references public.tariffe_aziendali(id) on delete set null,
  add column if not exists prezzo_fonte text,
  add column if not exists prezzo_a_mano boolean not null default false,
  add column if not exists ordine integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appalto_rendiconto_righe_categoria_check') then
    alter table public.appalto_rendiconto_righe add constraint appalto_rendiconto_righe_categoria_check
      check (categoria is null or categoria in ('manodopera', 'mezzo', 'trasporto', 'materiale', 'voce'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appalto_rendiconto_righe_prezzo_fonte_check') then
    alter table public.appalto_rendiconto_righe add constraint appalto_rendiconto_righe_prezzo_fonte_check
      check (prezzo_fonte is null or prezzo_fonte in ('cantiere', 'committente', 'generale', 'manuale', 'mancante'));
  end if;
end $$;

create index if not exists appalto_rendiconto_giornaliero_idx
  on public.appalto_rendiconto_righe (rendiconto_giornaliero_id) where rendiconto_giornaliero_id is not null;

-- Le colonne nuove le legge il browser (le righe hanno la lettura per tabella, non per colonna:
-- se un giorno passassero al GRANT per colonna, vanno aggiunte qui).

-- 3. Il trigger che riscriveva il prezzo dal contratto non tocca le righe del giornaliero ──────
-- Il prezzo del giornaliero lo calcola rendiconto_giornaliero_salva con la regola unica
-- (cantiere → committente → generale → a mano) e non pretende il contratto sulla commessa:
-- il listino del committente arriva anche da orders.customer_id.
-- Resta SECURITY DEFINER con search_path '' come in produzione: legge orders, che la
-- restrittiva office_financial_select nasconde a chi non ha importi + costi + margini.
create or replace function public.appalto_rendiconto_prepara()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
  new.company_id := v_ord.company_id;

  if new.fase_id is not null and not exists (
    select 1 from public.order_work_phases f
     where f.id = new.fase_id and f.order_id = new.order_id
  ) then
    raise exception 'La fase deve appartenere a questa commessa' using errcode = '23514';
  end if;

  -- Riga di un rendiconto giornaliero: prezzo e descrizione sono quelli scritti.
  if new.rendiconto_giornaliero_id is not null then
    new.extra_contratto := coalesce(new.extra_contratto, false);
    return new;
  end if;

  if new.tariffa_id is null then
    if v_ord.appalto_contratto_id is null then
      new.extra_contratto := false;
    else
      new.extra_contratto := true;
    end if;
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
  new.extra_contratto := coalesce(new.extra_contratto, false);

  if v_t.tariffa_id is not null then
    select coalesce(ta.costo_interno, ta.prezzo_costo) into v_costo
      from public.tariffe_aziendali ta where ta.id = v_t.tariffa_id;
    if v_costo is not null and v_costo > 0 then
      new.costo_interno := round(new.quantita * v_costo, 2);
    end if;
  end if;

  return new;
end;
$function$;

-- 4. Le righe del giornaliero si toccano solo dal giornaliero
-- (importo e margine sono colonne generate: in un trigger BEFORE valgono null in NEW, vanno escluse
-- dal confronto; una colonna generata nuova va aggiunta qui) ─────────────────────────────────
-- Il rendiconto del periodo può ancora cambiare stato e sal_id (lo fa appalto_sal_crea).
-- Definer: la testata si cerca senza RLS, così una riga non resta scoperta se chi la tocca
-- non vede la testata.
create or replace function private.rendiconto_giornaliero_righe_guardia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_rg uuid := coalesce(case when tg_op <> 'INSERT' then old.rendiconto_giornaliero_id end,
                        case when tg_op <> 'DELETE' then new.rendiconto_giornaliero_id end);
  v_testata record;
begin
  if v_rg is null or coalesce(current_setting('eic.rendiconto_giornaliero', true), '') = '1' then
    return coalesce(new, old);
  end if;
  -- Cascate e «set null» delle chiavi esterne (testata, commessa, persona, mezzo, fase, listino
  -- cancellati, purga dell'azienda) arrivano da un trigger di sistema: passano.
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;
  select numero, stato into v_testata from public.rendiconti_giornalieri where id = v_rg;
  if not found then
    return coalesce(new, old);
  end if;
  -- Il rendiconto del periodo (appalto_sal_crea, annullo, fattura) sposta solo stato e sal_id,
  -- e solo su righe di un giornaliero già confermato: mai da bozza a confermata o indietro.
  if tg_op = 'UPDATE'
     and v_testata.stato = 'confermato'
     and new.rendiconto_giornaliero_id is not distinct from old.rendiconto_giornaliero_id
     and old.stato in ('confermata', 'in_sal', 'fatturata')
     and new.stato in ('confermata', 'in_sal', 'fatturata')
     and (to_jsonb(new) - array['stato','sal_id','importo','margine','updated_at','confermata_da','confermata_at'])
         = (to_jsonb(old) - array['stato','sal_id','importo','margine','updated_at','confermata_da','confermata_at']) then
    return new;
  end if;
  raise exception 'Questa riga fa parte del rendiconto del giorno n. %: si modifica da lì', v_testata.numero
    using errcode = '42501';
end;
$function$;

revoke all on function private.rendiconto_giornaliero_righe_guardia() from public, anon, authenticated;

drop trigger if exists trg_rendiconto_giornaliero_righe_guardia on public.appalto_rendiconto_righe;
create trigger trg_rendiconto_giornaliero_righe_guardia
  before insert or update or delete on public.appalto_rendiconto_righe
  for each row execute function private.rendiconto_giornaliero_righe_guardia();

-- 5. Permesso unico per scrivere un giornaliero ───────────────────────────────────────────────
create or replace function private.rendiconto_giornaliero_puo_scrivere(p_order uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $function$
declare v_company uuid;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order and o.deleted_at is null;
  if v_company is null then
    raise exception 'Commessa inesistente' using errcode = '23514';
  end if;
  if auth.uid() is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_company)
     or not public.puo_modificare_commessa(p_order)
     or not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_company) then
    raise exception 'Non puoi scrivere il rendiconto di questa commessa' using errcode = '42501';
  end if;
  return v_company;
end;
$function$;

revoke all on function private.rendiconto_giornaliero_puo_scrivere(uuid) from public, anon, authenticated;

-- 6. Prezzo di una voce di listino per la commessa e il giorno (regola unica) ─────────────────
-- Restituisce {prezzo, fonte, unita, descrizione, codice, appalto_tariffa_id, costo_unitario}.
create or replace function private.rendiconto_giornaliero_prezzo(p_order uuid, p_listino uuid, p_data date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select case when p_listino is null then null
              else private.prezzo_voce_commessa_raw(p_order, p_listino, p_data) end;
$function$;

revoke all on function private.rendiconto_giornaliero_prezzo(uuid, uuid, date) from public, anon, authenticated;

-- 7. Salva: testata + righe in un colpo (solo in bozza) ───────────────────────────────────────
-- p = {id?, order_id, data, descrizione_lavori?, note?, righe: [{categoria, descrizione, unita,
--      quantita, prezzo_unitario?, prezzo_a_mano?, listino_voce_id?, employee_id?, mezzo_id?,
--      fase_id?, maggiorazione_pct?, note?}]}
-- Il prezzo di una riga col listino si ricalcola, salvo prezzo_a_mano. Senza listino e senza
-- prezzo resta 0 con fonte «mancante»: la conferma lo rifiuta.
create or replace function public.rendiconto_giornaliero_salva(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_order uuid := nullif(p->>'order_id', '')::uuid;
  v_data date := coalesce(nullif(p->>'data', '')::date, current_date);
  v_company uuid;
  v_rg record;
  v_r jsonb;
  v_i integer := 0;
  v_listino uuid;
  v_prezzo jsonb;
  v_a_mano boolean;
  v_pu numeric;
  v_fonte text;
  v_q numeric;
  v_unita text;
  v_descr text;
  v_costo_u numeric;
  v_emp uuid;
  v_mezzo uuid;
begin
  if v_id is not null then
    select * into v_rg from public.rendiconti_giornalieri where id = v_id for update;
    if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
    v_order := v_rg.order_id;
  end if;
  if v_order is null then raise exception 'Manca la commessa' using errcode = '22023'; end if;
  v_company := private.rendiconto_giornaliero_puo_scrivere(v_order);

  if v_id is not null then
    if v_rg.stato <> 'bozza' then
      raise exception 'Il rendiconto n. % è %: riaprilo per modificarlo', v_rg.numero, v_rg.stato using errcode = '23514';
    end if;
  end if;

  perform set_config('eic.rendiconto_giornaliero', '1', true);

  if v_id is null and nullif(p->>'rapportino_id', '') is not null and not exists (
    select 1 from public.campo_rapportini cr
     where cr.id = (p->>'rapportino_id')::uuid and cr.order_id = v_order) then
    raise exception 'Il rapportino non è di questa commessa' using errcode = '23514';
  end if;

  if v_id is null then
    perform pg_advisory_xact_lock(hashtextextended('rendiconto_giornaliero:' || v_order::text, 0));
    insert into public.rendiconti_giornalieri (company_id, order_id, data, numero, descrizione_lavori, note, rapportino_id)
    values (v_company, v_order, v_data,
            (select coalesce(max(numero), 0) + 1 from public.rendiconti_giornalieri where order_id = v_order),
            nullif(btrim(p->>'descrizione_lavori'), ''), nullif(btrim(p->>'note'), ''),
            nullif(p->>'rapportino_id', '')::uuid)
    returning id into v_id;
  else
    update public.rendiconti_giornalieri
       set data = v_data,
           descrizione_lavori = case when p ? 'descrizione_lavori' then nullif(btrim(p->>'descrizione_lavori'), '') else descrizione_lavori end,
           note = case when p ? 'note' then nullif(btrim(p->>'note'), '') else note end,
           updated_at = now()
     where id = v_id;
  end if;

  delete from public.appalto_rendiconto_righe where rendiconto_giornaliero_id = v_id;

  for v_r in select value from jsonb_array_elements(coalesce(p->'righe', '[]'::jsonb)) loop
    v_i := v_i + 1;
    v_q := coalesce(nullif(replace(v_r->>'quantita', ',', '.'), '')::numeric, 0);
    if v_q <= 0 then
      raise exception 'La riga «%» ha quantità 0: scrivila o toglila', coalesce(nullif(btrim(v_r->>'descrizione'), ''), 'senza nome')
        using errcode = '22023';
    end if;
    v_listino := nullif(v_r->>'listino_voce_id', '')::uuid;
    if v_listino is not null and not exists (
      select 1 from public.tariffe_aziendali t where t.id = v_listino and t.company_id = v_company) then
      raise exception 'Voce di listino non trovata' using errcode = '23514';
    end if;
    v_emp := nullif(v_r->>'employee_id', '')::uuid;
    if v_emp is not null and not exists (select 1 from public.employees e where e.id = v_emp and e.company_id = v_company) then
      raise exception 'Persona non trovata in azienda' using errcode = '23514';
    end if;
    v_mezzo := nullif(v_r->>'mezzo_id', '')::uuid;
    if v_mezzo is not null and not exists (select 1 from public.mezzi m where m.id = v_mezzo and m.company_id = v_company) then
      raise exception 'Mezzo non trovato in azienda' using errcode = '23514';
    end if;

    v_a_mano := coalesce((v_r->>'prezzo_a_mano')::boolean, false);
    v_pu := nullif(replace(v_r->>'prezzo_unitario', ',', '.'), '')::numeric;
    v_prezzo := private.rendiconto_giornaliero_prezzo(v_order, v_listino, v_data);
    v_descr := coalesce(nullif(btrim(v_r->>'descrizione'), ''), v_prezzo->>'descrizione', 'Voce');
    v_unita := coalesce(nullif(btrim(v_r->>'unita'), ''), v_prezzo->>'unita', 'cad');
    v_costo_u := nullif(v_prezzo->>'costo_unitario', '')::numeric;

    if v_a_mano or v_listino is null then
      v_fonte := case when v_pu is not null and (v_a_mano or v_pu > 0) then 'manuale' else 'mancante' end;
      v_pu := coalesce(v_pu, 0);
      v_a_mano := v_fonte = 'manuale';
    else
      v_fonte := coalesce(v_prezzo->>'fonte', 'mancante');
      v_pu := coalesce(nullif(v_prezzo->>'prezzo', '')::numeric, 0);
    end if;
    if v_pu < 0 then raise exception 'Il prezzo non può essere negativo' using errcode = '22023'; end if;

    insert into public.appalto_rendiconto_righe (
      order_id, data, tariffa_id, descrizione, unita_misura, prezzo_unitario, quantita,
      maggiorazione_pct, costo_interno, employee_id, fase_id, origine, stato, note,
      mezzo_id, extra_contratto, rendiconto_giornaliero_id, categoria, listino_voce_id,
      prezzo_fonte, prezzo_a_mano, ordine)
    values (
      v_order, v_data,
      case when not v_a_mano then nullif(v_prezzo->>'appalto_tariffa_id', '')::uuid end,
      v_descr, v_unita, v_pu, v_q,
      coalesce(nullif(v_r->>'maggiorazione_pct', '')::numeric, 0),
      -- Il costo orario della persona NON si scrive qui: la riga la legge chi ha solo gli importi.
      case when v_emp is null and v_costo_u is not null then round(v_q * v_costo_u, 2) end,
      v_emp, nullif(v_r->>'fase_id', '')::uuid, 'manuale', 'bozza', nullif(btrim(v_r->>'note'), ''),
      v_mezzo, false, v_id,
      case when v_r->>'categoria' in ('manodopera','mezzo','trasporto','materiale','voce') then v_r->>'categoria'
           when v_emp is not null then 'manodopera' when v_mezzo is not null then 'mezzo' else 'voce' end,
      v_listino, v_fonte, v_a_mano, v_i);
  end loop;

  return v_id;
end;
$function$;

-- 8. Conferma / riapri / annulla ─────────────────────────────────────────────────────────────
create or replace function public.rendiconto_giornaliero_conferma(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_rg record; v_n integer; v_senza integer;
begin
  select * into v_rg from public.rendiconti_giornalieri where id = p_id for update;
  if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
  perform private.rendiconto_giornaliero_puo_scrivere(v_rg.order_id);
  if v_rg.stato = 'confermato' then return jsonb_build_object('id', p_id, 'stato', 'confermato'); end if;
  if v_rg.stato <> 'bozza' then raise exception 'Il rendiconto è annullato' using errcode = '23514'; end if;

  select count(*), count(*) filter (where prezzo_unitario = 0 and not prezzo_a_mano)
    into v_n, v_senza
    from public.appalto_rendiconto_righe where rendiconto_giornaliero_id = p_id;
  if v_n = 0 then raise exception 'Il rendiconto non ha righe' using errcode = '23514'; end if;
  if v_senza > 0 then
    raise exception 'Ci sono % righe senza prezzo: scrivilo, o scrivi 0 a mano se non si fanno pagare', v_senza
      using errcode = '23514';
  end if;

  perform set_config('eic.rendiconto_giornaliero', '1', true);
  update public.appalto_rendiconto_righe set stato = 'confermata'
   where rendiconto_giornaliero_id = p_id and stato = 'bozza';
  update public.rendiconti_giornalieri
     set stato = 'confermato', confermato_da = auth.uid(), confermato_at = now(), updated_at = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'stato', 'confermato', 'righe', v_n);
end;
$function$;

create or replace function public.rendiconto_giornaliero_riapri(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_rg record; v_sal integer;
begin
  select * into v_rg from public.rendiconti_giornalieri where id = p_id for update;
  if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
  perform private.rendiconto_giornaliero_puo_scrivere(v_rg.order_id);
  if v_rg.stato = 'bozza' then return jsonb_build_object('id', p_id, 'stato', 'bozza'); end if;
  if v_rg.stato = 'annullato' then raise exception 'Il rendiconto è annullato' using errcode = '23514'; end if;
  select min(s.numero) into v_sal
    from public.appalto_rendiconto_righe r join public.appalto_sal s on s.id = r.sal_id
   where r.rendiconto_giornaliero_id = p_id;
  if v_sal is not null then
    raise exception 'Il giorno è già nel rendiconto del periodo n. %: annulla quello per riaprirlo', v_sal
      using errcode = '23514';
  end if;
  perform set_config('eic.rendiconto_giornaliero', '1', true);
  update public.appalto_rendiconto_righe set stato = 'bozza' where rendiconto_giornaliero_id = p_id;
  update public.rendiconti_giornalieri
     set stato = 'bozza', confermato_da = null, confermato_at = null, updated_at = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'stato', 'bozza');
end;
$function$;

create or replace function public.rendiconto_giornaliero_annulla(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v_rg record;
begin
  select * into v_rg from public.rendiconti_giornalieri where id = p_id for update;
  if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
  perform private.rendiconto_giornaliero_puo_scrivere(v_rg.order_id);
  if v_rg.stato = 'confermato' then
    raise exception 'Il rendiconto è confermato: riaprilo prima di annullarlo' using errcode = '23514';
  end if;
  perform set_config('eic.rendiconto_giornaliero', '1', true);
  delete from public.appalto_rendiconto_righe where rendiconto_giornaliero_id = p_id;
  update public.rendiconti_giornalieri
     set stato = 'annullato', annullato_da = auth.uid(), annullato_at = now(), updated_at = now()
   where id = p_id;
  return jsonb_build_object('id', p_id, 'stato', 'annullato');
end;
$function$;

-- 9. Dal rapportino al rendiconto (bozza) ────────────────────────────────────────────────────
-- Persone × ore (prezzo: voce «ore» della commessa, orders.tariffa_manodopera_id),
-- ditte × ore (subappaltatori.tariffa_id), mezzi × ore (mezzi.tariffa_id),
-- voci libere (viaggio → trasporto) col loro prezzo, materiali senza prezzo.
-- Se il rapportino ha già un rendiconto vivo, restituisce quello.
create or replace function private.rendiconto_giornaliero_righe_da_rapportino(p_rapportino_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_r record; v_ord record; v_righe jsonb := '[]'::jsonb; v_p record; v_emp record;
begin
  select cr.* into v_r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then return '[]'::jsonb; end if;
  select o.tariffa_manodopera_id into v_ord from public.orders o where o.id = v_r.order_id;

  -- Persone
  for v_p in
    select case when p->>'employee_id' ~* '^[0-9a-f-]{36}$' then (p->>'employee_id')::uuid end as emp,
           case when p->>'subappaltatore_id' ~* '^[0-9a-f-]{36}$' then (p->>'subappaltatore_id')::uuid end as sub,
           coalesce(nullif(btrim(p->>'nome'), ''), 'Senza nome') as nome,
           case when p->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' then replace(p->>'ore', ',', '.')::numeric else 0 end as ore
      from jsonb_array_elements(case when jsonb_typeof(v_r.presenze) = 'array' then v_r.presenze else '[]'::jsonb end) p
  loop
    if v_p.ore <= 0 then continue; end if;
    v_righe := v_righe || jsonb_build_array(jsonb_build_object(
      'categoria', 'manodopera',
      'descrizione', v_p.nome,
      'unita', 'ora', 'quantita', v_p.ore,
      'employee_id', v_p.emp,
      'listino_voce_id', case when v_p.sub is not null
                              then (select s.tariffa_id from public.subappaltatori s where s.id = v_p.sub)
                              else v_ord.tariffa_manodopera_id end));
  end loop;

  -- Operaio da solo, senza elenco presenze: le ore del rapportino sono le sue.
  if jsonb_array_length(v_righe) = 0 and coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0) > 0 then
    select e.id, btrim(concat_ws(' ', e.first_name, e.last_name)) as nome into v_emp
      from public.employees e
     where e.user_id = v_r.user_id and e.company_id = v_r.company_id
     order by coalesce(e.is_active, true) desc, e.created_at limit 1;
    v_righe := v_righe || jsonb_build_array(jsonb_build_object(
      'categoria', 'manodopera',
      'descrizione', coalesce(nullif(v_emp.nome, ''), 'Autore del rapportino'),
      'unita', 'ora', 'quantita', coalesce(v_r.ore_lavorate, 0) + coalesce(v_r.ore_straordinario, 0),
      'employee_id', v_emp.id, 'listino_voce_id', v_ord.tariffa_manodopera_id));
  end if;

  -- Mezzi (senza ore: 1 ora da correggere, la conferma lo fa vedere)
  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', 'mezzo',
             'descrizione', coalesce(nullif(btrim(m->>'nome'), ''), mz.nome, 'Mezzo'),
             'unita', 'ora',
             'quantita', case when m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' and replace(m->>'ore', ',', '.')::numeric > 0
                              then replace(m->>'ore', ',', '.')::numeric else 1 end,
             'mezzo_id', mz.id, 'listino_voce_id', mz.tariffa_id,
             'note', case when not (m->>'ore' ~ '^[0-9]+([.,][0-9]+)?$' and replace(m->>'ore', ',', '.')::numeric > 0)
                          then 'Ore del mezzo non scritte nel rapportino: 1 da correggere' end))
      from jsonb_array_elements(case when jsonb_typeof(v_r.mezzi_usati) = 'array' then v_r.mezzi_usati else '[]'::jsonb end) m
      left join public.mezzi mz on mz.id = case when m->>'mezzo_id' ~* '^[0-9a-f-]{36}$' then (m->>'mezzo_id')::uuid end
                               and mz.company_id = v_r.company_id), '[]'::jsonb);

  -- Voci libere: il prezzo scritto nel rapportino vale come prezzo a mano, se c'era.
  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', case when v.viaggio is not null then 'trasporto' else 'voce' end,
             'descrizione', v.descrizione, 'unita', v.unita, 'quantita', v.quantita,
             'listino_voce_id', v.tariffa_id,
             'prezzo_unitario', v.vendita_unitaria,
             'prezzo_a_mano', coalesce(v.prezzo_a_mano, false) or (v.tariffa_id is null and coalesce(v.vendita_unitaria, 0) > 0))
           order by v.created_at)
      from public.rapportino_voci_libere v where v.rapportino_id = p_rapportino_id), '[]'::jsonb);

  -- Materiali: senza prezzo, li valorizza l'ufficio.
  v_righe := v_righe || coalesce((
    select jsonb_agg(jsonb_build_object(
             'categoria', 'materiale',
             'descrizione', coalesce(nullif(btrim(m->>'nome'), ''), 'Materiale'),
             'unita', coalesce(nullif(btrim(m->>'unita'), ''), 'cad'),
             'quantita', case when m->>'quantita' ~ '^[0-9]+([.,][0-9]+)?$' then replace(m->>'quantita', ',', '.')::numeric else 1 end))
      from jsonb_array_elements(case when jsonb_typeof(v_r.materiali_usati) = 'array' then v_r.materiali_usati else '[]'::jsonb end) m
     where coalesce(nullif(btrim(m->>'nome'), ''), '') <> ''), '[]'::jsonb);

  return v_righe;
end;
$function$;

revoke all on function private.rendiconto_giornaliero_righe_da_rapportino(uuid) from public, anon, authenticated;

create or replace function public.rendiconto_giornaliero_da_rapportino(p_rapportino_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare v_r record; v_id uuid;
begin
  select cr.id, cr.order_id, cr.data_lavoro, cr.stato, cr.annullato_at, cr.descrizione_lavori
    into v_r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then raise exception 'Rapportino inesistente' using errcode = '23514'; end if;
  perform private.rendiconto_giornaliero_puo_scrivere(v_r.order_id);
  if v_r.annullato_at is not null or v_r.stato = 'rifiutato' then
    raise exception 'Il rapportino è rifiutato o annullato: non diventa un rendiconto' using errcode = '23514';
  end if;

  select id into v_id from public.rendiconti_giornalieri
   where rapportino_id = p_rapportino_id and stato <> 'annullato';
  if v_id is not null then return v_id; end if;

  return public.rendiconto_giornaliero_salva(jsonb_build_object(
    'order_id', v_r.order_id,
    'data', v_r.data_lavoro,
    'descrizione_lavori', v_r.descrizione_lavori,
    'rapportino_id', v_r.id,
    'righe', private.rendiconto_giornaliero_righe_da_rapportino(v_r.id)));
end;
$function$;

-- In blocco: i rapportini (non rifiutati, non annullati, senza rendiconto vivo) di una commessa,
-- in un periodo. Con p_prova conta e non scrive. Salta i rapportini che il vecchio meccanismo
-- aveva già portato nel rendiconto (righe con rapportino_id), per non contarli due volte.
create or replace function public.rendiconti_giornalieri_da_rapportini(
  p_order_id uuid, p_dal date default null, p_al date default null, p_prova boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare v record; v_creati integer := 0; v_gia integer := 0; v_vecchi integer := 0; v_ids uuid[] := '{}';
        v_errori jsonb := '[]'::jsonb;
begin
  perform private.rendiconto_giornaliero_puo_scrivere(p_order_id);
  for v in
    select cr.id,
           exists (select 1 from public.rendiconti_giornalieri g where g.rapportino_id = cr.id and g.stato <> 'annullato') as ha_rg,
           exists (select 1 from public.appalto_rendiconto_righe rr where rr.rapportino_id = cr.id and rr.rendiconto_giornaliero_id is null) as ha_vecchie
      from public.campo_rapportini cr
     where cr.order_id = p_order_id
       and cr.annullato_at is null
       and cr.stato in ('inviato', 'approvato')
       and (p_dal is null or cr.data_lavoro >= p_dal)
       and (p_al is null or cr.data_lavoro <= p_al)
     order by cr.data_lavoro, cr.created_at
  loop
    if v.ha_rg then v_gia := v_gia + 1; continue; end if;
    if v.ha_vecchie then v_vecchi := v_vecchi + 1; continue; end if;
    if p_prova then
      v_creati := v_creati + 1;
    else
      begin
        v_ids := v_ids || public.rendiconto_giornaliero_da_rapportino(v.id);
        v_creati := v_creati + 1;
      exception when others then
        v_errori := v_errori || jsonb_build_array(jsonb_build_object('rapportino_id', v.id, 'errore', sqlerrm));
      end;
    end if;
  end loop;
  return jsonb_build_object('prova', p_prova, 'da_creare', v_creati, 'gia_fatti', v_gia,
                            'gia_nel_rendiconto', v_vecchi, 'creati', v_ids, 'errori', v_errori);
end;
$function$;

-- 10. Il rapportino non scrive più nel rendiconto ─────────────────────────────────────────────
-- Interruttore unico: false dal 27/11/2026. Per tornare indietro basta farlo rendere true.
create or replace function private.rendiconto_dai_rapportini()
returns boolean language sql immutable as $$ select false $$;
-- Lo legge anche un trigger che gira coi diritti di chi approva: EXECUTE ad authenticated.
revoke all on function private.rendiconto_dai_rapportini() from public, anon;
grant execute on function private.rendiconto_dai_rapportini() to authenticated;

create or replace function public.appalto_rendiconto_da_rapportino()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_errore text;
begin
  if not private.rendiconto_dai_rapportini() then return new; end if;
  if not (coalesce(new.approvato, false) and not coalesce(old.approvato, false)) then return new; end if;
  begin
    perform public.appalto_rendiconto_crea_righe(new.id);
  exception when others then
    v_errore := sqlerrm;
    raise warning 'rendiconto dal rapportino % non creato: %', new.id, v_errore;
  end;
  return new;
end; $function$;

-- Anche la via manuale («Crea riga» / appalto_rendiconto_recupera) passa di qui: con
-- l'interruttore spento non crea più righe dal rapportino.
create or replace function public.appalto_rendiconto_crea_righe(p_rapportino_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare v_r record; v record; v_n integer := 0;
begin
  if not private.rendiconto_dai_rapportini() then return 0; end if;
  select cr.order_id, cr.data_lavoro into v_r from public.campo_rapportini cr where cr.id = p_rapportino_id;
  if not found then return 0; end if;
  for v in select * from public.appalto_righe_da_rapportino_calcola(p_rapportino_id) c where c.motivo is null and c.tariffa_id is not null loop
    if exists (select 1 from public.appalto_rendiconto_righe rr where (rr.rapportino_id = p_rapportino_id and rr.employee_id is not distinct from v.employee_id and rr.maggiorazione_pct = v.maggiorazione_pct) or (rr.rapportino_id is null and rr.order_id = v_r.order_id and rr.data = v_r.data_lavoro and v.employee_id is not null and rr.employee_id = v.employee_id)) then continue; end if;
    insert into public.appalto_rendiconto_righe (order_id, data, tariffa_id, quantita, maggiorazione_pct, employee_id, fase_id, origine, rapportino_id, stato, descrizione, unita_misura, prezzo_unitario, costo_interno, note)
    values (v_r.order_id, v_r.data_lavoro, v.tariffa_id, v.quantita, v.maggiorazione_pct, v.employee_id, null, 'rapportino', p_rapportino_id, 'bozza', '—', 'cad', 0, v.costo_interno, v.persona);
    v_n := v_n + 1;
  end loop;
  return v_n;
end; $function$;

-- La voce libera continua a scrivere il COSTO (company_costs, Controllo di gestione); la vendita
-- non va più nel rendiconto: le righe in bozza già nate restano finché qualcuno non le toglie.
create or replace function public.rapportino_voce_applica(p_voce_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare v public.rapportino_voci_libere%rowtype; v_r record; v_costo numeric; v_cost_id uuid; v_ric numeric;
begin
  select * into v from public.rapportino_voci_libere where id = p_voce_id;
  if not found then return; end if;
  select cr.approvato, cr.data_lavoro into v_r from public.campo_rapportini cr where cr.id = v.rapportino_id;
  if not coalesce(v_r.approvato, false) then
    perform public.rapportino_voce_ritira(v);
    update public.rapportino_voci_libere set company_cost_id = null where id = v.id and company_cost_id is not null;
    return;
  end if;

  v_costo := round(v.quantita * coalesce(v.costo_unitario, 0), 2);
  if v_costo > 0 then
    if v.company_cost_id is not null then
      update public.company_costs set name = v.descrizione, amount = v_costo, due_date = v_r.data_lavoro where id = v.company_cost_id;
    else
      insert into public.company_costs (company_id, name, cost_type, amount, recurrence, due_date, is_paid, paid_date, category, notes, order_id, senza_fattura)
      values (v.company_id, v.descrizione, 'variable', v_costo, 'once', v_r.data_lavoro, true, v_r.data_lavoro, 'Rapportino', 'Voce libera del rapportino', v.order_id, true)
      returning id into v_cost_id;
      update public.rapportino_voci_libere set company_cost_id = v_cost_id where id = v.id;
    end if;
  elsif v.company_cost_id is not null then
    delete from public.company_costs where id = v.company_cost_id;
    update public.rapportino_voci_libere set company_cost_id = null where id = v.id;
  end if;

  if not private.rendiconto_dai_rapportini() then return; end if;

  v_ric := coalesce(v.vendita_unitaria, 0);
  if v_ric <= 0 then
    delete from public.appalto_rendiconto_righe where voce_libera_id = v.id and stato = 'bozza';
    return;
  end if;
  if exists (select 1 from public.appalto_rendiconto_righe r where r.voce_libera_id = v.id and r.stato <> 'bozza') then
    raise exception 'La voce «%» e'' gia'' in un rendiconto confermato', v.descrizione using errcode = '23514';
  end if;
  delete from public.appalto_rendiconto_righe where voce_libera_id = v.id;
  insert into public.appalto_rendiconto_righe (
    order_id, data, tariffa_id, quantita, employee_id, fase_id, origine, rapportino_id,
    stato, descrizione, unita_misura, prezzo_unitario, costo_interno, note, voce_libera_id, extra_contratto)
  values (
    v.order_id, v_r.data_lavoro, v.appalto_tariffa_id, v.quantita, null, null,
    'rapportino', v.rapportino_id,
    'bozza', v.descrizione, v.unita, v_ric, nullif(v_costo, 0),
    case when v.appalto_tariffa_id is not null then 'Voce del rapportino, dal listino concordato' else 'Voce del rapportino' end,
    v.id,
    false);
end; $function$;

-- 11. Elenco per la scheda Rendiconti ─────────────────────────────────────────────────────────
create or replace view public.v_rendiconti_giornalieri
with (security_invoker = true) as
select g.id, g.company_id, g.order_id, g.data, g.numero, g.stato, g.descrizione_lavori, g.note,
       g.rapportino_id, g.created_at, g.updated_at, g.confermato_at, g.accettato_da_nome, g.accettato_il,
       coalesce(r.righe, 0) as righe,
       coalesce(r.totale, 0) as totale,
       coalesce(r.senza_prezzo, 0) as senza_prezzo,
       r.sal_id
  from public.rendiconti_giornalieri g
  left join lateral (
    select count(*)::integer as righe, sum(x.importo) as totale,
           (count(*) filter (where x.prezzo_unitario = 0 and not x.prezzo_a_mano))::integer as senza_prezzo,
           min(x.sal_id::text)::uuid as sal_id
      from public.appalto_rendiconto_righe x where x.rendiconto_giornaliero_id = g.id
  ) r on true;

revoke all on public.v_rendiconti_giornalieri from anon;
grant select on public.v_rendiconti_giornalieri to authenticated;

-- 12. Permessi delle funzioni ────────────────────────────────────────────────────────────────
revoke all on function public.rendiconto_giornaliero_salva(jsonb) from public, anon;
revoke all on function public.rendiconto_giornaliero_conferma(uuid) from public, anon;
revoke all on function public.rendiconto_giornaliero_riapri(uuid) from public, anon;
revoke all on function public.rendiconto_giornaliero_annulla(uuid) from public, anon;
revoke all on function public.rendiconto_giornaliero_da_rapportino(uuid) from public, anon;
revoke all on function public.rendiconti_giornalieri_da_rapportini(uuid, date, date, boolean) from public, anon;
grant execute on function public.rendiconto_giornaliero_salva(jsonb) to authenticated;
grant execute on function public.rendiconto_giornaliero_conferma(uuid) to authenticated;
grant execute on function public.rendiconto_giornaliero_riapri(uuid) to authenticated;
grant execute on function public.rendiconto_giornaliero_annulla(uuid) to authenticated;
grant execute on function public.rendiconto_giornaliero_da_rapportino(uuid) to authenticated;
grant execute on function public.rendiconti_giornalieri_da_rapportini(uuid, date, date, boolean) to authenticated;
