-- Un WhatsApp rinviato non è un errore (19/09/2026).
--
-- Il motore delle automazioni registrava come «error» i passi rinviati: un
-- WhatsApp Locale fuori dalle fasce del passo, o con i numeri tutti occupati,
-- che riparte da solo quando può. Nell'elenco delle automazioni comparivano in
-- rosso («2 errori nelle ultime 24 ore»). Da oggi il motore li scrive
-- «skipped», stato già ammesso dal vincolo di automation_execution_log e che
-- nessuno usava; nel builder si legge «Rinviato».
--
-- 1. automazioni_attivita: l'ultima esecuzione e i passaggi della settimana
--    contano solo i passi eseguiti davvero, non i rinvii.
-- 2. I rinvii già registrati come errore diventano «skipped» (2 righe, del
--    19/09, del flusso «Download Risorse — PDF Vendita · WhatsApp»).

create or replace function public.automazioni_attivita(p_company_id uuid)
returns table (
  flow_id uuid,
  ultima_esecuzione timestamptz,
  esecuzioni_7gg integer,
  errori_7gg integer,
  ultimo_errore text
)
language sql
stable
security invoker
set search_path = public
as $$
  select f.id,
         ultima.created_at,
         settimana.esecuzioni::integer,
         settimana.errori::integer,
         errore.error_message
  from automation_flows f
  left join lateral (
    select l.created_at
    from automation_execution_log l
    where l.flow_id = f.id
      and l.status <> 'skipped'
    order by l.created_at desc
    limit 1
  ) ultima on true
  left join lateral (
    select count(*) filter (where l.status <> 'skipped') as esecuzioni,
           count(*) filter (where l.status = 'error') as errori
    from automation_execution_log l
    where l.flow_id = f.id
      and l.created_at > now() - interval '7 days'
  ) settimana on true
  left join lateral (
    select l.error_message
    from automation_execution_log l
    where l.flow_id = f.id
      and l.status = 'error'
      and l.created_at > now() - interval '7 days'
    order by l.created_at desc
    limit 1
  ) errore on true
  where f.company_id = p_company_id
    and f.deleted_at is null;
$$;

comment on function public.automazioni_attivita(uuid) is
  'Per ogni automazione non eliminata dell''azienda: ultima esecuzione, esecuzioni ed errori degli ultimi 7 giorni, ultimo errore. I passi rinviati (skipped) non contano. Security invoker: valgono le policy di lettura di chi chiama.';

revoke all on function public.automazioni_attivita(uuid) from public, anon;
grant execute on function public.automazioni_attivita(uuid) to authenticated;

-- I rinvii registrati come errore prima di oggi. Poche righe, ma sulla tabella
-- del registro: meglio fallire che aspettare un lock.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

update public.automation_execution_log
   set status = 'skipped'
 where status = 'error'
   and (error_message like 'Fuori dall''orario di invio consentito%'
     or error_message like 'Fuori dalle fasce orarie del passo%'
     or error_message like 'Nessun numero WhatsApp Locale disponibile%');
