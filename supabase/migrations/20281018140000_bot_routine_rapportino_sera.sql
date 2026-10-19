-- Automazioni del bot: il rapportino della sera (18/10/2026).
--
-- Nuovo tipo di routine «rapportino_sera»: all'ora scelta il bot scrive a chi
-- oggi era in cantiere e non ha ancora mandato il rapportino, e manda ai
-- destinatari della routine (il titolare) l'elenco di chi manca. Si imposta
-- dalla pagina Automazioni del WhatsApp hub, come le altre routine.
--
-- Rilanciabile: il vincolo si ricrea con l'elenco completo dei tipi.

set local lock_timeout = '3s';

alter table public.bot_routine drop constraint if exists bot_routine_tipo_check;
alter table public.bot_routine add constraint bot_routine_tipo_check
  check (tipo = any (array['report_mattino', 'todo_operaio', 'avviso', 'promemoria_appuntamento', 'rapportino_sera']));
