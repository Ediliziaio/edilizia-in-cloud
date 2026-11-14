-- 20290322121000_riepilogo_generale_solo_figlie.sql
--
-- commessa_generale_riepilogo (testata e Panoramica di ogni commessa generale) prendeva costo e
-- margine delle figlie da v_ordine_marginalita, che calcola tutte le commesse dell'azienda per
-- poi tenerne dieci: 1,4 secondi a ogni apertura di Via Lotti (URBAN VISION, 14/11/2026).
-- Ora usa economia_commesse(id delle figlie), lo stesso calcolo ristretto: 86 ms. Provato su
-- Demo Azienda (40 figlie, 2,69 milioni di costi): costo e margine identici, riga per riga.

do $migrazione$
declare
  vecchio constant text := 'left join public.v_ordine_marginalita m on m.id = f.id;';
  nuovo constant text := 'left join public.economia_commesse(array(select id from figlie)) m on m.id = f.id;';
  definizione text := pg_get_functiondef('public.commessa_generale_riepilogo(uuid)'::regprocedure);
begin
  if position(nuovo in definizione) > 0 then
    return; -- già fatto
  end if;
  if position(vecchio in definizione) = 0 then
    raise exception 'commessa_generale_riepilogo: non trovo la lettura dei costi da cambiare';
  end if;
  execute replace(definizione, vecchio, nuovo);
end
$migrazione$;
