-- Chiamata conoscitiva (Discovery) fissata dalla risposta all'outreach
-- (25/09/2026, richiesta del founder).
--
-- Quando qualcuno risponde a un'email a freddo «chiamami oggi alle 15», il
-- gestore delle risposte fissa da solo la chiamata nel calendario del brand
-- (_shared/appuntamentoChiamata.ts) e porta la scheda in «Discovery · chiamata
-- conoscitiva». Il percorso è: Discovery (chiamata conoscitiva) → Demo
-- (dimostrazione del prodotto o del servizio). Chiama sempre il founder: i
-- calendari scelti sono suoi.
--
-- Qui: su quale calendario e per quanto, per brand; e la fase Discovery nelle
-- tre pipeline dove finiscono le opportunità dell'outreach, subito dopo
-- «Contattato». Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.outreach_brands
  add column if not exists calendario_chiamate_id uuid references public.marketing_calendars(id) on delete set null,
  add column if not exists durata_chiamata_min integer not null default 15 check (durata_chiamata_min between 5 and 120);

comment on column public.outreach_brands.calendario_chiamate_id is
  'Calendario in cui fissare la chiamata conoscitiva quando una risposta dice «chiamami alle…». Vuoto = non si fissa niente.';

-- Marketing Edile → «Consulenza marketing edile», ThermoDMR → «Consulenza infissi
-- e serramenti», Edilizia in Cloud → «Consulenza gestionale» (la demo ha il suo
-- calendario, «Demo Edilizia in Cloud»). Solo se non è già stato scelto.
update public.outreach_brands b set calendario_chiamate_id = v.cal
  from (values
    ('7d52853f-fa86-4f68-9cd5-25ee444cf132'::uuid, 'c0bfb5ee-1d9d-4183-97ed-1845a74eb55b'::uuid),
    ('93361c3d-bd62-43c5-bca1-aa9380b97953'::uuid, 'e43767c9-fb0c-49ad-b972-8402738952df'::uuid),
    ('caa0ec49-8e59-4db0-a05d-bb25bc50bd98'::uuid, '2b57b852-761b-4c5e-908b-8c1b79e3ee4a'::uuid)
  ) as v(brand, cal)
 where b.id = v.brand and b.calendario_chiamate_id is null
   and exists (select 1 from public.marketing_calendars c where c.id = v.cal);

-- La fase Discovery dopo «Contattato», nelle pipeline Marketing Edile, ThermoDMR
-- e Vendita SaaS (dove finiscono le risposte a Edilizia in Cloud).
do $$
declare
  v_p uuid;
  v_dopo integer;
  v_company uuid;
begin
  foreach v_p in array array[
    '193b7839-f388-4b50-ae05-e53717067d33'::uuid,
    'e9641126-7832-44fd-a051-e60443500c2b'::uuid,
    '00000000-0000-0000-0000-000000000010'::uuid
  ] loop
    continue when not exists (select 1 from public.marketing_pipelines where id = v_p);
    continue when exists (select 1 from public.marketing_pipeline_stages
                           where pipeline_id = v_p and name = 'Discovery · chiamata conoscitiva');
    select s.position, s.company_id into v_dopo, v_company
      from public.marketing_pipeline_stages s
     where s.pipeline_id = v_p and s.name = 'Contattato'
     order by s.position limit 1;
    if v_dopo is null then
      select min(s.position), min(s.company_id::text)::uuid into v_dopo, v_company
        from public.marketing_pipeline_stages s where s.pipeline_id = v_p;
    end if;
    update public.marketing_pipeline_stages
       set position = position + 1
     where pipeline_id = v_p and position > v_dopo;
    insert into public.marketing_pipeline_stages (pipeline_id, company_id, name, position, show_in_reports, stalled_threshold_days)
    values (v_p, v_company, 'Discovery · chiamata conoscitiva', v_dopo + 1, true, 14);
  end loop;
end $$;
