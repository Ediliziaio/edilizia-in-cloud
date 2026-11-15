-- Rimanenze di magazzino alla data e loro variazione nel conto economico (15/11/2026)
--
-- Lo Stato patrimoniale usava la giacenza di oggi anche per gli anni chiusi
-- («il magazzino non ha storico»), e nel conto economico la variazione delle
-- rimanenze di materie (art. 2425 c.c., B11) era fissata a zero: i materiali
-- comprati e ancora in magazzino erano tutti costi dell'anno. Il magazzino lo
-- storico ce l'ha: ogni carico e scarico è in warehouse_movements.
-- Demo 2: 43.217 € di giacenza al 31/12/2025, 173.396 € oggi; nel 2026
-- 130.179 € di materiali comprati sono ancora in magazzino, non costi.
--
--  - private.cg_rimanenze_al(azienda, data): per ogni articolo la giacenza di
--    oggi meno i carichi e più gli scarichi successivi alla data, al costo
--    unitario attuale (mai sotto zero).
--  - Stato patrimoniale: rimanenze alla data di riferimento.
--  - Conto economico, voce 04: rimanenze a inizio periodo − rimanenze a fine
--    periodo (positiva se il magazzino cala). Solo se il magazzino era già in
--    uso prima dell'inizio del periodo: l'inventario d'apertura caricato in un
--    giorno sembrerebbe un acquisto rimasto in magazzino e gonfierebbe
--    l'utile, quindi nel primo periodo di utilizzo la variazione resta zero.
-- Lo Stato patrimoniale legge l'utile dal conto economico fino al mese della
-- data: rimanenze e risultato restano coerenti.

create or replace function private.cg_rimanenze_al(p_company uuid, p_rif date)
returns numeric language sql stable security definer set search_path to '' as $$
  select coalesce(sum(greatest(coalesce(s.quantity, 0) - coalesce(m.dopo, 0), 0) * coalesce(s.unit_cost, 0)), 0)::numeric(14,2)
    from public.warehouse_stock s
    left join (
      select w.stock_item_id,
             sum(case when w.movement_type = 'scarico' then -w.quantity else w.quantity end) as dopo
        from public.warehouse_movements w
       where w.company_id = p_company and w.created_at::date > p_rif
       group by w.stock_item_id
    ) m on m.stock_item_id = s.id
   where s.company_id = p_company
$$;
revoke all on function private.cg_rimanenze_al(uuid, date) from public, anon, authenticated;

-- Variazione del periodo (rimanenze iniziali − finali), zero se il magazzino è
-- entrato in uso dentro il periodo.
create or replace function private.cg_variazione_magazzino(p_company uuid, p_dal date, p_al date)
returns numeric language sql stable security definer set search_path to '' as $$
  select case
    when (select min(w.created_at)::date from public.warehouse_movements w where w.company_id = p_company) < p_dal
      then private.cg_rimanenze_al(p_company, p_dal - 1) - private.cg_rimanenze_al(p_company, p_al)
    else 0 end::numeric(14,2)
$$;
revoke all on function private.cg_variazione_magazzino(uuid, date, date) from public, anon, authenticated;

do $p$
declare
  ce_vecchio text := pg_get_functiondef('public.cg_get_conto_economico_riclassificato'::regproc);
  sp_vecchio text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  ce_prima text := $a$v_var_rim_mag := 0;$a$;
  sp_prima text := $a$  SELECT COALESCE(sum(quantity * COALESCE(unit_cost, 0)), 0)
  INTO v_rimanenze
  FROM public.warehouse_stock
  WHERE company_id = v_company_id AND quantity > 0;$a$;
begin
  if position('private.cg_variazione_magazzino' in ce_vecchio) = 0 then
    if (length(ce_vecchio) - length(replace(ce_vecchio, ce_prima, ''))) / length(ce_prima) <> 1 then
      raise exception 'Conto economico: variazione del magazzino non trovata, la funzione è cambiata';
    end if;
    execute replace(ce_vecchio, ce_prima, $b$v_var_rim_mag := private.cg_variazione_magazzino(v_company_id,
      make_date(p_anno, p_mese_da, 1), (make_date(p_anno, p_mese_a, 1) + interval '1 month' - interval '1 day')::date);$b$);
  end if;
  if position('private.cg_rimanenze_al' in sp_vecchio) = 0 then
    if position(sp_prima in sp_vecchio) = 0 then
      raise exception 'Stato patrimoniale: blocco delle rimanenze non trovato, la funzione è cambiata';
    end if;
    execute replace(sp_vecchio, sp_prima, $b$  -- Giacenza alla data, dallo storico dei carichi e degli scarichi.
  v_rimanenze := private.cg_rimanenze_al(v_company_id, v_rif);$b$);
  end if;
end $p$;
