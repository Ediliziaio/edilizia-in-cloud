-- Le scadenze della sicurezza in una vista sola (9 novembre 2026).
-- Fin qui il DURC di una ditta, un attestato o la verifica di una gru scadevano
-- in silenzio: lo vedeva solo chi apriva la pagina. Campanella, email e
-- automazioni esistono già e girano ogni mattina (hr-check-scadenze) su
-- personale, mezzi e carte della ditta, ognuno con la sua vista. Questa è la
-- quarta: la funzione non deve decidere nulla, legge e avvisa.
--
-- Quattro fonti: l'archivio dei documenti del cantiere, le evidenze del
-- fascicolo (saltando quelle chiuse o dichiarate non applicabili), gli
-- adempimenti ancora da fare, e la data del DURC scritta nella scheda della
-- ditta quando non c'è un documento di DURC a dirlo.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace view public.sicurezza_scadenze
with (security_invoker = on) as
with righe as (
  select d.company_id,
         d.order_id,
         'documento'::text as origine,
         d.id as riferimento_id,
         d.tipo,
         nullif(btrim(d.titolo), '') as titolo,
         d.subappaltatore_id,
         null::uuid as operaio_id,
         d.data_scadenza
    from public.sicurezza_documenti d
   where d.data_scadenza is not null

  union all

  select f.company_id,
         f.order_id,
         'fascicolo',
         f.id,
         f.tipo,
         nullif(btrim(f.titolo), ''),
         f.subappaltatore_id,
         f.operaio_id,
         f.data_scadenza
    from public.sicurezza_fascicolo f
   where f.data_scadenza is not null
     and coalesce(f.stato, '') not in ('non_applicabile', 'superato')

  union all

  select a.company_id,
         a.order_id,
         'adempimento',
         a.id,
         a.tipo,
         nullif(btrim(a.titolo), ''),
         null::uuid,
         null::uuid,
         a.scadenza_data
    from public.adempimenti_sicurezza a
   where a.scadenza_data is not null
     and coalesce(a.stato, 'da_fare') = 'da_fare'

  union all

  -- La data scritta a mano nella scheda della ditta vale solo finché nessun
  -- documento di DURC parla per lei: altrimenti si avviserebbe due volte.
  select s.company_id,
         s.order_id,
         'durc_ditta',
         s.id,
         'durc',
         'DURC',
         s.id,
         null::uuid,
         s.durc_scadenza
    from public.subappaltatori_sicurezza s
   where s.durc_scadenza is not null
     and not exists (
       select 1 from public.sicurezza_documenti d
        where d.subappaltatore_id = s.id and d.tipo = 'durc' and d.data_scadenza is not null
     )
     and not exists (
       select 1 from public.sicurezza_fascicolo f
        where f.subappaltatore_id = s.id and f.tipo = 'durc' and f.data_scadenza is not null
          and coalesce(f.stato, '') not in ('non_applicabile', 'superato')
     )
)
select r.company_id,
       r.order_id,
       o.order_code,
       o.client_name,
       r.origine,
       r.riferimento_id,
       r.tipo,
       r.titolo,
       r.subappaltatore_id,
       s.ragione_sociale as subappaltatore,
       r.operaio_id,
       r.data_scadenza,
       (r.data_scadenza - current_date) as giorni_mancanti,
       case when r.data_scadenza < current_date then 'scaduto' else 'in_scadenza' end as stato
  from righe r
  left join public.orders o
         on o.id = r.order_id and o.deleted_at is null
  left join public.subappaltatori_sicurezza s
         on s.id = r.subappaltatore_id
 -- Stessa finestra di preavviso che la pagina già usa: 30 giorni.
 where r.data_scadenza <= current_date + 30
   -- Una commessa cancellata non deve più chiamare nessuno.
   and (r.order_id is null or o.id is not null);

comment on view public.sicurezza_scadenze is
  'Scadenze della sicurezza da avvisare: documenti del cantiere, evidenze del fascicolo, adempimenti da fare e il DURC scritto nella scheda della ditta. Preavviso 30 giorni. Letta da hr-check-scadenze.';

grant select on public.sicurezza_scadenze to authenticated, service_role;
