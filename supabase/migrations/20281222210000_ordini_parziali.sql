-- Ordini d'acquisto parziali: una parte del materiale oggi, il resto dopo.
--
-- crea_oda_materiali_atomica voleva che la riga d'ordine coprisse ESATTAMENTE il
-- residuo del materiale (previsto − già coperto): ordinare 200 m² di rete su
-- 453,59 oggi e il resto la settimana dopo non si poteva (provato il
-- 07/11/2026: «Quantità o coperture cambiate»). Lo chiede la richiesta del
-- cliente sugli acquisti («acquisti parziali o suddivisi tra più fornitori»).
--
-- Ora la riga può essere MINORE o uguale al residuo, mai maggiore: resta
-- impossibile ordinare più del necessario, e il residuo rimasto torna nel
-- pannello e nel fabbisogno per il giro successivo. Tutto il resto della
-- funzione non cambia (stesso controllo su prezzo, IVA, unità, posizioni):
-- si sostituisce solo quel confronto nella definizione attuale, e la
-- migrazione si ferma se non lo trova esattamente una volta.

do $migrazione$
declare
  def text;
  quanti integer;
  schema_vecchio constant text := 'round\(v_requested,\s*6\)\s*<>\s*round\(v_item\.quantity\s*-\s*v_covered,\s*6\)';
begin
  def := pg_get_functiondef('public.crea_oda_materiali_atomica(uuid,uuid,uuid,jsonb)'::regprocedure);
  if position('ordine parziale (20281222210000)' in def) > 0 then
    return;
  end if;
  select count(*) into quanti from regexp_matches(def, schema_vecchio, 'g');
  if quanti <> 1 then
    raise exception 'crea_oda_materiali_atomica: atteso un solo confronto con il residuo, trovati %', quanti;
  end if;
  execute regexp_replace(def, schema_vecchio,
    '/* ordine parziale (20281222210000): mai oltre il residuo */ round(v_requested,6) > round(v_item.quantity-v_covered,6)');
end
$migrazione$;
