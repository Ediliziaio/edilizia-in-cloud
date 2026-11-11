-- Un ordine esplicito rende stabile l'impronta anche quando cambia il piano SQL.
-- Nessun documento, quantità o decisione viene modificato.
do $migrazione$
declare d text; vecchio text := 'jsonb_agg(to_jsonb(v))';
 nuovo text := 'jsonb_agg(to_jsonb(v) order by v.fattura_id,v.ddt_id,v.riga_id)';
begin
 select pg_get_functiondef('public.fattura_riconciliazione_contesto(uuid,jsonb)'::regprocedure) into d;
 if position(vecchio in d)>0 then
  execute replace(d,vecchio,nuovo);
 elsif position(nuovo in d)=0 then
  raise exception 'Definizione del contesto non riconosciuta: controllare l’ordinamento dei consumi.';
 end if;
end $migrazione$;
