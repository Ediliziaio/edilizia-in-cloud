-- ============================================================================
-- v_preventivi_unificati — aggiunta del verticale Ristrutturazione (rst_progetti)
-- ============================================================================
-- Ricrea la vista di convergenza preventivi (vedi 20270915000000) mantenendo
-- INVARIATI i tre flussi esistenti:
--   • classico      → public.quotes        (esclude i soft-deleted)
--   • serramenti    → public.sr_progetti
--   • fotovoltaico  → public.fv_progetti   (esclude gli annullati)
-- e aggiungendo un quarto ramo:
--   • ristrutturazione → public.rst_progetti
--
-- La mappatura stato_unificato di rst_progetti riusa la STESSA logica CASE dei
-- serramenti (gli stati condividono lo stesso vocabolario: bozza /
-- da_consegnare / consegnato / in_valutazione / accettato / rifiutato /
-- scaduto), così client e DB restano allineati (mirror di
-- mapRistrutturazioneStato ≡ mapSerramentiStato in statoUnificato.ts).
--
-- Allineamento colonne rst → schema vista:
--   numero         = COALESCE(code, '—')
--   cliente        = nome + cognome
--   commerciale_id = created_by
--   stato_raw      = stato
--   totale         = totale (già numeric sul progetto)
--   opportunity_id = opportunita_id
--   contact_id     = cliente_id
--   data           = created_at  (rst_progetti.updated_at esiste, ma per la
--                    colonna `data` usiamo created_at come richiesto dal piano;
--                    COALESCE per robustezza)
--
-- SICUREZZA: security_invoker = true → la vista eredita le RLS delle tabelle
-- sottostanti (isolamento per azienda). rst_progetti ha già le sue policy
-- company-scoped (migration 20271001000000). NON usare security definer.
--
-- IDEMPOTENTE: CREATE OR REPLACE VIEW. Migrazione LOCALE — da applicare via MCP
-- apply_migration solo in fase di pubblicazione (NON db push).
-- ============================================================================

CREATE OR REPLACE VIEW public.v_preventivi_unificati
WITH (security_invoker = true) AS

  -- ── Classici (quotes) ────────────────────────────────────────────────────
  SELECT
    q.id,
    q.company_id,
    'classico'::text                              AS tipo,
    COALESCE(q.quote_number, '—')                 AS numero,
    q.client_name                                 AS cliente,
    q.salesperson_id                              AS commerciale_id,
    q.status::text                                 AS stato_raw,
    CASE q.status::text
      WHEN 'bozza'        THEN 'bozza'
      WHEN 'draft'        THEN 'bozza'
      WHEN 'inviata'      THEN 'in_corso'
      WHEN 'sent'         THEN 'in_corso'
      WHEN 'viewed'       THEN 'in_corso'
      WHEN 'visualizzata' THEN 'in_corso'
      WHEN 'pending'      THEN 'in_corso'
      WHEN 'accettata'    THEN 'vinto'
      WHEN 'accepted'     THEN 'vinto'
      WHEN 'firmata'      THEN 'vinto'
      WHEN 'signed'       THEN 'vinto'
      WHEN 'convertita'   THEN 'vinto'
      WHEN 'rifiutata'    THEN 'perso'
      WHEN 'rejected'     THEN 'perso'
      WHEN 'scaduta'      THEN 'perso'
      WHEN 'expired'      THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    q.total::numeric                               AS totale,
    q.opportunity_id                               AS opportunity_id,
    q.contact_id                                   AS contact_id,
    COALESCE(q.updated_at, q.created_at)           AS data,
    q.created_at,
    q.updated_at
  FROM public.quotes q
  WHERE q.deleted_at IS NULL

  UNION ALL

  -- ── Serramenti (sr_progetti) ─────────────────────────────────────────────
  SELECT
    s.id,
    s.company_id,
    'serramenti'::text                             AS tipo,
    COALESCE(s.code, '—')                          AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', s.cliente_nome, s.cliente_cognome)), '') AS cliente,
    s.consulente_id                                AS commerciale_id,
    s.stato::text                                  AS stato_raw,
    CASE s.stato::text
      WHEN 'bozza'         THEN 'bozza'
      WHEN 'da_consegnare' THEN 'in_corso'
      WHEN 'consegnato'    THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso'
      WHEN 'accettato'     THEN 'vinto'
      WHEN 'rifiutato'     THEN 'perso'
      WHEN 'scaduto'       THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    CASE
      WHEN s.totale_min IS NOT NULL AND s.totale_max IS NOT NULL
      THEN (s.totale_min::numeric + s.totale_max::numeric) / 2.0
      ELSE NULL
    END                                            AS totale,
    s.opportunita_id                               AS opportunity_id,
    s.cliente_id                                   AS contact_id,
    COALESCE(s.updated_at, s.created_at)           AS data,
    s.created_at,
    s.updated_at
  FROM public.sr_progetti s

  UNION ALL

  -- ── Fotovoltaico (fv_progetti) ───────────────────────────────────────────
  SELECT
    f.id,
    f.company_id,
    'fotovoltaico'::text                           AS tipo,
    COALESCE(f.numero, '—')                        AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', mc.first_name, mc.last_name)), '') AS cliente,
    f.created_by                                   AS commerciale_id,
    f.stato::text                                  AS stato_raw,
    CASE f.stato::text
      WHEN 'bozza'       THEN 'bozza'
      WHEN 'configurato' THEN 'in_corso'
      WHEN 'emesso'      THEN 'in_corso'
      WHEN 'firmato'     THEN 'vinto'
      WHEN 'annullato'   THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    f.prezzo_vendita_iva_inclusa::numeric          AS totale,
    f.opportunita_crm_id                           AS opportunity_id,
    f.cliente_id                                   AS contact_id,
    COALESCE(f.updated_at, f.created_at)           AS data,
    f.created_at,
    f.updated_at
  FROM public.fv_progetti f
  LEFT JOIN public.marketing_contacts mc ON mc.id = f.cliente_id
  WHERE f.annullato = false

  UNION ALL

  -- ── Ristrutturazione (rst_progetti) ──────────────────────────────────────
  -- Stessa logica CASE dei serramenti (vocabolario stato condiviso).
  SELECT
    r.id,
    r.company_id,
    'ristrutturazione'::text                       AS tipo,
    COALESCE(r.code, '—')                          AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', r.cliente_nome, r.cliente_cognome)), '') AS cliente,
    r.created_by                                   AS commerciale_id,
    r.stato::text                                  AS stato_raw,
    CASE r.stato::text
      WHEN 'bozza'          THEN 'bozza'
      WHEN 'da_consegnare'  THEN 'in_corso'
      WHEN 'consegnato'     THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso'
      WHEN 'accettato'      THEN 'vinto'
      WHEN 'rifiutato'      THEN 'perso'
      WHEN 'scaduto'        THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    r.totale::numeric                              AS totale,
    r.opportunita_id                               AS opportunity_id,
    r.cliente_id                                   AS contact_id,
    COALESCE(r.created_at, r.updated_at)           AS data,
    r.created_at,
    r.updated_at
  FROM public.rst_progetti r;

COMMENT ON VIEW public.v_preventivi_unificati IS
  'Convergenza preventivi cross-modulo (classico/serramenti/fotovoltaico/ristrutturazione). security_invoker=true → eredita le RLS delle tabelle base (isolamento per azienda). Mirror server-side del merge di UnifiedPreventiviList.';

GRANT SELECT ON public.v_preventivi_unificati TO authenticated;
