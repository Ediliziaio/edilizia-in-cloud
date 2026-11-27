-- Rendiconto: prendere tutto quello che i rapportini hanno prodotto
-- ────────────────────────────────────────────────────────────────────────────
-- 27/11/2026. Piano: docs/piano-rendiconto-da-rapportini-verifica.md
--
-- Contato su un’impresa in appalto: 137 voci di rapportino, ~64.500 € di vendita
-- scritta, 0 righe di rendiconto. La strada si interrompeva in tre punti, e
-- tutti e tre stanno qui:
--
--   D1  68 voci (50.945 €) su commesse `order_type = 'cliente'`: la vendita
--       veniva CANCELLATA. Due guardie la fermavano — `rapportino_voce_applica`
--       usciva prima, e `appalto_rendiconto_prepara` sollevava un'eccezione —
--       e l'eccezione finiva nel `when others then null` di D6, quindi
--       l'approvazione riusciva e nessuno sapeva niente.
--       Deciso dal titolare il 27/11: il rendiconto vale su QUALUNQUE commessa.
--   D2  la riga nata da una voce si scriveva `origine = 'manuale'` e
--       `rapportino_id = null`: a schermo sembrava scritta a mano dall'ufficio
--       e il legame alla giornata era perso. È il difetto che impediva il
--       controllo incrociato.
--   D6  gli errori della creazione righe venivano buttati in silenzio.
--   D8  ogni riga nasceva «fuori contratto» perché `appalto_tariffa_id` è
--       sempre nullo: ma «fuori contratto» ha senso solo se un contratto c'è.
--
-- Deciso anche (D7): su commessa «a corpo» le voci libere CONTINUANO a entrare
-- nel rendiconto (il corpo d'opera copre la manodopera, non il materiale e il
-- trasporto consumati in più). Le ore restano fuori, come già oggi. Nessuna
-- riga di codice cambia per questo: è il comportamento attuale, qui scritto
-- perché non venga «corretto» per sbaglio.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Il rendiconto esiste su qualunque commessa (D1), e «fuori contratto»
--    solo dove un contratto c'è (D8).
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.appalto_rendiconto_prepara()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
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
  -- Prima qui c'era: «Il rendiconto esiste solo sulle commesse in appalto».
  -- Era la guardia che cancellava 50.945 € di voci: su una commessa cliente il
  -- rendiconto è la base della fattura a misura, non un errore.
  new.company_id := v_ord.company_id;

  if new.fase_id is not null and not exists (
    select 1 from public.order_work_phases f
     where f.id = new.fase_id and f.order_id = new.order_id
  ) then
    raise exception 'La fase deve appartenere a questa commessa' using errcode = '23514';
  end if;

  if new.tariffa_id is null then
    -- «Fuori contratto» vuol dire «fuori dal listino concordato». Senza
    -- contratto non c'è un dentro, quindi non può esserci un fuori: marcarle
    -- tutte extra faceva comparire il rendiconto intero come roba da
    -- discutere a fine lavori.
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

-- ───────────────────────────────────────────────────────────────────────────
-- 2. La voce libera va nel rendiconto di qualunque commessa, e si ricorda da
--    quale giornata viene (D1 + D2).
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.rapportino_voce_applica(p_voce_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
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

  -- Il costo: invariato. Va in company_costs come costo senza fattura.
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

  -- La vendita. Niente più controllo sul tipo di commessa: se c'è un prezzo,
  -- quel lavoro si fattura, e deve esserci una riga che lo dice.
  v_ric := coalesce(v.vendita_unitaria, 0);
  if v_ric <= 0 then
    -- Senza prezzo non si inventa una riga: la voce compare in
    -- v_rapportini_da_rendicontare col motivo, e l'ufficio decide.
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
    -- origine e rapportino_id: senza questi due non si risale alla giornata,
    -- e il pannello «Da dove viene» non ha niente da mostrare.
    'rapportino', v.rapportino_id,
    'bozza', v.descrizione, v.unita, v_ric, nullif(v_costo, 0),
    case when v.appalto_tariffa_id is not null then 'Voce del rapportino, dal listino concordato' else 'Voce del rapportino' end,
    v.id,
    -- lo decide appalto_rendiconto_prepara in base al contratto (D8)
    false);
end; $function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Gli errori non si buttano (D6).
-- ───────────────────────────────────────────────────────────────────────────
-- L'approvazione di un rapportino non deve fallire per un problema di prezzi:
-- chi è in ufficio approva quello che è stato fatto, non negozia il listino.
-- Ma l'errore va detto. Resta catturato (l'approvazione passa), e viene
-- scritto nel registro del database con il numero del rapportino.
-- Quello che manca resta comunque visibile a schermo: la vista
-- v_rapportini_da_rendicontare lo ricalcola ogni volta.

create or replace function public.appalto_rendiconto_da_rapportino()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_errore text;
begin
  if not (coalesce(new.approvato, false) and not coalesce(old.approvato, false)) then return new; end if;
  begin
    perform public.appalto_rendiconto_crea_righe(new.id);
  exception when others then
    v_errore := sqlerrm;
    raise warning 'rendiconto dal rapportino % non creato: %', new.id, v_errore;
  end;
  return new;
end; $function$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Ricucire le righe già nate senza provenienza (D2).
-- ───────────────────────────────────────────────────────────────────────────
-- Solo le bozze: una riga già chiusa in un rendiconto al committente non si
-- tocca, e il trigger appalto_riga_congelata la difende comunque.
-- In tutto il sistema sono 53 righe, quindi è un UPDATE da niente — i due
-- timeout in testa valgono per la regola, non per la dimensione.

update public.appalto_rendiconto_righe r
   set origine = 'rapportino',
       rapportino_id = v.rapportino_id
  from public.rapportino_voci_libere v
 where r.voce_libera_id = v.id
   and r.stato = 'bozza'
   and (r.origine is distinct from 'rapportino' or r.rapportino_id is distinct from v.rapportino_id);
