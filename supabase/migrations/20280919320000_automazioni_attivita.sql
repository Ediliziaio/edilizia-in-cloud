-- Elenco delle automazioni: quando ha lavorato l'ultima volta ogni automazione,
-- e quanti errori ha avuto negli ultimi 7 giorni.
--
-- Il 19/09/2026 sulla piattaforma 20 automazioni pubblicate su 24 non avevano
-- mai eseguito un passaggio, e l'elenco non lo diceva: «Iscritti 0» e la data di
-- modifica erano uguali per quelle vive e per quelle ferme.
--
-- SECURITY INVOKER: legge con i permessi di chi chiama, quindi vede le stesse
-- righe che vedrebbe leggendo automation_flows e automation_execution_log
-- (policy di lettura e blocco utente compresi). Una funzione DEFINER avrebbe
-- dovuto rifare a mano quei controlli.
--
-- Le tre letture per flusso usano l'indice (flow_id, created_at desc): una riga
-- per l'ultima esecuzione, e solo i 7 giorni per i conteggi.

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
    order by l.created_at desc
    limit 1
  ) ultima on true
  left join lateral (
    select count(*) as esecuzioni,
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
  'Per ogni automazione non eliminata dell''azienda: ultima esecuzione, esecuzioni ed errori degli ultimi 7 giorni, ultimo errore. Security invoker: valgono le policy di lettura di chi chiama.';

revoke all on function public.automazioni_attivita(uuid) from public, anon;
grant execute on function public.automazioni_attivita(uuid) to authenticated;
