-- 20290401130000_piano_agenzia_vendita_non_terreno.sql
--
-- generale_piano_chiave_costo leggeva «immobil» prima di «agenzia»: una spesa «Agenzia immobiliare»
-- o «Agenzia immobiliare: provvigioni di vendita» finiva sulla voce del terreno, invece che sulla
-- commercializzazione (simulazione del 15/11/2026 su Demo Azienda). L'agenzia dell'acquisto
-- (con «acquist» nella categoria) resta col terreno.
--
-- Idempotente: si aggiunge la regola solo se non c'è.

do $migrazione$
declare
  definizione text := pg_get_functiondef('public.generale_piano_chiave_costo(text)'::regprocedure);
  vecchio constant text := '    when c ~ ''terren|notai|rogit|compravendit|immobil'' then ''terreno''';
  nuovo constant text := '    when c ~ ''agenzi|provvigion'' and c !~ ''acquist'' then ''commercializzazione''
    when c ~ ''terren|notai|rogit|compravendit|immobil'' then ''terreno''';
begin
  if position('when c ~ ''agenzi|provvigion'' and c !~ ''acquist''' in definizione) > 0 then
    return;
  end if;
  if position(vecchio in definizione) = 0 then
    raise exception 'generale_piano_chiave_costo: non trovo la regola del terreno';
  end if;
  execute replace(definizione, vecchio, nuovo);
end
$migrazione$;
