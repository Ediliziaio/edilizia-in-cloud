-- I conflitti di versione sono definitivi per la richiesta corrente. SQLSTATE 40001
-- induce PostgREST/Hasql a ripetere la transazione: lo stesso salvataggio obsoleto
-- ha tenuto un backend in retry dal 4 novembre, generando ~48.000 errori in 13 ore.
-- PT409 restituisce HTTP 409 senza retry, conservando TUTTI i controlli e messaggi.
-- Manifest revisionato: 46 funzioni, 83 guardie applicative. Nessuna riga dati,
-- firma, proprietà, SECURITY DEFINER/INVOKER, search_path o ACL viene modificata.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $migration$
declare f record; originale text; corretto text;
begin
  for f in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f'
      and p.proname = any(array[
        'commessa_salva',
        'converti_modulo_commessa_atomic',
        'duplica_lavoro_atomic',
        'fv_save_configuration_atomic',
        'guard_automation_enrollment',
        'materiale_rientro_magazzino',
        'mezzi_verbale_completa',
        'mezzi_verbale_copia_esistente',
        'planimetria_salva_versione',
        'pos_completa_emissione',
        'pos_documenti_mezzi_guardia',
        'pos_documenti_mezzi_verifica',
        'pos_documento_mezzo_per_autore',
        'pos_documento_tecnico_apri',
        'pos_fonti_tecniche_guardia',
        'pos_fonti_tecniche_verifica',
        'pos_mezzi_guardia',
        'pos_mezzi_verifica',
        'pos_originale_addetto_per_autore',
        'pos_prenota_emissione',
        'pos_prodotti_editor_guardia',
        'pos_prodotti_verifica',
        'pos_psc_guardia',
        'pos_psc_verifica',
        'pos_requisiti_addetti_guardia',
        'pos_requisiti_addetti_verifica',
        'pos_riesame_proprio_foto',
        'pos_tecnica_guardia',
        'riclassifica_righe_storiche',
        'salva_flusso_lavoro_atomico',
        'save_automation_graph',
        'sds_collega_revisione',
        'sicurezza_archivia_profilo',
        'sicurezza_prodotto_salva',
        'sicurezza_qualifica_registra',
        'sicurezza_registra_addetti',
        'sicurezza_registra_itp',
        'sicurezza_salva_dpi',
        'sicurezza_salva_profilo',
        'sicurezza_sub_dpi_guardia',
        'sr_apply_ai_bom_atomic',
        'sub_dpi_apri_verbale',
        'sub_dpi_salva',
        'versione_riga',
        'warehouse_rettifica_giacenza'
      ])
      and p.prosrc ~* $pattern$errcode[[:space:]]*=[[:space:]]*'40001'$pattern$
  loop
    originale := pg_get_functiondef(f.oid);
    corretto := regexp_replace(
      originale,
      $pattern$(errcode[[:space:]]*=[[:space:]]*)'40001'$pattern$,
      $replacement$\1'PT409'$replacement$,
      'gi'
    );
    if corretto is distinct from originale then execute corretto; end if;
  end loop;
end
$migration$;
notify pgrst, 'reload schema';

