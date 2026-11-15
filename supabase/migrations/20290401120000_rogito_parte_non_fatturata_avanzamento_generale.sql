-- 20290401120000_rogito_parte_non_fatturata_avanzamento_generale.sql
--
-- Trovati il 15/11/2026 simulando un'operazione dall'inizio alla fine (Demo Azienda, transazione
-- annullata) e leggendo il Dossier che ne usciva.
--
-- 1. generale_piano_righe_reali: un'unità rogitata con anche una sola fattura (l'acconto) perdeva
--    il rogito, e nel piano valeva solo quella fattura (450.000 € venduti, 81.818 € di ricavo).
--    Ora le fatture dell'unità contano come prima e il rogito conta per il resto del prezzo.
-- 2. commessa_generale_riepilogo: la generale dice anche il suo avanzamento (orders.percentuale_avanzamento,
--    che recompute_order_progress calcola dalle fasi della generale e delle commesse dentro). Il
--    Dossier e il rendiconto ai soci usavano solo la media delle unità: lavori fatti sulla
--    generale, con le fasi al 100%, risultavano «al 0%».
--
-- Idempotente: ogni sostituzione si salta se è già fatta.

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.generale_piano_righe_reali(uuid,boolean,boolean)'::regprocedure);
  inizio_vecchio constant text := '  ricavi as (
    select ''fattura''::text as fonte';
  inizio_nuovo constant text := '  fatturati as (
    select ''fattura''::text as fonte';
  a int;
  b int;
  rogito_nuovo constant text := '
  ),
  ricavi as (
    select * from fatturati
    union all
    -- Unità rogitate (modulo Unità): il prezzo di rogito è il ricavo. Le fatture già emesse sulla
    -- commessa dell''unità (acconti, saldo) ne coprono una parte: il rogito conta per il resto.
    select ''rogito'', u.id, u.order_id, u.data_rogito,
           ''ricavi'', null::text,
           concat_ws('' · '', ''Rogito'', nullif(btrim(o.description), ''''),
                     case when exists (select 1 from fatturati fa where fa.order_id = u.order_id) then ''parte non fatturata'' end),
           greatest(0, coalesce(u.prezzo_rogito, u.prezzo_trattato, u.prezzo_listino, 0)
                       - coalesce((select sum(fa.importo) from fatturati fa where fa.order_id = u.order_id), 0))
      from public.unita_immobiliari u
      join s on s.id = u.order_id and s.company_id = u.company_id
      join public.orders o on o.id = u.order_id
     where p_ricavi
       and u.stato_vendita = ''rogitata'' and u.divisa_il is null
  )
  select x.fonte';
begin
  if position('parte non fatturata' in definizione) = 0 then
    if position(inizio_vecchio in definizione) = 0 then
      raise exception 'generale_piano_righe_reali: non trovo l''inizio dei ricavi';
    end if;
    definizione := replace(definizione, inizio_vecchio, inizio_nuovo);
    a := position('    union all
    -- Unità rogitate (modulo Unità, 20281031120000)' in definizione);
    b := position('
  )
  select x.fonte' in definizione);
    if a = 0 or b = 0 or b < a then
      raise exception 'generale_piano_righe_reali: non trovo il ramo del rogito';
    end if;
    definizione := left(definizione, a - 1) || ltrim(rogito_nuovo, E'\n') || substr(definizione, b + length('
  )
  select x.fonte'));
    execute definizione;
  end if;
end
$migrazione$;

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.commessa_generale_riepilogo(uuid)'::regprocedure);
  vecchio constant text := '''inizio'', o.work_start_date, ''fine'', o.work_end_date,';
  nuovo constant text := '''inizio'', o.work_start_date, ''fine'', o.work_end_date, ''avanzamento'', o.percentuale_avanzamento,';
begin
  if position('''avanzamento'', o.percentuale_avanzamento' in definizione) > 0 then
    return;
  end if;
  if position(vecchio in definizione) = 0 then
    raise exception 'commessa_generale_riepilogo: non trovo le date della generale';
  end if;
  execute replace(definizione, vecchio, nuovo);
end
$migrazione$;
