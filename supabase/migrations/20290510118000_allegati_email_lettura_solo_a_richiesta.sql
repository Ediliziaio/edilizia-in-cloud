-- Lettura AI degli allegati PDF delle email: solo a richiesta (23/11/2026).
--
-- Il job email-ai-dispatch-fatture-7min, ogni 7 minuti, mandava a
-- email-ai-estrai-allegato (Sonnet, a pagamento) ogni email classificata
-- fattura/fornitore con un PDF, senza che nessuno lo chiedesse. Dal 16/11 il costo
-- è addebitato all'azienda: Innovasol ha pagato 4,79 € per 32 letture mai chieste.
-- Decisione del titolare: la lettura parte solo dal pulsante «Estrai dati»
-- sull'allegato (DocumentoEstrattoPanel → useEstraiAllegato), per tutte le aziende.
--
-- Si toglie solo il job. silvio_email_dispatch_fatture resta (la usano
-- scripts/test-email-ai-queue.mjs e chi volesse riaccenderla), ma nessuno la chiama.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
begin
  if exists (select 1 from cron.job where jobname = 'email-ai-dispatch-fatture-7min') then
    perform cron.unschedule('email-ai-dispatch-fatture-7min');
  end if;
end $$;

comment on function public.silvio_email_dispatch_fatture(text, integer) is
  'Dispatcher della lettura AI degli allegati PDF. Dal 23/11/2026 NON è schedulato: la lettura parte solo a richiesta (pulsante «Estrai dati»). Riaccenderlo addebita letture non chieste alle aziende.';
