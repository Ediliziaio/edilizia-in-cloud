-- Una lavorazione a quantità senza una base non deriva niente (invece di dire «zero»)
-- ──────────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, dal controllo accessi del lotto 1 (punto trovato per strada, non di sicurezza).
--
-- `avanzamento_derivato_sottofase` entra nel ramo a quantità solo se c'è una base:
-- `quantita_contratto` congelata, oppure `sottofase_quantita_totale()`, che però vale NULL quando
-- le voci del computo hanno unità diverse. Senza base cadeva nel ramo a percentuale e rispondeva
-- **0**, anche con 15,5 mq registrati: accendere una lavorazione fatta così ne azzererebbe
-- l'avanzamento. Oggi non si vede (nessuna lavorazione è accesa), ma è un difetto che aspetta.
--
-- Qui una lavorazione dichiarata a quantità **senza base non deriva niente**: la funzione risponde
-- NULL e `avanzamento_ricalcola` esce senza toccare la riga, lasciando il valore che c'è. È la
-- scelta prudente: meglio non aggiornare che azzerare. Chi accende le lavorazioni (il travaso) deve
-- rifiutarsi di accendere una a quantità senza base, e la prova del travaso lo controllerà.
--
-- Nota, a correzione di un commento della 20290630110000: `avanzamento_movimenti` LA HA una regola
-- restrittiva, `blocco_utente_bloccato`, messa da sola dall'event trigger del progetto su ogni
-- tabella nuova con `company_id`. È giusto che ci sia (l'utente bloccato vede zero righe) e non è
-- una restrittiva introdotta a mano: il commento di quella migrazione dice il falso.
-- Idempotente.

create or replace function private.avanzamento_derivato_sottofase(p_sottofase uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_s record; v_tot numeric; v_q numeric; v_pct numeric; v_da bigint;
begin
  select s.id, s.modo_avanzamento, s.quantita_contratto, s.percentuale, s.quantita_fatta
    into v_s from public.order_work_subphases s where s.id = p_sottofase;
  if not found then return null; end if;
  v_tot := coalesce(v_s.quantita_contratto, public.sottofase_quantita_totale(p_sottofase));

  if coalesce(v_s.modo_avanzamento, 'quantita') = 'quantita' then
    -- Senza una base non si sa su quanto: non si deriva niente, e il valore di adesso resta.
    if v_tot is null or v_tot <= 0 then return null; end if;
    select round(coalesce(sum(m.quantita), 0), 3) into v_q
      from public.avanzamento_movimenti m
     where m.sottofase_id = p_sottofase and m.modo = 'quantita';
    v_q := least(greatest(v_q, 0), v_tot);
    v_pct := case when v_q <= 0 then 0
                  when v_q >= v_tot then 100
                  else greatest(1, least(99, round(100 * v_q / v_tot))) end;
    return jsonb_build_object('quantita', v_q, 'percentuale', v_pct, 'base', v_tot);
  end if;

  -- A percentuale: vince la più alta dichiarata. Una rettifica azzera quello che c'era prima di lei,
  -- e da lì in poi si torna a contare (la rettifica stessa compresa).
  select max(m.seq) into v_da
    from public.avanzamento_movimenti m
   where m.sottofase_id = p_sottofase and m.modo = 'percentuale' and m.rettifica;
  select coalesce(max(m.percentuale), 0) into v_pct
    from public.avanzamento_movimenti m
   where m.sottofase_id = p_sottofase and m.modo = 'percentuale'
     and (v_da is null or m.seq >= v_da);
  return jsonb_build_object('quantita', null, 'percentuale', round(v_pct), 'base', v_tot);
end;
$function$;
