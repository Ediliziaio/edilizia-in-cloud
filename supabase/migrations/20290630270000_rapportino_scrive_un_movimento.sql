-- Anche il rapportino di cantiere scrive un movimento, dove il registro è acceso
-- ──────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, lotto 6 del modello (docs/modello-avanzamento-rendiconto-sal-20261128.md §5).
--
-- `sottofase_applica_avanzata` è la strada del cantiere: quando un rapportino viene approvato
-- (`campo_rapportino_avanzamento_approvato`), per ogni lavorazione dichiarata somma la quantità del
-- giorno — o alza la percentuale — **scrivendo direttamente** su `order_work_subphases`, e tiene lo
-- storico in `sottofasi_dal_rapportino`. È la quarta delle quattro strade che il modello voleva far
-- passare dal registro.
--
-- Da qui: se la lavorazione è nel registro (`a_movimenti`), il rapportino **scrive un movimento** —
-- origine `rapportino`, documento il rapportino stesso — e la riga la aggiorna il derivato, come
-- fanno il rendiconto e l'ufficio. Un rapportino corretto e riapprovato sostituisce il proprio
-- movimento invece di sommarsi (l'indice unico su origine+documento+lavorazione), che è esattamente
-- quello che faceva l'`on conflict` dello storico.
--
-- Dove la lavorazione NON è nel registro resta tutto come prima, riga per riga: oggi è il caso di
-- ogni azienda vera, e il passaggio si fa commessa per commessa col travaso.
--
-- Due cose che cambiano, dove il registro è acceso, e sono il motivo del lavoro:
--   * una lavorazione già spuntata non blocca più la dichiarazione (prima `if s.fatta then return`):
--     il movimento si somma, e se la quantità supera il contratto il tetto la ferma;
--   * la percentuale può scendere, se il rapportino che l'aveva alzata viene corretto in basso:
--     prima era impossibile, perché il numero era l'unico posto in cui la storia stava scritta.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

create or replace function public.sottofase_applica_avanzata(
  p_rapportino uuid, p_id uuid, p_quantita numeric, p_percentuale numeric, p_giorno date)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.order_work_subphases;
  v_tot numeric := public.sottofase_quantita_totale(p_id);
  v_q numeric;
  v_pct integer;
  v_modo text;
  v_dopo record;
begin
  select * into s from public.order_work_subphases where id = p_id for update;
  if not found then return; end if;

  -- ── La strada nuova: la lavorazione è nel registro dei movimenti ──────────────────────────────
  if coalesce(s.a_movimenti, false) then
    v_modo := coalesce(s.modo_avanzamento, case when v_tot > 0 then 'quantita' else 'percentuale' end);
    if v_modo = 'quantita' then
      if coalesce(p_quantita, 0) <= 0 then return; end if;   -- a quantità serve la quantità
    else
      if coalesce(p_percentuale, 0) <= 0 then return; end if;
    end if;

    delete from public.avanzamento_movimenti m
     where m.sottofase_id = p_id and m.origine = 'rapportino' and m.documento_id = p_rapportino;

    perform private.avanzamento_registra(
      p_id, s.phase_id, coalesce(p_giorno, current_date), v_modo,
      case when v_modo = 'quantita' then p_quantita end,
      case when v_modo = 'percentuale' then least(100, round(p_percentuale)) end,
      'rapportino', p_rapportino, s.unita_contratto, false, 'Dichiarato nel rapportino');

    -- Lo storico «cosa ha cambiato questo rapportino» resta: lo legge l'ufficio. I valori «dopo»
    -- si rileggono, perché li ha scritti il derivato.
    select x.percentuale, x.quantita_fatta into v_dopo
      from public.order_work_subphases x where x.id = p_id;
    insert into public.sottofasi_dal_rapportino
      (rapportino_id, subphase_id, percentuale_prima, quantita_prima, percentuale_dopo, quantita_dopo)
    values (p_rapportino, p_id, s.percentuale, s.quantita_fatta, v_dopo.percentuale, v_dopo.quantita_fatta)
    on conflict (rapportino_id, subphase_id) do update
      set percentuale_prima = excluded.percentuale_prima, quantita_prima = excluded.quantita_prima,
          percentuale_dopo = excluded.percentuale_dopo, quantita_dopo = excluded.quantita_dopo, created_at = now();
    return;
  end if;

  -- ── La strada di prima, identica, per le lavorazioni non ancora nel registro ──────────────────
  if s.fatta then return; end if;
  v_pct := s.percentuale;
  v_q := s.quantita_fatta;
  if coalesce(p_quantita, 0) > 0 and v_tot > 0 then
    v_q := coalesce(s.quantita_fatta, v_tot * s.percentuale / 100) + p_quantita;
    v_pct := case when v_q >= v_tot then 100 else greatest(1, least(99, round(100 * v_q / v_tot)))::integer end;
  elsif coalesce(p_percentuale, 0) > 0 then
    v_pct := greatest(s.percentuale, least(99, round(p_percentuale))::integer);
  else
    return;
  end if;
  if v_pct = s.percentuale and v_q is not distinct from s.quantita_fatta then return; end if;
  insert into public.sottofasi_dal_rapportino (rapportino_id, subphase_id, percentuale_prima, quantita_prima, percentuale_dopo, quantita_dopo)
  values (p_rapportino, p_id, s.percentuale, s.quantita_fatta, v_pct, v_q)
  on conflict (rapportino_id, subphase_id) do update
    set percentuale_prima = excluded.percentuale_prima, quantita_prima = excluded.quantita_prima,
        percentuale_dopo = excluded.percentuale_dopo, quantita_dopo = excluded.quantita_dopo, created_at = now();
  update public.order_work_subphases set percentuale = v_pct, quantita_fatta = v_q where id = p_id;
  if v_pct >= 100 and p_giorno is not null then
    update public.order_work_subphases
       set fatta_il = ((p_giorno::timestamp + interval '12 hours') at time zone 'Europe/Rome')
     where id = p_id and fatta;
  end if;
end;
$function$;
