-- «Contratto e pagamenti» del subappaltatore nell'app (26/11/2026, piano campo completo, punto 3.3).
--
-- Finora contratti, SAL e pagamenti della ditta si vedevano solo in ufficio. Ora la ditta vede i SUOI, in sola
-- lettura: lavori affidati e importo, SAL con stato e data di pagamento, quanto ha maturato, quanto è stato
-- pagato, quanto aspetta, la ritenuta trattenuta. Solo contratti attivi o completati (le bozze no).
--
-- L'azienda può spegnerlo (campo_avvisi_azienda.sub_vede_pagamenti, acceso di default: sono dati della ditta
-- stessa). La ditta è riconosciuta da subappaltatori.user_id; i contratti puntano a subappaltatori_sicurezza,
-- collegata alla ditta da campo_subappaltatore_id.

alter table public.campo_avvisi_azienda add column if not exists sub_vede_pagamenti boolean not null default true;

create or replace function public.campo_sub_contratti()
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or public.utente_bloccato() then
    raise exception 'Sessione non autorizzata.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(c order by c->>'stato', c->>'cantiere')
    from (
      select jsonb_build_object(
        'id', cs.id, 'numero', cs.numero_contratto, 'lavori', cs.descrizione_lavori, 'stato', cs.stato,
        'cantiere', concat_ws(' · ', nullif(o.order_code, ''), nullif(left(o.description, 60), '')),
        'importo', coalesce(cs.importo_contrattuale, 0) + coalesce(cs.oneri_sicurezza, 0),
        'ritenuta_pct', cs.ritenuta_garanzia_pct, 'modalita_pagamento', cs.modalita_pagamento,
        'maturato', coalesce((select sum(sa.importo_lordo) from public.sal_subappaltatori sa
                              where sa.contratto_id = cs.id and sa.stato in ('verificato', 'pagato')), 0),
        'pagato', coalesce((select sum(coalesce(sa.pagato_registrato, sa.importo_netto)) from public.sal_subappaltatori sa
                            where sa.contratto_id = cs.id and sa.stato = 'pagato'), 0),
        'da_pagare', coalesce((select sum(sa.importo_netto) from public.sal_subappaltatori sa
                               where sa.contratto_id = cs.id and sa.stato = 'verificato'), 0),
        'ritenute', coalesce((select sum(sa.ritenuta_importo) from public.sal_subappaltatori sa
                              where sa.contratto_id = cs.id and sa.stato in ('verificato', 'pagato')), 0),
        'sal', coalesce((select jsonb_agg(jsonb_build_object(
                  'numero', sa.numero_sal, 'data', sa.data_emissione, 'lordo', sa.importo_lordo,
                  'netto', sa.importo_netto, 'stato', sa.stato, 'pagato_il', sa.data_pagamento)
                  order by sa.numero_sal desc)
                from public.sal_subappaltatori sa where sa.contratto_id = cs.id), '[]'::jsonb)
      ) as c
      from public.contratti_subappalto cs
      join public.subappaltatori_sicurezza ss on ss.id = cs.subappaltatore_id
      join public.subappaltatori s on s.id = ss.campo_subappaltatore_id and s.user_id = v_uid
      left join public.orders o on o.id = cs.order_id
      where cs.stato in ('attivo', 'completato')
        and cs.company_id = s.company_id
        and coalesce((select a.sub_vede_pagamenti from public.campo_avvisi_azienda a where a.company_id = cs.company_id), true)
    ) x
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.campo_sub_contratti() from public, anon;
grant execute on function public.campo_sub_contratti() to authenticated;

-- Leggere e cambiare l'interruttore: stesse funzioni dell'avviso di domani, con un campo in più.
create or replace function public.campo_avvisi_azienda_leggi(p_company_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not (public.campo_e_ufficio(p_company_id)
             or public.has_permission_for_company(auth.uid(), 'can_view_settings_orders', p_company_id)) then
    raise exception using errcode = '42501', message = 'Non puoi vedere queste impostazioni.';
  end if;
  return jsonb_build_object(
    'avviso_domani', coalesce((select a.avviso_domani from public.campo_avvisi_azienda a where a.company_id = p_company_id), false),
    'sub_vede_pagamenti', coalesce((select a.sub_vede_pagamenti from public.campo_avvisi_azienda a where a.company_id = p_company_id), true));
end;
$function$;

create or replace function public.campo_avvisi_azienda_salva_pagamenti_sub(p_company_id uuid, p_attivo boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception using errcode = '42501', message = 'Non puoi cambiare queste impostazioni.';
  end if;
  insert into public.campo_avvisi_azienda (company_id, sub_vede_pagamenti, aggiornato_da, aggiornato_il)
  values (p_company_id, coalesce(p_attivo, true), auth.uid(), now())
  on conflict (company_id) do update
    set sub_vede_pagamenti = excluded.sub_vede_pagamenti, aggiornato_da = excluded.aggiornato_da, aggiornato_il = now();
  return jsonb_build_object('sub_vede_pagamenti', coalesce(p_attivo, true));
end;
$function$;

revoke all on function public.campo_avvisi_azienda_salva_pagamenti_sub(uuid, boolean) from public, anon;
grant execute on function public.campo_avvisi_azienda_salva_pagamenti_sub(uuid, boolean) to authenticated;
