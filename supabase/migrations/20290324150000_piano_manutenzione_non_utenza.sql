-- 20290324150000_piano_manutenzione_non_utenza.sql
--
-- generale_piano_chiave_costo leggeva «utenz» anche dentro «manutenzione»: una spesa con
-- categoria «Manutenzione» o «Manutenzioni mezzi» finiva sulla voce «Allacci e utenze» del piano
-- economico, invece che sulle spese generali (15/11/2026, URBAN VISION). Stessa correzione
-- nell'importazione dei business plan (pianoCategorie.ts, INDIZI).
--
-- Idempotente: sostituisce la parola solo se c'è ancora la forma vecchia.

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.generale_piano_chiave_costo(text)'::regprocedure);
  vecchio constant text := 'when c ~ ''allacc|utenz|';
  nuovo constant text := 'when c ~ ''allacc|(^|_)utenz|';
begin
  if position(nuovo in definizione) > 0 then
    return;
  end if;
  if position(vecchio in definizione) = 0 then
    raise exception 'generale_piano_chiave_costo: non trovo la regola degli allacci';
  end if;
  execute replace(definizione, vecchio, nuovo);
end
$migrazione$;
