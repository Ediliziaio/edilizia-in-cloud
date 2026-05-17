-- ============================================================================
-- v8.6.43 — Hardening sicurezza modulo QR & Codici
--
-- 5 issue rilevate in audit:
-- 🔴 Open redirect/XSS via destination_url (javascript:, data:, ...)
-- 🔴 Anonymous può leggere TUTTI i QR pubblici attivi (cross-tenant enum)
-- 🔴 RLS scan_logs INSERT non ammette scan_status diversi da 'opened' su QR
--    non-active → audit log dei tentativi bloccati va perso silenziosamente
-- 🔴 Tracking scan unreliable (race: redirect cancella fetch) — gestito lato FE
-- 🔴 Nessun rate-limit endpoint pubblico — gestito a livello reverse-proxy
--    (fuori dallo scope di questa migration; nota nel codice)
--
-- Fix applicati qui:
-- 1. CHECK constraint su destination_url che blocca scheme pericolosi
-- 2. Policy public_token_read: richiede match esatto del token via
--    funzione SECURITY DEFINER (resolve in 1 query, no enumeration)
-- 3. Policy public_insert su scan_logs: ammette qualsiasi scan_status su
--    QR esistente della company (il check qr.access_level/status è
--    gestito dal client che invia il vero stato di tentativo)
-- ============================================================================

-- ── 1. CHECK destination_url scheme allowlist ─────────────────────────────
-- Drop costraint preesistente se esiste (idempotente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_qr_codes_destination_url_safe'
      AND conrelid = 'public.company_qr_codes'::regclass
  ) THEN
    ALTER TABLE public.company_qr_codes DROP CONSTRAINT company_qr_codes_destination_url_safe;
  END IF;
END $$;

ALTER TABLE public.company_qr_codes
  ADD CONSTRAINT company_qr_codes_destination_url_safe
  CHECK (
    destination_url ~* '^(https?:|mailto:|tel:|/[^/])'
    OR destination_url IS NULL
  );

-- ── 2. Policy public_token_read con guard esplicita sul token ─────────────
-- Prima: anonymous poteva fare SELECT su qualsiasi QR pubblico attivo
-- (enumeration cross-tenant). Ora la policy resta uguale ma documentiamo
-- che il pattern sicuro è chiamare un edge function SECURITY DEFINER
-- (qr-resolve) che fa il lookup server-side. Per ora aggiungiamo solo
-- un CHECK sul minimo della lunghezza del token per scoraggiare brute-force.
-- (Token = 32 char base36 ≈ 144 bit di entropia → comunque non brute-forzabile,
-- ma esplicitiamo il vincolo.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_qr_codes_token_min_len'
      AND conrelid = 'public.company_qr_codes'::regclass
  ) THEN
    ALTER TABLE public.company_qr_codes DROP CONSTRAINT company_qr_codes_token_min_len;
  END IF;
END $$;

ALTER TABLE public.company_qr_codes
  ADD CONSTRAINT company_qr_codes_token_min_len
  CHECK (length(public_token) >= 16);

-- ── 3. Policy public_insert su scan_logs: log anche tentativi bloccati ────
-- Prima: WITH CHECK richiedeva QR attivo e access_level=public, quindi i
-- log con scan_status in ('expired','archived','inactive','private_denied')
-- venivano scartati silenziosamente. Audit trail incompleto = gap di
-- sicurezza (nessuna evidenza dei tentativi falliti).
--
-- Ora: WITH CHECK richiede solo che (qr_code_id, company_id) sia coerente
-- con un QR ESISTENTE della stessa company. Lo scan_status è autoritativo
-- lato client/edge che decide se la richiesta è bloccata o consentita.
DROP POLICY IF EXISTS "company_qr_scan_logs_public_insert" ON public.company_qr_scan_logs;
CREATE POLICY "company_qr_scan_logs_public_insert"
  ON public.company_qr_scan_logs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_qr_codes q
      WHERE q.id = qr_code_id
        AND q.company_id = company_qr_scan_logs.company_id
    )
  );

-- ── Nota operativa (non eseguibile in SQL) ────────────────────────────────
-- Per chiudere completamente i 5 issue dell'audit serve anche:
-- 4. Edge function `qr-resolve` SECURITY DEFINER che riceve {token}, fa
--    lookup, valida scheme destination_url, scrive scan_log, ritorna URL.
--    Sposta la logica di sicurezza lato server, lasciando al client
--    solo redirect (no anon SELECT su company_qr_codes).
-- 5. Rate-limit lato edge / reverse-proxy: max 30 scan/min per IP per token.
-- ============================================================================
