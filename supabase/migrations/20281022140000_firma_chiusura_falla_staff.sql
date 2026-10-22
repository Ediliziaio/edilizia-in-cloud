-- Firma elettronica: lo staff non può più scrivere le richieste di firma.
--
-- La policy `company_staff_signature_requests` (FOR ALL) dava ad admin e staff
-- dell'azienda lettura E SCRITTURA su `signature_requests`: si poteva segnare un
-- documento «firmato» senza la firma del cliente, cambiare l'email o il cellulare
-- del firmatario per ricevere il codice al suo posto, o leggere l'impronta del
-- codice OTP (6 cifre: si risale al codice in un istante). La firma perdeva il
-- «controllo esclusivo» del firmatario (eIDAS art. 26 c; DPCM 22/02/2013 art. 56).
--
-- Da qui:
-- 1. Le richieste di firma si scrivono SOLO dalle funzioni del server
--    (fea-richiedi-firma, fea-genera-otp, fea-verifica-otp, fea-completa-firma,
--    fea-rifiuta-firma, send-quote-signature…, che usano la chiave di servizio).
--    Nessuna schermata dell'app le scrive (verificato il 22/10/2026).
-- 2. L'app le legge, ma senza l'impronta del codice OTP (colonna non concessa).
-- 3. Via le due policy «via token» (header x-signature-token): inerti con il
--    PostgREST di oggi, ma una delle due permetteva pending → signed senza codice.
-- 4. Il registro di audit (`fea_audit_log`) lo scrive solo il server: prima gli
--    utenti dell'azienda potevano inserire eventi qualsiasi.

-- ── 1-3. signature_requests ────────────────────────────────────────────────
drop policy if exists company_staff_signature_requests on public.signature_requests;
drop policy if exists public_update_by_token on public.signature_requests;
drop policy if exists public_read_by_token on public.signature_requests;

create policy company_staff_signature_requests_lettura on public.signature_requests for select to authenticated
  using (public.e_amministratore_di(company_id)
    or (company_id = (select public.get_my_company_id()) and (select public.has_role(auth.uid(), 'company_staff'::public.app_role)))
    or (select public.has_role(auth.uid(), 'super_admin'::public.app_role)));

revoke all on public.signature_requests from anon, authenticated;
-- Lettura colonna per colonna: tutto tranne l'impronta del codice OTP.
grant select (
  id, company_id, token, signer_email, signer_name, signer_phone, status, tipo_documento, tipo_firmatario,
  categoria, note, order_id, quote_id, sessione_id, fv_progetto_id, contratto_subappalto_id,
  created_at, created_by, updated_at, expires_at, signed_at, refused_at, rifiuto_motivo,
  otp_canale, otp_scadenza, otp_tentativi, documento_hash, documento_hash_firma,
  firma_ip, firma_user_agent, firma_lat, firma_lng, signed_by_ip, signature_data,
  b2c_clausole, b2c_email_copia, b2c_recesso, b2c_recesso_ts,
  clausole_approvate, clausole_approvate_testi, clausole_approvate_ts,
  certificato_url, codice_verifica, signed_pdf_hash, signed_pdf_path
) on public.signature_requests to authenticated;

-- ── 4. Registro di audit: solo il server scrive ────────────────────────────
drop policy if exists fea_audit_insert on public.fea_audit_log;
revoke insert, update, delete, truncate on public.fea_audit_log from anon, authenticated;
