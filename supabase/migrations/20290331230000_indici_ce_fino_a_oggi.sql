-- Indici avanzati dell'anno in corso: conto economico fino al mese corrente (15/11/2026)
--
-- Gli indici leggevano il conto economico da gennaio a dicembre anche per
-- l'anno in corso: con ammortamenti e costi già programmati fino a dicembre,
-- ma ricavi fino a oggi. Poi rapportavano il flusso ai giorni trascorsi (DSCR,
-- Z-score riportato all'anno): i mesi futuri pesavano come se fossero passati.
-- Lo Stato patrimoniale, da cui gli indici prendono crediti, debiti e attivo,
-- legge già il conto economico fino al mese della data.
-- Adesso anche gli indici: anno in corso fino al mese corrente, anni chiusi
-- l'anno intero.

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_indici_avanzati'::regproc);
  prima text := $a$  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1, 12);$a$;
  dopo text := $b$  -- Anno in corso: fino al mese corrente, come lo Stato patrimoniale.
  v_ce := public.cg_get_conto_economico_riclassificato(v_company_id, p_anno, 1,
            CASE WHEN p_anno = extract(year FROM current_date)::int THEN extract(month FROM current_date)::int ELSE 12 END);$b$;
begin
  if position('Anno in corso: fino al mese corrente' in vecchio) > 0 then
    return;
  end if;
  if position(prima in vecchio) = 0 then
    raise exception 'Indici avanzati: lettura del conto economico non trovata, la funzione è cambiata';
  end if;
  execute replace(vecchio, prima, dopo);
end $p$;
