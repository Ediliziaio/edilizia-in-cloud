-- v_preventivi_unificati — aggiunta del verticale Piscine (pis_progetti).
-- Ricrea la vista di convergenza preventivi (vedi 20270915000000 + 20271001010000 +
-- 20271101030000 + 20271102030000) mantenendo INVARIATI i flussi esistenti
-- (classico, serramenti, fotovoltaico, ristrutturazione, bagni, tetti) e aggiungendo
-- il branch Climatizzazione con la STESSA logica CASE di Ristrutturazione.
--
-- SICUREZZA: security_invoker = true → la vista eredita le RLS delle tabelle.
-- IDEMPOTENTE: CREATE OR REPLACE VIEW. Migrazione LOCALE — applicata via MCP in
-- pubblicazione del modulo Piscine.

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
  FROM public.rst_progetti r

  UNION ALL

  -- ── Bagni (bgn_progetti) ─────────────────────────────────────────────────
  -- Stessa logica CASE di Ristrutturazione (vocabolario stato condiviso).
  SELECT
    g.id,
    g.company_id,
    'bagni'::text                                  AS tipo,
    COALESCE(g.code, '—')                          AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', g.cliente_nome, g.cliente_cognome)), '') AS cliente,
    g.created_by                                   AS commerciale_id,
    g.stato::text                                  AS stato_raw,
    CASE g.stato::text
      WHEN 'bozza'          THEN 'bozza'
      WHEN 'da_consegnare'  THEN 'in_corso'
      WHEN 'consegnato'     THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso'
      WHEN 'accettato'      THEN 'vinto'
      WHEN 'rifiutato'      THEN 'perso'
      WHEN 'scaduto'        THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    g.totale::numeric                              AS totale,
    g.opportunita_id                               AS opportunity_id,
    g.cliente_id                                   AS contact_id,
    COALESCE(g.created_at, g.updated_at)           AS data,
    g.created_at,
    g.updated_at
  FROM public.bgn_progetti g

  UNION ALL

  -- ── Tetti (tet_progetti) ─────────────────────────────────────────────────
  -- Stessa logica CASE di Ristrutturazione (vocabolario stato condiviso).
  SELECT
    b.id,
    b.company_id,
    'tetti'::text                                  AS tipo,
    COALESCE(b.code, '—')                          AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', b.cliente_nome, b.cliente_cognome)), '') AS cliente,
    b.created_by                                   AS commerciale_id,
    b.stato::text                                  AS stato_raw,
    CASE b.stato::text
      WHEN 'bozza'          THEN 'bozza'
      WHEN 'da_consegnare'  THEN 'in_corso'
      WHEN 'consegnato'     THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso'
      WHEN 'accettato'      THEN 'vinto'
      WHEN 'rifiutato'      THEN 'perso'
      WHEN 'scaduto'        THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    b.totale::numeric                              AS totale,
    b.opportunita_id                               AS opportunity_id,
    b.cliente_id                                   AS contact_id,
    COALESCE(b.created_at, b.updated_at)           AS data,
    b.created_at,
    b.updated_at
  FROM public.tet_progetti b

  UNION ALL

  -- ── Climatizzazione (clm_progetti) ───────────────────────────────────────
  -- Stessa logica CASE di Ristrutturazione (vocabolario stato condiviso).
  SELECT
    c.id,
    c.company_id,
    'climatizzazione'::text                        AS tipo,
    COALESCE(c.code, '—')                          AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', c.cliente_nome, c.cliente_cognome)), '') AS cliente,
    c.created_by                                   AS commerciale_id,
    c.stato::text                                  AS stato_raw,
    CASE c.stato::text
      WHEN 'bozza'          THEN 'bozza'
      WHEN 'da_consegnare'  THEN 'in_corso'
      WHEN 'consegnato'     THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso'
      WHEN 'accettato'      THEN 'vinto'
      WHEN 'rifiutato'      THEN 'perso'
      WHEN 'scaduto'        THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    c.totale::numeric                              AS totale,
    c.opportunita_id                               AS opportunity_id,
    c.cliente_id                                   AS contact_id,
    COALESCE(c.created_at, c.updated_at)           AS data,
    c.created_at,
    c.updated_at
  FROM public.clm_progetti c

  UNION ALL

  -- ── Elettrico (ele_progetti) ───────────────────────────
  -- Stessa logica CASE di Ristrutturazione (vocabolario stato condiviso).
  SELECT
    e.id,
    e.company_id,
    'elettrico'::text                            AS tipo,
    COALESCE(e.code, '—')                          AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', e.cliente_nome, e.cliente_cognome)), '') AS cliente,
    e.created_by                                   AS commerciale_id,
    e.stato::text                                  AS stato_raw,
    CASE e.stato::text
      WHEN 'bozza'          THEN 'bozza'
      WHEN 'da_consegnare'  THEN 'in_corso'
      WHEN 'consegnato'     THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso'
      WHEN 'accettato'      THEN 'vinto'
      WHEN 'rifiutato'      THEN 'perso'
      WHEN 'scaduto'        THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    e.totale::numeric                              AS totale,
    e.opportunita_id                               AS opportunity_id,
    e.cliente_id                                   AS contact_id,
    COALESCE(e.created_at, e.updated_at)           AS data,
    e.created_at,
    e.updated_at
  FROM public.ele_progetti e

  UNION ALL

  -- Termoidraulico (idr_progetti) - stessa logica CASE di Ristrutturazione.
  SELECT
    i.id,
    i.company_id,
    'termoidraulico'::text                       AS tipo,
    COALESCE(i.code, '—')                          AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', i.cliente_nome, i.cliente_cognome)), '') AS cliente,
    i.created_by                                   AS commerciale_id,
    i.stato::text                                  AS stato_raw,
    CASE i.stato::text
      WHEN 'bozza'          THEN 'bozza'
      WHEN 'da_consegnare'  THEN 'in_corso'
      WHEN 'consegnato'     THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso'
      WHEN 'accettato'      THEN 'vinto'
      WHEN 'rifiutato'      THEN 'perso'
      WHEN 'scaduto'        THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    i.totale::numeric                              AS totale,
    i.opportunita_id                               AS opportunity_id,
    i.cliente_id                                   AS contact_id,
    COALESCE(i.created_at, i.updated_at)           AS data,
    i.created_at,
    i.updated_at
  FROM public.idr_progetti i

  UNION ALL

  -- Pavimenti (pav_progetti) - stessa logica CASE di Ristrutturazione.
  SELECT
    p.id,
    p.company_id,
    'pavimenti'::text                            AS tipo,
    COALESCE(p.code, '—')                          AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', p.cliente_nome, p.cliente_cognome)), '') AS cliente,
    p.created_by                                   AS commerciale_id,
    p.stato::text                                  AS stato_raw,
    CASE p.stato::text
      WHEN 'bozza'          THEN 'bozza'
      WHEN 'da_consegnare'  THEN 'in_corso'
      WHEN 'consegnato'     THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso'
      WHEN 'accettato'      THEN 'vinto'
      WHEN 'rifiutato'      THEN 'perso'
      WHEN 'scaduto'        THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    p.totale::numeric                              AS totale,
    p.opportunita_id                               AS opportunity_id,
    p.cliente_id                                   AS contact_id,
    COALESCE(p.created_at, p.updated_at)           AS data,
    p.created_at,
    p.updated_at
  FROM public.pav_progetti p

  UNION ALL

  -- Piscine (pis_progetti) - stessa logica CASE di Ristrutturazione.
  SELECT
    ps.id,
    ps.company_id,
    'piscine'::text                              AS tipo,
    COALESCE(ps.code, '—')                         AS numero,
    NULLIF(BTRIM(CONCAT_WS(' ', ps.cliente_nome, ps.cliente_cognome)), '') AS cliente,
    ps.created_by                                  AS commerciale_id,
    ps.stato::text                                 AS stato_raw,
    CASE ps.stato::text
      WHEN 'bozza'          THEN 'bozza'
      WHEN 'da_consegnare'  THEN 'in_corso'
      WHEN 'consegnato'     THEN 'in_corso'
      WHEN 'in_valutazione' THEN 'in_corso'
      WHEN 'accettato'      THEN 'vinto'
      WHEN 'rifiutato'      THEN 'perso'
      WHEN 'scaduto'        THEN 'perso'
      ELSE 'altro'
    END                                            AS stato_unificato,
    ps.totale::numeric                             AS totale,
    ps.opportunita_id                              AS opportunity_id,
    ps.cliente_id                                  AS contact_id,
    COALESCE(ps.created_at, ps.updated_at)         AS data,
    ps.created_at,
    ps.updated_at
  FROM public.pis_progetti ps;

COMMENT ON VIEW public.v_preventivi_unificati IS
  'Convergenza preventivi cross-modulo: quotes (classico) + sr_progetti (serramenti) + fv_progetti (fotovoltaico) + rst_progetti (ristrutturazione) + bgn_progetti (bagni) + tet_progetti (tetti) + clm_progetti (climatizzazione) + ele_progetti (elettrico) + idr_progetti (termoidraulico) + pav_progetti (pavimenti) + pis_progetti (piscine). security_invoker eredita le RLS delle tabelle sorgente.';
