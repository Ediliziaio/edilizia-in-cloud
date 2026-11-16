-- Chi vede i costi: la stessa regola anche nelle regole per riga (16/11/2026).
--
-- Compagna di 20290417140000. Qui le policy che chiedevano il solo `can_view_costs`
-- mentre l'app mostra la pagina con `canViewCosts` (Costi OPPURE Gestione acquisti).
-- Si cambia la sola espressione (ALTER POLICY), non si rifanno le regole: ogni
-- CREATE/ALTER POLICY blocca auth finché la transazione non chiude, quindi è corta.
--
-- Restano fuori di proposito: `permessi_finanza` (cespiti, patrimonio netto, mutui, TFR,
-- prima nota, storico fiscale: elenco di permessi di amministrazione, non i costi di
-- cantiere), `scadenze_lettura`, le regole di storage sui documenti fiscali e
-- `campo_rapportini.cr_select`, dove `can_view_costs` è una via in più e chi gestisce gli
-- acquisti passa già da `can_view_orders`.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  d record;
  q text; w text; q0 text; w0 text; sql text; n int := 0;
begin
  for d in
    select * from (values
      ('public.computo_preventivo_costi','computo_costi_lettura'),('public.computo_preventivo_costi','computo_costi_modifica'),
      ('public.computo_preventivo_costi','computo_costi_scrittura'),
      ('public.contratti_subappalto','ufficio_leggi'),('public.contratti_subappalto','ufficio_scrivi'),
      ('public.cost_budgets','Permesso costi: budget elimina'),('public.cost_budgets','Permesso costi: budget inserisce'),
      ('public.cost_budgets','Permesso costi: budget legge'),('public.cost_budgets','Permesso costi: budget modifica'),
      ('public.cost_categories','Permesso costi: categorie elimina'),('public.cost_categories','Permesso costi: categorie inserisce'),
      ('public.cost_categories','Permesso costi: categorie legge'),('public.cost_categories','Permesso costi: categorie modifica'),
      ('public.costi_orari_storico','costi_orari_storico_lettura'),
      ('public.generale_subappalto_ordini','generale_subappalto_ordini_lettura'),
      ('public.hr_rimborsi_km','hrk_select_costi_commessa'),
      ('public.mezzi_piani_costi','lettura'),('public.mezzi_piani_spese','lettura'),
      ('public.order_external_teams','oet_scrittura_ufficio'),
      ('public.order_work_phase_voci','voci_fase_lettura'),('public.order_work_phase_voci','voci_fase_scrittura'),
      ('public.ritenute_garanzia','ufficio_leggi'),('public.ritenute_garanzia','ufficio_scrivi'),
      ('public.sal_sub_pagamenti','sal_quote_read'),('public.sal_sub_verbali','sal_sub_verbali_lettura'),
      ('public.sal_subappaltatori','ufficio_leggi'),('public.sal_subappaltatori','ufficio_scrivi'),
      ('public.silvio_correzioni','silvio_correzioni_lettura'),
      ('public.subappalto_affidamenti','affidamenti_lettura'),('public.subappalto_contratti_carta','contratti_carta_leggi'),
      ('public.subappalto_misure','subappalto_misure_leggi'),('public.subappalto_modello_contratto','subappalto_modello_leggi'),
      ('public.subappalto_modello_contratto','subappalto_modello_scrivi'),('public.subappalto_quadri_lavori','subappalto_quadri_leggi'),
      ('public.subappalto_varianti_contratto','subappalto_varianti_leggi'),
      ('public.tariffa_costi_varianti','varianti_lettura_costi'),('public.tariffa_costi_varianti','varianti_scrittura_listino'),
      ('public.warehouse_rincari','warehouse_rincari_lettura')
    ) t(tab, pol)
  loop
    select pg_get_expr(po.polqual, po.polrelid), pg_get_expr(po.polwithcheck, po.polrelid)
      into q0, w0
      from pg_policy po where po.polrelid = d.tab::regclass and po.polname = d.pol;
    if not found then raise exception 'Regola % su % non trovata', d.pol, d.tab; end if;
    if coalesce(q0,'') || coalesce(w0,'') ilike '%puo_vedere_costi%' then continue; end if;

    q := replace(regexp_replace(q0,
      '(public\.)?has_permission_for_company\(\s*([^,]+?)\s*,\s*''can_view_costs''(::text)?\s*,\s*((?:[a-z_]+\([^()]*\))|[^),]+?)\s*\)',
      'public.puo_vedere_costi(\2, \4)', 'gi'),
      'aziende_con_permesso(''can_view_costs''::text)',
      'aziende_con_uno_dei_permessi(ARRAY[''can_view_costs''::text, ''can_manage_purchasing''::text])');
    w := replace(regexp_replace(w0,
      '(public\.)?has_permission_for_company\(\s*([^,]+?)\s*,\s*''can_view_costs''(::text)?\s*,\s*((?:[a-z_]+\([^()]*\))|[^),]+?)\s*\)',
      'public.puo_vedere_costi(\2, \4)', 'gi'),
      'aziende_con_permesso(''can_view_costs''::text)',
      'aziende_con_uno_dei_permessi(ARRAY[''can_view_costs''::text, ''can_manage_purchasing''::text])');

    if coalesce(q,'') || coalesce(w,'') ilike '%can_view_costs%'
       and coalesce(q,'') || coalesce(w,'') not ilike '%can_manage_purchasing%' then
      raise exception 'Sostituzione non riuscita su %.%', d.tab, d.pol;
    end if;
    if q is not distinct from q0 and w is not distinct from w0 then
      raise exception 'Nessuna sostituzione su %.%', d.tab, d.pol;
    end if;

    sql := format('alter policy %I on %s', d.pol, d.tab);
    if q is not null then sql := sql || format(' using (%s)', q); end if;
    if w is not null then sql := sql || format(' with check (%s)', w); end if;
    execute sql;
    n := n + 1;
  end loop;
  raise notice 'Regole convertite: %', n;
end $$;
