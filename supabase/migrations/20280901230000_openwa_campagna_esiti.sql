-- Pipeline degli esiti per le campagne WhatsApp Locale.
--
-- Il flusso automatico (in coda → messaggio 1 → follow-up → ha risposto) e'
-- gia' tracciato dallo stato del destinatario. Quello che mancava e' il DOPO:
-- una risposta puo' essere "non mi interessa" o "fissiamo un appuntamento", e
-- senza qualificarla i numeri della campagna non dicono niente sulla QUALITA'
-- della lista e del messaggio — solo sulla quantita' di invii.
--
-- L'esito e' una colonna, non una tabella di stage configurabili: gli esiti di
-- una campagna a freddo sono sempre questi quattro, e ogni livello di
-- configurazione in piu' e' un posto in piu' dove i dati divergono.

alter table public.openwa_campagna_destinatari
  add column if not exists esito text
    check (esito in ('da_ricontattare', 'non_interessato', 'appuntamento', 'cliente'));

alter table public.openwa_campagna_destinatari
  add column if not exists esito_at timestamptz;

comment on column public.openwa_campagna_destinatari.esito is
  'Qualificazione manuale della risposta: da_ricontattare | non_interessato | appuntamento | cliente. NULL = non ancora qualificato.';

create index if not exists openwa_dest_esito_idx
  on public.openwa_campagna_destinatari (campagna_id, esito);
