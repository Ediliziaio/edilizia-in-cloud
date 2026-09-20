-- Rapporto del mattino dei clienti marketing: perché manca la spesa (20/09/2026).
--
-- Per i clienti senza spesa leggibile l'email scriveva un trattino. Il 20/09
-- erano 4 su 7, ognuno per un motivo diverso e tutti risolvibili: BeMade con
-- 64 account pubblicitari visibili e nessuno scelto, Ser Style col
-- collegamento Meta scaduto dal 30/08, Ener Italia senza Meta, Suntech con
-- l'account scelto ma zero spesa da fine agosto. Il trattino non lo diceva, e
-- «non mi arrivano i report di spesa» è rimasto così per settimane.
--
-- mkt_rapporto_mattino passa ora anche meta_stato e meta_account di ogni
-- cliente (ci sono già in mkt_metriche_giorno): il motivo lo scrive
-- ops-canarino/clienti-marketing.ts (motivoSenzaSpesa).
--
-- La funzione si aggiorna sul posto: alla definizione che c'è si aggiungono i
-- due campi, invece di ricopiarne a mano settemila caratteri.

do $mig$
declare
  v_def text;
  v_prima constant text := 'm.spesa_disponibile, m.rapporto_zero, m.spesa_senza_lead';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mkt_rapporto_mattino';
  if v_def is null then
    raise exception 'mkt_rapporto_mattino non trovata';
  end if;
  -- Già fatto: la migrazione si può rilanciare.
  if position('m.meta_stato' in v_def) > 0 then
    return;
  end if;
  if position(v_prima in v_def) = 0 then
    raise exception 'mkt_rapporto_mattino: elenco dei campi del cliente non trovato';
  end if;
  execute replace(v_def, v_prima, v_prima || ', m.meta_stato, m.meta_account');
end
$mig$;
