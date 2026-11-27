-- Fatture ricevute: «segnata pagata» non vuol dire «pagamento registrato».
--
-- Se qualcuno accende company_costs.is_paid (o la fattura) senza passare da
-- registra_pagamento_costo, il trigger porta le rate a «pagata» ma nessuna
-- scrittura dice che i soldi sono usciti. L'elenco mostrava «Pagato 37,54 € ·
-- Residuo 0,00 €», il dettaglio «Nessun pagamento registrato», e la fattura non
-- entrava fra quelle da pagare (un'impresa cliente, 27/11/2026).
--
-- Da qui la RPC dell'elenco:
--   · restituisce `segnata_non_registrata`: quanto delle rate «pagate» non è
--     coperto da nessuna scrittura (NULL se non ce n'è);
--   · sposta quell'importo da «pagato» a «residuo», così la fattura entra nel
--     filtro «Da pagare» e nei totali «DA PAGARE»/«SCADUTO» ed esce da «PAGATO»;
--   · non dice più «pagata il …» per quella fattura.
--
-- La definizione è quella di pagamenti_segnati_da_sistemare (l'avviso in cima
-- alla pagina): rata «pagata» con private.fornitore_residuo_rata(rata) > 0.005,
-- sul costo non annullato. Le due liste devono coincidere: il test
-- fattureRicevuteSegnataNonRegistrata lo controlla.
--
-- private.fatture_ricevute_calcola_saldi non cambia: la usano anche
-- riconciliazione bancaria, distinte e controlli di pagamento.
--
-- Cambia il tipo restituito (una colonna in più): DROP e CREATE, stessi permessi.

drop function if exists public.fatture_ricevute_saldi(uuid, integer);

create function public.fatture_ricevute_saldi(p_company_id uuid, p_anno integer default null)
returns table(
  id uuid, dovuto numeric, pagato numeric, residuo numeric, iva_split numeric,
  pagata_il date, data_saldo date, rate_pagate integer, rate_totali integer,
  stornata boolean, segnata_non_registrata numeric
)
language plpgsql
stable security definer
set search_path to ''
as $function$
#variable_conflict use_column
begin
  -- Stessi accessi alla lista fornitori. Restituisce solo i saldi, senza movimenti, conti o IBAN.
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
    or not coalesce(
      (p_company_id = public.get_my_company_id() and public.puo_vedere_documenti_fornitore())
      or public.user_can_read_accountant_company(p_company_id)
      or public.e_super_admin_dentro(p_company_id), false
    ) then
    raise exception 'Non puoi consultare i pagamenti delle fatture ricevute.' using errcode = '42501';
  end if;
  if p_anno is not null and p_anno not between 1 and 9998 then
    raise exception 'Anno non valido.' using errcode = '22023';
  end if;

  return query
  with saldi as materialized (
    select * from private.fatture_ricevute_calcola_saldi(p_company_id, p_anno, null)
  ), scoperte as (
    -- Come pagamenti_segnati_da_sistemare: rata «pagata», residuo vero > 0.005.
    select r.fattura_ricevuta_id, sum(round(v.residuo, 2)) importo
    from public.rate_fornitori r
    join saldi s on s.id = r.fattura_ricevuta_id
    join public.company_costs c on c.id = r.company_cost_id and c.company_id = r.company_id
      and c.annullato_il is null
    -- offset 0: una chiamata per rata, non due (filtro e somma). È la parte che costa.
    cross join lateral (select private.fornitore_residuo_rata(r) residuo offset 0) v
    where r.company_id = p_company_id and r.stato = 'pagata' and v.residuo > 0.005
    group by r.fattura_ricevuta_id
  ), vere as (
    select s.*, x.importo scoperto,
      case when x.importo is null or s.residuo is null then s.residuo
        else round(least(coalesce(s.pagato, 0) + s.residuo, s.residuo + x.importo), 2) end residuo_vero
    from saldi s left join scoperte x on x.fattura_ricevuta_id = s.id
  )
  select v.id, v.dovuto,
    case when v.scoperto is null or v.residuo is null then v.pagato
      else greatest(0, round(coalesce(v.pagato, 0) + v.residuo - v.residuo_vero, 2)) end,
    v.residuo_vero, v.iva_split,
    case when v.scoperto is null then v.pagata_il end,
    case when v.scoperto is null then v.data_saldo end,
    v.rate_pagate, v.rate_totali, v.stornata, v.scoperto
  from vere v;
end $function$;

revoke all on function public.fatture_ricevute_saldi(uuid, integer) from public, anon;
grant execute on function public.fatture_ricevute_saldi(uuid, integer) to authenticated;
