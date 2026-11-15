-- Mutui alla data di riferimento, nello Stato patrimoniale e nella PFN (15/11/2026)
--
-- Banche, crediti e debiti sono già alla data dell'anno scelto; i mutui no:
-- al 31/12/2025 compariva il capitale residuo di oggi (Demo 2: 243.500 €),
-- come se le rate pagate nel 2026 fossero già state pagate a fine 2025. Il
-- debito di fine anno era più alto.
--
-- private.cg_mutui_al(azienda, data) dà, per ogni finanziamento attivo, il
-- capitale residuo alla data: partendo da quello di oggi e tornando indietro
-- di una rata al mese (ammortamento alla francese: residuo prima della rata =
-- (residuo + rata) / (1 + tasso mensile)), mai oltre il capitale iniziale.
-- I finanziamenti iniziati dopo la data non ci sono. A oggi il numero non
-- cambia.
-- Stato patrimoniale e PFN leggono i mutui da lì (stesse colonne della
-- tabella), quindi anche la quota entro 12 mesi parte dal residuo alla data.

create or replace function private.cg_mutui_al(p_company uuid, p_rif date)
returns table (id uuid, company_id uuid, is_active boolean, capitale_residuo numeric, rata_mensile numeric, tasso_pct numeric)
language sql stable security definer set search_path to '' as $$
  with b as (
    select l.*,
           greatest(0, (extract(year from current_date) * 12 + extract(month from current_date))
                     - (extract(year from p_rif) * 12 + extract(month from p_rif)))::integer as mesi,
           coalesce(l.tasso_pct, 0)::numeric / 1200 as i
      from public.cg_loans l
     where l.company_id = p_company and l.is_active = true
       and (l.data_inizio is null or l.data_inizio <= p_rif)
  )
  select b.id, b.company_id, b.is_active,
         least(coalesce(b.capitale_iniziale, 'Infinity'::numeric),
               case when b.mesi = 0 then coalesce(b.capitale_residuo, 0)::numeric
                    when b.i = 0 then coalesce(b.capitale_residuo, 0) + coalesce(b.rata_mensile, 0) * b.mesi
                    else coalesce(b.capitale_residuo, 0) / power(1 + b.i, b.mesi)
                         + coalesce(b.rata_mensile, 0) * (1 - 1 / power(1 + b.i, b.mesi)) / b.i end)::numeric(14,2),
         b.rata_mensile::numeric, b.tasso_pct::numeric
    from b
$$;
revoke all on function private.cg_mutui_al(uuid, date) from public, anon, authenticated;

do $p$
declare
  f text;
  vecchio text;
  nuovo text;
begin
  foreach f in array array['public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)', 'public.cg_get_pfn(uuid,integer)'] loop
    vecchio := pg_get_functiondef(f::regprocedure);
    if position('private.cg_mutui_al' in vecchio) > 0 then
      continue;
    end if;
    if (length(vecchio) - length(replace(vecchio, 'public.cg_loans', ''))) / length('public.cg_loans') <> 2 then
      raise exception '%: attese due letture dei mutui, la funzione è cambiata', f;
    end if;
    nuovo := replace(vecchio, 'public.cg_loans', 'private.cg_mutui_al(v_company_id, v_rif)');
    execute nuovo;
  end loop;
end $p$;
