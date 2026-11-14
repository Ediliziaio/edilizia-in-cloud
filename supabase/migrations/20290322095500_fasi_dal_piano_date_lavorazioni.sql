-- 20290322095500_fasi_dal_piano_date_lavorazioni.sql
--
-- Le lavorazioni create dal piano (generale_fasi_dal_piano, 20290322094500) nascevano senza
-- date: la fase aveva il suo periodo, le sue sottofasi no, e il cantiere le contava tutte tra
-- le «senza date» (URBAN VISION, 14/11/2026: 78 lavorazioni su tre operazioni).
--
-- Ora ogni lavorazione prende il periodo della sua fase, in parallelo con le altre della stessa
-- fase: il piano dice cosa si fa in quella fase, non in che ordine. Chi conosce il cantiere le
-- mette in fila dopo (piano in fila delle sottofasi).
--
-- 1. La funzione: la sottofase nasce con le date della fase.
-- 2. Le lavorazioni già create dal piano senza date prendono quelle della loro fase.

do $migrazione$
declare
  vecchio constant text := 'insert into public.order_work_subphases (phase_id, name, position, peso)
      values (v_fase_id, left(btrim(v_voce.descrizione), 160), v_pos, 1)';
  nuovo constant text := 'insert into public.order_work_subphases (phase_id, name, position, peso, data_inizio, data_fine, in_parallelo)
      values (v_fase_id, left(btrim(v_voce.descrizione), 160), v_pos, 1, v_inizio, v_fine, true)';
  definizione text := pg_get_functiondef('public.generale_fasi_dal_piano(uuid,jsonb)'::regprocedure);
begin
  if position(nuovo in definizione) > 0 then
    return; -- già fatto
  end if;
  if position(vecchio in definizione) = 0 then
    raise exception 'generale_fasi_dal_piano: non trovo l''inserimento delle sottofasi da cambiare';
  end if;
  execute replace(definizione, vecchio, nuovo);
end
$migrazione$;

set local lock_timeout = '3s';
set local statement_timeout = '60s';

update public.order_work_subphases s
   set data_inizio = f.start_date, data_fine = f.end_date, in_parallelo = true
  from public.order_work_phase_voci v
  join public.order_work_phases f on f.id = v.phase_id
 where v.subphase_id = s.id
   and v.origine = 'piano'
   and s.data_inizio is null and s.data_fine is null
   and f.start_date is not null and f.end_date is not null;
