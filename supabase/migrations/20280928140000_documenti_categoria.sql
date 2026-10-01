-- Documenti di contatti e opportunità: una categoria per ogni file
-- (contratto, preventivo, planimetria, foto, identità, fattura, visura, altro).
-- Colonna vuota per i documenti già caricati: l'app li mostra come «Altro» finché
-- qualcuno non li classifica. Nessuna riscrittura di righe esistenti.

set local lock_timeout = '3s';

alter table public.marketing_documents
  add column if not exists categoria text;

comment on column public.marketing_documents.categoria is
  'Categoria scelta dall''utente (contratto, preventivo, planimetria, foto, identita, fattura, ufficiale, altro). Null = non classificato.';
