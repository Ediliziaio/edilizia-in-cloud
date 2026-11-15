-- Rendiconti e dossier scaricati, non solo inviati, restano nello storico col loro PDF.
-- Lo stato nuovo «scaricato» lo scrivono generale-rendiconto-invia e generale-dossier-invia
-- quando ricevono «archivia: true»: niente email, solo la riga e il file. Senza destinatario:
-- generale_rendiconti.destinatario resta NOT NULL e vale '' (stringa vuota), generale_dossier
-- ha destinatari = '{}'.
-- Idempotente: si rifanno i due CHECK con l'elenco completo. Tabelle piccole: il lock dura un attimo.

set local lock_timeout = '3s';

alter table public.generale_rendiconti drop constraint if exists generale_rendiconti_stato;
alter table public.generale_rendiconti add constraint generale_rendiconti_stato
  check (stato = any (array['in_invio', 'inviato', 'fallito', 'scaricato']));

alter table public.generale_dossier drop constraint if exists generale_dossier_stato;
alter table public.generale_dossier add constraint generale_dossier_stato
  check (stato = any (array['in_invio', 'inviato', 'parziale', 'fallito', 'scaricato']));
