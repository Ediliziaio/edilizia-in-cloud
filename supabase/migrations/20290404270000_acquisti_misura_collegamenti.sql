-- Misura dei collegamenti fatti dalle regole (docs/automazioni-acquisti.md §5, «misura in pagina»).
-- Per ogni regola, negli ultimi N giorni: quanti collegamenti, quanti fatti da soli, quanti
-- confermati a mano, quanti in attesa, quanti corretti da una persona (annullati o rifiutati) e la
-- percentuale di correzioni. La quota di lavori chiusi senza AI la dà già metriche_ai_azienda
-- (sessione A): qui si misura quanto le regole ci azzeccano.
-- Legge chi vede la traccia (costi o acquisti, o super admin dentro l'azienda). Solo lettura.

create or replace function public.acquisti_misura_collegamenti(p_company uuid, p_giorni integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_da timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_giorni, 30), 366))); v jsonb;
begin
  if public.utente_bloccato() or public.utente_e_cliente_esterno()
     or not (public.e_super_admin_dentro(p_company)
             or p_company = any (public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))) then
    raise exception 'Non puoi vedere i collegamenti di questa azienda.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(r order by r.totali desc), '[]'::jsonb) into v
    from (
      select regola,
             count(*) as totali,
             count(*) filter (where esito = 'automatico') as da_soli,
             count(*) filter (where esito <> 'automatico' and stato in ('collegato', 'verificato', 'approvato_pagamento', 'pagato')) as confermati,
             count(*) filter (where stato = 'proposto') as in_attesa,
             count(*) filter (where stato in ('annullato', 'rifiutato')) as corretti,
             round(100.0 * count(*) filter (where stato in ('annullato', 'rifiutato')) / nullif(count(*), 0), 1) as pct_corretti,
             count(*) filter (where con_ai) as con_ai
        from public.acquisti_collegamenti
       where company_id = p_company and created_at >= v_da
       group by regola
    ) r;
  return jsonb_build_object('giorni', greatest(1, least(coalesce(p_giorni, 30), 366)), 'regole', v);
end $$;
revoke all on function public.acquisti_misura_collegamenti(uuid, integer) from public, anon;
grant execute on function public.acquisti_misura_collegamenti(uuid, integer) to authenticated;
