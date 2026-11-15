-- Rating bancario dell'anno in corso: conto economico fino al mese corrente (15/11/2026)
--
-- Il flusso di cassa del rating è (utile + ammortamenti) riportato all'anno
-- (× 365 / giorni trascorsi). Per l'anno in corso l'utile veniva dal conto
-- economico gennaio-dicembre, che ha già ammortamenti e costi programmati fino
-- a dicembre: riportarlo all'anno lo contava due volte. Come gli indici
-- avanzati e lo Stato patrimoniale (da cui il rating prende attivo e passivo):
-- anno in corso fino al mese corrente, anni chiusi l'anno intero.

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_rating'::regproc);
  prima text := $a$  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno);$a$;
  dopo text := $b$  -- Anno in corso: fino al mese corrente, come lo Stato patrimoniale.
  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1,
            CASE WHEN p_anno = extract(year FROM current_date)::int THEN extract(month FROM current_date)::int ELSE 12 END);$b$;
begin
  if position('Anno in corso: fino al mese corrente' in vecchio) > 0 then
    return;
  end if;
  if position(prima in vecchio) = 0 then
    raise exception 'Rating: lettura del conto economico non trovata, la funzione è cambiata';
  end if;
  execute replace(vecchio, prima, dopo);
end $p$;
