-- L'avanzamento del giorno: il rendiconto e il rapportino dichiarano quanto si è fatto del computo
-- ────────────────────────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, lotto 4 del modello (docs/modello-avanzamento-rendiconto-sal-20261128.md §3.2).
--
-- Oggi un rendiconto giornaliero dice quanto si è SPESO (righe a prezzo: manodopera, mezzi,
-- trasporti, materiali, voci) e non dice niente di quanto si è FATTO delle cose già pattuite nel
-- computo. Chi segue un appalto a computo deve riscriverlo a mano nell'editor delle fasi, e a fine
-- mese il SAL non sa da dove nascono i suoi numeri.
--
-- Qui ci sono le tre cose che servono perché un documento del giorno possa dichiarare l'avanzamento:
--
--  1. `appalto_rendiconto_righe.voce_computo_id` — il legame che mancava fra la riga a prezzo e la
--     voce del computo. Con il legame, la regola «una voce del computo non si fa pagare due volte»
--     diventa vera: quando la commessa si misura sul computo, una riga a prezzo deve DIRE se è una
--     voce del computo (e quale) o un lavoro extra. È la decisione del titolare del 28/11/2026:
--     la regola si impone, non si avvisa.
--  2. `public.rendiconto_lavorazioni_del_giorno` — le lavorazioni della commessa con quantità e
--     unità di contratto, quanto è già fatto e quanto dichiara questo documento, **senza un solo
--     importo**: le voci del computo si leggono con il permesso Costi, e la griglia nuova deve
--     funzionare anche per chi non lo ha (come fa `campo_quantita_sottofasi` per il rapportino).
--  3. `public.avanzamento_del_giorno_salva` — scrive i movimenti del documento, uno per lavorazione:
--     l'indice unico (origine, documento, lavorazione) del registro fa sì che risalvare lo stesso
--     giorno **sostituisca** invece di sommare. Dichiarare zero (o niente) cancella il movimento di
--     quel giorno: finché il documento è aperto, il giorno è una bozza.
--
-- Quello che NON fa, e va detto: un documento già **confermato** non si riscrive. Dopo la conferma
-- la correzione è un movimento nuovo — una rettifica dell'ufficio — non la cancellazione di quello
-- di prima, perché quel numero può essere già dentro un SAL (`trg_appalto_riga_congelata` fa lo
-- stesso con le righe a prezzo).
--
-- Chi può: chi può dichiarare l'avanzamento di quella commessa, cioè chi può modificarla
-- (`puo_modificare_commessa`: l'ufficio con «Commesse → modifica», o chi è assegnato al cantiere),
-- non bloccato e non cliente esterno. Di proposito NON si chiede «Venduto e importi»: l'avanzamento
-- è una quantità, non un prezzo, e il capocantiere che non vede i soldi deve poterlo dichiarare.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- 1. Il legame con la voce del computo ───────────────────────────────────────────────────────────
alter table public.appalto_rendiconto_righe
  add column if not exists voce_computo_id uuid references public.order_work_phase_voci(id) on delete set null;

create index if not exists appalto_rendiconto_righe_voce_computo_idx
  on public.appalto_rendiconto_righe (voce_computo_id) where voce_computo_id is not null;

comment on column public.appalto_rendiconto_righe.voce_computo_id is
  'La voce del computo che questa riga sta misurando. Nulla se la riga è un lavoro extra (extra_contratto) o se la commessa non si misura sul computo.';

grant select (voce_computo_id), insert (voce_computo_id), update (voce_computo_id)
  on public.appalto_rendiconto_righe to authenticated;

create or replace function public.rendiconto_riga_computo_coerente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_voce record; v_modalita text;
begin
  if new.voce_computo_id is not null then
    if coalesce(new.extra_contratto, false) then
      raise exception 'Una riga non può essere insieme una voce del computo e un lavoro extra.'
        using errcode = '23514';
    end if;
    select v.id, f.order_id into v_voce
      from public.order_work_phase_voci v
      join public.order_work_phases f on f.id = v.phase_id
     where v.id = new.voce_computo_id;
    if not found then
      raise exception 'La voce del computo non esiste.' using errcode = '23503';
    end if;
    if v_voce.order_id is distinct from new.order_id then
      raise exception 'La voce del computo è di un''altra commessa.' using errcode = '23514';
    end if;
  end if;

  -- La scelta obbligatoria, solo dove ha senso: commessa che si misura sul computo, riga a prezzo
  -- delle «altre voci» (manodopera, mezzi, trasporti e materiali sono economia per natura), e solo
  -- per le righe nuove o per quelle che si stanno cambiando proprio su questo punto: le righe
  -- scritte prima di oggi restano modificabili per il resto.
  if coalesce(new.categoria, 'voce') = 'voce'
     and (tg_op = 'INSERT'
          or new.voce_computo_id is distinct from old.voce_computo_id
          or new.extra_contratto is distinct from old.extra_contratto)
     and new.voce_computo_id is null
     and not coalesce(new.extra_contratto, false) then
    select o.modalita_lavoro into v_modalita from public.orders o where o.id = new.order_id;
    if v_modalita in ('computo', 'computo_ed_economia') then
      raise exception 'Questa commessa si misura sul computo: di ogni voce a prezzo serve dire se è una voce del computo o un lavoro extra.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.rendiconto_riga_computo_coerente() from public, anon, authenticated;

drop trigger if exists trg_rendiconto_riga_computo on public.appalto_rendiconto_righe;
create trigger trg_rendiconto_riga_computo
  before insert or update of voce_computo_id, extra_contratto, categoria, order_id
  on public.appalto_rendiconto_righe
  for each row execute function public.rendiconto_riga_computo_coerente();

-- 2. Le lavorazioni del giorno, senza un solo importo ────────────────────────────────────────────
-- `p_documento` è il rendiconto (o il rapportino) che si sta compilando: `quantita_del_giorno` e
-- `percentuale_del_giorno` sono quello che QUEL documento ha già dichiarato, così riaprirlo mostra
-- quello che c'era e non riparte da zero.
create or replace function public.rendiconto_lavorazioni_del_giorno(
  p_order uuid,
  p_origine text default 'rendiconto',
  p_documento uuid default null
)
returns table (
  fase_id uuid,
  fase text,
  sottofase_id uuid,
  lavorazione text,
  modo text,
  unita text,
  quantita_contratto numeric,
  quantita_fatta numeric,
  percentuale integer,
  a_movimenti boolean,
  quantita_del_giorno numeric,
  percentuale_del_giorno numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_uid uuid := (select auth.uid()); v_company uuid;
begin
  select o.company_id into v_company from public.orders o where o.id = p_order and o.deleted_at is null;
  if v_uid is null or v_company is null then
    return;
  end if;
  -- Stesso cancello di `campo_quantita_sottofasi`: chi è sul cantiere o chi vede le commesse.
  if not (public.user_assigned_to_order(p_order)
          or exists (select 1 from public.order_employees oe
                       join public.employees e on e.id = oe.employee_id
                      where oe.order_id = p_order and e.user_id = v_uid)
          or public.has_permission_for_company(v_uid, 'can_view_orders', v_company)) then
    return;
  end if;

  return query
    select f.id, f.name, s.id, s.name,
           coalesce(s.modo_avanzamento,
                    case when coalesce(s.quantita_contratto, public.sottofase_quantita_totale(s.id)) > 0
                         then 'quantita' else 'percentuale' end) as modo,
           coalesce(s.unita_contratto, (select max(v.unita) from public.order_work_phase_voci v where v.subphase_id = s.id)),
           coalesce(s.quantita_contratto, public.sottofase_quantita_totale(s.id)),
           s.quantita_fatta,
           s.percentuale,
           coalesce(s.a_movimenti, false),
           m.quantita,
           m.percentuale
      from public.order_work_phases f
      join public.order_work_subphases s on s.phase_id = f.id
      left join public.avanzamento_movimenti m
             on m.sottofase_id = s.id
            and m.origine = p_origine
            and p_documento is not null
            and m.documento_id = p_documento
     where f.order_id = p_order
     order by f.position nulls last, f.created_at, s.position nulls last, s.name;
end;
$function$;

revoke all on function public.rendiconto_lavorazioni_del_giorno(uuid, text, uuid) from public, anon;
grant execute on function public.rendiconto_lavorazioni_del_giorno(uuid, text, uuid) to authenticated;

comment on function public.rendiconto_lavorazioni_del_giorno(uuid, text, uuid) is
  'Le lavorazioni della commessa per la griglia «Avanzamento del giorno»: quantità e unità di contratto, quanto è fatto, quanto dichiara questo documento. Nessun importo: la usa anche chi non ha il permesso Costi.';

-- 3. Accendere UNA lavorazione, col suo saldo di apertura ────────────────────────────────────────
-- `avanzamento_travaso_commessa` (20290630170000) accende una commessa intera e si rifiuta dove i
-- numeri non tornano, perché lì nessuno sta guardando. Qui è il contrario: c'è una persona che sta
-- dichiarando il lavoro di oggi su QUELLA lavorazione, e fermarla perché una percentuale scritta a
-- mano mesi fa non corrisponde alla quantità sarebbe assurdo. Quindi si apre sempre, e il saldo di
-- apertura è quello che la lavorazione mostra nel modo in cui si misura:
--   * a quantità: la quantità fatta, al massimo la quantità di contratto;
--   * a percentuale: la percentuale di adesso.
-- Se i due numeri non erano d'accordo, da qui in avanti comanda la misura del modo scelto, e la
-- differenza torna nel riepilogo come scostamento, così chi salva lo vede.
create or replace function private.avanzamento_apri_sottofase(p_sottofase uuid, p_modo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_s record; v_base numeric; v_unita text; v_q numeric; v_pct numeric; v_prima jsonb; v_dopo record;
begin
  select s.id, s.phase_id, s.a_movimenti, s.percentuale, s.quantita_fatta, s.fatta,
         s.fatta_il, s.updated_at, s.created_at
    into v_s from public.order_work_subphases s where s.id = p_sottofase;
  if not found then
    raise exception 'La lavorazione non esiste.' using errcode = '23503';
  end if;
  if coalesce(v_s.a_movimenti, false) then
    return jsonb_build_object('gia_aperta', true);
  end if;

  v_base := public.sottofase_quantita_totale(p_sottofase);
  select max(v.unita) into v_unita from public.order_work_phase_voci v where v.subphase_id = p_sottofase;
  v_prima := jsonb_build_object('percentuale', v_s.percentuale, 'quantita', v_s.quantita_fatta, 'fatta', v_s.fatta);

  if p_modo = 'quantita' and v_base > 0 then
    v_q := round(least(greatest(coalesce(v_s.quantita_fatta, 0), 0), v_base), 3);
  else
    v_pct := least(greatest(coalesce(v_s.percentuale, case when v_s.fatta then 100 else 0 end), 0), 100);
  end if;

  update public.order_work_subphases s
     set a_movimenti = true,
         modo_avanzamento = case when v_q is not null then 'quantita' else 'percentuale' end,
         quantita_contratto = case when v_q is not null then v_base end,
         unita_contratto = case when v_q is not null then v_unita end
   where s.id = p_sottofase;

  -- Niente da portare dentro: la lavorazione era a zero, il registro parte da zero.
  if coalesce(v_q, 0) <= 0 and coalesce(v_pct, 0) <= 0 then
    return jsonb_build_object('aperta', true, 'saldo', 0);
  end if;

  perform private.avanzamento_registra(
    p_sottofase, v_s.phase_id,
    coalesce(v_s.fatta_il::date, v_s.updated_at::date, v_s.created_at::date, current_date),
    case when v_q is not null then 'quantita' else 'percentuale' end,
    v_q, v_pct, 'apertura', p_sottofase, v_unita, false,
    'Saldo di apertura del registro dei movimenti');

  select s.percentuale, s.quantita_fatta, s.fatta into v_dopo
    from public.order_work_subphases s where s.id = p_sottofase;
  return jsonb_build_object(
    'aperta', true,
    'prima', v_prima,
    'dopo', jsonb_build_object('percentuale', v_dopo.percentuale, 'quantita', v_dopo.quantita_fatta, 'fatta', v_dopo.fatta),
    'spostata', v_dopo.percentuale is distinct from v_s.percentuale
                or coalesce(v_dopo.quantita_fatta, 0) is distinct from coalesce(v_s.quantita_fatta, 0));
end;
$function$;

revoke all on function private.avanzamento_apri_sottofase(uuid, text) from public, anon, authenticated;

-- 4. Il salvataggio dell'avanzamento del giorno ──────────────────────────────────────────────────
-- `p_righe`: [{"sottofase_id": "…", "quantita": 12.5}] oppure [{"sottofase_id": "…", "percentuale": 40}].
-- Una riga con quantità e percentuale nulle (o a zero) cancella il movimento di questo documento.
create or replace function public.avanzamento_del_giorno_salva(
  p_order uuid,
  p_data date,
  p_origine text,
  p_documento uuid,
  p_righe jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_company uuid;
  v_r jsonb;
  v_s record;
  v_base numeric;
  v_modo text;
  v_q numeric;
  v_pct numeric;
  v_scritti int := 0;
  v_togli int := 0;
  v_fermi int := 0;
  v_aperte int := 0;
  v_apertura jsonb;
  v_spostate jsonb := '[]'::jsonb;
  v_motivi jsonb := '[]'::jsonb;
begin
  if p_origine not in ('rendiconto', 'rapportino', 'ufficio', 'campo') then
    raise exception 'Origine non ammessa per l''avanzamento del giorno: %', p_origine using errcode = '22023';
  end if;
  if p_documento is null then
    raise exception 'Serve il documento che dichiara l''avanzamento.' using errcode = '22023';
  end if;
  select o.company_id into v_company from public.orders o where o.id = p_order and o.deleted_at is null;
  if v_company is null then
    raise exception 'Commessa inesistente.' using errcode = '23514';
  end if;
  if v_uid is null
     or public.utente_bloccato()
     or public.utente_e_cliente_esterno()
     or public.utente_sola_lettura(v_company)
     or not public.puo_modificare_commessa(p_order) then
    raise exception 'Non puoi dichiarare l''avanzamento di questa commessa.' using errcode = '42501';
  end if;

  -- Un documento confermato non si riscrive: la correzione è una rettifica, non una cancellazione.
  if p_origine = 'rendiconto' and exists (
       select 1 from public.rendiconti_giornalieri g
        where g.id = p_documento and g.stato <> 'bozza') then
    raise exception 'Il rendiconto è già confermato: l''avanzamento si corregge con una rettifica dell''ufficio.'
      using errcode = '42501';
  end if;

  for v_r in select * from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb))
  loop
    select s.id, s.phase_id, s.a_movimenti, s.modo_avanzamento, s.quantita_contratto, s.unita_contratto
      into v_s
      from public.order_work_subphases s
      join public.order_work_phases f on f.id = s.phase_id
     where s.id = (v_r->>'sottofase_id')::uuid and f.order_id = p_order;
    if not found then
      v_fermi := v_fermi + 1;
      v_motivi := v_motivi || jsonb_build_object('sottofase', v_r->>'sottofase_id', 'motivo', 'non è una lavorazione di questa commessa');
      continue;
    end if;

    v_q := nullif(v_r->>'quantita', '')::numeric;
    v_pct := nullif(v_r->>'percentuale', '')::numeric;

    -- Niente da dichiarare: si toglie quello che questo documento aveva detto.
    if coalesce(v_q, 0) <= 0 and v_pct is null then
      delete from public.avanzamento_movimenti m
       where m.sottofase_id = v_s.id and m.origine = p_origine and m.documento_id = p_documento;
      if found then v_togli := v_togli + 1; end if;
      continue;
    end if;

    v_base := coalesce(v_s.quantita_contratto, public.sottofase_quantita_totale(v_s.id));
    v_modo := coalesce(v_s.modo_avanzamento,
                       case when v_q is not null and v_base > 0 then 'quantita' else 'percentuale' end);
    if v_modo = 'quantita' and (v_base is null or v_base <= 0) then
      v_fermi := v_fermi + 1;
      v_motivi := v_motivi || jsonb_build_object('sottofase', v_s.id, 'motivo', 'si misura a quantità ma non ha una quantità di contratto');
      continue;
    end if;
    if v_modo = 'quantita' and v_q is null then
      v_fermi := v_fermi + 1;
      v_motivi := v_motivi || jsonb_build_object('sottofase', v_s.id, 'motivo', 'si misura a quantità: serve la quantità, non la percentuale');
      continue;
    end if;
    if v_modo = 'quantita' and v_q < 0 then
      raise exception 'Una quantità fatta non può essere negativa.' using errcode = '23514';
    end if;
    if v_modo = 'percentuale' and (v_pct < 0 or v_pct > 100) then
      raise exception 'Una percentuale sta fra 0 e 100.' using errcode = '23514';
    end if;

    -- Prima accende la lavorazione col suo saldo di apertura, se non è ancora nel registro: senza
    -- questo, il primo movimento azzererebbe quello che la lavorazione mostra oggi.
    if not coalesce(v_s.a_movimenti, false) then
      v_apertura := private.avanzamento_apri_sottofase(v_s.id, v_modo);
      v_aperte := v_aperte + 1;
      if coalesce((v_apertura->>'spostata')::boolean, false) then
        v_spostate := v_spostate || jsonb_build_object(
          'sottofase', v_s.id, 'prima', v_apertura->'prima', 'dopo', v_apertura->'dopo');
      end if;
    end if;

    delete from public.avanzamento_movimenti m
     where m.sottofase_id = v_s.id and m.origine = p_origine and m.documento_id = p_documento;

    perform private.avanzamento_registra(
      v_s.id, v_s.phase_id, coalesce(p_data, current_date), v_modo,
      case when v_modo = 'quantita' then v_q end,
      case when v_modo = 'percentuale' then v_pct end,
      p_origine, p_documento, v_s.unita_contratto, false,
      case when p_origine = 'rendiconto' then 'Dichiarato nel rendiconto del giorno'
           else 'Dichiarato nel rapportino' end);
    v_scritti := v_scritti + 1;
  end loop;

  return jsonb_build_object(
    'scritti', v_scritti, 'togliti', v_togli, 'fermi', v_fermi, 'motivi', v_motivi,
    'aperte', v_aperte, 'spostate_dall_apertura', v_spostate);
end;
$function$;

revoke all on function public.avanzamento_del_giorno_salva(uuid, date, text, uuid, jsonb) from public, anon;
grant execute on function public.avanzamento_del_giorno_salva(uuid, date, text, uuid, jsonb) to authenticated;

comment on function public.avanzamento_del_giorno_salva(uuid, date, text, uuid, jsonb) is
  'Scrive l''avanzamento dichiarato da un documento del giorno (rendiconto o rapportino): un movimento per lavorazione, risalvare sostituisce, dichiarare zero cancella. Un documento confermato non si riscrive.';
