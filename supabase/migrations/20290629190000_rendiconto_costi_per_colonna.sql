-- Rendiconto: il costo torna sulle righe, ma solo a chi ha «Costi»
-- ────────────────────────────────────────────────────────────────
-- 27/11/2026. `20290629150000` ha smesso di scrivere il costo della persona in
-- `appalto_rendiconto_righe.costo_interno` perché la riga la legge chiunque abbia solo
-- «Venduto e importi» (la policy `arr_lettura` chiede `can_view_order_amounts`): scrivere
-- lì il costo orario del dipendente era una fuga di dati. Risultato: su una commessa in
-- appalto la testata diceva «MARGINE € — · Nessuna riga conosce il suo costo» anche a chi
-- HA il permesso «Costi» (93 righe di rendiconti giornalieri, 15 col costo, 0 per persone).
--
-- Si fa come per i rapportini («I soldi dei rapportini») e per le fasi
-- (`order_work_phases_visibili`, migrazioni 20290327110000/110100):
--  1. il costo si riscrive nella riga (persone: ore equivalenti × costo orario della scheda;
--     ditte e voci: il costo della voce di listino, come già oggi);
--  2. ad `authenticated` si toglie il SELECT su `costo_interno` e `margine` (GRANT per
--     colonna su tutte le altre): un `select("*")` sulla tabella grezza fallisce per tutti;
--  3. il browser legge da `appalto_rendiconto_righe_visibili` (security_invoker: stesse
--     righe, stesse policy), dove costo e margine arrivano solo a chi ha «Costi» per quella
--     commessa, e `null` agli altri.
-- Le scritture restano sulla tabella. `v_rendiconti_giornalieri` non legge né costo né
-- margine (conta righe, totale e righe senza prezzo): resta com'è.
-- Idempotente; non riscrive le righe già salvate (si rifanno salvando il rendiconto).

-- ── 1. Il costo nella riga ──────────────────────────────────────────────────────

-- Le ore che stanno dietro a una quantità: il costo della persona è orario, la riga
-- può essere a giornata. 8 h = una giornata, la stessa soglia di
-- `private.quantita_per_unita` (fino a 4 h mezza giornata, cioè 4 h).
-- Per un'unità che non si converte (corpo, mq, viaggio) non c'è modo di saperlo: null,
-- e la riga resta senza costo, come prima.
create or replace function private.ore_equivalenti(p_qta numeric, p_unita text)
returns numeric
language sql
immutable
as $$
  select case
    when p_qta is null or p_qta <= 0 then null
    when p_unita = 'ora' then p_qta
    when p_unita in ('giornata', 'uomo_giorno') then p_qta * 8
  end;
$$;
revoke all on function private.ore_equivalenti(numeric, text) from public, anon;
grant execute on function private.ore_equivalenti(numeric, text) to authenticated;

-- Solo il punto del costo cambia: il resto è `20290629170000_rendiconto_unita_della_voce`.
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
  v_costo numeric;
  v_ore numeric;
  v_emp uuid;
  v_mezzo uuid;
  v_sub uuid;
  v_atar uuid;
  v_altro integer;
  v_da_rap uuid;
begin
  if v_id is not null then
    select * into v_rg from public.rendiconti_giornalieri where id = v_id for update;
    if not found then raise exception 'Rendiconto inesistente' using errcode = '23514'; end if;
    v_order := v_rg.order_id;
    -- In modifica, senza data resta quella salvata (prima finiva a oggi).
    if nullif(p->>'data', '') is null then v_data := v_rg.data; end if;
  end if;
  if v_order is null then raise exception 'Manca la commessa' using errcode = '22023'; end if;
  v_company := private.rendiconto_giornaliero_puo_scrivere(v_order);
  -- Un solo scrittore per commessa: del_giorno, salva e copia si mettono in fila.
  perform pg_advisory_xact_lock(hashtextextended('rendiconto_giornaliero:' || v_order::text, 0));
  -- Un rendiconto per giorno: un altro giorno già occupato non si prende.
  select g.numero into v_altro from public.rendiconti_giornalieri g
   where g.order_id = v_order and g.data = v_data and g.stato <> 'annullato' and g.id is distinct from v_id
   order by g.numero limit 1;
  if v_altro is not null then
    raise exception 'Il % c''è già il rendiconto n. %: aprilo da lì', to_char(v_data, 'DD/MM/YYYY'), v_altro using errcode = '23505';
  end if;
  -- Con rapportini dentro la data non si sposta: resterebbero legati a un giorno che non è il loro.
  if v_id is not null then
    if v_data is distinct from v_rg.data and exists (
         select 1 from public.rendiconto_giornaliero_rapportini l where l.rendiconto_giornaliero_id = v_id) then
      raise exception 'Questo rendiconto contiene rapportini del %: la data non si cambia', to_char(v_rg.data, 'DD/MM/YYYY') using errcode = '23514';
    end if;
  end if;

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
    v_atar := nullif(v_r->>'appalto_tariffa_id', '')::uuid;
    v_sub := nullif(v_r->>'subappaltatore_id', '')::uuid;
    v_da_rap := nullif(v_r->>'da_rapportino_id', '')::uuid;
    if v_da_rap is not null and not exists (select 1 from public.campo_rapportini cr where cr.id = v_da_rap and cr.order_id = v_order) then
      v_da_rap := null;
    end if;
    if v_sub is not null and not exists (select 1 from public.subappaltatori s where s.id = v_sub and s.company_id = v_company) then
      raise exception 'Ditta non trovata in azienda' using errcode = '23514';
    end if;
    -- Ditta senza voce scelta: vale la tariffa della ditta.
    if v_listino is null and v_atar is null and v_sub is not null
       and not coalesce((v_r->>'prezzo_a_mano')::boolean, false) then
      select s.tariffa_id into v_listino from public.subappaltatori s where s.id = v_sub;
    end if;
    -- Manodopera di una persona senza voce scelta: vale la voce «ore» della commessa.
    if v_listino is null and v_atar is null and not coalesce((v_r->>'prezzo_a_mano')::boolean, false)
       and nullif(v_r->>'employee_id', '') is not null
       and coalesce(v_r->>'categoria', 'manodopera') = 'manodopera' then
      select o.tariffa_manodopera_id into v_listino from public.orders o where o.id = v_order;
    end if;
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
    -- Voce del listino del committente scelta direttamente (anche se non è collegata al generale).
    if v_atar is not null then
      v_prezzo := private.prezzo_tariffa_committente(v_order, v_atar, v_data);
      if v_prezzo is null then
        raise exception 'La voce del listino del committente non vale per questa commessa o per questo giorno' using errcode = '23514';
      end if;
      v_listino := coalesce(v_listino, nullif(v_prezzo->>'tariffa_id', '')::uuid);
    else
      v_prezzo := private.rendiconto_giornaliero_prezzo(v_order, v_listino, v_data);
    end if;
    v_descr := coalesce(nullif(btrim(v_r->>'descrizione'), ''), v_prezzo->>'descrizione', 'Voce');
    v_costo_u := nullif(v_prezzo->>'costo_unitario', '')::numeric;

    if v_a_mano or (v_listino is null and v_atar is null) then
      v_fonte := case when v_pu is not null and (v_a_mano or v_pu > 0) then 'manuale' else 'mancante' end;
      v_pu := coalesce(v_pu, 0);
      v_a_mano := v_fonte = 'manuale';
      v_unita := coalesce(nullif(btrim(v_r->>'unita'), ''), v_prezzo->>'unita', 'cad');
    else
      v_fonte := coalesce(v_prezzo->>'fonte', 'mancante');
      v_pu := coalesce(nullif(v_prezzo->>'prezzo', '')::numeric, 0);
      -- L'unità è quella della voce, sempre: il prezzo è per QUELLA unità. Una riga a
      -- «ora» su una voce a giornata moltiplicava il prezzo del giorno per le ore
      -- (8 × 248 € invece di 248 €, visto nella simulazione di dicembre).
      v_unita := coalesce(v_prezzo->>'unita', nullif(btrim(v_r->>'unita'), ''), 'cad');
    end if;
    if v_pu < 0 then raise exception 'Il prezzo non può essere negativo' using errcode = '22023'; end if;

    -- Il costo della riga. Senza di lui la commessa non ha margine (27/11/2026: la
    -- testata diceva «Nessuna riga conosce il suo costo»). Non è una fuga di dati perché
    -- `costo_interno` e `margine` non sono più leggibili dalla tabella: passano dalla
    -- vista `appalto_rendiconto_righe_visibili`, che li dà solo a chi ha «Costi».
    --  * persona: ore equivalenti × costo orario della scheda (come faceva
    --    `appalto_righe_da_rapportino_calcola`: lì il costo era sulle ore vere anche
    --    quando la tariffa era a giornata). Le ore arrivano dalla riga se ci sono,
    --    altrimenti si ricavano da quantità e unità;
    --  * ditta esterna e voci: il costo della voce di listino, quando c'è. Su
    --    `subappaltatori` non c'è nessun costo (solo `tariffa_id`): una ditta con una
    --    voce senza costo resta senza costo, e il margine di quella riga non si sa.
    v_ore := coalesce(nullif(replace(v_r->>'ore', ',', '.'), '')::numeric,
                      private.ore_equivalenti(v_q, v_unita));
    v_costo := case
      when v_emp is not null and v_ore is not null
        then round(v_ore * nullif(public.costo_orario_calcolato(v_emp), 0), 2)
    end;
    if v_costo is null and v_costo_u is not null then
      v_costo := round(v_q * v_costo_u, 2);
    end if;

    insert into public.appalto_rendiconto_righe (
      order_id, data, tariffa_id, descrizione, unita_misura, prezzo_unitario, quantita,
      maggiorazione_pct, costo_interno, employee_id, fase_id, origine, stato, note,
      mezzo_id, extra_contratto, rendiconto_giornaliero_id, categoria, listino_voce_id,
      prezzo_fonte, prezzo_a_mano, ordine, subappaltatore_id, da_rapportino_id)
    values (
      v_order, v_data,
      coalesce(v_atar, case when not v_a_mano then nullif(v_prezzo->>'appalto_tariffa_id', '')::uuid end),
      v_descr, v_unita, v_pu, v_q,
      coalesce(nullif(v_r->>'maggiorazione_pct', '')::numeric, 0),
      v_costo,
      v_emp, nullif(v_r->>'fase_id', '')::uuid, 'manuale', 'bozza', nullif(btrim(v_r->>'note'), ''),
      v_mezzo, false, v_id,
      case when v_r->>'categoria' in ('manodopera','mezzo','trasporto','materiale','voce') then v_r->>'categoria'
           when v_emp is not null or v_sub is not null then 'manodopera' when v_mezzo is not null then 'mezzo' else 'voce' end,
      v_listino, v_fonte, v_a_mano, v_i, v_sub, v_da_rap);
  end loop;

  return v_id;
end;
$function$;

-- ── 2. Costo e margine non si leggono più dalla tabella ─────────────────────────

-- Un `select("*")` dal browser sulla tabella grezza ora fallisce per tutti, amministratori
-- compresi: si passa dalla vista. Le scritture (INSERT/UPDATE/DELETE) non cambiano.
revoke select on public.appalto_rendiconto_righe from authenticated;
grant select (
  id, company_id, order_id, data, tariffa_id, descrizione, unita_misura, prezzo_unitario,
  quantita, maggiorazione_pct, importo, employee_id, fase_id, origine, rapportino_id,
  extra_contratto, stato, confermata_da, confermata_at, note, created_by, created_at,
  updated_at, sal_id, voce_libera_id, mezzo_id, rendiconto_giornaliero_id, categoria,
  listino_voce_id, prezzo_fonte, prezzo_a_mano, ordine, subappaltatore_id, da_rapportino_id
) on public.appalto_rendiconto_righe to authenticated;
revoke all on public.appalto_rendiconto_righe from anon;

-- ── 3. La vista che il browser legge ───────────────────────────────────────────

-- La vista è security_invoker: le stesse righe della tabella, con le sue policy, e i
-- privilegi per colonna dell'utente. Per questo costo e margine NON si leggono dentro la
-- vista (lì il SELECT è negato: la vista fallirebbe per tutti) ma attraverso due funzioni
-- SECURITY DEFINER che controllano il permesso «Costi» su quella commessa — lo stesso
-- schema di `order_work_phase_voci_visibili` con `private.voce_costo_manodopera`.
create or replace function private.rendiconto_riga_costo(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select r.costo_interno from public.appalto_rendiconto_righe r
   where r.id = p_id
     and coalesce((private.office_order_rights(r.order_id) ->> 'costs')::boolean, false);
$$;
revoke all on function private.rendiconto_riga_costo(uuid) from public, anon;
grant execute on function private.rendiconto_riga_costo(uuid) to authenticated;

create or replace function private.rendiconto_riga_margine(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select r.margine from public.appalto_rendiconto_righe r
   where r.id = p_id
     and coalesce((private.office_order_rights(r.order_id) ->> 'costs')::boolean, false);
$$;
revoke all on function private.rendiconto_riga_margine(uuid) from public, anon;
grant execute on function private.rendiconto_riga_margine(uuid) to authenticated;

-- Tutte le colonne, nell'ordine della tabella: un `select("*")` sulla vista deve dare
-- la stessa forma di prima, con costo e margine a null per chi non ha «Costi».
create or replace view public.appalto_rendiconto_righe_visibili
with (security_invoker = true) as
select
  r.id,
  r.company_id,
  r.order_id,
  r.data,
  r.tariffa_id,
  r.descrizione,
  r.unita_misura,
  r.prezzo_unitario,
  r.quantita,
  r.maggiorazione_pct,
  r.importo,
  private.rendiconto_riga_costo(r.id) as costo_interno,
  private.rendiconto_riga_margine(r.id) as margine,
  r.employee_id,
  r.fase_id,
  r.origine,
  r.rapportino_id,
  r.extra_contratto,
  r.stato,
  r.confermata_da,
  r.confermata_at,
  r.note,
  r.created_by,
  r.created_at,
  r.updated_at,
  r.sal_id,
  r.voce_libera_id,
  r.mezzo_id,
  r.rendiconto_giornaliero_id,
  r.categoria,
  r.listino_voce_id,
  r.prezzo_fonte,
  r.prezzo_a_mano,
  r.ordine,
  r.subappaltatore_id,
  r.da_rapportino_id
from public.appalto_rendiconto_righe r;

-- `create or replace view` non riporta security_invoker da sé se la vista esisteva già
-- con un'altra impostazione: lo si dice comunque (viste che perdono security_invoker,
-- 10/11/2026).
alter view public.appalto_rendiconto_righe_visibili set (security_invoker = true);
revoke all on public.appalto_rendiconto_righe_visibili from anon;
grant select on public.appalto_rendiconto_righe_visibili to authenticated;

comment on view public.appalto_rendiconto_righe_visibili is
  'Righe di rendiconto come le legge il browser: stesse righe della tabella (security_invoker), costo_interno e margine solo a chi ha il permesso «Costi» su quella commessa. Le scritture restano su appalto_rendiconto_righe.';
