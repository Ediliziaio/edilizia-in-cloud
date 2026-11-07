-- Da quale modello vengono le condizioni del contratto d'appalto (07/11/2026).
--
-- Il 20/12 la colonna `condizioni_origine` è nata su `quotes` e sui dieci `*_progetti`. Il contratto
-- d'appalto è il documento che il committente firma, e fino a oggi le sue clausole le inventava l'AI
-- a ogni giro: garanzia, penali e foro generici anche quando l'azienda le aveva già scritte.
-- Ora `genera-contratto-ai` legge il modello predefinito dell'ambito «appalto» e le riporta alla
-- lettera: qui resta scritto da quale modello e da quale versione sono partite.
--
-- Solo una colonna in più: nessuna riga viene scritta, quindi è istantanea e non prende lock di
-- scrittura. Niente default e niente NOT NULL, per non riscrivere la tabella.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.contratti_documents') is not null then
    alter table public.contratti_documents add column if not exists condizioni_origine jsonb;
    comment on column public.contratti_documents.condizioni_origine is
      'Da dove vengono le clausole di questo contratto: modello dell''archivio «Contratti e condizioni», versione e quando sono state fissate. Il contratto già generato non cambia se cambia il modello.';
  end if;
end $$;
