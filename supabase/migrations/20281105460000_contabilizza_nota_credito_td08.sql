-- La nota di credito semplificata (TD08) si registra come nota di credito (lotto 7 di
-- docs/piano-costi-commessa.md, 01/11/2026).
--
-- contabilizza_fattura_ricevuta riconosceva come nota di credito solo TD04: una TD08 diventava un costo in
-- più invece di stornare quello della fattura, e il margine della commessa saliva di spesa invece di
-- scendere. Le altre funzioni usano già e_nota_credito_ricevuta(), che comprende TD08. Qui si allinea
-- l'elenco scritto dentro la funzione, in tutti i punti, e si pretende di trovarlo.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_def text := pg_get_functiondef('public.contabilizza_fattura_ricevuta(uuid)'::regprocedure);
  v_nuova text;
begin
  v_nuova := replace(v_def, $q$in ('TD04', 'passive_credit_note')$q$, $q$in ('TD04', 'TD08', 'passive_credit_note')$q$);
  if v_nuova = v_def and position($q$'TD08'$q$ in v_def) = 0 then
    raise exception 'contabilizza_fattura_ricevuta: elenco delle note di credito non trovato';
  end if;
  execute v_nuova;
end $$;
