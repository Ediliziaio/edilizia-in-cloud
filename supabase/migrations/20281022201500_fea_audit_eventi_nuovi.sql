-- Registro della firma: gli eventi nuovi del 22/10/2026.
--
-- 20281022150000 li aggiungeva, ma in produzione quel pezzo non era arrivato:
-- la prova di firma del 22/10 su Demo Azienda 2 ha mostrato che
-- «documento_congelato» veniva rifiutato in silenzio (le funzioni scrivono il
-- registro senza fermarsi). Senza questi eventi mancavano dal registro la copia
-- congelata, l'identificazione, l'accettazione delle condizioni, i tentativi
-- esauriti e la conservazione delle prove.
alter table public.fea_audit_log drop constraint if exists fea_audit_log_evento_check;
alter table public.fea_audit_log add constraint fea_audit_log_evento_check check (evento = any (array[
  'sessione_creata', 'link_inviato', 'link_aperto', 'otp_inviato', 'otp_verificato', 'otp_fallito',
  'documento_visualizzato', 'recesso_accettato', 'clausola_approvata', 'firma_completata', 'firma_rifiutata',
  'certificato_generato', 'email_copia_inviata', 'sessione_scaduta',
  'documento_congelato', 'identita_registrata', 'dichiarazione_accettata', 'tentativi_esauriti', 'prove_conservate']));
