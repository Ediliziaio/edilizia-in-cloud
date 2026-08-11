-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

ALTER TABLE public.subappaltatori_sicurezza
  ADD COLUMN IF NOT EXISTS codice_fiscale text;

CREATE OR REPLACE VIEW public.v_subappaltatori_dashboard AS
 SELECT ss.id,
    ss.company_id,
    ss.order_id,
    ss.ragione_sociale,
    ss.tipo_lavori,
    ss.responsabile,
    ss.telefono,
    ss.piva,
    ss.email,
    ss.pec,
    ss.indirizzo,
    ss.note,
    ss.campo_subappaltatore_id,
    sc.user_id AS campo_user_id,
    sc.user_email AS campo_user_email,
    COALESCE(sc.is_active, false) AS campo_is_active,
    ss.durc_scadenza,
    cs.id AS contratto_id,
    cs.importo_contrattuale,
    cs.ritenuta_garanzia_pct,
    cs.stato AS stato_contratto,
    COALESCE(sum(sal.importo_lordo), 0::numeric) AS totale_sal_lordo,
    COALESCE(sum(sal.importo_netto), 0::numeric) AS totale_sal_netto,
    COALESCE(sum(rg.importo) FILTER (WHERE rg.stato = 'trattenuta'::text), 0::numeric) AS ritenute_in_corso,
    COALESCE(sum(rg.importo) FILTER (WHERE rg.stato = 'svincolata'::text), 0::numeric) AS ritenute_svincolate,
    COALESCE(cs.importo_contrattuale, 0::numeric) - COALESCE(sum(sal.importo_lordo), 0::numeric) AS residuo_contrattuale,
    ss.codice_fiscale
   FROM subappaltatori_sicurezza ss
     LEFT JOIN subappaltatori sc ON sc.id = ss.campo_subappaltatore_id
     LEFT JOIN contratti_subappalto cs ON cs.subappaltatore_id = ss.id
     LEFT JOIN sal_subappaltatori sal ON sal.contratto_id = cs.id
     LEFT JOIN ritenute_garanzia rg ON rg.contratto_id = cs.id
  GROUP BY ss.id, cs.id, sc.user_id, sc.user_email, sc.is_active;
